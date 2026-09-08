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
 *   GET ?action=revenue                   -> per-company revenue overview (admin only)
 *   GET ?action=company_revenue           -> one company's online/office revenue breakdown
 *                                                           (company_id, month, year) (admin only)
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
 *   POST ?action=company_reject      -> pending -> rejected (admin only)
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
 * Validate a required rejection / suspension reason. Rejections and
 * suspensions MUST carry a non-empty reason the company owner can see.
 * Returns the trimmed final text (the admin's actual submitted reason).
 */
function admin_reason_or_error(mixed $raw): string
{
    $reason = trim((string) $raw);
    if ($reason === '') {
        auth_response(422, [
            'success' => false,
            'message' => 'A reason is required to reject or suspend a company.',
        ]);
    }

    $length = function_exists('mb_strlen') ? mb_strlen($reason) : strlen($reason);
    if ($length > 500) {
        auth_response(422, [
            'success' => false,
            'message' => 'The reason must be at most 500 characters.',
        ]);
    }

    return $reason;
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
        'listed' => (int) ($row['listed'] ?? 1),
        'account_status' => $row['account_status'],
        'current_reason' => $row['current_reason'] ?? null,
        'current_action' => $row['current_action'] ?? null,
        'current_action_at' => $row['current_action_at'] ?? null,
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
            c.listed,
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
                         AND p.status = \'paid\'), 0) AS total_paid_revenue,
            (SELECT rh.reason FROM company_reason_history rh
              WHERE rh.company_id = c.id
              ORDER BY rh.id DESC LIMIT 1) AS current_reason,
            (SELECT rh.action_type FROM company_reason_history rh
              WHERE rh.company_id = c.id
              ORDER BY rh.id DESC LIMIT 1) AS current_action,
            (SELECT rh.created_at FROM company_reason_history rh
              WHERE rh.company_id = c.id
              ORDER BY rh.id DESC LIMIT 1) AS current_action_at
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
            (SELECT COUNT(*) FROM companies c
               JOIN users u ON u.id = c.user_id
              WHERE c.status = \'approved\' AND u.status = \'active\') AS approved_companies,
            (SELECT COUNT(*) FROM companies WHERE status = \'rejected\') AS rejected_companies,
            (SELECT COUNT(*) FROM companies c
               JOIN users u ON u.id = c.user_id
              WHERE (c.status = \'approved\' AND u.status = \'suspended\')
                 OR c.status = \'suspended\') AS suspended_companies,
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

/**
 * GET /api/admin.php?action=reviews — platform reviews (admin only).
 *
 * The admin Reviews tab is for feedback ABOUT the ET Transport platform
 * itself — never about an individual company (company reviews are owned and
 * replied to by each company operator from their own dashboard).
 *
 * There is no platform-review storage table yet, so the demo media serves
 * one client-side mock platform review. This endpoint keeps the platform-only
 * contract (an empty, non-company feed) so real platform reviews can plug in
 * later without the admin UI changing.
 */
function handle_admin_reviews(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    requireRole('admin');

    auth_response(200, [
        'success' => true,
        'platformOnly' => true,
        'rating' => 0,
        'reviewCount' => 0,
        'reviews' => [],
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

/**
 * Validate optional revenue period filters. month: 1-12, year: 1970-2200.
 * Empty or missing -> null (no restriction). Malformed -> 422.
 */
function admin_filter_period(mixed $monthRaw, mixed $yearRaw): array
{
    $month = null;
    if ($monthRaw !== null && trim((string) $monthRaw) !== '') {
        $month = (int) trim((string) $monthRaw);
        if ($month < 1 || $month > 12) {
            auth_response(422, ['success' => false, 'message' => 'A valid month (1-12) is required.']);
        }
    }

    $year = null;
    if ($yearRaw !== null && trim((string) $yearRaw) !== '') {
        $year = (int) trim((string) $yearRaw);
        if ($year < 1970 || $year > 2200) {
            auth_response(422, ['success' => false, 'message' => 'A valid year (e.g. 2026) is required.']);
        }
    }

    return [$month, $year];
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

/** GET /api/admin.php?action=revenue — per-company revenue overview (admin only). */
function handle_admin_revenue(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    requireRole('admin');
    ensure_admin_parcel_payments_table($pdo);

    $stmt = $pdo->query('
        SELECT
            c.id,
            c.name,
            c.slug,
            c.logo,
            c.status,
            (SELECT COUNT(*) FROM trips t WHERE t.company_id = c.id) AS trip_count,
            COALESCE((SELECT COUNT(*)
                       FROM bookings bk
                       JOIN trips t ON t.id = bk.trip_id
                      WHERE t.company_id = c.id), 0) AS booking_count,
            COALESCE((SELECT SUM(p.amount)
                       FROM payments p
                       JOIN bookings bk ON bk.id = p.booking_id
                       JOIN trips t ON t.id = bk.trip_id
                      WHERE t.company_id = c.id
                        AND p.status IN (\'paid\', \'refunded\')), 0)
            + COALESCE((SELECT SUM(pp.amount) FROM parcel_payments pp WHERE pp.company_id = c.id), 0) AS collected_revenue
        FROM companies c
        ORDER BY collected_revenue DESC, c.name ASC
    ');

    $companies = [];
    foreach ($stmt->fetchAll() as $row) {
        $companies[] = [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'slug' => $row['slug'],
            'logo' => $row['logo'],
            'status' => $row['status'],
            'trip_count' => (int) $row['trip_count'],
            'booking_count' => (int) $row['booking_count'],
            'collected_revenue' => round((float) ($row['collected_revenue'] ?? 0), 2),
        ];
    }

    auth_response(200, [
        'success' => true,
        'companies' => $companies,
    ]);
}

/* GET /api/admin.php?action=company_revenue&company_id=N[&month=M][&year=Y] — one
   company's online / office (paid, refund, net) revenue breakdown (admin only).
   Missing month/year returns all time; year alone returns the whole year. The
   numbers reuse the platform revenue convention from the company dashboard:
   paid = every payment row that ever collected money for the company (paid +
   refunded), refunds = refunded_amount recorded per booking on half/full refunds,
   net = paid - refunds. Period filters apply to the booking creation date. */
function handle_admin_company_revenue(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    requireRole('admin');
    ensure_admin_parcel_payments_table($pdo);

    $companyId = admin_company_id_or_error($_GET['company_id'] ?? null, 'A valid company id is required.');
    [$month, $year] = admin_filter_period($_GET['month'] ?? null, $_GET['year'] ?? null);

    $companyStmt = $pdo->prepare('SELECT id, name, slug, logo FROM companies WHERE id = :company_id LIMIT 1');
    $companyStmt->execute([':company_id' => $companyId]);
    $company = $companyStmt->fetch();
    if ($company === false) {
        auth_response(404, ['success' => false, 'message' => 'Company not found.']);
    }

    $periodSql = '';
    $periodParams = [];
    if ($year !== null) {
        $periodSql .= ' AND YEAR(b.created_at) = :year';
        $periodParams[':year'] = $year;
    }
    if ($month !== null) {
        $periodSql .= ' AND MONTH(b.created_at) = :month';
        $periodParams[':month'] = $month;
    }

    $breakdown = [
        'online' => ['bookings' => 0, 'paid' => 0.0, 'refunds' => 0.0, 'net' => 0.0],
        'office' => ['bookings' => 0, 'paid' => 0.0, 'refunds' => 0.0, 'net' => 0.0],
    ];
    foreach (['online', 'office'] as $source) {
        $paidStmt = $pdo->prepare('
            SELECT
                COUNT(DISTINCT b.id) AS bookings,
                COALESCE(SUM(p.amount), 0) AS paid_amount
            FROM bookings b
            JOIN trips t ON t.id = b.trip_id
            LEFT JOIN payments p ON p.booking_id = b.id AND p.status IN (\'paid\', \'refunded\')
            WHERE t.company_id = :company_id
              AND b.booking_source = :source
              ' . $periodSql . '
        ');
        $paidStmt->execute(array_merge(
            [':company_id' => $companyId, ':source' => $source],
            $periodParams
        ));
        $paidRow = $paidStmt->fetch() ?: [];

        /* Refunds live on bookings (a half refund is not representable by the
           payment status alone). Aggregated once per booking so the same
           refund can never be counted twice. */
        $refundStmt = $pdo->prepare('
            SELECT COALESCE(SUM(
                CASE WHEN b.refund_type IN (\'half\', \'full\')
                     THEN COALESCE(b.refunded_amount, 0)
                     ELSE 0 END), 0) AS refunded_amount
            FROM bookings b
            JOIN trips t ON t.id = b.trip_id
            WHERE t.company_id = :company_id
              AND b.booking_source = :source
              ' . $periodSql . '
        ');
        $refundStmt->execute(array_merge(
            [':company_id' => $companyId, ':source' => $source],
            $periodParams
        ));
        $refundRow = $refundStmt->fetch() ?: [];

        $paid = round((float) ($paidRow['paid_amount'] ?? 0), 2);
        $refunds = round((float) ($refundRow['refunded_amount'] ?? 0), 2);
        $breakdown[$source] = [
            'bookings' => (int) ($paidRow['bookings'] ?? 0),
            'paid' => $paid,
            'refunds' => $refunds,
            'net' => round($paid - $refunds, 2),
        ];
    }

    /* Parcel counter sales are independent from office ticket bookings. */
    $parcelPeriod = '';
    $parcelParams = [':company_id' => $companyId];
    if ($year !== null) { $parcelPeriod .= ' AND YEAR(created_at) = :year'; $parcelParams[':year'] = $year; }
    if ($month !== null) { $parcelPeriod .= ' AND MONTH(created_at) = :month'; $parcelParams[':month'] = $month; }
    $parcelStmt = $pdo->prepare('SELECT COUNT(*) AS records, COALESCE(SUM(amount), 0) AS paid, COALESCE(SUM(refunded_amount), 0) AS refunds FROM parcel_payments WHERE company_id = :company_id' . $parcelPeriod);
    $parcelStmt->execute($parcelParams);
    $parcelRow = $parcelStmt->fetch() ?: [];
    $breakdown['parcels'] = ['bookings' => (int) ($parcelRow['records'] ?? 0), 'paid' => round((float) ($parcelRow['paid'] ?? 0), 2), 'refunds' => round((float) ($parcelRow['refunds'] ?? 0), 2), 'net' => round((float) ($parcelRow['paid'] ?? 0) - (float) ($parcelRow['refunds'] ?? 0), 2)];

    $total = [
        'bookings' => $breakdown['online']['bookings'] + $breakdown['office']['bookings'] + $breakdown['parcels']['bookings'],
        'paid' => round($breakdown['online']['paid'] + $breakdown['office']['paid'] + $breakdown['parcels']['paid'], 2),
        'refunds' => round($breakdown['online']['refunds'] + $breakdown['office']['refunds'] + $breakdown['parcels']['refunds'], 2),
        'net' => 0.0,
    ];
    $total['net'] = round($total['paid'] - $total['refunds'], 2);

    $label = 'All time';
    if ($year !== null && $month !== null) {
        $label = DateTime::createFromFormat('!m', (string) $month)->format('F') . ' ' . $year;
    } elseif ($year !== null) {
        $label = (string) $year;
    }

    auth_response(200, [
        'success' => true,
        'company' => [
            'id' => (int) $company['id'],
            'name' => $company['name'],
            'slug' => $company['slug'],
            'logo' => $company['logo'],
        ],
        'period' => [
            'month' => $month,
            'year' => $year,
            'label' => $label,
        ],
        'breakdown' => [
            'online' => $breakdown['online'],
            'office' => $breakdown['office'],
            'parcels' => $breakdown['parcels'],
            'total' => $total,
        ],
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
/* GET /api/admin.php?action=passengers — registered website passenger accounts
   (admin only). Office / walk-in booking accounts (synthetic walkin-*@ettransport.local
   users auto-created by api/company.php) are excluded — this list is for
   website-registered passenger owners only. Neither password hashes nor any
   authentication internals are ever included. */
function handle_admin_passengers(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    requireRole('admin');

    $search = trim((string) ($_GET['q'] ?? ''));
    if (strlen($search) > 120) {
        auth_response(422, ['success' => false, 'message' => 'Search text must be at most 120 characters.']);
    }
    $status = admin_filter_enum($_GET['status'] ?? null, ['active', 'pending', 'suspended', 'rejected'], 'A valid passenger account status is required.');
    $dateFrom = admin_filter_date($_GET['date_from'] ?? null, 'A valid date_from (YYYY-MM-DD) is required.');
    $dateTo = admin_filter_date($_GET['date_to'] ?? null, 'A valid date_to (YYYY-MM-DD) is required.');

    if ($dateFrom !== null && $dateTo !== null && strcmp($dateFrom, $dateTo) > 0) {
        auth_response(422, ['success' => false, 'message' => 'date_from must not be after date_to.']);
    }

    $sql = '
        SELECT
            u.id,
            u.name,
            u.email,
            u.phone,
            u.role,
            u.status,
            u.created_at,
            u.updated_at,
            (SELECT COUNT(*) FROM bookings bk WHERE bk.passenger_id = u.id) AS booking_count,
            (SELECT COUNT(*) FROM reviews rv WHERE rv.passenger_id = u.id) AS review_count,
            COALESCE((SELECT SUM(bk2.total_amount)
                        FROM bookings bk2
                       WHERE bk2.passenger_id = u.id
                         AND bk2.payment_status = \'paid\'), 0) AS total_spent
        FROM users u
        WHERE u.role = \'passenger\'
          AND u.email NOT LIKE \'walkin-%@ettransport.local\'
    ';
    $params = [];

    if ($search !== '') {
        $sql .= ' AND (u.name LIKE :search1 OR u.email LIKE :search2 OR u.phone LIKE :search3)';
        $params[':search1'] = '%' . $search . '%';
        $params[':search2'] = '%' . $search . '%';
        $params[':search3'] = '%' . $search . '%';
    }
    if ($status !== null) { $sql .= ' AND u.status = :status'; $params[':status'] = $status; }
    if ($dateFrom !== null) { $sql .= ' AND u.created_at >= :date_from'; $params[':date_from'] = $dateFrom . ' 00:00:00'; }
    if ($dateTo !== null) {
        $sql .= ' AND u.created_at < :date_to_excl';
        $params[':date_to_excl'] = date('Y-m-d', strtotime($dateTo . ' +1 day')) . ' 00:00:00';
    }
    $sql .= ' ORDER BY u.created_at DESC, u.id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $passengers = [];
    foreach ($stmt->fetchAll() as $row) {
        $passengers[] = [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'email' => $row['email'],
            'phone' => $row['phone'],
            'role' => $row['role'],
            'status' => $row['status'],
            'booking_count' => (int) $row['booking_count'],
            'review_count' => (int) $row['review_count'],
            'total_spent' => round((float) $row['total_spent'], 2),
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }

    auth_response(200, [
        'success' => true,
        'passengers' => $passengers,
    ]);
}

/* GET /api/admin.php?action=passenger&id=N — one passenger's admin detail
   (admin only). Same website-registered-user rule as the list: office /
   walk-in synthetic accounts are excluded with a 404. The detail bundles
   account info, bookings, reviews, refunds and liked companies so the admin
   popup can render them in one round trip. */
function handle_admin_passenger(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    requireRole('admin');

    $userId = admin_company_id_or_error($_GET['id'] ?? null, 'A valid passenger id is required.');

    $stmt = $pdo->prepare('
        SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.created_at, u.updated_at
        FROM users u
        WHERE u.id = :id
          AND u.role = :role
          AND u.email NOT LIKE \'walkin-%@ettransport.local\'
        LIMIT 1
    ');
    $stmt->execute([':id' => $userId, ':role' => 'passenger']);
    $user = $stmt->fetch();

    if ($user === false) {
        auth_response(404, ['success' => false, 'message' => 'Passenger not found.']);
    }

    $ids = [':id1' => $userId, ':id2' => $userId, ':id3' => $userId, ':id4' => $userId, ':id5' => $userId, ':id6' => $userId];
    $pid = [':passenger_id' => $userId];

    /* Aggregate counters. */
    $agg = $pdo->prepare('
        SELECT
            (SELECT COUNT(*) FROM bookings bk WHERE bk.passenger_id = :id1) AS booking_count,
            (SELECT COUNT(*) FROM reviews rv WHERE rv.passenger_id = :id2) AS review_count,
            (SELECT COUNT(*) FROM bookings bk WHERE bk.passenger_id = :id3 AND bk.refund_type <> \'none\') AS refund_count,
            COALESCE((SELECT SUM(bk2.refunded_amount)
                        FROM bookings bk2
                       WHERE bk2.passenger_id = :id4
                         AND bk2.refund_type <> \'none\'), 0) AS refund_total,
            (SELECT COUNT(DISTINCT r2.company_id)
               FROM review_likes rl2
               JOIN reviews r2 ON r2.id = rl2.review_id
              WHERE rl2.user_id = :id5) AS liked_company_count,
            COALESCE((SELECT SUM(bk3.total_amount)
                        FROM bookings bk3
                       WHERE bk3.passenger_id = :id6
                         AND bk3.payment_status = \'paid\'), 0) AS total_spent
    ');
    $agg->execute($ids);
    $a = $agg->fetch();

    /* Recent bookings (newest first). The manifest modal reuses the same
       booking id the rest of the platform uses. */
    $bs = $pdo->prepare('
        SELECT
            b.id,
            b.booking_reference,
            t.company_id,
            c.name             AS company_name,
            r.from_city        AS route_from,
            r.to_city          AS route_to,
            t.departure_date,
            t.departure_time,
            b.booking_status,
            b.payment_status,
            b.total_amount,
            b.refund_type,
            b.refunded_amount,
            b.created_at
        FROM bookings b
        JOIN trips t     ON t.id = b.trip_id
        JOIN companies c ON c.id = t.company_id
        JOIN routes r    ON r.id = t.route_id
        WHERE b.passenger_id = :passenger_id
        ORDER BY b.created_at DESC, b.id DESC
        LIMIT 60
    ');
    $bs->execute($pid);
    $bookings = [];
    foreach ($bs->fetchAll() as $b) {
        $bookings[] = [
            'id' => (int) $b['id'],
            'booking_reference' => $b['booking_reference'],
            'company_id' => (int) $b['company_id'],
            'company_name' => $b['company_name'],
            'route_from' => $b['route_from'],
            'route_to' => $b['route_to'],
            'departure_date' => $b['departure_date'],
            'departure_time' => $b['departure_time'],
            'booking_status' => $b['booking_status'],
            'payment_status' => $b['payment_status'],
            'total_amount' => (float) $b['total_amount'],
            'refund_type' => $b['refund_type'],
            'refunded_amount' => $b['refunded_amount'] !== null ? (float) $b['refunded_amount'] : null,
            'created_at' => $b['created_at'],
        ];
    }

    /* Reviews written by this passenger. */
    $rs = $pdo->prepare('
        SELECT
            rv.id,
            rv.company_id,
            c.name          AS company_name,
            rv.rating,
            rv.comment,
            rv.status,
            rv.likes,
            rv.reply,
            rv.created_at
        FROM reviews rv
        JOIN companies c ON c.id = rv.company_id
        WHERE rv.passenger_id = :passenger_id
        ORDER BY rv.created_at DESC, rv.id DESC
    ');
    $rs->execute($pid);
    $reviews = [];
    foreach ($rs->fetchAll() as $r) {
        $reviews[] = [
            'id' => (int) $r['id'],
            'company_id' => (int) $r['company_id'],
            'company_name' => $r['company_name'],
            'rating' => (int) $r['rating'],
            'comment' => $r['comment'],
            'status' => $r['status'],
            'likes' => (int) $r['likes'],
            'reply' => $r['reply'],
            'created_at' => $r['created_at'],
        ];
    }

    /* Refunded bookings (derived from the bookings the passenger owns). */
    $fs = $pdo->prepare('
        SELECT
            b.id,
            b.booking_reference,
            b.refund_type,
            b.refunded_amount,
            b.booking_status,
            b.payment_status,
            c.name             AS company_name,
            r.from_city        AS route_from,
            r.to_city          AS route_to,
            b.created_at
        FROM bookings b
        JOIN trips t     ON t.id = b.trip_id
        JOIN companies c ON c.id = t.company_id
        JOIN routes r    ON r.id = t.route_id
        WHERE b.passenger_id = :passenger_id
          AND b.refund_type <> \'none\'
        ORDER BY b.created_at DESC, b.id DESC
    ');
    $fs->execute($pid);
    $refunds = [];
    foreach ($fs->fetchAll() as $f) {
        $refunds[] = [
            'id' => (int) $f['id'],
            'booking_reference' => $f['booking_reference'],
            'refund_type' => $f['refund_type'],
            'refunded_amount' => $f['refunded_amount'] !== null ? (float) $f['refunded_amount'] : null,
            'booking_status' => $f['booking_status'],
            'payment_status' => $f['payment_status'],
            'company_name' => $f['company_name'],
            'route_from' => $f['route_from'],
            'route_to' => $f['route_to'],
            'created_at' => $f['created_at'],
        ];
    }

    /* Companies the passenger liked (through their liked reviews) — one row per company. */
    $ls = $pdo->prepare('
        SELECT
            c.id,
            c.name,
            c.slug,
            c.logo,
            MAX(rl.created_at)                    AS liked_at,
            COUNT(rl.id)                          AS liked_review_count
        FROM review_likes rl
        JOIN reviews r2   ON r2.id = rl.review_id
        JOIN companies c  ON c.id = r2.company_id
        WHERE rl.user_id = :passenger_id
        GROUP BY c.id, c.name, c.slug, c.logo
        ORDER BY liked_at DESC, c.name ASC
    ');
    $ls->execute($pid);
    $likedCompanies = [];
    foreach ($ls->fetchAll() as $l) {
        $likedCompanies[] = [
            'id' => (int) $l['id'],
            'name' => $l['name'],
            'slug' => $l['slug'],
            'logo' => $l['logo'],
            'liked_at' => $l['liked_at'],
            'liked_review_count' => (int) $l['liked_review_count'],
        ];
    }

    auth_response(200, [
        'success' => true,
        'passenger' => [
            'id' => (int) $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'phone' => $user['phone'],
            'role' => $user['role'],
            'status' => $user['status'],
            'booking_count' => (int) ($a['booking_count'] ?? 0),
            'review_count' => (int) ($a['review_count'] ?? 0),
            'refund_count' => (int) ($a['refund_count'] ?? 0),
            'refund_total' => round((float) ($a['refund_total'] ?? 0), 2),
            'liked_company_count' => (int) ($a['liked_company_count'] ?? 0),
            'total_spent' => round((float) ($a['total_spent'] ?? 0), 2),
            'created_at' => $user['created_at'],
            'updated_at' => $user['updated_at'],
        ],
        'bookings' => $bookings,
        'reviews' => $reviews,
        'refunds' => $refunds,
        'liked_companies' => $likedCompanies,
    ]);
}

/**
 * POST /api/admin.php?action=company_* — one atomic lifecycle transition.
 *
 * Approval lifecycle is carried by companies.status (pending | approved |
 * rejected), account lifecycle by users.status (active | suspended), and
 * public visibility by companies.listed. Each mutation checks the exact
 * pre-state, otherwise responds 409 and changes nothing.
 *
 * - approval admits a pending company (or a rejected company being reviewed
 *   again) and sets account_status='active'.
 * - rejection requires a non-empty reason, sets approval_status='rejected',
 *   account_status='active' and listing_status='off'.
 * - suspension requires a non-empty reason, keeps approval_status='approved',
 *   sets account_status='suspended' and listing_status='off'. The prior
 *   listing value is recorded in company_reason_history so an unsuspension
 *   can restore it.
 * - activation (unsuspension) restores account_status='active' and the exact
 *   listing recorded at suspension time — it never forces a hidden company
 *   public again.
 */
function apply_company_status(PDO $pdo, array $input, string $action, int $adminUserId): void
{
    $requiresReason = ($action === 'company_reject' || $action === 'company_suspend');
    $reason = null;
    if ($requiresReason) {
        $reason = admin_reason_or_error($input['reason'] ?? null);
    }

    switch ($action) {
        case 'company_approve':
            $newCompanyStatus = 'approved';
            $newAccountStatus = 'active';
            $allowedStates = [
                ['pending', 'pending'],
                ['pending', 'active'],
                ['rejected', 'active'],
                ['rejected', 'rejected'],
                ['rejected', 'suspended'],
            ];
            $message = 'Company approved. The owner account is now active.';
            break;

        case 'company_reject':
            $newCompanyStatus = 'rejected';
            $newAccountStatus = 'active';
            $allowedStates = [
                ['pending', 'pending'],
                ['pending', 'active'],
            ];
            $message = 'Company rejected. Listing turned off and login remains blocked.';
            break;

        case 'company_suspend':
            $newCompanyStatus = 'approved';
            $newAccountStatus = 'suspended';
            $allowedStates = [
                ['approved', 'active'],
            ];
            $message = 'Company suspended. The owner account is suspended and login is blocked.';
            break;

        case 'company_activate':
            $newCompanyStatus = 'approved';
            $newAccountStatus = 'active';
            $allowedStates = [
                ['approved', 'suspended'],
                ['suspended', 'suspended'],
                ['suspended', 'active'],
            ];
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
            SELECT c.id, c.user_id, c.name, c.status AS company_status, c.listed, u.status AS account_status
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
        $currentListed = (int) ($row['listed'] ?? 1);

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
/* Approval status update (only when it actually changes — suspension
           keeps approval_status='approved'). */
        if ($newCompanyStatus !== $companyStatus) {
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

            if ($updCompany->rowCount() === 0) {
                $pdo->rollBack();
                auth_response(409, [
                    'success' => false,
                    'message' => 'This company cannot be changed to the requested state.',
                ]);
            }
        }

        /* Account status update (only when it actually changes). */
        if ($newAccountStatus !== $accountStatus) {
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

            if ($updUser->rowCount() === 0) {
                $pdo->rollBack();
                auth_response(409, [
                    'success' => false,
                    'message' => 'This company cannot be changed to the requested state.',
                ]);
            }
        }

        /* Rejection / suspension always unlists the company and appends the
           reason to the audit history. The suspension row also remembers the
           listing that existed immediately before the suspension so that an
           unsuspension can restore it exactly. */
        if ($requiresReason) {
            $updList = $pdo->prepare('UPDATE companies SET listed = 0 WHERE id = :company_id');
            $updList->execute([':company_id' => $companyId]);

            if ($action === 'company_suspend') {
                $historyStmt = $pdo->prepare('
                    INSERT INTO company_reason_history
                        (company_id, action_type, reason, admin_user_id, listed_before)
                    VALUES
                        (:company_id, \'suspended\', :reason, :admin_user_id, :listed_before)
                ');
                $historyStmt->execute([
                    ':company_id' => $companyId,
                    ':reason' => $reason,
                    ':admin_user_id' => $adminUserId,
                    ':listed_before' => $currentListed,
                ]);
            } else {
                $historyStmt = $pdo->prepare('
                    INSERT INTO company_reason_history
                        (company_id, action_type, reason, admin_user_id)
                    VALUES
                        (:company_id, \'rejected\', :reason, :admin_user_id)
                ');
                $historyStmt->execute([
                    ':company_id' => $companyId,
                    ':reason' => $reason,
                    ':admin_user_id' => $adminUserId,
                ]);
            }
        }

        /* Unsuspension restores the exact listing recorded at suspension
           time, so it never makes a previously-hidden company public. */
        if ($action === 'company_activate') {
            $restore = $pdo->prepare('
                SELECT listed_before
                FROM company_reason_history
                WHERE company_id = :company_id AND action_type = \'suspended\'
                ORDER BY id DESC
                LIMIT 1
            ');
            $restore->execute([':company_id' => $companyId]);
            $listedBefore = $restore->fetchColumn();
            if ($listedBefore !== false && $listedBefore !== null) {
                $updList = $pdo->prepare('UPDATE companies SET listed = :listed WHERE id = :company_id');
                $updList->execute([':listed' => (int) $listedBefore, ':company_id' => $companyId]);
            }
        }

        /* In-app notification for the affected company owner, using the
           existing notification helper inside the same transaction. The
           recipient is the company's real user (server-resolved), never a
           browser value. No email/SMS/Telegram is ever sent. */
        $label = $action === 'company_approve' ? 'approved'
            : ($action === 'company_reject' ? 'rejected'
            : ($action === 'company_suspend' ? 'suspended' : 'activated'));

        $notificationBody = 'Your company "' . $row['name'] . '" was ' . $label . ' by the platform admin.';
        if ($requiresReason) {
            $notificationBody .= ' Reason: ' . $reason;
        }

        createNotification(
            $pdo,
            (int) $row['user_id'],
            'general',
            'Company ' . $label,
            $notificationBody,
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

/**
 * POST /api/admin.php?action=company_list | action=company_unlist —
 * toggle the company's public-directory listing flag.
 *
 * 'listed' only controls public visibility (the passenger-facing Companies
 * page, company profile and search). It never touches the approval lifecycle:
 * an approved-but-unlisted company still signs in and operates normally.
 *
 * Listing may ONLY be toggled for companies that are approval_status='approved'
 * AND account_status='active'. Suspended, rejected, and pending companies stay
 * hidden regardless of the flag.
 */
function update_company_listing(PDO $pdo, array $input, string $action): void
{
    $companyId = admin_company_id_or_error($input['company_id'] ?? null);
    $listed = $action === 'company_list' ? 1 : 0;

    try {
        $pdo->beginTransaction();

        $sel = $pdo->prepare('
            SELECT c.id, c.name, c.status, c.listed, u.status AS account_status
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

        if ($row['status'] !== 'approved' || $row['account_status'] !== 'active') {
            $pdo->rollBack();
            auth_response(409, [
                'success' => false,
                'message' => 'Listing can only be changed for approved active companies.',
            ]);
        }

        $upd = $pdo->prepare('UPDATE companies SET listed = :listed WHERE id = :company_id');
        $upd->execute([
            ':listed' => $listed,
            ':company_id' => $companyId,
        ]);

        $companyName = (string) $row['name'];

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
        'message' => $listed === 1
            ? '"' . $companyName . '" is now listed in the public directory.'
            : '"' . $companyName . '" is hidden from the public directory.',
        'company' => $fresh ? admin_company_payload($fresh[0]) : null,
    ]);
}

/**
 * POST /api/admin.php?action=company_delete — permanently remove a company
 * and its owner account.
 *
 * The company's own rows (buses, routes, company_branches, trips, reviews,
 * review_likes, notifications, company_reason_history) are deleted in FK-safe
 * order inside one transaction. Trips are removed FIRST because schema.sql
 * RESTRICTs trips.bus_id/trips.route_id, so a direct cascade from
 * companies would be blocked as long as those trips still reference a bus or
 * route. Passenger bookings are the deliberate safety valve: bookings table
 * RESTRICTs on trips (and passengers), so a company that has any passenger
 * booking rows cannot be deleted — this prevents destroying paid passenger
 * history.
 */
function delete_company(PDO $pdo, array $input): void
{
    $companyId = admin_company_id_or_error($input['company_id'] ?? null);

    try {
        $pdo->beginTransaction();

        $sel = $pdo->prepare('SELECT id, user_id, name FROM companies WHERE id = :company_id LIMIT 1 FOR UPDATE');
        $sel->execute([':company_id' => $companyId]);
        $company = $sel->fetch();

        if (!$company) {
            $pdo->rollBack();
            auth_response(404, [
                'success' => false,
                'message' => 'Company not found.',
            ]);
        }

        $bookings = $pdo->prepare('
            SELECT COUNT(*)
            FROM bookings bk
            JOIN trips t ON t.id = bk.trip_id
            WHERE t.company_id = :company_id
        ');
        $bookings->execute([':company_id' => $companyId]);
        if ((int) $bookings->fetchColumn() > 0) {
            $pdo->rollBack();
            auth_response(409, [
                'success' => false,
                'message' => 'This company has passenger bookings and cannot be deleted. Suspend or reject it instead.',
            ]);
        }

        /* FK-safe child order: trips first (they RESTRICT bus/route deletes),
           then buses/routes/branches, then the company, then the owner. */
        $delTrips = $pdo->prepare('DELETE FROM trips WHERE company_id = :company_id');
        $delTrips->execute([':company_id' => $companyId]);

        $delBuses = $pdo->prepare('DELETE FROM buses WHERE company_id = :company_id');
        $delBuses->execute([':company_id' => $companyId]);

        $delRoutes = $pdo->prepare('DELETE FROM routes WHERE company_id = :company_id');
        $delRoutes->execute([':company_id' => $companyId]);

        $delBranches = $pdo->prepare('DELETE FROM company_branches WHERE company_id = :company_id');
        $delBranches->execute([':company_id' => $companyId]);

        $delCompany = $pdo->prepare('DELETE FROM companies WHERE id = :company_id');
        $delCompany->execute([':company_id' => $companyId]);

        $delUser = $pdo->prepare('DELETE FROM users WHERE id = :user_id');
        $delUser->execute([':user_id' => (int) $company['user_id']]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ($e instanceof PDOException && (int) $e->getCode() === 23000) {
            auth_response(409, [
                'success' => false,
                'message' => 'This company cannot be deleted because related records still exist. Suspend or reject it instead.',
            ]);
        }
        throw $e;
    }

    auth_response(200, [
        'success' => true,
        'message' => 'Company deleted.',
    ]);
}

/**
 * Verify the admin's current password for a sensitive mutation. Every
 * company lifecycle / delete action requires the admin's own password.
 */
function require_admin_password(array $input): void
{
    $adminPassword = (string) ($input['admin_password'] ?? '');
    if ($adminPassword === '' || !verify_current_password($adminPassword)) {
        auth_response(401, [
            'success' => false,
            'message' => 'Your admin password is required to perform this action.',
        ]);
    }
}

/** POST entries — every mutation must pass requireRole('admin') FIRST. */
function require_admin_mutation(PDO $pdo, string $action): void
{
    require_admin_post();
    $user = requireRole('admin');
    $adminUserId = (int) $user['id'];

    $input = admin_input();
    require_admin_password($input);

    apply_company_status($pdo, $input, $action, $adminUserId);
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

    if ($action === 'revenue') {
        handle_admin_revenue($pdo);
    }

    if ($action === 'company_revenue') {
        handle_admin_company_revenue($pdo);
    }

    if ($action === 'bookings') {
        handle_admin_bookings($pdo);
    }

    if ($action === 'passengers') {
        handle_admin_passengers($pdo);
    }

    if ($action === 'passenger') {
        handle_admin_passenger($pdo);
    }

    if ($action === 'reviews') {
        handle_admin_reviews($pdo);
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

    if ($action === 'company_list' || $action === 'company_unlist') {
        require_admin_post();
        $user = requireRole('admin');
        unset($user);
        require_admin_password(admin_input());
        update_company_listing($pdo, admin_input(), $action);
    }

    if ($action === 'company_delete') {
        require_admin_post();
        $user = requireRole('admin');
        unset($user);
        require_admin_password(admin_input());
        delete_company($pdo, admin_input());
    }

    auth_response(400, [
        'success' => false,
        'message' => 'Unsupported action. Use action=overview, action=companies, action=company, action=reviews, action=trips, action=revenue, action=company_revenue, action=bookings, action=passengers, action=passenger, action=manifest, action=company_approve, action=company_reject, action=company_suspend, action=company_activate, action=company_list, action=company_unlist or action=company_delete.',
    ]);
} catch (Throwable $e) {
    auth_response(500, [
        'success' => false,
        'message' => 'Admin data is temporarily unavailable. Please try again later.',
    ]);
}

function ensure_admin_parcel_payments_table(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS parcel_payments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        parcel_id BIGINT UNSIGNED NOT NULL, company_id BIGINT UNSIGNED NOT NULL,
        amount DECIMAL(10,2) NOT NULL DEFAULT 0.00, refunded_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        method VARCHAR(30) NOT NULL DEFAULT \'cash\', transaction_reference VARCHAR(120) DEFAULT NULL,
        status ENUM(\'paid\',\'refunded\') NOT NULL DEFAULT \'paid\',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_parcel_payments_parcel (parcel_id), KEY idx_parcel_payments_company (company_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $pdo->exec('INSERT IGNORE INTO parcel_payments (parcel_id, company_id, amount, method, status, created_at)
        SELECT id, company_id, price, \'cash\', \'paid\', created_at FROM parcels');
}
