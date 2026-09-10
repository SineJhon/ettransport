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
function passenger_complaint_payload(array $row, array $responses = []): array
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
        'responses' => $responses,
        'route' => $row['route'] ?? null,
        'departure' => $departure === '' ? null : $departure,
        'created_at' => $row['created_at'] ?? '',
    ];
}

/** The response thread of one complaint, oldest first. */
function fetch_passenger_complaint_responses(PDO $pdo, int $complaintId): array
{
    $stmt = $pdo->prepare('
        SELECT id, complaint_id, message, kind, actor, created_at, updated_at
        FROM complaint_responses
        WHERE complaint_id = :complaint_id
        ORDER BY id ASC
    ');
    $stmt->execute([':complaint_id' => $complaintId]);

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[] = [
            'id' => (int) $row['id'],
            'message' => $row['message'],
            'kind' => ($row['kind'] ?? 'message') === 'status' ? 'status' : 'message',
            'actor' => $row['actor'] ?? 'company',
            'created_at' => $row['created_at'] ?? '',
            'updated_at' => $row['updated_at'] ?? '',
        ];
    }
    return $out;
}

/** One complaint row owned by the passenger, or a 404 response. */
function fetch_passenger_complaint_row(PDO $pdo, int $passengerId, int $complaintId): array
{
    $stmt = $pdo->prepare(complaint_select_sql() . ' WHERE c.id = :id AND c.passenger_id = :uid LIMIT 1');
    $stmt->execute([':id' => $complaintId, ':uid' => $passengerId]);
    $row = $stmt->fetch();
    if ($row === false) {
        auth_response(404, [
            'success' => false,
            'message' => 'Complaint not found.',
        ]);
    }
    return $row;
}

/** Insert a status teller row into the thread. */
function insert_passenger_status_teller(PDO $pdo, int $complaintId, string $text, string $actor = 'system'): void
{
    $ins = $pdo->prepare('INSERT INTO complaint_responses (complaint_id, message, kind, actor) VALUES (:cid, :msg, \'status\', :actor)');
    $ins->execute([':cid' => $complaintId, ':msg' => $text, ':actor' => $actor]);
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
/** Passenger-owned post-complaint lifecycle actions.
 *  mode: reply | confirm_resolution | reopen | escalate.
 *  Ownership is part of the WHERE clause — only the passenger's own rows match. */
function passenger_complaint_mutation(PDO $pdo, string $mode): array
{
    $user = require_active_passenger();
    $input = complaint_input();

    $complaintId = (int) ($input['complaint_id'] ?? 0);
    if ($complaintId <= 0) {
        auth_response(422, ['success' => false, 'message' => 'A complaint id is required.']);
    }
    $row = fetch_passenger_complaint_row($pdo, (int) $user['id'], $complaintId);
    $currentStatus = (string) $row['status'];
    $notify = false;

    if ($mode === 'reply') {
        $message = trim((string) ($input['message'] ?? ''));
        if ($message === '') {
            auth_response(422, ['success' => false, 'message' => 'A message is required.']);
        }
        if (mb_strlen($message) > COMPLAINT_MESSAGE_MAX) {
            auth_response(422, ['success' => false, 'message' => 'Message must be ' . COMPLAINT_MESSAGE_MAX . ' characters or fewer.']);
        }
        if (in_array($currentStatus, ['resolved', 'closed'], true)) {
            auth_response(422, ['success' => false, 'message' => 'This complaint is ' . $currentStatus . ' and can no longer be replied to.']);
        }
        $ins = $pdo->prepare('INSERT INTO complaint_responses (complaint_id, message, kind, actor) VALUES (:cid, :msg, \'message\', \'passenger\')');
        $ins->execute([':cid' => $complaintId, ':message' => $message]);
        $targetStatus = $currentStatus;
        $notify = true;
    } elseif ($mode === 'confirm_resolution') {
        if ($currentStatus !== 'resolved_pending') {
            auth_response(422, ['success' => false, 'message' => 'There is no resolution waiting for your confirmation.']);
        }
        $targetStatus = 'resolved';
        insert_passenger_status_teller($pdo, $complaintId, 'Customer confirmed this complaint is resolved.', 'passenger');
        $notify = true;
    } elseif ($mode === 'reopen') {
        if ($currentStatus !== 'resolved_pending') {
            auth_response(422, ['success' => false, 'message' => 'There is no resolution to reopen.']);
        }
        $targetStatus = 'in_progress';
        insert_passenger_status_teller($pdo, $complaintId, 'Customer reopened this complaint — it needs more attention.', 'passenger');
        $notify = true;
    } elseif ($mode === 'escalate') {
        if (in_array($currentStatus, ['resolved', 'escalated'], true)) {
            auth_response(422, ['success' => false, 'message' => 'This complaint cannot be escalated.']);
        }
        $targetStatus = 'escalated';
        insert_passenger_status_teller($pdo, $complaintId, 'Customer requested admin assistance for this complaint.', 'passenger');
        $notify = true;
    } else {
        auth_response(400, ['success' => false, 'message' => 'Unknown complaint action.']);
    }

    $upd = $pdo->prepare('UPDATE complaints SET status = :status WHERE id = :id AND passenger_id = :uid');
    $upd->execute([':status' => $targetStatus, ':id' => $complaintId, ':uid' => (int) $user['id']]);

    if ($notify) {
        /* Notify the company operator so they can react. */
        $companyStmt = $pdo->prepare('SELECT user_id FROM companies WHERE id = :cid LIMIT 1');
        $companyStmt->execute([':cid' => (int) $row['company_id']]);
        $company = $companyStmt->fetch();
        $companyUserId = (int) ($company['user_id'] ?? 0);
        if ($companyUserId > 0) {
            try {
                $titleMsg = match ($mode) {
                    'reply' => 'A passenger replied to your complaint thread.',
                    'confirm_resolution' => 'A passenger confirmed a complaint is resolved.',
                    'reopen' => 'A passenger reopened a complaint.',
                    'escalate' => 'A passenger requested admin help on a complaint.',
                    default => 'A complaint was updated.',
                };
                createNotification(
                    $pdo,
                    $companyUserId,
                    'complaint',
                    'Complaint Update',
                    $titleMsg . ' ("' . $row['subject'] . '")',
                    'complaint-activity:' . $complaintId
                );
            } catch (Throwable $e) {
                /* Best-effort only. */
            }
        }
    }

    $updated = fetch_passenger_complaint_row($pdo, (int) $user['id'], $complaintId);
    return [
        'complaint' => passenger_complaint_payload($updated, fetch_passenger_complaint_responses($pdo, $complaintId)),
    ];
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

    /* Opening teller — the first entry in the chat thread. */
    insert_passenger_status_teller($pdo, $newId, 'Customer opened this complaint.', 'passenger');

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
        'complaint' => passenger_complaint_payload($row, fetch_passenger_complaint_responses($pdo, $newId)),
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
        $payload = passenger_complaint_payload($row);
        $payload['responses'] = fetch_passenger_complaint_responses($pdo, (int) $row['id']);
        $complaints[] = $payload;
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
    if (in_array($action, ['reply', 'confirm_resolution', 'reopen', 'escalate'], true)) {
        require_complaint_post();
        $result = passenger_complaint_mutation($pdo, $action);
        auth_response(200, array_merge([
            'success' => true,
            'message' => 'Complaint updated.',
        ], $result));
    }

    auth_response(400, [
        'success' => false,
        'message' => 'Unsupported action. Use action=create, action=list, action=reply, action=confirm_resolution, action=reopen or action=escalate.',
    ]);
} catch (Throwable $e) {
    auth_response(500, [
        'success' => false,
        'message' => 'Complaint service is temporarily unavailable. Please try again later.',
    ]);
}