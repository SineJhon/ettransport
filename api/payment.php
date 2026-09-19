<?php

declare(strict_types=1);

/**
 * ET Transport — Payment API.
 *
 * Database payment foundation. This is NOT a real Telebirr / CBE Birr /
 * M-Pesa gateway integration — the mobile-money methods are simulated,
 * but the payment RECORD is persisted for real in the payments table.
 *
 * Supported action:
 *
 *   POST api/payment.php?action=pay   { booking_id, method, phone }
 *
 * The server NEVER trusts the client for the amount or the booking:
 *   - the booking is looked up by id AND passenger_id (ownership enforced),
 *   - the amount is read from bookings.total_amount (which was itself
 *     computed from trip.price * seat count when the booking was created),
 *   - the payment status is always 'paid' on success — never client-set.
 *
 * The whole operation is atomic (BEGIN ... COMMIT / ROLLBACK).
 */

require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/../config/notifications.php';
require_once __DIR__ . '/../config/payment_providers.php';

/** Business rejection carrying an HTTP status (same convention as booking.php). */
class PaymentBusinessException extends RuntimeException
{
    public int $httpStatus;

    public function __construct(string $message, int $httpStatus = 422)
    {
        parent::__construct($message);
        $this->httpStatus = $httpStatus;
    }
}

function payment_input(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $decoded = json_decode((string) $raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    return $_POST;
}

function payment_text(?string $value): string
{
    return trim((string) $value);
}

function require_payment_post(): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        auth_response(405, [
            'success' => false,
            'message' => 'Method not allowed.',
        ]);
    }
}

function normalize_payment_method(?string $value): ?string
{
    $m = strtolower(preg_replace('/[\s\-_]+/', '', (string) $value));

    if ($m === 'telebirr') {
        return 'telebirr';
    }
    if ($m === 'cbebirr') {
        return 'cbe_birr';
    }
    if ($m === 'mpesa') {
        return 'mpesa';
    }

    return null;
}

/**
 * Local Ethiopian phone check for a given payment method. Accepts the
 * common written forms (+251…, 251…, 0…) and enforces the provider's
 * network prefix:
 *   - mpesa    → must start with 7 (Safaricom Ethiopia)
 *   - telebirr → must start with 9 (Ethio Telecom)
 *   - cbe_birr → any valid Ethiopian number (mobile 7/9 or landline 1…)
 */
function payment_phone_valid_for_method(?string $raw, ?string $method): bool
{
    $digits = preg_replace('/\D/', '', (string) $raw) ?? '';

    if (strlen($digits) === 12 && strncmp($digits, '251', 3) === 0) {
        $digits = substr($digits, 3);
    } elseif (strlen($digits) === 10 && $digits[0] === '0') {
        $digits = substr($digits, 1);
    }

    if (preg_match('/^[1-9][0-9]{8}$/', $digits) !== 1) {
        return false;
    }

    if ($method === 'mpesa') {
        return $digits[0] === '7';
    }
    if ($method === 'telebirr') {
        return $digits[0] === '9';
    }

    return true; /* cbe_birr — any valid Ethiopian number */
}

function require_active_passenger(): array
{
    $user = requireRole('passenger');

    if (($user['status'] ?? '') !== 'active') {
        auth_response(403, [
            'success' => false,
            'message' => 'Your account is not active.',
        ]);
    }

    return $user;
}

function generate_transaction_reference(PDO $pdo): string
{
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $max = strlen($chars) - 1;
    $check = $pdo->prepare('SELECT id FROM payments WHERE transaction_reference = :r LIMIT 1');

    for ($attempt = 0; $attempt < 25; $attempt++) {
        $rand = '';
        for ($i = 0; $i < 8; $i++) {
            $rand .= $chars[random_int(0, $max)];
        }

        $ref = 'TXN-' . date('Ymd') . '-' . $rand;
        $check->execute([':r' => $ref]);
        if (!$check->fetch()) {
            return $ref;
        }
    }

    throw new PaymentBusinessException('Unable to allocate a transaction reference. Please retry.', 500);
}
function payment_booking_payload(PDO $pdo, array $row, ?array $payment): array
{
    return [
        'id' => (int) $row['id'],
        'reference' => $row['booking_reference'],
        'status' => $row['booking_status'],
        'payment_status' => $row['payment_status'],
        'total' => (float) $row['total_amount'],
        'date' => $row['departure_date'],
        'from' => $row['from_city'],
        'to' => $row['to_city'],
        'depart' => substr((string) $row['departure_time'], 0, 5),
        'arrive' => $row['arrival_time'] !== null ? substr((string) $row['arrival_time'], 0, 5) : '',
        'company' => $row['company_name'],
        'companyId' => $row['company_slug'],
        'payment' => $payment !== null ? [
            'id' => (int) $payment['id'],
            'amount' => (float) $payment['amount'],
            'method' => $payment['method'],
            'transaction_reference' => $payment['transaction_reference'],
            'status' => $payment['status'],
        ] : null,
    ];
}

/* ============================================================
   POST pay — simulate a mobile-money payment, persist for real
   ============================================================ */
function handle_pay(): void
{
    require_payment_post();
    $user = require_active_passenger();

    $input = payment_input();

    $bookingId = (int) ($input['booking_id'] ?? 0);
    $method = normalize_payment_method($input['method'] ?? '');
    $phone = payment_text($input['phone'] ?? '');

    if ($bookingId <= 0) {
        auth_response(422, ['success' => false, 'message' => 'A valid booking is required.']);
    }

    if ($method === null) {
        auth_response(422, ['success' => false, 'message' => 'Unsupported payment method.']);
    }

    if (!payment_phone_valid_for_method($phone, $method)) {
        if ($method === 'mpesa') {
            auth_response(422, ['success' => false, 'message' => 'M-Pesa numbers start with 7, e.g. +2517XXXXXXXX.']);
        }
        if ($method === 'telebirr') {
            auth_response(422, ['success' => false, 'message' => 'Telebirr numbers start with 9, e.g. +2519XXXXXXXX.']);
        }
        auth_response(422, ['success' => false, 'message' => 'A valid Ethiopian payment phone number is required, e.g. +2519XXXXXXXX.']);
    }

 /* Payment provider gate: the authoritative server-side
       check against the deployment's payment configuration. A request is
       rejected BEFORE any work starts whenever the effective provider is not
       configured. This is what guarantees the app can never silently process
       payments with the development/simulation provider in production and can
       never pretend a not-yet-integrated gateway is live. */
    if (!et_payment_gateway_configured()) {
        throw new PaymentBusinessException(
            'This payment method is not available yet in this deployment. No money was taken.',
            503
        );
    }

    $pdo = db();

    try {
        $pdo->beginTransaction();

        /* The amount is never taken from the client: it is read from the
           booking row that already stores the server-computed total. */
        $stmt = $pdo->prepare('
            SELECT
                b.id, b.passenger_id, b.booking_reference, b.total_amount,
                b.payment_method, b.payment_status, b.booking_status,
                t.departure_date, t.departure_time, t.arrival_time,
                c.name AS company_name, c.slug AS company_slug,
                r.from_city, r.to_city
            FROM bookings b
            JOIN trips t     ON t.id = b.trip_id
            JOIN companies c ON c.id = t.company_id
            JOIN routes r    ON r.id = t.route_id
            WHERE b.id = :bid AND b.passenger_id = :uid
            FOR UPDATE');
        $stmt->execute([':bid' => $bookingId, ':uid' => (int) $user['id']]);
        $booking = $stmt->fetch();

        if ($booking === false) {
            throw new PaymentBusinessException('Booking not found.', 404);
        }

        if ($booking['booking_status'] === 'cancelled') {
            throw new PaymentBusinessException('This booking was cancelled and cannot be paid.', 409);
        }

        if ($booking['payment_status'] === 'paid') {
            throw new PaymentBusinessException('This booking is already paid.', 409);
        }

        $amount = (float) $booking['total_amount'];
        $txRef = generate_transaction_reference($pdo);

        $ins = $pdo->prepare('
            INSERT INTO payments (booking_id, amount, method, transaction_reference, status)
            VALUES (:bid, :amount, :method, :tx, \'paid\')');
        $ins->execute([
            ':bid'     => $bookingId,
            ':amount'  => $amount,
            ':method'  => $method,
            ':tx'      => $txRef,
        ]);
        $paymentId = (int) $pdo->lastInsertId();

        $upd = $pdo->prepare('
            UPDATE bookings
            SET payment_status = \'paid\', booking_status = \'confirmed\'
            WHERE id = :bid AND passenger_id = :uid');
        $upd->execute([':bid' => $bookingId, ':uid' => (int) $user['id']]);

        $pdo->commit();

        /* Real notification: payment successful. Created ONLY after the payment
           row is persisted. The amount comes from bookings.total_amount (server
           side), never from the client. The unique transaction reference is the
           application-level dedup token, so double submission cannot duplicate it. */
        try {
            createNotification(
                $pdo,
                (int) $user['id'],
                'payment',
                'Payment Successful',
                'Payment of ETB ' . number_format($amount, 2) . ' for booking '
                    . $booking['booking_reference'] . ' was successful (ref ' . $txRef . ').',
                'payment-success:' . $txRef,
                'tickets'
            );
        } catch (Throwable $e) {
            /* Best-effort only — never let a notification failure alter the response. */
        }

        $payment = [
            'id' => $paymentId,
            'amount' => $amount,
            'method' => $method,
            'transaction_reference' => $txRef,
            'status' => 'paid',
        ];
        $booking['payment_status'] = 'paid';
        $booking['booking_status'] = 'confirmed';

        auth_response(200, [
            'success' => true,
            'message' => 'Payment successful.',
            'payment' => $payment,
            'booking' => payment_booking_payload($pdo, $booking, $payment),
            'gateway' => et_payment_gateway_info(),
        ]);
    } catch (PaymentBusinessException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        auth_response($e->httpStatus, [
            'success' => false,
            'message' => $e->getMessage(),
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        auth_response(500, [
            'success' => false,
            'message' => 'Payment could not be processed. Please try again later.',
        ]);
    }
}

/* ============================================================
   Dispatcher
   ============================================================ */
$action = strtolower(trim((string) ($_GET['action'] ?? $_POST['action'] ?? '')));

if ($action === 'pay') {
    handle_pay();
}

auth_response(400, [
    'success' => false,
    'message' => 'Unsupported action. Use action=pay.',
]);