<?php

declare(strict_types=1);

/**
 * ET Transport — Admin API.
 *
 * Server-authorized admin operator interface for company approval lifecycle
 * management. Every action is gated by requireRole('admin'). The authenticated
 * session user's `users.role = 'admin'` is the ONLY source of admin identity —
 * browser values (role=admin, user_id, status=approved, hidden fields, URL
 * parameters) are never trusted.
 *
 * A company targeted by an admin action is the RESOURCE being administered
 * (companies.id from the request body). It is never the authorization identity.
 *
 * Adds READ-ONLY operational oversight on top of the admin lifecycle:
 *
 *   GET ?action=trips                     -> platform trip oversight (admin only)
 *   GET ?action=bookings                  -> platform-wide bookings (admin only)
 *   GET ?action=manifest&booking_id=N     -> admin-wide booking manifest
 *
 * The oversight endpoints are GET-only and never write. They observe trips,
 * bookings and booking_passengers/payments through the existing schema and
 * reuse the derived availability model (bus.seat_count - booked seats).
 *
 *   GET  ?action=overview            -> aggregate platform overview (admin only)
 *   GET  ?action=companies           -> admin company list (admin only)
 *   GET  ?action=company&id=N        -> one company's administrative summary
 *   POST ?action=company_approve     -> pending -> approved          (admin only)
 *   POST ?action=company_reject      -> pending|approved -> rejected (admin only)
 *   POST ?action=company_suspend     -> approved -> suspended        (admin only)
 *   POST ?action=company_activate    -> suspended -> approved        (admin only)
 *
 * State machine (from schema.sql — companies.status ENUM is
 * 'pending','approved','suspended','rejected' with the documented flow
 * "pending -> approved -> suspended | rejected"; users.status ENUM is
 * 'active','pending','suspended','rejected').
 *
 * Registration creates BOTH companies.status='pending' AND the linked
 * users.status='pending'. api/auth.php's login gate only lets a company in
 * when users.status='active' AND companies.status='approved' (suspended /
 * rejected / pending users and companies are each blocked in turn). Every
 * transition below therefore changes BOTH tables in ONE transaction so the
 * login pair can never drift apart. 'rejected' is intentionally final —
 * there is no approved-after-rejection path in the current model.
 */

require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/../config/notifications.php';

$requestMethod = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($requestMethod !== 'GET' && $requestMethod !== 'POST') {
    auth_response(405, [
        'success' => false,
        'message' => 'Method not allowed.',
    ]);
}

/** Read the request payload: JSON body when sent as JSON, otherwise form fields. */
function admin_input(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $decoded = json_decode((string) $raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    return $_POST;
}

/** Normalized lowercased action taken from the query string. */
function admin_action(): string
{
    return strtolower(trim((string) ($_GET['action'] ?? '')));
}

/** Stop with 405 unless the request is a POST (mutations only happen via POST). */
function require_admin_post(): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        auth_response(405, [
            'success' => false,
            'message' => 'Method not allowed.',
        ]);
    }
}

/**
 * Validate and normalize a company id. Rejects malformed, zero and negative
 * values with 422 before they can reach a SQL statement.
 */
function admin_company_id_or_error(mixed $raw, string $message = 'A valid company id is required.'): int
{
    $value = 0;
    if (is_int($raw)) {
        $value = $raw;
    } elseif (is_string($raw) && preg_match('/^\d{1,18}$/', trim($raw)) === 1) {
        $value = (int) trim($raw);
    } else {
        auth_response(422, ['success' => false, 'message' => $message]);
    }

    if ($value <= 0) {
        auth_response(422, ['success' => false, 'message' => $message]);
    }

    return $value;
}
/**
 * Shape one company row into the admin-facing payload. Passwords, hashes,
 * sessions, reset tokens and authentication internals are NEVER included.
 * The linked user id is not exposed either — the backend resolves it when it
 * needs it, and the frontend only ever targets a company by company id.
 */
function admin_company_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'slug' => $row['slug'],
        'logo' => $row['logo'],
        'cover_image' => $row['cover_image'],
        'description' => $row['description'],
        'phone' => $row['phone'],
        'email' => $row['email'],
        'address' => $row['address'],
        'status' => $row['status'],
        'account_status' => $row['account_status'],
        'owner_name' => $row['owner_name'],
        'owner_email' => $row['owner_email'],
        'owner_phone' => $row['owner_phone'],
        'bus_count' => (int) $row['bus_count'],
        'trip_count' => (int) $row['trip_count'],
        'booking_count' => (int) $row['booking_count'],
        'passenger_count' => (int) $row['passenger_count'],
        'avg_rating' => round((float) $row['avg_rating'], 1),
        'review_count' => (int) $row['review_count'],
        'total_paid_revenue' => round((float) $row['total_paid_revenue'], 2),
        'created_at' => $row['created_at'],
        'updated_at' => $row['updated_at'],
    ];
}
/**
 * Shared admin company select: company profile + linked user account status +
 * light operational aggregates. All counts are schema-supported and derived,
 * never copied. COALESCE keeps zero-activity companies at 0.
 */
function admin_company_select_sql(): string
{
    return '
        SELECT
            c.id,
            c.name,
            c.slug,
            c.logo,
            c.cover_image,
            c.description,
            c.phone,
            c.email,
            c.address,
            c.status,
            c.created_at,
            c.updated_at,
            u.id                          AS user_id,
            u.name                        AS owner_name,
            u.email                       AS owner_email,
            u.phone                       AS owner_phone,
            u.status                      AS account_status,
            (SELECT COUNT(*) FROM buses b WHERE b.company_id = c.id) AS bus_count,
            (SELECT COUNT(*) FROM trips t WHERE t.company_id = c.id) AS trip_count,
            (SELECT COUNT(*)
               FROM bookings bk
               JOIN trips t ON t.id = bk.trip_id
              WHERE t.company_id = c.id) AS booking_count,
            (SELECT COUNT(*)
               FROM booking_passengers bp
               JOIN bookings bk ON bk.id = bp.booking_id
               JOIN trips t ON t.id = bk.trip_id
              WHERE t.company_id = c.id) AS passenger_count,
            COALESCE((SELECT AVG(rv.rating)
                        FROM reviews rv
                       WHERE rv.company_id = c.id
                         AND rv.status = \'approved\'), 0) AS avg_rating,
            (SELECT COUNT(*)
               FROM reviews rv
              WHERE rv.company_id = c.id
                AND rv.status = \'approved\') AS review_count,
            COALESCE((SELECT SUM(p.amount)
                        FROM payments p
                        JOIN bookings bk ON bk.id = p.booking_id
                        JOIN trips t ON t.id = bk.trip_id
                       WHERE t.company_id = c.id
                         AND p.status = \'paid\'), 0) AS total_paid_revenue
        FROM companies c
        JOIN users u ON u.id = c.user_id
    ';
}

/** All admin company rows, or a single row when :companyId is supplied. */
function fetch_admin_company_rows(PDO $pdo, ?int $companyId = null): array
{
    $sql = admin_company_select_sql();
    $params = [];

    if ($companyId !== null) {
        $sql .= ' WHERE c.id = :company_id LIMIT 1';
        $params[':company_id'] = $companyId;
    } else {
        $sql .= ' ORDER BY c.created_at DESC, c.id DESC';
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return $stmt->fetchAll();
}
/** GET ?action=overview — aggregate company approval stats (admin only). */
function handle_admin_overview(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    requireRole('admin');

    $stmt = $pdo->query('
        SELECT
            (SELECT COUNT(*) FROM companies) AS total_companies,
            (SELECT COUNT(*) FROM companies WHERE status = \'pending\') AS pending_companies,
            (SELECT COUNT(*) FROM companies WHERE status = \'approved\') AS approved_companies,
            (SELECT COUNT(*) FROM companies WHERE status = \'rejected\') AS rejected_companies,
            (SELECT COUNT(*) FROM companies WHERE status = \'suspended\') AS suspended_companies,
            (SELECT COUNT(*) FROM users WHERE role = \'company\') AS total_company_users,
            (SELECT COUNT(*) FROM buses) AS total_buses,
            (SELECT COUNT(*) FROM trips) AS total_trips,
            (SELECT COUNT(*) FROM bookings) AS total_bookings,
            COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.status = \'paid\'), 0) AS total_paid_revenue
    ');
    $row = $stmt->fetch();
    if ($row === false) {
        $row = [];
    }

    auth_response(200, [
        'success' => true,
        'overview' => [
            'totalCompanies' => (int) ($row['total_companies'] ?? 0),
            'pendingCompanies' => (int) ($row['pending_companies'] ?? 0),
            'approvedCompanies' => (int) ($row['approved_companies'] ?? 0),
            'rejectedCompanies' => (int) ($row['rejected_companies'] ?? 0),
            'suspendedCompanies' => (int) ($row['suspended_companies'] ?? 0),
            'totalCompanyUsers' => (int) ($row['total_company_users'] ?? 0),
            'totalBuses' => (int) ($row['total_buses'] ?? 0),
            'totalTrips' => (int) ($row['total_trips'] ?? 0),
            'totalBookings' => (int) ($row['total_bookings'] ?? 0),
            'totalPaidRevenue' => round((float) ($row['total_paid_revenue'] ?? 0), 2),
        ],
    ]);
}

/** GET /api/admin.php?action=companies — admin company directory (admin only). */
function handle_admin_companies(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    requireRole('admin');

    $rows = fetch_admin_company_rows($pdo);

    $companies = [];
    foreach ($rows as $row) {
        $companies[] = admin_company_payload($row);
    }

    auth_response(200, [
        'success' => true,
        'companies' => $companies,
    ]);
}

/** GET /api/admin.php?action=company&id=N — one company's admin summary. */
function handle_admin_company(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    requireRole('admin');

    $companyId = admin_company_id_or_error($_GET['id'] ?? null);

    $rows = fetch_admin_company_rows($pdo, $companyId);
    if (!$rows) {
        auth_response(404, [
            'success' => false,
            'message' => 'Company not found.',
        ]);
    }

    auth_response(200, [
        'success' => true,
        'company' => admin_company_payload($rows[0]),
    ]);
}
/* ============================================================
 Admin operational oversight (READ-ONLY)
   ------------------------------------------------------------
   The admin may inspect platform-wide trips, bookings and passenger
   manifests. Every handler below is gated by requireRole('admin');
   the authenticated session role is the ONLY source of admin
   identity (browser role/user/company parameters are never trusted).

   All three endpoints are GET-only and contain NO INSERT/UPDATE/
   DELETE/REPLACE statements. Each filter value is validated here and
   bound through prepared statements — raw request input is never
   concatenated into SQL. Availability / passenger counts are DERIVED
   from the existing tables (bus.seat_count, booking_passengers),
   never stored on trips or bookings.
   ============================================================ */

/** Validate a numeric, optional filter id. Empty -> null (no restriction). */
function admin_filter_id(mixed $value, string $message): ?int
{
    if ($value === null || $value === '') {
        return null;
    }
    return admin_company_id_or_error($value, $message);
}

/** Validate an optional enum filter. Empty -> null; unknown value -> 422. */
function admin_filter_enum(mixed $value, array $allowed, string $message): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    $normalized = strtolower(trim((string) $value));
    if (!in_array($normalized, $allowed, true)) {
        auth_response(422, ['success' => false, 'message' => $message]);
    }
    return $normalized;
}

/** Validate an optional Y-m-d date filter. Empty -> null; malformed -> 422. */
function admin_filter_date(mixed $value, string $message): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    $normalized = trim((string) $value);
    $parsed = DateTime::createFromFormat('Y-m-d', $normalized);
    if (!$parsed || $parsed->format('Y-m-d') !== $normalized) {
        auth_response(422, ['success' => false, 'message' => $message]);
    }
    return $normalized;
}
/* GET /api/admin.php?action=trips — platform trip oversight (admin only). */
function handle_admin_trips(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    requireRole('admin');

    $companyId = admin_filter_id($_GET['company_id'] ?? null, 'A valid company id is required.');
    $status = admin_filter_enum($_GET['status'] ?? null, ['scheduled', 'departed', 'completed', 'cancelled'], 'A valid trip status is required.');
    $dateFrom = admin_filter_date($_GET['date_from'] ?? null, 'A valid date_from (YYYY-MM-DD) is required.');
    $dateTo = admin_filter_date($_GET['date_to'] ?? null, 'A valid date_to (YYYY-MM-DD) is required.');

    if ($dateFrom !== null && $dateTo !== null && strcmp($dateFrom, $dateTo) > 0) {
        auth_response(422, ['success' => false, 'message' => 'date_from must not be after date_to.']);
    }

    $sql = '
        SELECT
            t.id,
            t.company_id,
            c.name                   AS company_name,
            t.route_id,
            r.from_city,
            r.to_city,
            r.duration               AS route_duration,
            t.bus_id,
            b.name                   AS bus_name,
            b.registration_number    AS bus_registration,
            b.bus_type,
            b.seat_count             AS seat_capacity,
            t.price,
            t.departure_date,
            t.departure_time,
            t.arrival_time,
            t.status,
            t.created_at,
            t.updated_at,
            (SELECT COUNT(*)
               FROM booking_passengers bp
               JOIN bookings bk ON bk.id = bp.booking_id
              WHERE bk.trip_id = t.id) AS booked_seats,
            COALESCE(canc.affected_booking_count, 0) AS affected_booking_count,
            COALESCE(canc.refund_required, 0) AS refund_required
        FROM trips t
        JOIN companies c ON c.id = t.company_id
        JOIN routes r   ON r.id = t.route_id
        JOIN buses b    ON b.id = t.bus_id
        LEFT JOIN (
            SELECT b2.trip_id AS trip_id,
                   COUNT(*) AS affected_booking_count,
                   SUM(CASE WHEN b2.payment_status = \'paid\' THEN 1 ELSE 0 END) AS refund_required
            FROM bookings b2
            WHERE b2.booking_status = \'cancelled\'
            GROUP BY b2.trip_id
        ) canc ON canc.trip_id = t.id
        WHERE 1 = 1
    ';
    $params = [];

    if ($companyId !== null) { $sql .= ' AND t.company_id = :company_id'; $params[':company_id'] = $companyId; }
    if ($status !== null) { $sql .= ' AND t.status = :status'; $params[':status'] = $status; }
    if ($dateFrom !== null) { $sql .= ' AND t.departure_date >= :date_from'; $params[':date_from'] = $dateFrom; }
    if ($dateTo !== null) { $sql .= ' AND t.departure_date <= :date_to'; $params[':date_to'] = $dateTo; }
    $sql .= ' ORDER BY t.departure_date ASC, t.departure_time ASC, t.id ASC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $trips = [];
    foreach ($stmt->fetchAll() as $row) {
        $capacity = (int) $row['seat_capacity'];
        $booked = (int) $row['booked_seats'];
        $trips[] = [
            'id' => (int) $row['id'],
            'company_id' => (int) $row['company_id'],
            'company_name' => $row['company_name'],
            'route_id' => (int) $row['route_id'],
            'from_city' => $row['from_city'],
            'to_city' => $row['to_city'],
            'route_duration' => $row['route_duration'] !== null ? (int) $row['route_duration'] : null,
            'bus_id' => (int) $row['bus_id'],
            'bus_name' => $row['bus_name'],
            'bus_registration' => $row['bus_registration'],
            'bus_type' => $row['bus_type'],
            'seat_capacity' => $capacity,
            'booked_seats' => $booked,
            'available_seats' => max(0, $capacity - $booked),
            'affected_booking_count' => (int) $row['affected_booking_count'],
            'refund_required' => (int) $row['refund_required'],
            'price' => (float) $row['price'],
            'departure_date' => $row['departure_date'],
            'departure_time' => $row['departure_time'],
            'arrival_time' => $row['arrival_time'],
            'status' => $row['status'],
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }

    auth_response(200, [
        'success' => true,
        'trips' => $trips,
    ]);
}
/* GET /api/admin.php?action=bookings — platform-wide bookings (admin only). */
function handle_admin_bookings(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    requireRole('admin');

    $companyId = admin_filter_id($_GET['company_id'] ?? null, 'A valid company id is required.');
    $tripId = admin_filter_id($_GET['trip_id'] ?? null, 'A valid trip id is required.');
    $bookingStatus = admin_filter_enum($_GET['booking_status'] ?? null, ['pending', 'confirmed', 'cancelled', 'completed'], 'A valid booking status is required.');
    $paymentStatus = admin_filter_enum($_GET['payment_status'] ?? null, ['pending', 'paid', 'failed', 'refunded'], 'A valid payment status is required.');
    $dateFrom = admin_filter_date($_GET['date_from'] ?? null, 'A valid date_from (YYYY-MM-DD) is required.');
    $dateTo = admin_filter_date($_GET['date_to'] ?? null, 'A valid date_to (YYYY-MM-DD) is required.');

    if ($dateFrom !== null && $dateTo !== null && strcmp($dateFrom, $dateTo) > 0) {
        auth_response(422, ['success' => false, 'message' => 'date_from must not be after date_to.']);
    }

    $sql = '
        SELECT
            b.id,
            b.booking_reference,
            b.trip_id,
            t.company_id,
            c.name                   AS company_name,
            b.booking_status,
            b.payment_status,
            b.total_amount,
            b.created_at,
            r.from_city              AS route_from,
            r.to_city                AS route_to,
            t.departure_date,
            t.departure_time,
            bu.name                  AS bus_name,
            bu.registration_number   AS bus_registration,
            (SELECT COUNT(*)
               FROM booking_passengers bp
              WHERE bp.booking_id = b.id) AS passenger_count
        FROM bookings b
        JOIN trips t     ON t.id = b.trip_id
        JOIN companies c ON c.id = t.company_id
        JOIN routes r    ON r.id = t.route_id
        JOIN buses bu    ON bu.id = t.bus_id
        WHERE 1 = 1
    ';
    $params = [];

    if ($companyId !== null) { $sql .= ' AND t.company_id = :company_id'; $params[':company_id'] = $companyId; }
    if ($tripId !== null) { $sql .= ' AND b.trip_id = :trip_id'; $params[':trip_id'] = $tripId; }
    if ($bookingStatus !== null) { $sql .= ' AND b.booking_status = :booking_status'; $params[':booking_status'] = $bookingStatus; }
    if ($paymentStatus !== null) { $sql .= ' AND b.payment_status = :payment_status'; $params[':payment_status'] = $paymentStatus; }
    if ($dateFrom !== null) { $sql .= ' AND b.created_at >= :date_from'; $params[':date_from'] = $dateFrom . ' 00:00:00'; }
    if ($dateTo !== null) {
        $sql .= ' AND b.created_at < :date_to_excl';
        $params[':date_to_excl'] = date('Y-m-d', strtotime($dateTo . ' +1 day')) . ' 00:00:00';
    }
    $sql .= ' ORDER BY b.created_at DESC, b.id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $bookings = [];
    foreach ($stmt->fetchAll() as $row) {
        $bookings[] = [
            'id' => (int) $row['id'],
            'booking_reference' => $row['booking_reference'],
            'trip_id' => (int) $row['trip_id'],
            'company_id' => (int) $row['company_id'],
            'company_name' => $row['company_name'],
            'booking_status' => $row['booking_status'],
            'payment_status' => $row['payment_status'],
            'total_amount' => (float) $row['total_amount'],
            'passenger_count' => (int) $row['passenger_count'],
            'route_from' => $row['route_from'],
            'route_to' => $row['route_to'],
            'departure_date' => $row['departure_date'],
            'departure_time' => $row['departure_time'],
            'bus_name' => $row['bus_name'],
            'bus_registration' => $row['bus_registration'],
            'created_at' => $row['created_at'],
        ];
    }

    auth_response(200, [
        'success' => true,
        'bookings' => $bookings,
    ]);
}
/* GET /api/admin.php?action=manifest&booking_id=N - admin-wide manifest. */
function handle_admin_manifest(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    requireRole('admin');

    $bookingId = admin_company_id_or_error($_GET['booking_id'] ?? null, 'A valid booking id is required.');

    $stmt = $pdo->prepare('
        SELECT
            b.id,
            b.booking_reference,
            b.booking_status,
            b.payment_status,
            b.total_amount,
            b.created_at,
            t.id                       AS trip_id,
            t.company_id,
            c.name                     AS company_name,
            r.from_city,
            r.to_city,
            t.departure_date,
            t.departure_time,
            t.arrival_time,
            bu.name                    AS bus_name,
            bu.registration_number     AS bus_registration,
            bu.bus_type
        FROM bookings b
        JOIN trips t     ON t.id = b.trip_id
        JOIN companies c ON c.id = t.company_id
        JOIN routes r    ON r.id = t.route_id
        JOIN buses bu    ON bu.id = t.bus_id
        WHERE b.id = :booking_id
        LIMIT 1
    ');
    $stmt->execute([':booking_id' => $bookingId]);
    $row = $stmt->fetch();

    if ($row === false) {
        auth_response(404, ['success' => false, 'message' => 'Booking not found.']);
    }

    $ps = $pdo->prepare('
        SELECT id, name, age, gender, phone, seat_number
        FROM booking_passengers
        WHERE booking_id = :booking_id
        ORDER BY id ASC
    ');
    $ps->execute([':booking_id' => $bookingId]);

    $passengers = [];
    foreach ($ps->fetchAll() as $p) {
        $passengers[] = [
            'id' => (int) $p['id'],
            'name' => $p['name'],
            'age' => $p['age'] !== null ? (int) $p['age'] : null,
            'gender' => $p['gender'],
            'phone' => $p['phone'],
            'seat_number' => $p['seat_number'],
        ];
    }

    auth_response(200, [
        'success' => true,
        'booking' => [
            'id' => (int) $row['id'],
            'booking_reference' => $row['booking_reference'],
            'booking_status' => $row['booking_status'],
            'payment_status' => $row['payment_status'],
            'total_amount' => (float) $row['total_amount'],
            'created_at' => $row['created_at'],
        ],
        'trip' => [
            'id' => (int) $row['trip_id'],
            'company_id' => (int) $row['company_id'],
            'company_name' => $row['company_name'],
            'from_city' => $row['from_city'],
            'to_city' => $row['to_city'],
            'departure_date' => $row['departure_date'],
            'departure_time' => $row['departure_time'],
            'arrival_time' => $row['arrival_time'],
            'bus_name' => $row['bus_name'],
            'bus_registration' => $row['bus_registration'],
            'bus_type' => $row['bus_type'],
        ],
        'passengers' => $passengers,
    ]);
}
/**
 * POST /api/admin.php?action=company_* — one atomic lifecycle transition.
 *
 * Both companies.status and the linked users.status must be in the exact
 * pre-state for the requested transition; otherwise the mutation responds
 * with a 409 conflict and changes nothing. 'rejected' is final in this
 * application's model (schema comment "pending -> approved -> suspended |
 * rejected"), so there is no way out of it here.
 */
function apply_company_status(PDO $pdo, array $input, string $action): void
{
    switch ($action) {
        case 'company_approve':
            $newCompanyStatus = 'approved';
            $newAccountStatus = 'active';
            $allowedStates = [['pending', 'pending']];
            $message = 'Company approved. The owner account is now active.';
            break;

        case 'company_reject':
            $newCompanyStatus = 'rejected';
            $newAccountStatus = 'rejected';
            $allowedStates = [['pending', 'pending'], ['approved', 'active']];
            $message = 'Company rejected. The owner account is now rejected and login remains blocked.';
            break;

        case 'company_suspend':
            $newCompanyStatus = 'suspended';
            $newAccountStatus = 'suspended';
            $allowedStates = [['approved', 'active']];
            $message = 'Company suspended. The owner account is suspended and login is blocked.';
            break;

        case 'company_activate':
            $newCompanyStatus = 'approved';
            $newAccountStatus = 'active';
            $allowedStates = [['suspended', 'suspended']];
            $message = 'Company reactivated. The owner account is active again.';
            break;

        default:
            return;
    }

    $companyId = admin_company_id_or_error($input['company_id'] ?? null);

    try {
        $pdo->beginTransaction();

        /* The admin is the only writer here, but FOR UPDATE still serializes
           against any concurrent process and anchors the guarded updates. */
        $sel = $pdo->prepare('
            SELECT c.id, c.user_id, c.name, c.status AS company_status, u.status AS account_status
            FROM companies c
            JOIN users u ON u.id = c.user_id
            WHERE c.id = :company_id
            LIMIT 1
            FOR UPDATE
        ');
        $sel->execute([':company_id' => $companyId]);
        $row = $sel->fetch();

        if ($row === false) {
            $pdo->rollBack();
            auth_response(404, [
                'success' => false,
                'message' => 'Company not found.',
            ]);
        }

        $companyStatus = $row['company_status'];
        $accountStatus = $row['account_status'];

        $stateOk = false;
        foreach ($allowedStates as $pair) {
            if ($pair[0] === $companyStatus && $pair[1] === $accountStatus) {
                $stateOk = true;
                break;
            }
        }

        if (!$stateOk) {
            $pdo->rollBack();
            auth_response(409, [
                'success' => false,
                'message' => 'This company cannot be changed to the requested state.',
            ]);
        }
$updCompany = $pdo->prepare('
            UPDATE companies
            SET status = :new_status
            WHERE id = :company_id AND status = :current_status
        ');
        $updCompany->execute([
            ':new_status' => $newCompanyStatus,
            ':company_id' => $companyId,
            ':current_status' => $companyStatus,
        ]);

        $updUser = $pdo->prepare('
            UPDATE users
            SET status = :new_status
            WHERE id = :user_id AND status = :current_status
        ');
        $updUser->execute([
            ':new_status' => $newAccountStatus,
            ':user_id' => (int) $row['user_id'],
            ':current_status' => $accountStatus,
        ]);

        if ($updCompany->rowCount() === 0 || $updUser->rowCount() === 0) {
            $pdo->rollBack();
            auth_response(409, [
                'success' => false,
                'message' => 'This company cannot be changed to the requested state.',
            ]);
        }

        /* Optional in-app notification for the affected company owner, using
           the existing notification helper inside the same transaction. The
           recipient is the company's real user (server-resolved), never a
           browser value. No email/SMS/Telegram is ever sent. */
        $label = $action === 'company_approve' ? 'approved'
            : ($action === 'company_reject' ? 'rejected'
            : ($action === 'company_suspend' ? 'suspended' : 'activated'));

        createNotification(
            $pdo,
            (int) $row['user_id'],
            'general',
            'Company ' . $label,
            'Your company "' . $row['name'] . '" was ' . $label . ' by the platform admin.',
            'admin-' . $action . '-' . $companyId
        );

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    $fresh = fetch_admin_company_rows($pdo, $companyId);

    auth_response(200, [
        'success' => true,
        'message' => $message,
        'company' => $fresh ? admin_company_payload($fresh[0]) : null,
    ]);
}

/** POST entries — every mutation must pass requireRole('admin') FIRST. */
function require_admin_mutation(PDO $pdo, string $action): void
{
    require_admin_post();
    $user = requireRole('admin');
    unset($user);

    apply_company_status($pdo, admin_input(), $action);
}
try {
    $pdo = db();
    $action = admin_action();

    if ($action === 'overview') {
        handle_admin_overview($pdo);
    }

    if ($action === 'companies') {
        handle_admin_companies($pdo);
    }

    if ($action === 'company') {
        handle_admin_company($pdo);
    }

    if ($action === 'trips') {
        handle_admin_trips($pdo);
    }

    if ($action === 'bookings') {
        handle_admin_bookings($pdo);
    }

    if ($action === 'manifest') {
        handle_admin_manifest($pdo);
    }

    if ($action === 'company_approve') {
        require_admin_mutation($pdo, 'company_approve');
    }

    if ($action === 'company_reject') {
        require_admin_mutation($pdo, 'company_reject');
    }

    if ($action === 'company_suspend') {
        require_admin_mutation($pdo, 'company_suspend');
    }

    if ($action === 'company_activate') {
        require_admin_mutation($pdo, 'company_activate');
    }

    auth_response(400, [
        'success' => false,
        'message' => 'Unsupported action. Use action=overview, action=companies, action=company, action=trips, action=bookings, action=manifest, action=company_approve, action=company_reject, action=company_suspend or action=company_activate.',
    ]);
} catch (Throwable $e) {
    auth_response(500, [
        'success' => false,
        'message' => 'Admin data is temporarily unavailable. Please try again later.',
    ]);
}