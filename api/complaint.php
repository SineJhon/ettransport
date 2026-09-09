<?php

declare(strict_types=1);

/**
 * ET Transport — Complaint API (passenger side).
 *
 * Real, database-backed passenger complaints against a bus company.
 *
 *   POST api/complaint.php?action=create   { company_id, category, subject,
 *                                                  message, booking_reference? }  (passenger)
 *   GET  api/complaint.php?action=list     (passenger)
 *
 * The `complaints` table is created by config/database.php / schema.sql and
 * carries this shape: passenger_id → users, company_id → companies,
 * booking_id → bookings (nullable), category, subject, message,
 * status ENUM('open','in_progress','resolved','closed'),
 * response + response_at (the company's reply).
 *
 * Server-side rules (the client is never trusted):
 *   - company_id must reference a board-visible company (approved + listed +
 *     active account), so passengers cannot complain about a hidden one;
 *   - passenger_id always comes from the session;
 *   - category must be in the catalog (refund_issue, lost_parcel,
 *     crew_behavior, comfort, luggage, late_departure, cancelled_trip,
 *     missed_bus, other);
 *   - an optional booking_reference is looked up against the passenger's OWN
 *     bookings for that company; the resolved booking_id is stored.
 *
 * Company operators triage these from the company dashboard via
 * api/company.php?action=complaints / complaint_update; those endpoints own
 * the status/response lifecycle and notify the passenger on response.
 */

require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/../config/notifications.php';

const COMPLAINT_CATEGORIES = [
    'refund_issue',
    'lost_parcel',
    'crew_behavior',
    'comfort',
    'luggage',
    'late_departure',
    'cancelled_trip',
    'missed_bus',
    'other',
];

const COMPLAINT_SUBJECT_MAX = 120;   // schema: varchar(120)
const COMPLAINT_MESSAGE_MAX = 1000;
const COMPLAINT_REFERENCE_MAX = 30;  // bookings.booking_reference: varchar(30)

function complaint_input(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $decoded = json_decode((string) $raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    return $_POST;
}

function complaint_action(): string
{
    return strtolower(trim((string) ($_GET['action'] ?? '')));
}

function require_complaint_post(): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        auth_response(405, [
            'success' => false,
            'message' => 'Method not allowed.',
        ]);
    }
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

/** True when the value is one of the complaint category catalog values. */
function valid_complaint_category(string $value): bool
{
    return in_array($value, COMPLAINT_CATEGORIES, true);
}

/**
 * A public-visible company (approved + listed + active user), or a 404
 * response. Returns the row so the caller can notify the right user.
 */
function complaint_target_company(PDO $pdo, int $companyId): array
{
    $stmt = $pdo->prepare('
        SELECT c.id, c.user_id, c.name
        FROM companies c
        JOIN users u ON u.id = c.user_id
        WHERE c.id = :id
          AND c.status = \'approved\'
          AND c.listed = 1
          AND u.status = \'active\'
        LIMIT 1');
    $stmt->execute([':id' => $companyId]);
    $row = $stmt->fetch();
    if ($row === false) {
        auth_response(404, [
            'success' => false,
            'message' => 'Company not found.',
        ]);
    }
    return $row;
}

/** Safe passenger-facing payload for one complaint row. */
function passenger_complaint_payload(array $row): array
{
    $departure = '';
    if (($row['departure_date'] ?? null) !== null) {
        $departure = (string) $row['departure_date'];
        if (($row['departure_time'] ?? null) !== null) {
            $departure .= ' ' . $row['departure_time'];
        }
    }

    return [
        'id' => (int) $row['id'],
        'company_id' => (int) $row['company_id'],
        'company_name' => $row['company_name'] ?? '',
        'booking_id' => isset($row['booking_id']) && $row['booking_id'] !== null ? (int) $row['booking_id'] : null,
        'booking_reference' => $row['booking_reference'] ?? null,
        'category' => $row['category'] ?? 'other',
        'subject' => $row['subject'],
        'message' => $row['message'],
        'status' => $row['status'],
        'response' => $row['response'] !== null && $row['response'] !== '' ? (string) $row['response'] : null,
        'response_at' => $row['response_at'] ?? null,
        'route' => $row['route'] ?? null,
        'departure' => $departure === '' ? null : $departure,
        'created_at' => $row['created_at'] ?? '',
    ];
}

/** The one booking JOIN shared by insert/readback/list (keeps shape identical). */
function complaint_select_sql(): string
{
    return "
        SELECT c.id, c.company_id, c.booking_id, c.category,
               c.subject, c.message, c.status,
               c.response, c.response_at, c.created_at,
               co.name AS company_name,
               b.booking_reference,
               CONCAT(r.from_city, ' → ', r.to_city) AS route,
               t.departure_date, t.departure_time
        FROM complaints c
        JOIN companies co ON co.id = c.company_id
        LEFT JOIN bookings b ON b.id = c.booking_id
        LEFT JOIN trips t ON t.id = b.trip_id
        LEFT JOIN routes r ON r.id = t.route_id
    ";
}
/* ============================================================
   POST create — file a complaint against a public company.
   ============================================================ */
function handle_create(): void
{
    require_complaint_post();
    $user = require_active_passenger();
    $input = complaint_input();

    $companyId = (int) ($input['company_id'] ?? 0);
    if ($companyId <= 0) {
        auth_response(422, ['success' => false, 'message' => 'A company is required.']);
    }

    $category = trim((string) ($input['category'] ?? 'other'));
    if (!valid_complaint_category($category)) {
        auth_response(422, ['success' => false, 'message' => 'Unknown complaint category.']);
    }

    $subject = trim((string) ($input['subject'] ?? ''));
    if ($subject === '') {
        auth_response(422, ['success' => false, 'message' => 'A subject is required.']);
    }
    if (mb_strlen($subject) > COMPLAINT_SUBJECT_MAX) {
        auth_response(422, ['success' => false, 'message' => 'Subject must be ' . COMPLAINT_SUBJECT_MAX . ' characters or fewer.']);
    }

    $message = trim((string) ($input['message'] ?? ''));
    if ($message === '') {
        auth_response(422, ['success' => false, 'message' => 'A message is required.']);
    }
    if (mb_strlen($message) > COMPLAINT_MESSAGE_MAX) {
        auth_response(422, ['success' => false, 'message' => 'Message must be ' . COMPLAINT_MESSAGE_MAX . ' characters or fewer.']);
    }

    $bookingRef = trim((string) ($input['booking_reference'] ?? ''));
    if ($bookingRef !== '' && mb_strlen($bookingRef) > COMPLAINT_REFERENCE_MAX) {
        auth_response(422, ['success' => false, 'message' => 'Booking reference must be ' . COMPLAINT_REFERENCE_MAX . ' characters or fewer.']);
    }

    $pdo = db();
    $company = complaint_target_company($pdo, $companyId);

    /* An optional booking reference must resolve to a booking the passenger
       owns on THIS company — ownership is part of the WHERE clause. */
    $bookingId = 0;
    if ($bookingRef !== '') {
        $bStmt = $pdo->prepare('
            SELECT b.id
            FROM bookings b
            JOIN trips t ON t.id = b.trip_id
            WHERE b.booking_reference = :ref
              AND b.passenger_id = :uid
              AND t.company_id = :company_id
            LIMIT 1
        ');
        $bStmt->execute([
            ':ref' => $bookingRef,
            ':uid' => (int) $user['id'],
            ':company_id' => $companyId,
        ]);
        $bookingRow = $bStmt->fetch();
        if ($bookingRow === false) {
            auth_response(422, ['success' => false, 'message' => 'Booking reference not found for your account on this company.']);
        }
        $bookingId = (int) $bookingRow['id'];
    }

    $stmt = $pdo->prepare('
        INSERT INTO complaints (company_id, passenger_id, booking_id, category, subject, message)
        VALUES (:company_id, :passenger_id, :booking_id, :category, :subject, :message)
    ');
    $stmt->execute([
        ':company_id' => $companyId,
        ':passenger_id' => (int) $user['id'],
        ':booking_id' => $bookingId > 0 ? $bookingId : null,
        ':category' => $category,
        ':subject' => $subject,
        ':message' => $message,
    ]);
    $newId = (int) $pdo->lastInsertId();

    /* Best-effort notifications: confirm to the passenger and alert the
       company operator. Neither ever alters the response on failure. */
    try {
        createNotification(
            $pdo,
            (int) $user['id'],
            'complaint',
            'Complaint Submitted',
            'Your complaint "' . $subject . '" for ' . $company['name'] . ' has been submitted. The company will respond soon.',
            'complaint-created:' . $newId
        );
        createNotification(
            $pdo,
            (int) $company['user_id'],
            'complaint',
            'Complaint Received',
            'A passenger submitted a complaint: "' . $subject . '".',
            'complaint-received:' . $newId
        );
    } catch (Throwable $e) {
        /* Best-effort only. */
    }

    $loadStmt = $pdo->prepare(complaint_select_sql() . ' WHERE c.id = :id LIMIT 1');
    $loadStmt->execute([':id' => $newId]);
    $row = $loadStmt->fetch();

    auth_response(201, [
        'success' => true,
        'message' => 'Complaint submitted. The company will respond soon.',
        'complaint' => passenger_complaint_payload($row),
    ]);
}

/* ============================================================
   GET list — the passenger's own complaints, newest first.
   Ownership is part of the WHERE clause — only own rows are ever returned.
   ============================================================ */
function handle_list(): void
{
    $user = require_active_passenger();
    $pdo = db();

    $stmt = $pdo->prepare(complaint_select_sql() . ' WHERE c.passenger_id = :uid ORDER BY c.created_at DESC, c.id DESC');
    $stmt->execute([':uid' => (int) $user['id']]);

    $complaints = [];
    foreach ($stmt->fetchAll() as $row) {
        $complaints[] = passenger_complaint_payload($row);
    }

    auth_response(200, [
        'success' => true,
        'complaints' => $complaints,
    ]);
}

try {
    $pdo = db();
    $action = complaint_action();

    if ($action === 'create') {
        handle_create();
    }
    if ($action === 'list') {
        handle_list();
    }

    auth_response(400, [
        'success' => false,
        'message' => 'Unsupported action. Use action=create or action=list.',
    ]);
} catch (Throwable $e) {
    auth_response(500, [
        'success' => false,
        'message' => 'Complaint service is temporarily unavailable. Please try again later.',
    ]);
}