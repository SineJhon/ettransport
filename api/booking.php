<?php

declare(strict_types=1);

/**
 * ET Transport — Booking API .
 *
 * Real, database-backed passenger booking.
 *
 *   GET  api/booking.php?action=availability&trip_id=N[&date=YYYY-MM-DD]  (public)
 *   POST api/booking.php?action=create                                   (passenger)
 *   GET  api/booking.php?action=list[&sort=...][&status=...][&q=...] [&limit=N][&offset=N]  (passenger)
 *       Paginated My Trips rows for the session passenger. Optional status is a
 *       strict whitelist: upcoming|all|completed|cancelled (default all).
 *   GET  api/booking.php?action=get&ref=ET-...  | &id=N                  (passenger, owner only)
 *   POST api/booking.php?action=cancel   { id }                         (passenger, owner only)
 *   GET  api/booking.php?action=search&q=TERM[&sort=...][&status=...] [&limit=N][&offset=N]  (passenger, owner only)
 *       Partial, case-insensitive match over the authenticated passenger's
 *       own booking reference / origin / destination / company name. The
 *       passenger is derived from the session (never the browser), so another
 *       passenger's data can never be returned. An empty q returns the
 *       passenger's normal booking list (same ordering as action=list). The
 *       optional status whitelist (upcoming|all|completed|cancelled) applies
 *       to both the returned rows and the count, so pagination stays correct.
 *
 * Server-side rules (the client is never trusted for price, availability,
 * company, route or seat state):
 *   - trip, price, bus seat range and booked seats all come from MySQL.
 *   - a passenger may only create / list / view / cancel their own bookings.
 *   - seat conflicts are prevented inside a transaction: the trips row is
 *     locked FOR UPDATE so that two concurrent booking attempts for the same
 *     trip serialize, then the booked-seat set is re-read before inserting.
 *   - a booking reference is always generated server-side and checked against
 *     the unique index before insert.
 */

require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/../config/notifications.php';

const MAX_PASSENGERS_PER_BOOKING = 10;

/* Phased-14.3 pagination bounds for the passenger booking list + search. */
const BOOKING_LIST_DEFAULT_LIMIT = 20;
const BOOKING_LIST_MAX_LIMIT = 50;

const ALLOWED_PAYMENT_METHODS = ['telebirr', 'cbe_birr', 'mpesa'];

/**
 * Business rejection carrying an HTTP status. Thrown inside a transaction,
 * caught at the dispatcher, rolled back and rendered through auth_response().
 */
class BookingBusinessException extends RuntimeException
{
    public int $httpStatus;

    public function __construct(string $message, int $httpStatus = 422)
    {
        parent::__construct($message);
        $this->httpStatus = $httpStatus;
    }
}

function booking_input(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $decoded = json_decode((string) $raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    return $_POST;
}

function booking_action(): string
{
    return strtolower(trim((string) ($_GET['action'] ?? $_POST['action'] ?? '')));
}

function booking_text(?string $value): string
{
    return trim((string) $value);
}

function require_booking_post(): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        auth_response(405, [
            'success' => false,
            'message' => 'Method not allowed.',
        ]);
    }
}

/** Decode a stored route-station JSON list into an array of clean names. */
function decode_route_stations(mixed $raw): array
{
    if ($raw === null || $raw === '') {
        return [];
    }
    $decoded = json_decode((string) $raw, true);
    if (!is_array($decoded)) {
        return [];
    }
    $out = [];
    foreach ($decoded as $name) {
        $name = trim((string) $name);
        if ($name !== '') {
            $out[] = $name;
        }
    }
    return $out;
}

/**
 * Parses + validates the optional limit / offset query params used by the
 * passenger booking list and search. The passenger is NEVER read here —
 * ownership always comes from the authenticated session. Returns
 * ['limit' => int, 'offset' => int] (never null).
 *
 *   - limit: a positive integer. It defaults to BOOKING_LIST_DEFAULT_LIMIT,
 *     and oversized values are safely constrained to BOOKING_LIST_MAX_LIMIT
 *     (clamped, never echoed back). Invalid / hostile values -> 422.
 *   - offset: a non-negative integer (0 allowed). Defaults to 0.
 *     Negative, non-numeric or otherwise invalid values -> 422.
 */
function booking_pagination(): array
{
    $limit = BOOKING_LIST_DEFAULT_LIMIT;
    if (isset($_GET['limit']) && $_GET['limit'] !== '') {
        $raw = (string) $_GET['limit'];
        if (!preg_match('/^[1-9][0-9]*$/', $raw)) {
            auth_response(422, ['success' => false, 'message' => 'Invalid pagination limit.']);
        }
        $limit = min((int) $raw, BOOKING_LIST_MAX_LIMIT);
    }

    $offset = 0;
    if (isset($_GET['offset']) && $_GET['offset'] !== '') {
        $raw = (string) $_GET['offset'];
        if (!preg_match('/^[0-9]+$/', $raw)) {
            auth_response(422, ['success' => false, 'message' => 'Invalid pagination offset.']);
        }
        $offset = (int) $raw;
    }

    return ['limit' => $limit, 'offset' => $offset];
}

/**
 * Whitelist of the passenger My Trips server-side sort options
 * The browser may only select one of the six opaque keys below;
 * the SQL ORDER BY fragment is ALWAYS resolved here on the server so an
 * arbitrary column name / order token from the browser can never reach an
 * ORDER BY clause. Every ordering ends with the deterministic booking id as
 * a secondary key, so pagination never produces unstable or duplicate
 * windows across pages.
 *
 * Supported keys and their exact ORDER BY:
 *   newest        b.created_at DESC, b.id DESC
 *   oldest        b.created_at ASC,  b.id ASC
 *   travel_soon   t.departure_date ASC, t.departure_time ASC, b.id DESC
 *   travel_later  t.departure_date DESC, t.departure_time DESC, b.id DESC
 *   price_low     b.total_amount ASC,  b.id DESC
 *   price_high    b.total_amount DESC, b.id DESC
 *
 * A missing / empty value returns the default 'newest' ordering. An unknown
 * key returns [null, null] so callers can reply HTTP 422 without echoing any
 * internal value. The returned ORDER BY may only be produced by this whitelist.
 *
 * @return array  [key|null, orderBy|null] where orderBy is never built from input.
 */
function booking_sort_order(?string $sort): array
{
    static $orders = [
        'newest'       => 'b.created_at DESC, b.id DESC',
        'oldest'       => 'b.created_at ASC, b.id ASC',
        'travel_soon'  => 't.departure_date ASC, t.departure_time ASC, b.id DESC',
        'travel_later' => 't.departure_date DESC, t.departure_time DESC, b.id DESC',
        'price_low'    => 'b.total_amount ASC, b.id DESC',
        'price_high'   => 'b.total_amount DESC, b.id DESC',
    ];

    $key = trim((string) $sort);

    if ($key === '') {
        return ['newest', $orders['newest']];
    }
    if (!isset($orders[$key])) {
        return [null, null];
    }

    return [$key, $orders[$key]];
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

function bus_type_label(string $type): string
{
    if ($type === 'vip') {
        return 'VIP';
    }

    return ucfirst($type);
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
function generate_booking_reference(PDO $pdo): string
{
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $max = strlen($chars) - 1;
    $check = $pdo->prepare('SELECT id FROM bookings WHERE booking_reference = :r LIMIT 1');

    for ($attempt = 0; $attempt < 25; $attempt++) {
        $rand = '';
        for ($i = 0; $i < 6; $i++) {
            $rand .= $chars[random_int(0, $max)];
        }

        $ref = 'ET-' . date('Ymd') . '-' . $rand;
        $check->execute([':r' => $ref]);
        if (!$check->fetch()) {
            return $ref;
        }
    }

    throw new BookingBusinessException('Unable to allocate a booking reference. Please retry.', 500);
}

/**
 * Rich row for one booking: booking + trip + bus + company + route.
 * Ownership is always part of the WHERE clause (never trusted from the URL).
 */
function booking_base_sql(): string
{
    return '
        SELECT
            b.id,
            b.booking_reference,
            b.total_amount,
            b.payment_method,
            b.payment_status,
            b.booking_status,
            b.refund_account_name,
            b.refund_account_number,
            b.refund_bank,
            b.created_at,
            t.departure_date,
            t.departure_time,
            t.arrival_time,
            t.price,
            b2.seat_count,
            b2.bus_type,
            b2.model                     AS bus_model,
            c.slug                       AS company_slug,
            c.name                       AS company_name,
            r.from_city,
            r.to_city,
            r.duration
        FROM bookings b
        JOIN trips t     ON t.id = b.trip_id
        JOIN buses b2    ON b2.id = t.bus_id
        JOIN companies c ON c.id = t.company_id
        JOIN routes r    ON r.id = t.route_id';
}

function find_booking_row(PDO $pdo, int $bookingId, int $passengerId): ?array
{
    $stmt = $pdo->prepare(booking_base_sql() . '
        WHERE b.id = :id AND b.passenger_id = :uid
        LIMIT 1');
    $stmt->execute([':id' => $bookingId, ':uid' => $passengerId]);

    $row = $stmt->fetch();

    return $row !== false ? $row : null;
}

function fetch_booking_passengers(PDO $pdo, int $bookingId): array
{
    $stmt = $pdo->prepare('
        SELECT name, age, gender, phone, seat_number
        FROM booking_passengers
        WHERE booking_id = :id
        ORDER BY id ASC');
    $stmt->execute([':id' => $bookingId]);

    return $stmt->fetchAll();
}

function fetch_booking_payment(PDO $pdo, int $bookingId): ?array
{
    $stmt = $pdo->prepare('
        SELECT id, amount, method, transaction_reference, status
        FROM payments
        WHERE booking_id = :id
        ORDER BY id DESC
        LIMIT 1');
    $stmt->execute([':id' => $bookingId]);

    $row = $stmt->fetch();

    return $row !== false ? $row : null;
}

/** Combined, frontend-friendly booking payload (used by every endpoint). */
function booking_payload(PDO $pdo, array $row): array
{
    $bookingId = (int) $row['id'];
    $passengers = fetch_booking_passengers($pdo, $bookingId);
    $payment = fetch_booking_payment($pdo, $bookingId);

    $seatNumbers = [];
    $passengerNames = [];
    $seatList = [];
    foreach ($passengers as $p) {
        $seat = (int) $p['seat_number'];
        $seatNumbers[] = $seat;
        $passengerNames[] = $p['name'];
        $seatList[] = [
            'name' => $p['name'],
            'age' => $p['age'] !== null ? (int) $p['age'] : null,
            'gender' => $p['gender'],
            'phone' => $p['phone'],
            'seat' => $seat,
        ];
    }

    sort($seatNumbers);
    $seatLabel = implode(', ', array_map(static fn (int $n): string => str_pad((string) $n, 2, '0', STR_PAD_LEFT), $seatNumbers));

    return [
        'id' => $bookingId,
        'reference' => $row['booking_reference'],
        'status' => $row['booking_status'],
        'payment_status' => $row['payment_status'],
        'payment_method' => $row['payment_method'],
        'total' => (float) $row['total_amount'],
        'date' => $row['departure_date'],
        'from' => $row['from_city'],
        'to' => $row['to_city'],
        'depart' => substr((string) $row['departure_time'], 0, 5),
        'arrive' => $row['arrival_time'] !== null ? substr((string) $row['arrival_time'], 0, 5) : '',
        'minutes' => (int) $row['duration'],
        'company' => $row['company_name'],
        'companyId' => $row['company_slug'],
        'busType' => $row['bus_model'] !== null ? $row['bus_model'] : $row['bus_type'],
        'tripType' => bus_type_label($row['bus_type']),
        'seats' => $seatNumbers,
        'seatLabel' => $seatLabel,
        'passengerCount' => count($passengers),
        'passengerNames' => $passengerNames,
        'passengers' => $seatList,
        'refundAccount' => [
            'name' => $row['refund_account_name'],
            'number' => $row['refund_account_number'],
            'bank' => $row['refund_bank'],
        ],
        'created_at' => $row['created_at'],
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
   Public availability (used by the seat map; no auth required —
   same information the public search already exposes).
   ============================================================ */
function handle_availability(): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    $tripId = (int) ($_GET['trip_id'] ?? 0);
    if ($tripId <= 0) {
        auth_response(422, ['success' => false, 'message' => 'A valid trip id is required.']);
    }

    try {
        $pdo = db();

        $stmt = $pdo->prepare('
            SELECT
                t.id,
                t.departure_date,
                t.departure_time,
                t.arrival_time,
                t.price,
                b.seat_count,
                b.bus_type,
                b.model       AS bus_model,
                c.slug        AS company_slug,
                c.name        AS company_name,
                r.from_city,
                r.to_city,
                r.pickup_stations,
                r.dropoff_stations,
                r.duration
            FROM trips t
            JOIN buses b     ON b.id = t.bus_id
            JOIN companies c ON c.id = t.company_id
            JOIN users u     ON u.id = c.user_id
            JOIN routes r    ON r.id = t.route_id
            WHERE t.id = :id
              AND t.status = \'scheduled\'
              AND c.status = \'approved\'
              AND c.listed = 1
              AND u.status = \'active\'
            LIMIT 1');
        $stmt->execute([':id' => $tripId]);
        $trip = $stmt->fetch();

        if ($trip === false) {
            auth_response(404, ['success' => false, 'message' => 'Trip not found or not available.']);
        }

        $occStmt = $pdo->prepare('
            SELECT bp.seat_number
            FROM booking_passengers bp
            JOIN bookings bk ON bk.id = bp.booking_id
            WHERE bk.trip_id = :tid
              AND bk.booking_status <> \'cancelled\'');
        $occStmt->execute([':tid' => $tripId]);

        $occupied = [];
        foreach ($occStmt->fetchAll() as $row) {
            $occupied[] = (int) $row['seat_number'];
        }
        sort($occupied);

        auth_response(200, [
            'success' => true,
            'trip' => [
                'id' => (int) $trip['id'],
                'company' => $trip['company_name'],
                'companyId' => $trip['company_slug'],
                'from' => $trip['from_city'],
                'to' => $trip['to_city'],
                'pickup_stations' => decode_route_stations($trip['pickup_stations'] ?? null),
                'dropoff_stations' => decode_route_stations($trip['dropoff_stations'] ?? null),
                'date' => $trip['departure_date'],
                'depart' => substr((string) $trip['departure_time'], 0, 5),
                'arrive' => $trip['arrival_time'] !== null ? substr((string) $trip['arrival_time'], 0, 5) : '',
                'minutes' => (int) $trip['duration'],
                'price' => (float) $trip['price'],
                'busType' => $trip['bus_model'] !== null ? $trip['bus_model'] : $trip['bus_type'],
                'tripType' => bus_type_label($trip['bus_type']),
            ],
            'seat_count' => (int) $trip['seat_count'],
            'occupied' => $occupied,
        ]);
    } catch (Throwable $e) {
        auth_response(500, [
            'success' => false,
            'message' => 'Seat availability could not be loaded. Please try again later.',
        ]);
    }
}
/* ============================================================
   POST create — the core booking transaction
   ============================================================ */
function handle_create(): void
{
    require_booking_post();
    $user = require_active_passenger();

    $input = booking_input();

    $tripId = (int) ($input['trip_id'] ?? 0);
    $date = booking_text($input['date'] ?? '');
    $method = normalize_payment_method($input['payment_method'] ?? '');
    $rawSeats = $input['seats'] ?? null;
    $rawPassengers = $input['passengers'] ?? null;

    if ($tripId <= 0) {
        auth_response(422, ['success' => false, 'message' => 'A valid trip is required.']);
    }

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        auth_response(422, ['success' => false, 'message' => 'A valid travel date is required.']);
    }

    if (!is_array($rawSeats) || count($rawSeats) < 1) {
        auth_response(422, ['success' => false, 'message' => 'At least one seat must be selected.']);
    }

    if (count($rawSeats) > MAX_PASSENGERS_PER_BOOKING) {
        auth_response(422, [
            'success' => false,
            'message' => 'A booking may contain at most ' . MAX_PASSENGERS_PER_BOOKING . ' passengers.',
        ]);
    }

    if ($method === null || !in_array($method, ALLOWED_PAYMENT_METHODS, true)) {
        auth_response(422, ['success' => false, 'message' => 'Unsupported payment method.']);
    }

    /* Normalise + validate seats (format, duplicates within the request). */
    $seats = [];
    foreach ($rawSeats as $rawSeat) {
        $seatStr = trim((string) $rawSeat);
        if (!preg_match('/^\d{1,3}$/', $seatStr)) {
            auth_response(422, ['success' => false, 'message' => 'Invalid seat selection.']);
        }

        $seat = (int) $seatStr;
        if ($seat < 1) {
            auth_response(422, ['success' => false, 'message' => 'Invalid seat selection.']);
        }

        if (in_array($seat, $seats, true)) {
            auth_response(422, [
                'success' => false,
                'message' => 'Seat ' . str_pad((string) $seat, 2, '0', STR_PAD_LEFT) . ' was selected more than once.',
            ]);
        }

        $seats[] = $seat;
    }

    if (!is_array($rawPassengers) || count($rawPassengers) !== count($seats)) {
        auth_response(422, [
            'success' => false,
            'message' => 'Passenger details must match the number of selected seats.',
        ]);
    }

    /* Normalize + validate passenger details. */
    $passengers = [];
    foreach ($rawPassengers as $index => $p) {
        $name = booking_text($p['name'] ?? '');
        $ageRaw = trim((string) ($p['age'] ?? ''));
        $gender = strtolower(booking_text($p['gender'] ?? ''));
        $phone = booking_text($p['phone'] ?? '');

        if (strlen($name) < 2) {
            auth_response(422, ['success' => false, 'message' => 'Please enter a valid passenger name.']);
        }

        if (!preg_match('/^\d{1,3}$/', $ageRaw)) {
            auth_response(422, ['success' => false, 'message' => 'Please enter a valid passenger age.']);
        }
        $age = (int) $ageRaw;
        if ($age < 1 || $age > 100) {
            auth_response(422, ['success' => false, 'message' => 'Passenger age must be between 1 and 100.']);
        }

        if (!in_array($gender, ['male', 'female', 'other'], true)) {
            auth_response(422, ['success' => false, 'message' => 'Please select a valid gender.']);
        }

        if ($phone === '' || strlen($phone) < 7) {
            auth_response(422, ['success' => false, 'message' => 'A passenger phone number is required.']);
        }

        $passengers[] = [
            'name' => $name,
            'age' => $age,
            'gender' => $gender,
            'phone' => $phone,
            'seat' => $seats[$index],
        ];
    }

    /* Refund destination account — collected once per booking on the passenger
       info page. Optional, but validated for length so bad data never persists.
       refund_bank is one of the known options or the free-text "Other" name. */
    $refundAccountName = booking_text($input['refund_account_name'] ?? '');
    $refundAccountNumber = booking_text($input['refund_account_number'] ?? '');
    $refundBank = booking_text($input['refund_bank'] ?? '');
    if (mb_strlen($refundAccountName) > 120) {
        auth_response(422, ['success' => false, 'message' => 'Refund account name must be at most 120 characters.']);
    }
    if (mb_strlen($refundAccountNumber) > 50) {
        auth_response(422, ['success' => false, 'message' => 'Refund account number must be at most 50 characters.']);
    }
    if (mb_strlen($refundBank) > 50) {
        auth_response(422, ['success' => false, 'message' => 'Refund bank must be at most 50 characters.']);
    }

    $pdo = db();

    try {
        $pdo->beginTransaction();

        /* Lock the trips row first — this serialises every booking attempt
           for the same trip, so two passengers can never pick the same seat. */
        $tripStmt = $pdo->prepare('
            SELECT
                t.id, t.company_id, t.route_id, t.bus_id,
                t.departure_date, t.departure_time, t.arrival_time,
                t.price, t.status,
                b.seat_count, b.bus_type, b.model AS bus_model,
                c.slug AS company_slug, c.name AS company_name,
                r.from_city, r.to_city, r.duration
            FROM trips t
            JOIN buses b     ON b.id = t.bus_id
            JOIN companies c ON c.id = t.company_id
            JOIN users u     ON u.id = c.user_id
            JOIN routes r    ON r.id = t.route_id
            WHERE t.id = :id
              AND c.status = \'approved\'
              AND c.listed = 1
              AND u.status = \'active\'
            FOR UPDATE');
        $tripStmt->execute([':id' => $tripId]);
        $trip = $tripStmt->fetch();

        if ($trip === false) {
            throw new BookingBusinessException('Trip not found.', 404);
        }

        if ($trip['status'] !== 'scheduled') {
            throw new BookingBusinessException('This trip is no longer available for booking.', 409);
        }

        if ($trip['departure_date'] !== $date) {
            throw new BookingBusinessException('The selected date does not match this trip.', 422);
        }

        if ($trip['departure_date'] < date('Y-m-d')) {
            throw new BookingBusinessException('This trip has already departed.', 409);
        }

        $seatCount = (int) $trip['seat_count'];
        foreach ($seats as $seat) {
            if ($seat > $seatCount) {
                throw new BookingBusinessException(
                    'Seat ' . str_pad((string) $seat, 2, '0', STR_PAD_LEFT) . ' is not available on this bus.',
                    422
                );
            }
        }
/* Current booked-seat set (locking read — sees the latest commit). */
        $bookedStmt = $pdo->prepare('
            SELECT bp.seat_number
            FROM booking_passengers bp
            JOIN bookings bk ON bk.id = bp.booking_id
            WHERE bk.trip_id = :tid
              AND bk.booking_status <> \'cancelled\'
            FOR UPDATE');
        $bookedStmt->execute([':tid' => $tripId]);

        $booked = [];
        foreach ($bookedStmt->fetchAll() as $row) {
            $booked[(int) $row['seat_number']] = true;
        }

        foreach ($seats as $seat) {
            if (isset($booked[$seat])) {
                throw new BookingBusinessException(
                    'Seat ' . str_pad((string) $seat, 2, '0', STR_PAD_LEFT) . ' is already booked for this trip.',
                    409
                );
            }
        }

        $total     = round((float) $trip['price'] * count($seats), 2);
        $reference = generate_booking_reference($pdo);

        $insertBooking = $pdo->prepare('
            INSERT INTO bookings (passenger_id, trip_id, booking_reference, total_amount, payment_method, payment_status, booking_status, refund_account_name, refund_account_number, refund_bank)
            VALUES (:uid, :trip, :ref, :total, :method, \'pending\', \'pending\', :refund_account_name, :refund_account_number, :refund_bank)');
        $insertBooking->execute([
            ':uid'                 => (int) $user['id'],
            ':trip'                => $tripId,
            ':ref'                 => $reference,
            ':total'               => $total,
            ':method'              => $method,
            ':refund_account_name' => $refundAccountName !== '' ? $refundAccountName : null,
            ':refund_account_number' => $refundAccountNumber !== '' ? $refundAccountNumber : null,
            ':refund_bank'         => $refundBank !== '' ? $refundBank : null,
        ]);
        $bookingId = (int) $pdo->lastInsertId();

        $insertPassenger = $pdo->prepare('
            INSERT INTO booking_passengers (booking_id, name, age, gender, phone, seat_number)
            VALUES (:bid, :name, :age, :gender, :phone, :seat)');
        foreach ($passengers as $p) {
            $insertPassenger->execute([
                ':bid'     => $bookingId,
                ':name'    => $p['name'],
                ':age'     => $p['age'],
                ':gender'  => $p['gender'],
                ':phone'   => $p['phone'],
                ':seat'    => (string) $p['seat'],
            ]);
        }

        $pdo->commit();

        /* Real notification: booking confirmed. Created ONLY after the booking
           is persisted. Wrapped so a notification failure never fails a real
           booking. The message uses trip/route data read from MySQL, never the
           browser. The booking reference is the application-level dedup token. */
        try {
            createNotification(
                $pdo,
                (int) $user['id'],
                'booking',
                'Booking Confirmed',
                'Your booking ' . $reference . ' for ' . $trip['from_city'] . ' → ' . $trip['to_city']
                    . ' on ' . $trip['departure_date'] . ' with ' . $trip['company_name']
                    . ' for ' . count($seats) . ' seat(s) is confirmed.',
                'booking-confirmed:' . $reference
            );
        } catch (Throwable $e) {
            /* Best-effort only — never let a notification failure alter the response. */
        }

        $row = find_booking_row($pdo, $bookingId, (int) $user['id']);
        if ($row === null) {
            throw new BookingBusinessException('Booking could not be loaded after creation.', 500);
        }

        auth_response(201, [
            'success' => true,
            'message' => 'Booking created successfully.',
            'booking' => booking_payload($pdo, $row),
        ]);
    } catch (BookingBusinessException $e) {
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
            'message' => 'Booking could not be completed. Please try again.',
        ]);
    }
}
/* ============================================================
   GET list — the passenger's own bookings (My Trips)
   ============================================================ */
function handle_list(): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    $user = require_active_passenger();
    $pg = booking_pagination();

    $sortOrder = booking_sort_order($_GET['sort'] ?? '');
    if ($sortOrder[0] === null) {
        auth_response(422, ['success' => false, 'message' => 'Invalid sort option.']);
    }
    $sortKey = $sortOrder[0];

    /* Status is a strict whitelist (all/upcoming/completed/cancelled);
       any other value returns 422 without echoing internal details. An empty
       value behaves like 'all'. The browser never supplies a passenger id. */
    $statusFilter = booking_status_filter($_GET['status'] ?? '');
    if ($statusFilter[0] === null) {
        auth_response(422, ['success' => false, 'message' => 'Invalid booking status.']);
    }
    $statusKey = $statusFilter[0];

    try {
        $pdo = db();
        $passengerId = (int) $user['id'];

        $total = booking_count_rows($pdo, $passengerId, null, $statusKey);
        $bookings = render_booking_rows($pdo, booking_list_rows($pdo, $passengerId, null, $pg['limit'], $pg['offset'], $sortKey, $statusKey));

        auth_response(200, [
            'success' => true,
            'bookings' => $bookings,
            'count' => $total,
            'hasMore' => ($pg['offset'] + count($bookings)) < $total,
        ]);
    } catch (Throwable $e) {
        auth_response(500, [
            'success' => false,
            'message' => 'Your bookings could not be loaded. Please try again later.',
        ]);
    }
}

/**
 * Shared WHERE fragment used by the list / search / count queries: a partial,
 * case-insensitive (MySQL collation) match over the booking reference, origin
 * city, destination city and company name. 4 distinct placeholders are used
 * because native prepares reject a single reused named placeholder. The value
 * is always bound (no injection).
 */
function booking_filter_fragment(string $q): string
{
    if ($q === '') { return ''; }
    return '
        AND (
            b.booking_reference LIKE :q1
         OR r.from_city         LIKE :q2
         OR r.to_city           LIKE :q3
         OR c.name              LIKE :q4
        )';
}

function booking_filter_values(string $q): array
{
    if ($q === '') { return []; }
    $like = '%' . $q . '%';
    return [':q1' => $like, ':q2' => $like, ':q3' => $like, ':q4' => $like];
}

/**
 * Strict whitelist for the passenger My Trips status tabs
 * The browser may only select one of the four opaque keys below;
 * the SQL condition is ALWAYS resolved here on the server so an arbitrary
 * status value from the browser can never reach a WHERE clause.
 *
 * Supported keys and their exact WHERE semantics (matching the project's
 * existing bookingStatus()/cancel rules):
 *   all        no status restriction (every booking owned by the passenger)
 *   upcoming   real, not-cancelled/completed bookings whose trip has not yet
 *              departed (booking_status pending/confirmed AND departure_date
 *              not before today)
 *   completed  bookings whose existing booking_status is 'completed'
 *   cancelled  bookings whose existing booking_status is 'cancelled'
 *
 * An empty / missing status behaves like 'all' (no status filter), matching
 * the pre-existing list behaviour. An unknown value returns [null, null] so
 * the caller can reply HTTP 422 without echoing any internal value. The
 * returned fragment is only ever chosen from this whitelist.
 *
 * @return array  [key|null, whereFragment|null]
 */
function booking_status_filter(?string $status): array
{
    $key = trim((string) $status);

    if ($key === '') {
        return ['all', ''];
    }

    switch ($key) {
        case 'all':
            return ['all', ''];
        case 'upcoming':
            return [
                'upcoming',
                " AND b.booking_status NOT IN ('cancelled','completed') "
                    . 'AND t.departure_date >= CURDATE()',
            ];
        case 'completed':
            return ['completed', " AND b.booking_status = 'completed'"];
        case 'cancelled':
            return ['cancelled', " AND b.booking_status = 'cancelled'"];
        default:
            return [null, null];
    }
}

/* ============================================================
   Shared list/search query — the passenger's own bookings.
   Ownership is ALWAYS part of the WHERE clause and passenger_id
   comes from the authenticated session ($user['id']), never from
   a browser-supplied user id. When $q is non-empty the query adds
   a partial, case-insensitive match over the booking reference,
   origin city, destination city and company name. mysql LIKE is
   used with a bound parameter (no injection). Order is newest
   first (created_at DESC, id DESC); the validated $limit/$offset
   drive the page window.
   ============================================================ */
function booking_list_rows(PDO $pdo, int $passengerId, ?string $q = null, int $limit = 20, int $offset = 0, string $sort = 'newest', ?string $status = null): PDOStatement
{
    /* ORDER BY is resolved ONLY through the booking_sort_order() whitelist.
       The fallback here is a hard-coded constant, never browser input. The
       status condition is likewise resolved ONLY through booking_status_filter()
       (whitelist) so a hostile browser value can never reach the WHERE clause. */
    $order = booking_sort_order($sort);
    $orderBy = ($order !== null) ? $order[1] : 'b.created_at DESC, b.id DESC';

    $statusFrag = booking_status_filter($status);
    if ($statusFrag[0] === null) {
        throw new BookingBusinessException('Invalid booking status.', 422);
    }

    $sql = booking_base_sql() . '
        WHERE b.passenger_id = :uid'
        . $statusFrag[1]
        . booking_filter_fragment((string) $q) . '
        ORDER BY ' . $orderBy . '
        LIMIT ' . $limit . ' OFFSET ' . $offset;

    $params = array_merge([':uid' => $passengerId], booking_filter_values((string) $q));

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return $stmt;
}

/**
 * Total number of matching bookings BEFORE pagination (used to compute count
 * and hasMore). Reuses the exact same passenger-scoped WHERE + optional search
 * filter as booking_list_rows so the page window and the total always agree.
 */
function booking_count_rows(PDO $pdo, int $passengerId, ?string $q = null, ?string $status = null): int
{
    $statusFrag = booking_status_filter($status);
    if ($statusFrag[0] === null) {
        throw new BookingBusinessException('Invalid booking status.', 422);
    }

    $sql = '
        SELECT COUNT(*) AS total
        FROM bookings b
        JOIN trips t     ON t.id = b.trip_id
        JOIN buses b2    ON b2.id = t.bus_id
        JOIN companies c ON c.id = t.company_id
        JOIN routes r    ON r.id = t.route_id
        WHERE b.passenger_id = :uid'
        . $statusFrag[1]
        . booking_filter_fragment((string) $q);

    $params = array_merge([':uid' => $passengerId], booking_filter_values((string) $q));

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return (int) ($row && isset($row['total']) ? $row['total'] : 0);
}

function render_booking_rows(PDO $pdo, PDOStatement $stmt): array
{
    $bookings = [];
    foreach ($stmt->fetchAll() as $row) {
        $bookings[] = booking_payload($pdo, $row);
    }

    return $bookings;
}

/* ============================================================
   GET search â the passenger's own booking history search.
   Accepts api/booking.php?action=search&q=TERM. Only the query
   is read from the browser; the passenger comes from the session
   and every booking is scoped to passenger_id = session user.
   ============================================================ */
function handle_search(): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    $user = require_active_passenger();

    $q = trim((string) ($_GET['q'] ?? ''));

    /* Oversized / pathological inputs are rejected up front. The value is
       always bound through PDO, so there is no injection surface here. */
    if (strlen($q) > 200) {
        auth_response(422, [
            'success' => false,
            'message' => 'Search query is too long.',
        ]);
    }

    $pg = booking_pagination();

    $sortOrder = booking_sort_order($_GET['sort'] ?? '');
    if ($sortOrder[0] === null) {
        auth_response(422, ['success' => false, 'message' => 'Invalid sort option.']);
    }
    $sortKey = $sortOrder[0];

    /* Status whitelist (same rules as action=list). Applied to BOTH the
       result rows and the total count so search + status + pagination stay
       consistent. Ownership remains session-scoped below. */
    $statusFilter = booking_status_filter($_GET['status'] ?? '');
    if ($statusFilter[0] === null) {
        auth_response(422, ['success' => false, 'message' => 'Invalid booking status.']);
    }
    $statusKey = $statusFilter[0];

    try {
        $pdo = db();
        $passengerId = (int) $user['id'];

        /* An empty q returns the passenger's normal booking list. */
        $total = booking_count_rows($pdo, $passengerId, $q, $statusKey);
        $bookings = render_booking_rows($pdo, booking_list_rows($pdo, $passengerId, $q, $pg['limit'], $pg['offset'], $sortKey, $statusKey));

        auth_response(200, [
            'success' => true,
            'bookings' => $bookings,
            'count' => $total,
            'hasMore' => ($pg['offset'] + count($bookings)) < $total,
        ]);
    } catch (Throwable $e) {
        auth_response(500, [
            'success' => false,
            'message' => 'Your bookings could not be searched. Please try again later.',
        ]);
    }
}

/* ============================================================
   GET get — one booking / ticket (owner only, by ref or id)
   ============================================================ */
function handle_get(): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    $user = requireLogin();

    $ref = trim((string) ($_GET['ref'] ?? ''));
    $id = (int) ($_GET['id'] ?? 0);

    if ($ref === '' && $id <= 0) {
        auth_response(400, ['success' => false, 'message' => 'A booking reference or id is required.']);
    }

    try {
        $pdo = db();

        /* Passenger owners see their own bookings. Companies may open the
           passenger confirmation page for bookings made on their own trips
           (office / call-in bookings), so ownership is derived server-side. */
        $sql = '';
        $params = [];

        if (($user['role'] ?? '') === 'company') {
            $companyStmt = $pdo->prepare('SELECT id FROM companies WHERE user_id = :uid LIMIT 1');
            $companyStmt->execute([':uid' => (int) $user['id']]);
            $companyId = (int) $companyStmt->fetchColumn();
            if ($companyId <= 0) {
                auth_response(403, ['success' => false, 'message' => 'No company is linked to this account.']);
            }

            $sql = booking_base_sql() . ' WHERE t.company_id = :cid';
            $params[':cid'] = $companyId;
        } else {
            $user = require_active_passenger();
            $sql = booking_base_sql() . ' WHERE b.passenger_id = :uid';
            $params[':uid'] = (int) $user['id'];
        }

        if ($id > 0) {
            $sql .= ' AND b.id = :id LIMIT 1';
            $params[':id'] = $id;
        } else {
            $sql .= ' AND b.booking_reference = :ref LIMIT 1';
            $params[':ref'] = $ref;
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();

        if ($row === false) {
            auth_response(404, ['success' => false, 'message' => 'Booking not found.']);
        }

        auth_response(200, [
            'success' => true,
            'booking' => booking_payload($pdo, $row),
        ]);
    } catch (Throwable $e) {
        auth_response(500, [
            'success' => false,
            'message' => 'The booking could not be loaded. Please try again later.',
        ]);
    }
}

/* ============================================================
   POST cancel — owner only; seats are released again
   ============================================================ */
function handle_cancel(): void
{
    require_booking_post();
    $user = require_active_passenger();

    $input = booking_input();
    $id = (int) ($input['id'] ?? 0);

    if ($id <= 0) {
        auth_response(422, ['success' => false, 'message' => 'A booking id is required.']);
    }

    $pdo = db();

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare('
            SELECT b.id, b.booking_status, b.payment_status, b.total_amount, t.departure_date
            FROM bookings b
            JOIN trips t ON t.id = b.trip_id
            WHERE b.id = :id AND b.passenger_id = :uid
            FOR UPDATE');
        $stmt->execute([':id' => $id, ':uid' => (int) $user['id']]);
        $book = $stmt->fetch();

        if ($book === false) {
            throw new BookingBusinessException('Booking not found.', 404);
        }

        if ($book['booking_status'] === 'cancelled') {
            throw new BookingBusinessException('This booking is already cancelled.', 409);
        }

        if ($book['booking_status'] === 'completed') {
            throw new BookingBusinessException('Completed trips cannot be cancelled.', 409);
        }

        if ($book['departure_date'] < date('Y-m-d')) {
            throw new BookingBusinessException('This trip has already departed and cannot be cancelled.', 409);
        }

        $upd = $pdo->prepare('UPDATE bookings SET booking_status = \'cancelled\' WHERE id = :id AND passenger_id = :uid');
        $upd->execute([':id' => $id, ':uid' => (int) $user['id']]);

        $pdo->commit();

        $row = find_booking_row($pdo, $id, (int) $user['id']);

        /* Real notification: booking cancelled. Created ONLY after the
           cancellation is persisted (a failed/second cancellation throws before
           this point and never creates a notification). The booking reference
           is the application-level dedup token. */
        try {
            if ($row !== null) {
                createNotification(
                    $pdo,
                    (int) $user['id'],
                    'booking',
                    'Booking Cancelled',
                    'Your booking ' . $row['booking_reference'] . ' (' . $row['from_city'] . ' → '
                        . $row['to_city'] . ') on ' . $row['departure_date'] . ' has been cancelled.',
                    'booking-cancelled:' . $row['booking_reference']
                );
            }
        } catch (Throwable $e) {
            /* Best-effort only — never let a notification failure alter the response. */
        }

        auth_response(200, [
            'success' => true,
            'message' => 'Booking cancelled.',
            'booking' => booking_payload($pdo, $row),
        ]);
    } catch (BookingBusinessException $e) {
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
            'message' => 'The booking could not be cancelled. Please try again.',
        ]);
    }
}

/* ============================================================
   Dispatcher
   ============================================================ */
$action = booking_action();

if ($action === 'availability') {
    handle_availability();
}
if ($action === 'create') {
    handle_create();
}
if ($action === 'list') {
    handle_list();
}
if ($action === 'search') {
    handle_search();
}
if ($action === 'get') {
    handle_get();
}
if ($action === 'cancel') {
    handle_cancel();
}

auth_response(400, [
    'success' => false,
    'message' => 'Unsupported action. Use action=availability, create, list, get, search, cancel.',
]);