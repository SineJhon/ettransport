<?php

declare(strict_types=1);

/**
 * ET Transport — Company API.
 *
 * Real, database-backed company discovery.
 *
 *   GET api/company.php?action=list                 -> { success, companies }
 *   GET api/company.php?action=get&slug=selam-bus   -> { success, company }
 *   GET api/company.php?action=overview             -> { success, company, stats }
 *                                                     (authenticated company role only)
 *   GET api/company.php?action=buses                -> { success, company_id, buses }
 *                                                     (authenticated company role only)
 *   POST api/company.php?action=bus_create          -> { success, bus }
 *                                                     (authenticated company role only)
 *   POST api/company.php?action=bus_update          -> { success, bus }
 *                                                     (authenticated company role only)
 *   GET  api/company.php?action=trips               -> { success, company_id, trips, routes }
 *                                                     (authenticated company role only)
 *   POST api/company.php?action=trip_create         -> { success, trip }  (scheduled only)
 *                                                     (authenticated company role only)
 *   POST api/company.php?action=trip_update         -> { success, trip }  (scheduled only)
 *                                                     (authenticated company role only)
  *   POST api/company.php?action=trip_status         -> { success, trip }  (scheduled -> cancelled)
 *                                                     (authenticated company role only)
 *   POST api/company.php?action=trip_delete         -> { success, message }  (cancelled only)
 *                                                     (authenticated company role only)
 *   GET  api/company.php?action=revenue             -> { success, company_id, revenue }
 *                                                     (read-only revenue summary, company role only)
 *   GET  api/company.php?action=payments            -> { success, company_id, payments }
 *                                                     (read-only payment list, company role only)
 *   GET  api/company.php?action=profile             -> { success, company }
 *                                                     (authenticated company role only; full editable profile)
 *   POST api/company.php?action=profile_update      -> { success, message, company }
 *                                                     (authenticated company role only; updates own profile)
 *
 * Only approved companies are exposed publicly through list/get. Ratings and
 * review counts are computed from the reviews table. Destinations / fleet /
 * popular routes / trips are derived from real buses, routes and trips rows
 * in the database.
 *
 * action=list and action=get are public by design (search + company
 * discovery). action=overview is a private company operator endpoint that
 * calls requireRole('company') and scopes every statistic to the company
 * resolved from the authenticated session user — it never accepts a
 * browser-supplied company_id.
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

const COMPANY_TRIP_WINDOW_DAYS = 14;

/** Read the request payload: JSON body when sent as JSON, otherwise form POST fields. */
function company_input(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $decoded = json_decode((string) $raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    return $_POST;
}

function company_action(): string
{
    return strtolower(trim((string) ($_GET['action'] ?? '')));
}

function require_company_post(): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        auth_response(405, [
            'success' => false,
            'message' => 'Method not allowed.',
        ]);
    }
}

/** True when the value is one of the schema's bus_type ENUM values. */
function valid_bus_type(string $value): bool
{
    return in_array($value, ['standard', 'luxury', 'vip'], true);
}

/** True when the value is one of the schema's bus status ENUM values. */
function valid_bus_status(string $value): bool
{
    return in_array($value, ['active', 'maintenance', 'inactive'], true);
}

/** Whether a key was present in the submitted payload. */
function has_key(array $input, string $key): bool
{
    return array_key_exists($key, $input);
}

/** Normalize one raw buses row into the operator-facing payload shape. */
function bus_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'registration_number' => $row['registration_number'] ?? null,
        'name' => $row['name'],
        'model' => $row['model'] ?? null,
        'bus_type' => $row['bus_type'],
        'seat_count' => (int) $row['seat_count'],
        'status' => $row['status'],
        'created_at' => $row['created_at'],
        'updated_at' => $row['updated_at'],
    ];
}

/**
 * All buses owned by the given company — always scoped by the company_id
 * resolved from the authenticated session, never by a browser value.
 */
function fetch_company_buses(PDO $pdo, int $companyId): array
{
    $stmt = $pdo->prepare('
        SELECT id, registration_number, name, model, bus_type, seat_count, status, created_at, updated_at
        FROM buses
        WHERE company_id = :company_id
        ORDER BY id ASC
    ');
    $stmt->execute([':company_id' => $companyId]);

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[] = bus_payload($row);
    }

    return $out;
}

/**
 * Resolve the authenticated session user's company profile, or stop with a
 * generic 404 so another company's searchability stays private.
 */
function require_company_scope(PDO $pdo, int $userId): array
{
    $company = resolve_company_by_user($pdo, $userId);
    if ($company === null) {
        auth_response(404, [
            'success' => false,
            'message' => 'No linked company profile was found for this account.',
        ]);
    }

    return $company;
}

/**
 * Validate and normalise a seat count. Stops with 422 unless the submitted
 * value is a plain positive whole number within a sensible coach-size range.
 */
function bus_seat_count_or_error(array $input): int
{
    $raw = $input['seat_count'] ?? 45;

    if (is_int($raw)) {
        $value = $raw;
    } elseif (is_string($raw) && preg_match('/^\d+$/', trim($raw)) === 1) {
        $value = (int) trim($raw);
    } else {
        auth_response(422, [
            'success' => false,
            'message' => 'Seat count must be a positive whole number.',
        ]);
    }

    if ($value < 1) {
        auth_response(422, [
            'success' => false,
            'message' => 'Seat count must be a positive integer.',
        ]);
    }

    if ($value > 200) {
        auth_response(422, [
            'success' => false,
            'message' => 'Seat count is unreasonably large.',
        ]);
    }

    return $value;
}

/** GET /api/company.php?action=buses — this company's own fleet. */
function handle_buses(PDO $pdo): void
{
    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);

    auth_response(200, [
        'success' => true,
        'company_id' => (int) $company['id'],
        'buses' => fetch_company_buses($pdo, (int) $company['id']),
    ]);
}

/** POST /api/company.php?action=bus_create — add a bus to this company's fleet. */
function handle_bus_create(PDO $pdo): void
{
    require_company_post();
    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);

    $input = company_input();

    $name = trim((string) ($input['name'] ?? ''));
    $model = trim((string) ($input['model'] ?? ''));
    $registrationNumber = trim((string) ($input['registration_number'] ?? ''));
    $busType = trim((string) ($input['bus_type'] ?? 'standard'));
    $status = trim((string) ($input['status'] ?? 'active'));

    if ($name === '') {
        auth_response(422, [
            'success' => false,
            'message' => 'A bus name is required.',
        ]);
    }
    if (mb_strlen($name) > 120) {
        auth_response(422, [
            'success' => false,
            'message' => 'Bus name must be at most 120 characters.',
        ]);
    }
    if ($model !== '' && mb_strlen($model) > 120) {
        auth_response(422, [
            'success' => false,
            'message' => 'Bus model must be at most 120 characters.',
        ]);
    }
    if ($registrationNumber !== '' && mb_strlen($registrationNumber) > 50) {
        auth_response(422, [
            'success' => false,
            'message' => 'Registration number must be at most 50 characters.',
        ]);
    }
    if (!valid_bus_type($busType)) {
        auth_response(422, [
            'success' => false,
            'message' => 'Invalid bus type. Use standard, luxury or vip.',
        ]);
    }
    if (!valid_bus_status($status)) {
        auth_response(422, [
            'success' => false,
            'message' => 'Invalid bus status. Use active, maintenance or inactive.',
        ]);
    }
    $seatCount = bus_seat_count_or_error($input);

    try {
        $ins = $pdo->prepare('
            INSERT INTO buses (company_id, name, model, bus_type, seat_count, registration_number, status)
            VALUES (:company_id, :name, :model, :bus_type, :seat_count, :registration_number, :status)
        ');
        $ins->execute([
            ':company_id' => (int) $company['id'],
            ':name' => $name,
            ':model' => $model === '' ? null : $model,
            ':bus_type' => $busType,
            ':seat_count' => $seatCount,
            ':registration_number' => $registrationNumber === '' ? null : $registrationNumber,
            ':status' => $status,
        ]);
        $newId = (int) $pdo->lastInsertId();
    } catch (PDOException $e) {
        if ((int) $e->getCode() === 23000) {
            auth_response(409, [
                'success' => false,
                'message' => 'A bus with this registration number already exists for your company.',
            ]);
        }
        throw $e;
    }

    $load = $pdo->prepare('
        SELECT id, registration_number, name, model, bus_type, seat_count, status, created_at, updated_at
        FROM buses
        WHERE id = :id
        LIMIT 1');
    $load->execute([':id' => $newId]);
    $row = $load->fetch();

    auth_response(201, [
        'success' => true,
        'message' => 'Bus added.',
        'bus' => $row !== false ? bus_payload($row) : null,
    ]);
}

/** POST /api/company.php?action=bus_update — update only buses this company owns. */
function handle_bus_update(PDO $pdo): void
{
    require_company_post();
    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);

    $input = company_input();

    $busId = (int) ($input['bus_id'] ?? 0);
    if ($busId <= 0) {
        auth_response(422, [
            'success' => false,
            'message' => 'A bus id is required.',
        ]);
    }

    /* Validate whichever fields were actually submitted. */
    $hasName = has_key($input, 'name') && trim((string) $input['name']) !== '';
    $hasModel = has_key($input, 'model') && trim((string) $input['model']) !== '';
    $hasReg = has_key($input, 'registration_number') && trim((string) $input['registration_number']) !== '';
    $hasBusType = has_key($input, 'bus_type') && trim((string) $input['bus_type']) !== '';
    $hasSeatCount = has_key($input, 'seat_count');
    $hasStatus = has_key($input, 'status') && trim((string) $input['status']) !== '';

    if ($hasName) {
        $name = trim((string) $input['name']);
        if (mb_strlen($name) > 120) {
            auth_response(422, [
                'success' => false,
                'message' => 'Bus name must be at most 120 characters.',
            ]);
        }
    }
    if ($hasModel) {
        $model = trim((string) $input['model']);
        if (mb_strlen($model) > 120) {
            auth_response(422, [
                'success' => false,
                'message' => 'Bus model must be at most 120 characters.',
            ]);
        }
    }
    if ($hasReg) {
        $reg = trim((string) $input['registration_number']);
        if (mb_strlen($reg) > 50) {
            auth_response(422, [
                'success' => false,
                'message' => 'Registration number must be at most 50 characters.',
            ]);
        }
    }
    if ($hasBusType) {
        $busType = trim((string) $input['bus_type']);
        if (!valid_bus_type($busType)) {
            auth_response(422, [
                'success' => false,
                'message' => 'Invalid bus type. Use standard, luxury or vip.',
            ]);
        }
    }
    if ($hasSeatCount) {
        $seatCount = bus_seat_count_or_error($input);
    }
    if ($hasStatus) {
        $status = trim((string) $input['status']);
        if (!valid_bus_status($status)) {
            auth_response(422, [
                'success' => false,
                'message' => 'Invalid bus status. Use active, maintenance or inactive.',
            ]);
        }
    }

    if (!$hasName && !$hasModel && !$hasReg && !$hasBusType && !$hasSeatCount && !$hasStatus) {
        auth_response(422, [
            'success' => false,
            'message' => 'At least one field to update is required.',
        ]);
    }

    /* Build an UPDATE that carries the ownership condition inside the same
       statement, so another company's bus can never be touched. */
    $sets = [];
    $params = [':bus_id' => $busId, ':company_id' => (int) $company['id']];
    if ($hasName) { $sets[] = 'name = :name'; $params[':name'] = $name; }
    if ($hasModel) { $sets[] = 'model = :model'; $params[':model'] = $model; }
    if ($hasReg) { $sets[] = 'registration_number = :registration_number'; $params[':registration_number'] = $reg; }
    if ($hasBusType) { $sets[] = 'bus_type = :bus_type'; $params[':bus_type'] = $busType; }
    if ($hasSeatCount) { $sets[] = 'seat_count = :seat_count'; $params[':seat_count'] = $seatCount; }
    if ($hasStatus) { $sets[] = 'status = :status'; $params[':status'] = $status; }

    try {
        $sql = 'UPDATE buses SET ' . implode(', ', $sets)
            . ' WHERE id = :bus_id AND company_id = :company_id';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        if ($stmt->rowCount() === 0) {
            /* Either there is no such bus or it belongs to another company.
               A generic 404 keeps other companies' bus ids private. */
            auth_response(404, [
                'success' => false,
                'message' => 'Bus not found.',
            ]);
        }

        $load = $pdo->prepare('
            SELECT id, registration_number, name, model, bus_type, seat_count, status, created_at, updated_at
            FROM buses
            WHERE id = :id AND company_id = :company_id
            LIMIT 1');
        $load->execute([':id' => $busId, ':company_id' => (int) $company['id']]);
        $row = $load->fetch();

        auth_response(200, [
            'success' => true,
            'message' => 'Bus updated.',
            'bus' => $row !== false ? bus_payload($row) : null,
        ]);
    } catch (PDOException $e) {
        if ((int) $e->getCode() === 23000) {
            auth_response(409, [
                'success' => false,
                'message' => 'A bus with this registration number already exists for your company.',
            ]);
        }
        throw $e;
    }
}

/**
 * Shared profile select: company + computed rating/review count + bus count.
 */
function company_profile_rows(PDO $pdo, ?string $slug = null): array
{
    $sql = '
        SELECT
            c.id,
            c.slug,
            c.name,
            c.description,
            c.logo,
            c.cover_image,
            c.phone,
            c.email,
            c.address,
            c.status,
            c.created_at,
            (SELECT COUNT(*) FROM buses b WHERE b.company_id = c.id) AS bus_count,
            COALESCE((SELECT AVG(rv.rating) FROM reviews rv WHERE rv.company_id = c.id AND rv.status = \'approved\'), 0) AS rating,
            (SELECT COUNT(*) FROM reviews rv WHERE rv.company_id = c.id AND rv.status = \'approved\') AS review_count
        FROM companies c
        WHERE c.status = \'approved\'';

    $params = [];
    if ($slug !== null) {
        $sql .= ' AND c.slug = :slug';
        $params[':slug'] = $slug;
    }

    $sql .= ' ORDER BY c.name ASC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return $stmt->fetchAll();
}

/**
 * Destinations (distinct real to_cities) served by each company.
 *
 * @return array<int, array{company_id:int, to_city:string}>
 */
function fetch_company_destinations(PDO $pdo): array
{
    $stmt = $pdo->query('
        SELECT t.company_id, r.to_city
        FROM trips t
        JOIN routes r ON r.id = t.route_id
        WHERE t.status = \'scheduled\'
        GROUP BY t.company_id, r.to_city
        ORDER BY r.to_city ASC
    ');

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[] = ['company_id' => (int) $row['company_id'], 'to_city' => $row['to_city']];
    }

    return $out;
}

/**
 * Popular routes (min fare per route) for each company from the schedule.
 *
 * @return array<int, array<int, array>>
 */
function fetch_popular_routes(PDO $pdo): array
{
    $stmt = $pdo->query('
        SELECT
            t.company_id,
            r.id AS route_id,
            r.from_city,
            r.to_city,
            r.duration,
            MIN(t.price) AS price
        FROM trips t
        JOIN routes r ON r.id = t.route_id
        WHERE t.status = \'scheduled\'
          AND t.departure_date >= CURDATE()
        GROUP BY t.company_id, r.id, r.from_city, r.to_city, r.duration
        ORDER BY MIN(t.price) ASC
    ');

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $companyId = (int) $row['company_id'];
        if (!isset($out[$companyId])) {
            $out[$companyId] = [];
        }
        $out[$companyId][] = [
            'from_city' => $row['from_city'],
            'to_city' => $row['to_city'],
            'duration' => (int) $row['duration'],
            'price' => (float) $row['price'],
        ];
    }

    return $out;
}

/**
 * Normalize one raw company row into the public payload shape.
 */
function company_payload(array $row, array $destinations): array
{
    $rating = round((float) $row['rating'], 1);
    $reviewCount = (int) $row['review_count'];

    return [
        'id' => (int) $row['id'],
        'slug' => $row['slug'],
        'name' => $row['name'],
        'description' => $row['description'],
        'logo' => $row['logo'],
        'cover_image' => $row['cover_image'],
        'phone' => $row['phone'],
        'email' => $row['email'],
        'address' => $row['address'],
        'status' => $row['status'],
        'verified' => $row['status'] === 'approved',
        'rating' => $rating,
        'review_count' => $reviewCount,
        'created_at' => $row['created_at'],
        'bus_count' => (int) $row['bus_count'],
        'destinations' => $destinations,
    ];
}
/**
 * Fleet rows for the given company (active buses only).
 */
function fetch_fleet(PDO $pdo, int $companyId): array
{
    $stmt = $pdo->prepare('
        SELECT id, name, model, bus_type, seat_count, registration_number, status
        FROM buses
        WHERE company_id = :company_id AND status = \'active\'
        ORDER BY id ASC
    ');
    $stmt->execute([':company_id' => $companyId]);

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[] = [
            'id' => (int) $row['id'],
            'model' => $row['model'],
            'bus_type' => $row['bus_type'],
            'seat_count' => (int) $row['seat_count'],
            'registration_number' => $row['registration_number'],
        ];
    }

    return $out;
}

/**
 * Approved reviews for the given company.
 */
function fetch_reviews(PDO $pdo, int $companyId): array
{
    $stmt = $pdo->prepare('
        SELECT r.rating, r.comment, r.created_at, u.name AS reviewer
        FROM reviews r
        JOIN users u ON u.id = r.passenger_id
        WHERE r.company_id = :company_id AND r.status = \'approved\'
        ORDER BY r.created_at DESC
        LIMIT 20
    ');
    $stmt->execute([':company_id' => $companyId]);

    $out = [];
/**
 * Upcoming trips (next N days) for the given company, shaped exactly like
 * api/search.php trip rows so the frontend can reuse one renderer.
 */
function fetch_company_trips(PDO $pdo, int $companyId): array
{
    $sql = '
        SELECT
            t.id                             AS trip_id,
            r.from_city,
            r.to_city,
            r.duration                       AS route_duration,
            t.departure_date,
            t.departure_time,
            t.arrival_time,
            t.price,
            b.bus_type,
            b.model                          AS bus_model,
            b.seat_count,
            (b.seat_count - COALESCE(booked.seats_booked, 0)) AS available_seats
        FROM trips t
        JOIN routes r ON r.id = t.route_id
        JOIN buses b ON b.id = t.bus_id
        LEFT JOIN (
            SELECT t2.id AS trip_id, COUNT(bp.id) AS seats_booked
            FROM trips t2
            JOIN bookings bk ON bk.trip_id = t2.id
            LEFT JOIN booking_passengers bp ON bp.booking_id = bk.id
            GROUP BY t2.id
        ) booked ON booked.trip_id = t.id
        WHERE t.status = \'scheduled\'
          AND t.company_id = :company_id
          AND t.departure_date >= CURDATE()
          AND t.departure_date <= DATE_ADD(CURDATE(), INTERVAL :days DAY)
        ORDER BY t.departure_date ASC, t.departure_time ASC
        LIMIT 200';

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':company_id' => $companyId,
        ':days' => COMPANY_TRIP_WINDOW_DAYS,
    ]);

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[] = [
            'id' => (int) $row['trip_id'],
            'company_id' => $companyId,
            'company_slug' => null,
            'company_name' => null,
            'from' => $row['from_city'],
            'to' => $row['to_city'],
            'departure_date' => $row['departure_date'],
            'departure_time' => substr((string) $row['departure_time'], 0, 5),
            'arrival_time' => $row['arrival_time'] !== null ? substr((string) $row['arrival_time'], 0, 5) : null,
            'duration_minutes' => (int) $row['route_duration'],
            'price' => (float) $row['price'],
            'bus_type' => $row['bus_type'],
            'bus_model' => $row['bus_model'] !== null ? $row['bus_model'] : null,
            'seat_count' => (int) $row['seat_count'],
            'available_seats' => (int) $row['available_seats'],
            'rating' => 0.0,
            'review_count' => 0,
            'amenities' => [],
        ];
    }

    return $out;
}
    foreach ($stmt->fetchAll() as $row) {
        $out[] = [
            'name' => $row['reviewer'],
            'rating' => (int) $row['rating'],
            'comment' => $row['comment'],
            'created_at' => $row['created_at'],
        ];
    }

    return $out;
}
/**
 * Resolve the authenticated user's linked company record.
 *
 * Ownership root: companies.user_id = authenticated session user id.
 * The company id is NEVER taken from a browser-supplied company_id
 * parameter — the server-side session decides the scope.
 *
 * @return ?array{id:int, name:string, slug:string, logo:?string, status:string}
 */
function resolve_company_by_user(PDO $pdo, int $userId): ?array
{
    $stmt = $pdo->prepare('
        SELECT id, name, slug, logo, status
        FROM companies
        WHERE user_id = :user_id
        LIMIT 1
    ');
    $stmt->execute([':user_id' => $userId]);
    $row = $stmt->fetch();
    return $row !== false ? $row : null;
}

/**
 * Company overview statistics.
 *
 * Every value is scoped to the authenticated company. Buses scope through
 * buses.company_id; trips through trips.company_id; bookings and passengers
 * reach their own company only through bookings.trip_id -> trips.company_id;
 * revenue reaches its company through payments -> bookings -> trips. No
 * schema changes and no global counters. Existing status values only.
 *
 * @return array{activeBuses:int, upcomingTrips:int, upcomingBookings:int,
 *               bookedPassengers:int, revenue:float}
 */
function company_overview_stats(PDO $pdo, int $companyId): array
{
    /* activeBuses — this company's buses currently in active service. */
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM buses WHERE company_id = :company_id AND status = :status');
    $stmt->execute([':company_id' => $companyId, ':status' => 'active']);
    $activeBuses = (int) $stmt->fetchColumn();

    /* upcomingTrips — this company's scheduled trips with a future departure. */
    $stmt = $pdo->prepare('
        SELECT COUNT(*)
        FROM trips
        WHERE company_id = :company_id
          AND status = :status
          AND (
                departure_date > CURDATE()
             OR (departure_date = CURDATE() AND departure_time > CURTIME())
          )
    ');
    $stmt->execute([':company_id' => $companyId, ':status' => 'scheduled']);
    $upcomingTrips = (int) $stmt->fetchColumn();

    /* upcomingBookings — active bookings on this company's future trips
       (cancelled bookings are not counted as upcoming). */
    $stmt = $pdo->prepare('
        SELECT COUNT(*)
        FROM bookings bk
        JOIN trips t ON t.id = bk.trip_id
        WHERE t.company_id = :company_id
          AND t.status = :trip_status
          AND (
              t.departure_date > CURRENT_DATE()
           OR (t.departure_date = CURRENT_DATE() AND t.departure_time > CURRENT_TIME())
          )
          AND bk.booking_status <> :cancelled
    ');
    $stmt->execute([
        ':company_id' => $companyId,
        ':trip_status' => 'scheduled',
        ':cancelled' => 'cancelled',
    ]);
    $upcomingBookings = (int) $stmt->fetchColumn();

    /* bookedPassengers — travelers on this company's relevant upcoming trips. */
    $stmt = $pdo->prepare('
        SELECT COUNT(*)
        FROM booking_passengers bp
        JOIN bookings bk ON bk.id = bp.booking_id
        JOIN trips t ON t.id = bk.trip_id
        WHERE t.company_id = :company_id
          AND t.status = :trip_status
          AND (
              t.departure_date > CURRENT_DATE()
           OR (t.departure_date = CURRENT_DATE() AND t.departure_time > CURRENT_TIME())
          )
          AND bk.booking_status <> :cancelled
    ');
    $stmt->execute([
        ':company_id' => $companyId,
        ':trip_status' => 'scheduled',
        ':cancelled' => 'cancelled',
    ]);
    $bookedPassengers = (int) $stmt->fetchColumn();

    /* revenue — sum of this company's paid payments, reached through the
       booking's trip so another company's payments can never be included. */
    $stmt = $pdo->prepare('
        SELECT COALESCE(SUM(p.amount), 0)
        FROM payments p
        JOIN bookings bk ON bk.id = p.booking_id
        JOIN trips t ON t.id = bk.trip_id
        WHERE t.company_id = :company_id
          AND p.status = :payment_status
    ');
    $stmt->execute([':company_id' => $companyId, ':payment_status' => 'paid']);
    $revenue = round((float) $stmt->fetchColumn(), 2);

    return [
        'activeBuses' => $activeBuses,
        'upcomingTrips' => $upcomingTrips,
        'upcomingBookings' => $upcomingBookings,
        'bookedPassengers' => $bookedPassengers,
        'revenue' => $revenue,
    ];
}

/* ============================================================
 Company trip scheduling / management
   ------------------------------------------------------------
   Every read/write is scoped by the company resolved from the
   authenticated session (requireRole('company') -> companies.user_id
   -> resolved company). A browser-supplied company_id is never trusted.
   Trip ownership is always part of the WHERE clause.

   Workers (scripts/trip_status_worker.php, trip_completion_worker.php,
   trip_lifecycle.php) remain the authoritative lifecycle mechanism:
   the company API may only create trips as 'scheduled', may edit trips
   that are still 'scheduled', and may cancel 'scheduled' trips. Departed,
   completed and cancelled trips are never rewritten.
   ============================================================ */

/** True when the value is one of the schema's trip status ENUM values. */
function valid_trip_status(string $value): bool
{
    return in_array($value, ['scheduled', 'departed', 'completed', 'cancelled'], true);
}

/**
 * A positive integer id, or a 422 response. Rejects malformed/negative/zero
 * ids before they ever reach a SQL statement.
 */
function positive_int_or_error(mixed $raw, string $message): int
{
    $value = 0;
    if (is_int($raw)) {
        $value = $raw;
    } elseif (is_string($raw) && preg_match('/^\d+$/', trim($raw)) === 1) {
        $value = (int) trim($raw);
    }

    if ($value <= 0) {
        auth_response(422, [
            'success' => false,
            'message' => $message,
        ]);
    }

    return $value;
}

/**
 * An active global route, or a 422 response. Routes are platform reference
 * data and are never treated as company-owned.
 *
 * @return array{id:int, duration:?int}
 */
function trip_route_or_error(PDO $pdo, mixed $raw): array
{
    $id = positive_int_or_error($raw, 'A valid route is required.');

    $stmt = $pdo->prepare('SELECT id, duration FROM routes WHERE id = :id AND status = :status LIMIT 1');
    $stmt->execute([':id' => $id, ':status' => 'active']);
    $row = $stmt->fetch();

    if ($row === false) {
        auth_response(422, [
            'success' => false,
            'message' => 'The selected route is not available.',
        ]);
    }

    return [
        'id' => (int) $row['id'],
        'duration' => $row['duration'] !== null ? (int) $row['duration'] : null,
    ];
}

/**
 * A bus that belongs to the authenticated company and can be used for a new
 * scheduled trip, or a 422 response. Never trusts a browser company/bus.
 *
 * @return array{id:int, seat_count:int}
 */
function company_bus_or_error(PDO $pdo, mixed $raw, int $companyId): array
{
    $id = positive_int_or_error($raw, 'A valid bus is required.');

    $stmt = $pdo->prepare('SELECT id, seat_count, status FROM buses WHERE id = :id AND company_id = :company_id LIMIT 1');
    $stmt->execute([':id' => $id, ':company_id' => $companyId]);
    $row = $stmt->fetch();

    if ($row === false) {
        auth_response(422, [
            'success' => false,
            'message' => 'The selected bus is not part of your fleet.',
        ]);
    }

    if ($row['status'] !== 'active') {
        auth_response(422, [
            'success' => false,
            'message' => 'This bus is not available for trips right now.',
        ]);
    }

    return [
        'id' => (int) $row['id'],
        'seat_count' => (int) $row['seat_count'],
    ];
}

/** A valid Y-m-d calendar date, or a 422 response (rejects malformed dates). */
function trip_date_or_error(mixed $raw): string
{
    $date = trim((string) $raw);
    $dt = DateTimeImmutable::createFromFormat('Y-m-d', $date);

    if ($dt === false || $dt->format('Y-m-d') !== $date) {
        auth_response(422, [
            'success' => false,
            'message' => 'A valid departure date (YYYY-MM-DD) is required.',
        ]);
    }

    return $date;
}

/** A real H:i clock time, or a 422 response (rejects impossible times). */
function trip_time_or_error(mixed $raw): string
{
    $time = trim((string) $raw);
    $dt = DateTimeImmutable::createFromFormat('H:i', $time);

    if ($dt === false || $dt->format('H:i') !== $time) {
        auth_response(422, [
            'success' => false,
            'message' => 'A valid departure time (HH:MM) is required.',
        ]);
    }

    return $time;
}

/** Stop with 422 unless the combined departure datetime is still in the future. */
function future_departure_or_error(string $date, string $time): void
{
    $depart = DateTimeImmutable::createFromFormat('Y-m-d H:i', $date . ' ' . $time);

    if ($depart === false || $depart <= new DateTimeImmutable()) {
        auth_response(422, [
            'success' => false,
            'message' => 'Departure date and time must be in the future.',
        ]);
    }
}
/**
 * Validate a DECIMAL(10,2) price. The schema CHECK is price >= 0, so any
 * non-negative decimal/whole amount within the column range is accepted.
 */
function trip_price_or_error(mixed $raw): float
{
    if (is_int($raw)) {
        $value = (float) $raw;
    } elseif (is_float($raw)) {
        $value = $raw;
    } elseif (is_string($raw) && preg_match('/^\d+(\.\d{1,2})?$/', trim($raw)) === 1) {
        $value = (float) trim($raw);
    } else {
        auth_response(422, [
            'success' => false,
            'message' => 'Price must be a valid amount in ETB.',
        ]);
    }

    if ($value < 0) {
        auth_response(422, [
            'success' => false,
            'message' => 'Price cannot be negative.',
        ]);
    }

    if ($value > 99999999.99) {
        auth_response(422, [
            'success' => false,
            'message' => 'Price is unreasonably large.',
        ]);
    }

    return round($value, 2);
}

/**
 * Shared SELECT for operator-facing trip rows. Availability is always derived:
 * bus.seat_count - COUNT(booking_passengers) for non-cancelled bookings
 * (matching what the passenger booking flow exposes). There is NO seat counter.
 */
function managed_trip_select_sql(): string
{
    return '
        SELECT
            t.id,
            t.company_id,
            t.route_id,
            r.from_city,
            r.to_city,
            r.duration AS route_duration,
            t.bus_id,
            b.name AS bus_name,
            b.registration_number AS bus_registration,
            b.bus_type,
            b.seat_count,
            COALESCE(booked.seats_booked, 0) AS booked_seats,
            (b.seat_count - COALESCE(booked.seats_booked, 0)) AS available_seats,
            t.price,
            t.departure_date,
            t.departure_time,
            t.arrival_time,
            t.status,
            t.created_at,
            t.updated_at,
            COALESCE(aff.affected_bookings, 0) AS affected_bookings,
            COALESCE(aff.refund_required, 0) AS refund_required
        FROM trips t
        JOIN routes r ON r.id = t.route_id
        JOIN buses b ON b.id = t.bus_id
        LEFT JOIN (
            SELECT t2.id AS trip_id, COUNT(bp.id) AS seats_booked
            FROM trips t2
            JOIN bookings bk ON bk.trip_id = t2.id
            LEFT JOIN booking_passengers bp ON bp.booking_id = bk.id
            WHERE bk.booking_status <> :cancelled
            GROUP BY t2.id
        ) booked ON booked.trip_id = t.id
        LEFT JOIN (
            SELECT b2.trip_id AS trip_id,
                   COUNT(*) AS affected_bookings,
                   SUM(CASE WHEN b2.payment_status = \'paid\' THEN 1 ELSE 0 END) AS refund_required
            FROM bookings b2
            WHERE b2.booking_status = \'cancelled\'
            GROUP BY b2.trip_id
        ) aff ON aff.trip_id = t.id
    ';
}

/** Normalise one raw managed-trip row into the operator-facing payload shape. */
function trip_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'company_id' => (int) $row['company_id'],
        'route_id' => (int) $row['route_id'],
        'from_city' => $row['from_city'],
        'to_city' => $row['to_city'],
        'route_duration' => $row['route_duration'] !== null ? (int) $row['route_duration'] : null,
        'bus_id' => (int) $row['bus_id'],
        'bus_name' => $row['bus_name'],
        'bus_registration' => $row['bus_registration'],
        'bus_type' => $row['bus_type'],
        'seat_count' => (int) $row['seat_count'],
        'booked_seats' => (int) $row['booked_seats'],
        'available_seats' => (int) $row['available_seats'],
        'price' => (float) $row['price'],
        'departure_date' => $row['departure_date'],
        'departure_time' => substr((string) $row['departure_time'], 0, 5),
        'arrival_time' => $row['arrival_time'] !== null ? substr((string) $row['arrival_time'], 0, 5) : null,
        'status' => $row['status'],
        'affected_bookings' => (int) $row['affected_bookings'],
        'refund_required' => (int) $row['refund_required'],
        'created_at' => $row['created_at'],
        'updated_at' => $row['updated_at'],
    ];
}

/** All trips owned by the given company, soonest first (every status). */
function fetch_managed_trips(PDO $pdo, int $companyId): array
{
    $stmt = $pdo->prepare(managed_trip_select_sql() . '
        WHERE t.company_id = :company_id
        ORDER BY t.departure_date ASC, t.departure_time ASC, t.id ASC
    ');
    $stmt->execute([':company_id' => $companyId, ':cancelled' => 'cancelled']);

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[] = trip_payload($row);
    }

    return $out;
}

/** One owned trip row, or null when missing / owned by another company. */
function fetch_managed_trip_row(PDO $pdo, int $tripId, int $companyId): ?array
{
    $stmt = $pdo->prepare(managed_trip_select_sql() . '
        WHERE t.id = :id AND t.company_id = :company_id
        LIMIT 1
    ');
    $stmt->execute([':id' => $tripId, ':company_id' => $companyId, ':cancelled' => 'cancelled']);

    $row = $stmt->fetch();
    return $row !== false ? trip_payload($row) : null;
}/**
 * Active global platform routes (never company-owned) for the create-trip form.
 */
function fetch_global_active_routes(PDO $pdo): array
{
    $stmt = $pdo->prepare('
        SELECT id, from_city, to_city, duration, status
        FROM routes
        WHERE status = :status
        ORDER BY from_city ASC, to_city ASC
    ');
    $stmt->execute([':status' => 'active']);

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[] = [
            'id' => (int) $row['id'],
            'from_city' => $row['from_city'],
            'to_city' => $row['to_city'],
            'duration' => $row['duration'] !== null ? (int) $row['duration'] : null,
            'status' => $row['status'],
        ];
    }

    return $out;
}

/** True when a scheduled trip already occupies this bus + departure slot. */
function trip_slot_conflict(
    PDO $pdo,
    int $companyId,
    int $busId,
    string $date,
    string $time,
    ?int $excludeTripId = null
): bool {
    $sql = '
        SELECT id FROM trips
        WHERE company_id = :company_id
          AND bus_id = :bus_id
          AND departure_date = :departure_date
          AND departure_time = :departure_time
          AND status = :status';
    $params = [
        ':company_id' => $companyId,
        ':bus_id' => $busId,
        ':departure_date' => $date,
        ':departure_time' => $time,
        ':status' => 'scheduled',
    ];

    if ($excludeTripId !== null) {
        $sql .= ' AND id <> :trip_id';
        $params[':trip_id'] = $excludeTripId;
    }

    $sql .= ' LIMIT 1';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return $stmt->fetch() !== false;
}

/** GET /api/company.php?action=trips — this company's own trips. */
function handle_trips(PDO $pdo): void
{
    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);

    auth_response(200, [
        'success' => true,
        'company_id' => (int) $company['id'],
        'trips' => fetch_managed_trips($pdo, (int) $company['id']),
        'routes' => fetch_global_active_routes($pdo),
    ]);
}/**
 * POST /api/company.php?action=trip_create — schedule a new trip for this
 * company. The bus is ownership-scoped server side (the browser can never pick
 * another company's bus). A new trip always starts as 'scheduled'.
 */
function handle_trip_create(PDO $pdo): void
{
    require_company_post();
    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);
    $companyId = (int) $company['id'];

    $input = company_input();

    /* New trips are always scheduled. The browser cannot create a trip as
       departed / completed / cancelled — lifecycle belongs to the workers. */
    if (has_key($input, 'status') && trim((string) $input['status']) !== 'scheduled') {
        auth_response(422, [
            'success' => false,
            'message' => 'New trips can only be created as scheduled.',
        ]);
    }

    $route = trip_route_or_error($pdo, $input['route_id'] ?? null);
    $bus = company_bus_or_error($pdo, $input['bus_id'] ?? null, $companyId);
    $departureDate = trip_date_or_error($input['departure_date'] ?? null);
    $departureTime = trip_time_or_error($input['departure_time'] ?? null);
    $price = trip_price_or_error($input['price'] ?? null);
    future_departure_or_error($departureDate, $departureTime);

    if (trip_slot_conflict($pdo, $companyId, $bus['id'], $departureDate, $departureTime)) {
        auth_response(409, [
            'success' => false,
            'message' => 'This bus already has another trip scheduled at that departure time.',
        ]);
    }

    $depart = DateTimeImmutable::createFromFormat('Y-m-d H:i', $departureDate . ' ' . $departureTime);
    $arrivalTime = null;
    if ($depart !== false && $route['duration'] !== null) {
        $arrivalTime = $depart->modify('+' . $route['duration'] . ' minutes')->format('H:i');
    }

    $ins = $pdo->prepare('
        INSERT INTO trips (company_id, bus_id, route_id, departure_date, departure_time, arrival_time, price, status)
        VALUES (:company_id, :bus_id, :route_id, :departure_date, :departure_time, :arrival_time, :price, :status)
    ');
    $ins->execute([
        ':company_id' => $companyId,
        ':bus_id' => $bus['id'],
        ':route_id' => $route['id'],
        ':departure_date' => $departureDate,
        ':departure_time' => $departureTime,
        ':arrival_time' => $arrivalTime,
        ':price' => $price,
        ':status' => 'scheduled',
    ]);
    $newId = (int) $pdo->lastInsertId();

    auth_response(201, [
        'success' => true,
        'message' => 'Trip scheduled.',
        'trip' => fetch_managed_trip_row($pdo, $newId, $companyId),
    ]);
}/**
 * POST /api/company.php?action=trip_update — update only trips this company
 * owns that are still 'scheduled'. The write itself carries the ownership and
 * lifecycle guard (id + company_id + status) so a departed/completed/cancelled
 * or foreign trip can never be rewritten.
 */
function handle_trip_update(PDO $pdo): void
{
    require_company_post();
    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);
    $companyId = (int) $company['id'];

    $input = company_input();

    $tripId = positive_int_or_error($input['trip_id'] ?? null, 'A valid trip id is required.');

    /* Status changes are not allowed through the edit action — they belong to
       trip_status (scheduled -> cancelled only). Rejecting arbitrary status
       here stops the browser from driving lifecycle transitions. */
    if (has_key($input, 'status') && trim((string) $input['status']) !== '') {
        auth_response(422, [
            'success' => false,
            'message' => 'Trip status cannot be changed here.',
        ]);
    }

    $hasRoute = has_key($input, 'route_id');
    $hasBus = has_key($input, 'bus_id');
    $hasDate = has_key($input, 'departure_date');
    $hasTime = has_key($input, 'departure_time');
    $hasPrice = has_key($input, 'price');

    if (!$hasRoute && !$hasBus && !$hasDate && !$hasTime && !$hasPrice) {
        auth_response(422, [
            'success' => false,
            'message' => 'At least one field to update is required.',
        ]);
    }

    /* Load the current trip — strictly scoped to this company. This is only for
       validation; the actual write is the ownership-scoped UPDATE below. */
    $currentStmt = $pdo->prepare('
        SELECT t.id, t.bus_id, t.route_id, t.departure_date, t.departure_time, t.status
        FROM trips t
        WHERE t.id = :id AND t.company_id = :company_id
        LIMIT 1
    ');
    $currentStmt->execute([':id' => $tripId, ':company_id' => $companyId]);
    $current = $currentStmt->fetch();

    if ($current === false) {
        /* Either there is no such trip or it belongs to another company.
           A generic 404 keeps other companies' trip ids private. */
        auth_response(404, [
            'success' => false,
            'message' => 'Trip not found.',
        ]);
    }

    if ($current['status'] !== 'scheduled') {
        auth_response(409, [
            'success' => false,
            'message' => 'Only scheduled trips can be edited.',
        ]);
    }

    $route = $hasRoute ? trip_route_or_error($pdo, $input['route_id']) : null;
    $bus = $hasBus ? company_bus_or_error($pdo, $input['bus_id'], $companyId) : null;
    $departureDate = $hasDate ? trip_date_or_error($input['departure_date']) : null;
    $departureTime = $hasTime ? trip_time_or_error($input['departure_time']) : null;
    $price = $hasPrice ? trip_price_or_error($input['price']) : null;

    $newDate = $departureDate !== null ? $departureDate : (string) $current['departure_date'];
    $newTime = $departureTime !== null ? $departureTime : substr((string) $current['departure_time'], 0, 5);
    $newBusId = $bus !== null ? $bus['id'] : (int) $current['bus_id'];
    $newRouteId = $route !== null ? $route['id'] : (int) $current['route_id'];

    if ($hasDate || $hasTime) {
        future_departure_or_error($newDate, $newTime);
    }

    /* If the bus changes, make sure its capacity still covers booked seats. */
    if ($bus !== null) {
        $booked = $pdo->prepare('
            SELECT COUNT(bp.id)
            FROM booking_passengers bp
            JOIN bookings bk ON bk.id = bp.booking_id
            WHERE bk.trip_id = :trip_id AND bk.booking_status <> :cancelled
        ');
        $booked->execute([':trip_id' => $tripId, ':cancelled' => 'cancelled']);
        if ($bus['seat_count'] < (int) $booked->fetchColumn()) {
            auth_response(422, [
                'success' => false,
                'message' => 'The selected bus has fewer seats than the tickets already booked on this trip.',
            ]);
        }
    }

    if ($hasBus || $hasDate || $hasTime) {
        if (trip_slot_conflict($pdo, $companyId, $newBusId, $newDate, $newTime, $tripId)) {
            auth_response(409, [
                'success' => false,
                'message' => 'This bus already has another trip scheduled at that departure time.',
            ]);
        }
    }/* Recompute arrival_time whenever route/date/time change so the schedule
       stays consistent with the (possibly new) route duration. */
    $arrivalTime = null;
    if ($hasRoute || $hasDate || $hasTime) {
        $dur = $pdo->prepare('SELECT duration FROM routes WHERE id = :id LIMIT 1');
        $dur->execute([':id' => $newRouteId]);
        $duration = $dur->fetchColumn();
        $depart = DateTimeImmutable::createFromFormat('Y-m-d H:i', $newDate . ' ' . $newTime);
        if ($duration !== false && $duration !== null && $depart !== false) {
            $arrivalTime = $depart->modify('+' . (int) $duration . ' minutes')->format('H:i');
        }
    }

    $sets = [];
    $params = [':trip_id' => $tripId, ':company_id' => $companyId];
    if ($hasRoute) { $sets[] = 'route_id = :route_id'; $params[':route_id'] = $newRouteId; }
    if ($hasBus) { $sets[] = 'bus_id = :bus_id'; $params[':bus_id'] = $newBusId; }
    if ($hasDate) { $sets[] = 'departure_date = :departure_date'; $params[':departure_date'] = $departureDate; }
    if ($hasTime) { $sets[] = 'departure_time = :departure_time'; $params[':departure_time'] = $departureTime; }
    if ($hasPrice) { $sets[] = 'price = :price'; $params[':price'] = $price; }
    if ($hasRoute || $hasDate || $hasTime) {
        $sets[] = 'arrival_time = :arrival_time';
        $params[':arrival_time'] = $arrivalTime;
    }

    try {
        $sql = 'UPDATE trips SET ' . implode(', ', $sets)
            . ' WHERE id = :trip_id AND company_id = :company_id AND status = :status';
        $params[':status'] = 'scheduled';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        /* The ownership + status guard lives in the UPDATE itself. A 0-row result
           means the trip vanished or left 'scheduled' between our read and write —
           a generic 404 is the safe, private answer. */
        if ($stmt->rowCount() === 0) {
            auth_response(404, [
                'success' => false,
                'message' => 'Trip not found.',
            ]);
        }

        auth_response(200, [
            'success' => true,
            'message' => 'Trip updated.',
            'trip' => fetch_managed_trip_row($pdo, $tripId, $companyId),
        ]);
    } catch (PDOException $e) {
        if ((int) $e->getCode() === 23000) {
            auth_response(409, [
                'success' => false,
                'message' => 'The trip could not be updated because it conflicts with existing schedule data.',
            ]);
        }
        throw $e;
    }
}/**
 * POST /api/company.php?action=trip_status — cancellation only.
 *
 * The only transition a company may drive is scheduled -> cancelled. There is
 * no manual 'completed' mechanism and departed/completed/cancelled trips can
 * never be revived through this endpoint (the status workers remain the
 * authoritative lifecycle).
 */
function handle_trip_status(PDO $pdo): void
{
    require_company_post();
    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);
    $companyId = (int) $company['id'];

    $input = company_input();

    $tripId = positive_int_or_error($input['trip_id'] ?? null, 'A valid trip id is required.');

    $status = trim((string) ($input['status'] ?? ''));
    if ($status !== 'cancelled') {
        auth_response(422, [
            'success' => false,
            'message' => 'Only scheduled trips may be cancelled.',
        ]);
    }

    try {
        $pdo->beginTransaction();

        /* Lock the owned trip first so the cancellation and its booking
           consequences are atomic and can never race the lifecycle workers
           or another operator action on the same row. */
        $tripStmt = $pdo->prepare('
            SELECT t.id, t.company_id, t.status, t.departure_date, t.departure_time,
                   r.from_city, r.to_city
            FROM trips t
            JOIN routes r ON r.id = t.route_id
            WHERE t.id = :trip_id
            FOR UPDATE');
        $tripStmt->execute([':trip_id' => $tripId]);
        $trip = $tripStmt->fetch();

        /* Ownership failure and missing trip both answer 404, exactly like the
           previous implementation, so a foreign trip id is never disclosed. */
        if ($trip === false || (int) $trip['company_id'] !== $companyId) {
            $pdo->rollBack();
            auth_response(404, [
                'success' => false,
                'message' => 'Trip not found.',
            ]);
        }

        /* Only a scheduled trip is cancellable by its operator (departed and
           completed trips are lifecycle-owned; an already-cancelled trip is
           rejected the same way). */
        if ($trip['status'] !== 'scheduled') {
            $pdo->rollBack();
            auth_response(409, [
                'success' => false,
                'message' => 'This trip cannot be cancelled in its current state.',
            ]);
        }

        /* Detect the bookings that exist on this trip right now (pending or
           confirmed). Completed and already-cancelled bookings are left alone. */
        $affStmt = $pdo->prepare('
            SELECT b.id, b.booking_reference, b.passenger_id, b.payment_status, b.total_amount
            FROM bookings b
            WHERE b.trip_id = :trip_id
              AND b.booking_status IN (\'pending\', \'confirmed\')');
        $affStmt->execute([':trip_id' => $tripId]);
        $affectedBookings = $affStmt->fetchAll();

        $updTrip = $pdo->prepare('
            UPDATE trips
            SET status = \'cancelled\'
            WHERE id = :trip_id
              AND company_id = :company_id
              AND status = \'scheduled\'');
        $updTrip->execute([
            ':trip_id' => $tripId,
            ':company_id' => $companyId,
        ]);

        if ($updTrip->rowCount() === 0) {
            $pdo->rollBack();
            auth_response(409, [
                'success' => false,
                'message' => 'This trip cannot be cancelled in its current state.',
            ]);
        }

        /* Mark the affected bookings cancelled INSIDE the same transaction.
           This preserves the full booking / passenger / payment history
           (nothing is deleted and no payment row is touched or refunded — a
           refund is never fabricated), and it guarantees the trip-lifecycle
           worker — which only ever completes pending/confirmed bookings —
           can never later "complete" a booking on a cancelled trip. Seats are
           released in every derived availability count exactly like the
           existing passenger cancellation flow. */
        $cancelledBookings = 0;
        if (count($affectedBookings) > 0) {
            $updBook = $pdo->prepare('
                UPDATE bookings
                SET booking_status = \'cancelled\'
                WHERE trip_id = :trip_id
                  AND booking_status IN (\'pending\', \'confirmed\')');
            $updBook->execute([':trip_id' => $tripId]);
            $cancelledBookings = $updBook->rowCount();
        }

        $pdo->commit();

        /* Best-effort in-app notifications for the affected passengers,
           strictly after the commit. Each booking reference is the dedup
           token, so a notification can never be duplicated for the same
           event. No email / SMS / Telegram is ever sent — in-app only,
           through the existing helper. Passenger PII is never exposed to
           the cancelling company. */
        $notified = 0;
        foreach ($affectedBookings as $book) {
            try {
                createNotification(
                    $pdo,
                    (int) $book['passenger_id'],
                    'booking',
                    'Trip Cancelled',
                    'Your booking ' . $book['booking_reference'] . ' (' . $trip['from_city'] . ' → '
                        . $trip['to_city'] . ') departing ' . $trip['departure_date'] . ' has been cancelled '
                        . 'because the transport company cancelled this trip. Please contact the company '
                        . 'for assistance or book another trip.',
                    'trip-cancelled:' . $book['booking_reference']
                );
                $notified++;
            } catch (Throwable $e) {
                /* A notification failure never changes the cancellation result. */
            }
        }

        $affectedSummary = [];
        foreach ($affectedBookings as $book) {
            $paid = ($book['payment_status'] ?? '') === 'paid';
            $affectedSummary[] = [
                'booking_reference' => $book['booking_reference'],
                'payment_status' => $book['payment_status'],
                /* Derived refund state — the schema has no refund_pending
                   value and payments are never mutated, so a paid booking on
                   a cancelled trip is reported as refund-required using the
                   existing payment_status. */
                'refund_required' => $paid,
            ];
        }

        auth_response(200, [
            'success' => true,
            'message' => 'Trip cancelled.',
            'trip' => fetch_managed_trip_row($pdo, $tripId, $companyId),
            'affected' => [
                'count' => $cancelledBookings,
                'bookings' => $affectedSummary,
            ],
            'notified' => $notified,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/**
 * POST /api/company.php?action=trip_delete — permanently remove a cancelled trip.
 *
 * Only a trip already in the `cancelled` state may be deleted, and only by the
 * company that owns it. The deletion is atomic: booking records on the trip are
 * removed first (their booking_passengers / payments cascade, and reviews that
 * referenced the bookings fall back to booking_id = NULL), then the trip row
 * itself. Departed / completed / scheduled trips are never touched here.
 */
function handle_trip_delete(PDO $pdo): void
{
    require_company_post();
    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);
    $companyId = (int) $company['id'];

    $input = company_input();

    $tripId = positive_int_or_error($input['trip_id'] ?? null, 'A valid trip id is required.');

    try {
        $pdo->beginTransaction();

        /* Lock the owned trip first so the deletion is atomic and can never
           race the lifecycle workers or another operator action on the row. */
        $tripStmt = $pdo->prepare('
            SELECT id, company_id, status
            FROM trips
            WHERE id = :trip_id
            FOR UPDATE');
        $tripStmt->execute([':trip_id' => $tripId]);
        $trip = $tripStmt->fetch();

        /* Ownership failure and missing trip both answer 404 so a foreign trip
           id is never disclosed. */
        if ($trip === false || (int) $trip['company_id'] !== $companyId) {
            $pdo->rollBack();
            auth_response(404, [
                'success' => false,
                'message' => 'Trip not found.',
            ]);
        }

        /* Only cancelled trips may be deleted. Everything else is owned by the
           lifecycle (scheduled / departed / completed). */
        if ($trip['status'] !== 'cancelled') {
            $pdo->rollBack();
            auth_response(409, [
                'success' => false,
                'message' => 'Only cancelled trips can be deleted.',
            ]);
        }

        /* Delete the booking records first (bookings.trip_id is RESTRICT so the
           trip row cannot go before them). booking_passengers and payments
           cascade; reviews.bookings fall back to booking_id = NULL. */
        $delBook = $pdo->prepare('
            DELETE FROM bookings
            WHERE trip_id = :trip_id');
        $delBook->execute([':trip_id' => $tripId]);
        $deletedBookings = $delBook->rowCount();

        $delTrip = $pdo->prepare('
            DELETE FROM trips
            WHERE id = :trip_id
              AND company_id = :company_id
              AND status = :status');
        $delTrip->execute([
            ':trip_id' => $tripId,
            ':company_id' => $companyId,
            ':status' => 'cancelled',
        ]);

        if ($delTrip->rowCount() === 0) {
            $pdo->rollBack();
            auth_response(409, [
                'success' => false,
                'message' => 'This trip cannot be deleted in its current state.',
            ]);
        }

        $pdo->commit();

        auth_response(200, [
            'success' => true,
            'message' => 'Trip deleted.',
            'deleted_bookings' => $deletedBookings,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}
/* ============================================================
 Company bookings / passenger manifests
   ------------------------------------------------------------
   READ-ONLY operator visibility: a logged-in approved company may
   view bookings (and the matching passenger manifest) belonging to
   its OWN trips. Ownership follows the exact ownership chain:

       requireRole('company') -> session user id
       -> companies.user_id -> resolved company id
       -> trips.company_id -> bookings (through bookings.trip_id)

   The bookings table intentionally has NO company_id and never will.
   Every query below scopes through trips.company_id = :company_id
   and re-checks any browser-supplied trip_id / booking_id against
   the resolved company, so a manipulated parameter can only ever
   target one of this company's own trips/books. Booking status,
   payment status, passengers and seats are READ-ONLY here — there
   is no company-sided mutation here.
   ============================================================ */

/** Shape one company bookings-list row (dashboard overview; no passenger PII). */
function company_booking_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'booking_reference' => $row['booking_reference'],
        'trip_id' => (int) $row['trip_id'],
        'booking_status' => $row['booking_status'],
        'payment_status' => $row['payment_status'],
        'total_amount' => (float) $row['total_amount'],
        'passenger_count' => (int) $row['passenger_count'],
        'created_at' => $row['created_at'],
        'trip_departure_date' => $row['trip_departure_date'],
        'trip_departure_time' => $row['trip_departure_time'],
        'route_from' => $row['route_from'],
        'route_to' => $row['route_to'],
        'bus_name' => $row['bus_name'],
        'bus_registration' => $row['bus_registration'],
        'refund_account_name' => $row['refund_account_name'],
        'refund_account_number' => $row['refund_account_number'],
    ];
}

/**
 * Bookings on trips owned by :company_id. An optional :trip_id is always
 * ANDed with trips.company_id = :company_id, so it can never widen scope:
 * the browser may only ever target one of this company's own trips.
 */
function fetch_company_bookings(PDO $pdo, int $companyId, ?int $tripId): array
{
    $sql = '
        SELECT
            b.id,
            b.booking_reference,
            b.trip_id,
            b.booking_status,
            b.payment_status,
            b.total_amount,
            b.refund_account_name,
            b.refund_account_number,
            b.created_at,
            t.departure_date AS trip_departure_date,
            t.departure_time AS trip_departure_time,
            r.from_city AS route_from,
            r.to_city AS route_to,
            bu.name AS bus_name,
            bu.registration_number AS bus_registration,
            (SELECT COUNT(bp.id) FROM booking_passengers bp WHERE bp.booking_id = b.id) AS passenger_count
        FROM bookings b
        JOIN trips t ON t.id = b.trip_id
        JOIN routes r ON r.id = t.route_id
        JOIN buses bu ON bu.id = t.bus_id
        WHERE t.company_id = :company_id';
    $params = [':company_id' => $companyId];

    if ($tripId !== null) {
        $sql .= ' AND t.id = :trip_id';
        $params[':trip_id'] = $tripId;
    }

    $sql .= ' ORDER BY b.created_at DESC, b.id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[] = company_booking_payload($row);
    }

    return $out;
}

/**
 * Verifies a browser-supplied trip_id belongs to the resolved company.
 * Foreign and nonexistent ids both answer with the same generic 404 so a
 * caller can neither learn whether another company owns a trip nor whether
 * that trip has bookings.
 */
function owned_trip_or_error(PDO $pdo, int $companyId, int $tripId): void
{
    $stmt = $pdo->prepare('
        SELECT id FROM trips
        WHERE id = :trip_id AND company_id = :company_id
        LIMIT 1
    ');
    $stmt->execute([':trip_id' => $tripId, ':company_id' => $companyId]);

    if ($stmt->fetch() === false) {
        auth_response(404, [
            'success' => false,
            'message' => 'Trip not found.',
        ]);
    }
}

/** GET /api/company.php?action=bookings — this company's own trip bookings. */
function normalize_company_manual_payment_method(?string $value): ?string
{
    $m = strtolower(preg_replace('/[\s\-_]+/', '', (string) $value));

    if ($m === 'cash' || $m === 'cashpayment' || $m === 'cashpay') {
        return 'cash';
    }
    if ($m === 'transfer' || $m === 'banktransfer' || $m === 'banktransferpayment' || $m === 'bank' || $m === 'bankdeposit') {
        return 'transfer';
    }

    return null;
}

function generate_company_booking_reference(PDO $pdo): string
{
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $max = strlen($chars) - 1;
    $check = $pdo->prepare('SELECT id FROM bookings WHERE booking_reference = :ref LIMIT 1');

    for ($attempt = 0; $attempt < 25; $attempt++) {
        $rand = '';
        for ($i = 0; $i < 6; $i++) {
            $rand .= $chars[random_int(0, $max)];
        }

        $ref = 'ET-' . date('Ymd') . '-' . $rand;
        $check->execute([':ref' => $ref]);
        if (!$check->fetch()) {
            return $ref;
        }
    }

    auth_response(500, ['success' => false, 'message' => 'Unable to allocate a booking reference. Please retry.']);
}

function ensure_booking_passenger_user(PDO $pdo, string $name, string $phone): int
{
    $phone = preg_replace('/\s+/', '', trim($phone));
    if ($phone === '' || strlen($phone) < 7) {
        auth_response(422, ['success' => false, 'message' => 'A valid passenger phone number is required.']);
    }

    $stmt = $pdo->prepare('SELECT id, role FROM users WHERE phone = :phone LIMIT 1');
    $stmt->execute([':phone' => $phone]);
    $row = $stmt->fetch();
    if ($row !== false) {
        if (($row['role'] ?? '') !== 'passenger') {
            auth_response(409, ['success' => false, 'message' => 'This phone number is already linked to an account that cannot receive a walk-in booking.']);
        }
        return (int) $row['id'];
    }

    $safeName = preg_replace('/[^A-Za-z0-9 ]+/', '', trim($name));
    $safeName = trim($safeName);
    $base = $safeName !== '' ? strtolower($safeName) : 'walkin';
    $base = preg_replace('/\s+/', '-', $base);
    $base = preg_replace('/-+/', '-', $base);
    $email = 'walkin-' . ($base !== '' ? $base : 'guest') . '-' . bin2hex(random_bytes(4)) . '@ettransport.local';
    $passwordHash = password_hash('WalkIn@' . bin2hex(random_bytes(4)), PASSWORD_DEFAULT);

    $ins = $pdo->prepare('
        INSERT INTO users (name, email, phone, password_hash, role, status)
        VALUES (:name, :email, :phone, :password_hash, :role, :status)
    ');
    $ins->execute([
        ':name' => trim($name),
        ':email' => $email,
        ':phone' => $phone,
        ':password_hash' => $passwordHash,
        ':role' => 'passenger',
        ':status' => 'active',
    ]);

    return (int) $pdo->lastInsertId();
}

/** POST /api/company.php?action=booking_create — company admin books for a passenger in person/phone. */
function handle_company_booking_create(PDO $pdo): void
{
    require_company_post();
    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);
    $companyId = (int) $company['id'];

    $input = company_input();
    $tripId = positive_int_or_error($input['trip_id'] ?? null, 'A valid trip is required.');
    $paymentMethod = normalize_company_manual_payment_method($input['payment_method'] ?? '');
    $seatNumber = positive_int_or_error($input['seat_number'] ?? null, 'A valid seat number is required.');
    $passengerName = trim((string) ($input['passenger_name'] ?? ''));
    $passengerPhone = trim((string) ($input['passenger_phone'] ?? ''));
    $passengerAge = isset($input['passenger_age']) && trim((string) $input['passenger_age']) !== '' ? (int) trim((string) $input['passenger_age']) : null;
    $passengerGender = strtolower(trim((string) ($input['passenger_gender'] ?? '')));
    $paymentReference = trim((string) ($input['payment_reference'] ?? ''));
    $refundAccountName = trim((string) ($input['refund_account_name'] ?? ''));
    $refundAccountNumber = trim((string) ($input['refund_account_number'] ?? ''));

    if ($refundAccountName !== '' && mb_strlen($refundAccountName) > 120) {
        auth_response(422, ['success' => false, 'message' => 'Refund account name must be at most 120 characters.']);
    }
    if ($refundAccountNumber !== '' && mb_strlen($refundAccountNumber) > 50) {
        auth_response(422, ['success' => false, 'message' => 'Refund account number must be at most 50 characters.']);
    }

    if ($passengerName === '' || mb_strlen($passengerName) < 2) {
        auth_response(422, ['success' => false, 'message' => 'Passenger name is required.']);
    }
    if ($passengerPhone === '' || strlen($passengerPhone) < 7) {
        auth_response(422, ['success' => false, 'message' => 'Passenger phone number is required.']);
    }
    if ($paymentMethod === null) {
        auth_response(422, ['success' => false, 'message' => 'Select cash or transfer as the payment method.']);
    }
    if ($paymentMethod === 'transfer' && $paymentReference === '') {
        auth_response(422, ['success' => false, 'message' => 'A transfer transaction number is required when bank transfer is selected.']);
    }
    if ($passengerAge !== null && ($passengerAge < 1 || $passengerAge > 100)) {
        auth_response(422, ['success' => false, 'message' => 'Passenger age must be between 1 and 100.']);
    }
    if ($passengerGender !== '' && !in_array($passengerGender, ['male', 'female', 'other'], true)) {
        auth_response(422, ['success' => false, 'message' => 'Passenger gender is invalid.']);
    }

    $tripStmt = $pdo->prepare('
        SELECT t.id, t.company_id, t.departure_date, t.departure_time, t.status, t.price,
               b.seat_count, b.name AS bus_name, r.from_city, r.to_city, c.name AS company_name
        FROM trips t
        JOIN buses b ON b.id = t.bus_id
        JOIN routes r ON r.id = t.route_id
        JOIN companies c ON c.id = t.company_id
        WHERE t.id = :trip_id AND t.company_id = :company_id
        LIMIT 1
    ');
    $tripStmt->execute([':trip_id' => $tripId, ':company_id' => $companyId]);
    $trip = $tripStmt->fetch();

    if ($trip === false) {
        auth_response(404, ['success' => false, 'message' => 'Trip not found.']);
    }
    if ($trip['status'] !== 'scheduled') {
        auth_response(409, ['success' => false, 'message' => 'This trip is no longer available for a walk-in booking.']);
    }
    if ($seatNumber > (int) $trip['seat_count']) {
        auth_response(422, ['success' => false, 'message' => 'Seat number is outside the available bus capacity.']);
    }

    $occupiedStmt = $pdo->prepare('
        SELECT bp.seat_number
        FROM booking_passengers bp
        JOIN bookings bk ON bk.id = bp.booking_id
        WHERE bk.trip_id = :trip_id
          AND bk.booking_status <> :cancelled
    ');
    $occupiedStmt->execute([':trip_id' => $tripId, ':cancelled' => 'cancelled']);
    $occupied = [];
    foreach ($occupiedStmt->fetchAll() as $row) {
        $occupied[(int) $row['seat_number']] = true;
    }
    if (isset($occupied[$seatNumber])) {
        auth_response(409, ['success' => false, 'message' => 'Seat ' . str_pad((string) $seatNumber, 2, '0', STR_PAD_LEFT) . ' is already booked for this trip.']);
    }

    $passengerUserId = ensure_booking_passenger_user($pdo, $passengerName, $passengerPhone);

    $pdo->beginTransaction();
    try {
        $ref = generate_company_booking_reference($pdo);
        $total = round((float) $trip['price'], 2);

        $bookingStmt = $pdo->prepare('
            INSERT INTO bookings (passenger_id, trip_id, booking_reference, total_amount, payment_method, payment_status, booking_status, refund_account_name, refund_account_number)
            VALUES (:passenger_id, :trip_id, :reference, :total_amount, :payment_method, :payment_status, :booking_status, :refund_account_name, :refund_account_number)
        ');
        $bookingStmt->execute([
            ':passenger_id' => $passengerUserId,
            ':trip_id' => $tripId,
            ':reference' => $ref,
            ':total_amount' => $total,
            ':payment_method' => $paymentMethod,
            ':payment_status' => 'paid',
            ':booking_status' => 'confirmed',
            ':refund_account_name' => $refundAccountName !== '' ? $refundAccountName : null,
            ':refund_account_number' => $refundAccountNumber !== '' ? $refundAccountNumber : null,
        ]);
        $bookingId = (int) $pdo->lastInsertId();

        $passengerStmt = $pdo->prepare('
            INSERT INTO booking_passengers (booking_id, name, age, gender, phone, seat_number)
            VALUES (:booking_id, :name, :age, :gender, :phone, :seat_number)
        ');
        $passengerStmt->execute([
            ':booking_id' => $bookingId,
            ':name' => $passengerName,
            ':age' => $passengerAge,
            ':gender' => $passengerGender !== '' ? $passengerGender : null,
            ':phone' => $passengerPhone,
            ':seat_number' => (string) $seatNumber,
        ]);

        $txRef = $paymentReference !== '' ? $paymentReference : 'OFFICE-' . date('Ymd') . '-' . bin2hex(random_bytes(4));
        $paymentStmt = $pdo->prepare('
            INSERT INTO payments (booking_id, amount, method, transaction_reference, status)
            VALUES (:booking_id, :amount, :method, :transaction_reference, :status)
        ');
        $paymentStmt->execute([
            ':booking_id' => $bookingId,
            ':amount' => $total,
            ':method' => $paymentMethod,
            ':transaction_reference' => $txRef,
            ':status' => 'paid',
        ]);

        $pdo->commit();

        try {
            createNotification(
                $pdo,
                $passengerUserId,
                'booking',
                'Ticket booked by office',
                'Your ticket for ' . $trip['from_city'] . ' → ' . $trip['to_city'] . ' has been booked and confirmed. Seat ' . $seatNumber . ' is reserved under booking ' . $ref . '.',
                'walkin-booking:' . $ref
            );
        } catch (Throwable $e) {
            // Best-effort only; never fail the booking.
        }

        auth_response(201, [
            'success' => true,
            'message' => 'Walk-in ticket booked successfully.',
            'booking' => [
                'id' => $bookingId,
                'booking_reference' => $ref,
                'trip_id' => $tripId,
                'seat_number' => $seatNumber,
                'payment_method' => $paymentMethod,
                'payment_status' => 'paid',
                'booking_status' => 'confirmed',
            ],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        auth_response(500, [
            'success' => false,
            'message' => 'Walk-in booking could not be created. Please try again.',
        ]);
    }
}

function handle_bookings(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, [
            'success' => false,
            'message' => 'Method not allowed.',
        ]);
    }

    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);
    $companyId = (int) $company['id'];

    $tripId = null;
    if (has_key($_GET, 'trip_id') && trim((string) $_GET['trip_id']) !== '') {
        $tripId = positive_int_or_error($_GET['trip_id'], 'A valid trip id is required.');
        owned_trip_or_error($pdo, $companyId, $tripId);
    }

    auth_response(200, [
        'success' => true,
        'company_id' => $companyId,
        'bookings' => fetch_company_bookings($pdo, $companyId, $tripId),
    ]);
}

/** POST /api/company.php?action=booking_cancel — company admin cancels a booking and frees the seat. */
function handle_booking_cancel(PDO $pdo): void
{
    require_company_post();
    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);
    $companyId = (int) $company['id'];

    $input = company_input();
    $bookingId = positive_int_or_error($input['booking_id'] ?? null, 'A valid booking is required.');

    /* Refund choice: none / full / half. Any other value is rejected so the
       payment_state stays conservative — a malformed request must never
       silently refund (or silently keep) money. */
    $refundType = strtolower(trim((string) ($input['refund_type'] ?? 'none')));
    if (!in_array($refundType, ['none', 'full', 'half'], true)) {
        auth_response(422, [
            'success' => false,
            'message' => 'Refund must be one of: none, full, half.',
        ]);
    }

    $reason = trim((string) ($input['reason'] ?? ''));
    if ($reason === '') {
        auth_response(422, [
            'success' => false,
            'message' => 'A cancellation reason is required.',
        ]);
    }
    if (mb_strlen($reason) > 500) {
        auth_response(422, [
            'success' => false,
            'message' => 'Cancellation reason must be at most 500 characters.',
        ]);
    }

    $bookingStmt = $pdo->prepare('
        SELECT
            bk.id,
            bk.trip_id,
            bk.passenger_id,
            bk.booking_reference,
            bk.booking_status,
            bk.payment_status,
            bk.total_amount,
            bk.refund_account_name,
            bk.refund_account_number,
            t.company_id,
            t.departure_date,
            t.departure_time,
            r.from_city,
            r.to_city
        FROM bookings bk
        JOIN trips t ON t.id = bk.trip_id
        JOIN routes r ON r.id = t.route_id
        WHERE bk.id = :booking_id
        LIMIT 1
    ');
    $bookingStmt->execute([':booking_id' => $bookingId]);
    $booking = $bookingStmt->fetch();

    if ($booking === false) {
        auth_response(404, ['success' => false, 'message' => 'Booking not found.']);
    }
    if ((int) $booking['company_id'] !== $companyId) {
        auth_response(403, ['success' => false, 'message' => 'You do not have permission to cancel this booking.']);
    }
    if ($booking['booking_status'] === 'cancelled') {
        auth_response(409, ['success' => false, 'message' => 'This booking has already been cancelled.']);
    }

    $totalAmount = round((float) $booking['total_amount'], 2);
    $refundedAmount = null;
    if ($refundType === 'full') {
        $refundedAmount = $totalAmount;
    } elseif ($refundType === 'half') {
        $refundedAmount = round($totalAmount / 2, 2);
    }

    /* When a refund is issued (full or half) the payment becomes 'refunded'.
       When no refund is chosen the booking is cancelled without touching the
       original payment_status — the operator deliberately kept the money, so
       it must keep showing as paid/pending/failed instead of silently
       flipping to 'refunded'. */
    $newPaymentStatus = $refundType === 'none' ? $booking['payment_status'] : 'refunded';

    $pdo->beginTransaction();
    try {
        $cancelStmt = $pdo->prepare('
            UPDATE bookings
            SET booking_status = :cancelled,
                payment_status = :payment_status,
                cancellation_reason = :reason,
                refund_type = :refund_type,
                refunded_amount = :refunded_amount
            WHERE id = :booking_id
        ');
        $cancelStmt->execute([
            ':cancelled' => 'cancelled',
            ':payment_status' => $newPaymentStatus,
            ':reason' => $reason,
            ':refund_type' => $refundType,
            ':refunded_amount' => $refundedAmount,
            ':booking_id' => $bookingId,
        ]);

        /* Real refund logic — a full or half refund must move the booking's
           paid payment row(s) to 'refunded' INSIDE the same transaction, so
           every revenue surface (overview revenue card, Revenue / Payments tab,
           payments list) stops counting the refunded money as income and shows
           it as a refunded payment. 'none' leaves the original payment status
           untouched because the company deliberately kept the money. */
        if ($refundType !== 'none') {
            $updPay = $pdo->prepare("
                UPDATE payments
                SET status = 'refunded'
                WHERE booking_id = :booking_id
                  AND status = 'paid'
            ");
            $updPay->execute([':booking_id' => $bookingId]);
        }

        $pdo->commit();

        if ($refundType === 'full') {
            $notice = 'Booking cancelled successfully. Full refund of ETB ' . number_format($refundedAmount, 2) . ' recorded. Seat has been freed.';
        } elseif ($refundType === 'half') {
            $notice = 'Booking cancelled successfully. Half refund of ETB ' . number_format($refundedAmount, 2) . ' recorded. Seat has been freed.';
        } else {
            $notice = 'Booking cancelled successfully. No refund was issued. Seat has been freed.';
        }

        /* Best-effort in-app notification for the passenger, strictly after
           the commit, so a refund that was refused earlier is never silently
           re-notified. Same dedup-token pattern as the trip-cancel path; no
           email / SMS / Telegram is ever sent. */
        try {
            $refundNote = $refundType === 'full'
                ? 'A full refund of ETB ' . number_format($refundedAmount, 2) . ' has been issued.'
                : ($refundType === 'half'
                    ? 'A half refund of ETB ' . number_format($refundedAmount, 2) . ' has been issued.'
                    : 'No refund was issued.');
            createNotification(
                $pdo,
                (int) $booking['passenger_id'],
                'booking',
                'Booking Cancelled',
                'Your booking ' . $booking['booking_reference'] . ' (' . $booking['from_city'] . ' → '
                    . $booking['to_city'] . ') departing ' . $booking['departure_date'] . ' has been cancelled. '
                    . $refundNote,
                'booking-cancelled:' . $booking['booking_reference']
            );
        } catch (Throwable $e) {
            /* A notification failure never changes the cancellation result. */
        }

        auth_response(200, [
            'success' => true,
            'message' => $notice,
            'booking_id' => $bookingId,
            'refund_type' => $refundType,
            'refunded_amount' => $refundedAmount,
            'refund_account' => [
                'name' => $booking['refund_account_name'],
                'number' => $booking['refund_account_number'],
            ],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        auth_response(500, [
            'success' => false,
            'message' => 'Unable to cancel the booking. Please try again.',
        ]);
    }
}

/** Shape one passenger-manifest traveler row (booking_passengers fields only). */
function manifest_passenger_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'age' => $row['age'] !== null ? (int) $row['age'] : null,
        'gender' => $row['gender'],
        'phone' => $row['phone'],
        'seat_number' => $row['seat_number'],
    ];
}

/** GET /api/company.php?action=manifest&booking_id=N — owned booking manifest. */
function handle_manifest(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, [
            'success' => false,
            'message' => 'Method not allowed.',
        ]);
    }

    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);
    $companyId = (int) $company['id'];

    $bookingId = positive_int_or_error($_GET['booking_id'] ?? null, 'A valid booking id is required.');

    /* A booking belongs to the company exactly because its trip belongs to the
       company. Joining through trips.company_id is the ownership check, so an
       other-company or nonexistent booking id answers with one generic 404
       and never reveals whether the id exists or who owns it. */
    $stmt = $pdo->prepare('
        SELECT
            b.id,
            b.booking_reference,
            b.booking_status,
            b.payment_status,
            b.total_amount,
            b.created_at,
            b.trip_id,
            t.departure_date,
            t.departure_time,
            t.arrival_time,
            r.from_city,
            r.to_city,
            bu.name AS bus_name,
            bu.registration_number AS bus_registration,
            bu.bus_type,
            b.refund_account_name,
            b.refund_account_number
        FROM bookings b
        JOIN trips t ON t.id = b.trip_id
        JOIN routes r ON r.id = t.route_id
        JOIN buses bu ON bu.id = t.bus_id
        WHERE b.id = :booking_id AND t.company_id = :company_id
        LIMIT 1
    ');
    $stmt->execute([':booking_id' => $bookingId, ':company_id' => $companyId]);
    $row = $stmt->fetch();

    if ($row === false) {
        auth_response(404, [
            'success' => false,
            'message' => 'Booking not found.',
        ]);
    }

    /* Passenger manifest: only real booking_passengers records. Seat numbers
       come from the stored rows, never reconstructed from client state. */
    $ps = $pdo->prepare('
        SELECT id, name, age, gender, phone, seat_number
        FROM booking_passengers
        WHERE booking_id = :booking_id
        ORDER BY id ASC
    ');
    $ps->execute([':booking_id' => $bookingId]);

    $passengers = [];
    foreach ($ps->fetchAll() as $p) {
        $passengers[] = manifest_passenger_payload($p);
    }

    auth_response(200, [
        'success' => true,
        'booking' => [
            'id' => (int) $row['id'],
            'booking_reference' => $row['booking_reference'],
            'booking_status' => $row['booking_status'],
            'payment_status' => $row['payment_status'],
            'total_amount' => (float) $row['total_amount'],
            'refund_account_name' => $row['refund_account_name'],
            'refund_account_number' => $row['refund_account_number'],
            'created_at' => $row['created_at'],
            'trip' => [
                'id' => (int) $row['trip_id'],
                'from_city' => $row['from_city'],
                'to_city' => $row['to_city'],
                'departure_date' => $row['departure_date'],
                'departure_time' => $row['departure_time'],
                'arrival_time' => $row['arrival_time'],
                'bus_name' => $row['bus_name'],
                'bus_registration' => $row['bus_registration'],
                'bus_type' => $row['bus_type'],
            ],
        ],
        'passengers' => $passengers,
    ]);
}
/* ============================================================
 Company revenue / payments (READ-ONLY reporting)
   ------------------------------------------------------------
   An authenticated, approved company user may view payments that
   belong ONLY to bookings on that company's own trips. This module
   is a read-only operator report — there are NO payment/revenue
   mutations here; the existing passenger payment flow
   (api/payment.php) stays authoritative for any payment write.

   Ownership is enforced exactly like the other company views. The session user
   resolves to a company through companies.user_id, and every
   payment reaches that company only through:

       payments -> bookings -> trips.company_id

   The bookings table has NO company_id and is never given one.
   A browser-supplied company_id / trip_id / booking_id is never
   trusted; any scope check failure returns the same generic 404 as
   a nonexistent object, so cross-company data can never leak.

   Supported actions (GET):
       action=revenue   -> aggregate revenue summary (company scope)
       action=payments  -> payment rows for the company's bookings
   ============================================================ */

/** Payment status ENUM values defined by the schema. */
const COMPANY_PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

/** True when the value is one of the schema's payment.status ENUM values. */
function valid_company_payment_status(string $value): bool
{
    return in_array($value, COMPANY_PAYMENT_STATUSES, true);
}

/**
 * Parse + validate the read-only payment filters (GET only). A supplied
 * trip_id is verified against the resolved company via owned_trip_or_error,
 * so a foreign or nonexistent trip answers with a generic 404 (and can
 * never widen scope beyond the session company). Returns
 * [tripId, status, fromDate, toDate].
 */
function company_payment_filters(PDO $pdo, int $companyId): array
{
    $tripId = null;
    if (has_key($_GET, 'trip_id') && trim((string) $_GET['trip_id']) !== '') {
        $tripId = positive_int_or_error($_GET['trip_id'], 'A valid trip id is required.');
        owned_trip_or_error($pdo, $companyId, $tripId);
    }

    $status = null;
    if (has_key($_GET, 'status') && trim((string) $_GET['status']) !== '') {
        $status = strtolower(trim((string) $_GET['status']));
        if (!valid_company_payment_status($status)) {
            auth_response(422, [
                'success' => false,
                'message' => 'A valid payment status is required.',
            ]);
        }
    }

    $datePattern = '/^\d{4}-\d{2}-\d{2}$/';
    $fromDate = null;
    if (has_key($_GET, 'date_from') && trim((string) $_GET['date_from']) !== '') {
        $fromDate = trim((string) $_GET['date_from']);
        if (preg_match($datePattern, $fromDate) !== 1) {
            auth_response(422, [
                'success' => false,
                'message' => 'A valid date_from (YYYY-MM-DD) is required.',
            ]);
        }
    }

    $toDate = null;
    if (has_key($_GET, 'date_to') && trim((string) $_GET['date_to']) !== '') {
        $toDate = trim((string) $_GET['date_to']);
        if (preg_match($datePattern, $toDate) !== 1) {
            auth_response(422, [
                'success' => false,
                'message' => 'A valid date_to (YYYY-MM-DD) is required.',
            ]);
        }
    }

    return [$tripId, $status, $fromDate, $toDate];
}

/**
 * Build the company-scoped payment FROM/WHERE clause shared by the revenue
 * summary and the payment list. ALWAYS anchored by trips.company_id =
 * :company_id; optional filters are ANDed on top and can never widen scope.
 * Returns [sqlBody, params].
 */
function company_payments_query(int $companyId, ?int $tripId, ?string $status, ?string $fromDate, ?string $toDate): array
{
    $sql = '
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        JOIN trips t ON t.id = b.trip_id
        JOIN routes r ON r.id = t.route_id
        WHERE t.company_id = :company_id';
    $params = [':company_id' => $companyId];

    if ($tripId !== null) {
        $sql .= ' AND t.id = :trip_id';
        $params[':trip_id'] = $tripId;
    }
    if ($status !== null) {
        $sql .= ' AND p.status = :status';
        $params[':status'] = $status;
    }
    if ($fromDate !== null) {
        $sql .= ' AND p.created_at >= :from_date';
        $params[':from_date'] = $fromDate . ' 00:00:00';
    }
    if ($toDate !== null) {
        $sql .= ' AND p.created_at <= :to_date';
        $params[':to_date'] = $toDate . ' 23:59:59';
    }

    return [$sql, $params];
}

/** Shape one payment row for the company payment list (NO passenger PII). */
function company_payment_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'booking_id' => (int) $row['booking_id'],
        'booking_reference' => $row['booking_reference'],
        'trip_id' => (int) $row['trip_id'],
        'route_from' => $row['from_city'],
        'route_to' => $row['to_city'],
        'departure_date' => $row['departure_date'],
        'departure_time' => $row['departure_time'],
        'amount' => (float) $row['amount'],
        'method' => $row['method'],
        'transaction_reference' => $row['transaction_reference'],
        'status' => $row['status'],
        'created_at' => $row['created_at'],
        'updated_at' => $row['updated_at'],
    ];
}

/**
 * Aggregate revenue summary for one company, scoped through
 * payments -> bookings -> trips.company_id. Honest to the schema:
 *   - total_paid_revenue   sum of payment rows marked 'paid'
 *   - paid/pending/failed/refunded counts are per payment row
 *   - paid_booking_count   distinct bookings with a 'paid' payment
 * The schema allows more than one payment row per booking, but the
 * current payment flow (api/payment.php) creates exactly one 'paid'
 * row per booking, so paid_payment_count == paid_booking_count today.
 * COALESCE(...,0) keeps a company with no payments on zero, not null.
 */
function company_revenue_summary(PDO $pdo, int $companyId, ?int $tripId, ?string $status, ?string $fromDate, ?string $toDate): array
{
    [$sqlBody, $params] = company_payments_query($companyId, $tripId, $status, $fromDate, $toDate);

        $sql = 'SELECT'
        . ' COALESCE(SUM(CASE WHEN p.status = \'paid\' THEN p.amount ELSE 0 END), 0) AS total_paid_revenue'
        . ', COUNT(*) AS total_payment_count'
        . ', COUNT(CASE WHEN p.status = \'paid\' THEN 1 END) AS paid_payment_count'
        . ', COUNT(CASE WHEN p.status = \'pending\' THEN 1 END) AS pending_payment_count'
        . ', COUNT(CASE WHEN p.status = \'failed\' THEN 1 END) AS failed_payment_count'
        . ', COUNT(CASE WHEN p.status = \'refunded\' THEN 1 END) AS refunded_payment_count'
        . ', COUNT(DISTINCT CASE WHEN p.status = \'paid\' THEN p.booking_id END) AS paid_booking_count'
        . $sqlBody;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();

    if ($row === false) {
        $row = [];
    }

    return [
        'total_paid_revenue' => round((float) ($row['total_paid_revenue'] ?? 0), 2),
        'paid_payment_count' => (int) ($row['paid_payment_count'] ?? 0),
        'pending_payment_count' => (int) ($row['pending_payment_count'] ?? 0),
        'failed_payment_count' => (int) ($row['failed_payment_count'] ?? 0),
        'refunded_payment_count' => (int) ($row['refunded_payment_count'] ?? 0),
        'total_payment_count' => (int) ($row['total_payment_count'] ?? 0),
        'paid_booking_count' => (int) ($row['paid_booking_count'] ?? 0),
    ];
}

/** GET ?action=payments — payment rows for bookings on the session company's trips. */
function fetch_company_payments(PDO $pdo, int $companyId, ?int $tripId, ?string $status, ?string $fromDate, ?string $toDate): array
{
    [$sqlBody, $params] = company_payments_query($companyId, $tripId, $status, $fromDate, $toDate);

    $sql = 'SELECT'
        . ' p.id'
        . ', b.id AS booking_id'
        . ', b.booking_reference'
        . ', t.id AS trip_id'
        . ', r.from_city'
        . ', r.to_city'
        . ', t.departure_date'
        . ', t.departure_time'
        . ', p.amount'
        . ', p.method'
        . ', p.transaction_reference'
        . ', p.status'
        . ', p.created_at'
        . ', p.updated_at'
        . $sqlBody
        . ' ORDER BY p.created_at DESC, p.id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[] = company_payment_payload($row);
    }
    return $out;
}

/** GET /api/company.php?action=revenue — aggregate revenue summary. */
function handle_revenue(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, [
            'success' => false,
            'message' => 'Method not allowed.',
        ]);
    }

    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);
    $companyId = (int) $company['id'];

    [$tripId, $status, $fromDate, $toDate] = company_payment_filters($pdo, $companyId);

    auth_response(200, [
        'success' => true,
        'company_id' => $companyId,
        'revenue' => company_revenue_summary($pdo, $companyId, $tripId, $status, $fromDate, $toDate),
    ]);
}

/** GET /api/company.php?action=payments — payment rows scoped to this company. */
function handle_payments(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, [
            'success' => false,
            'message' => 'Method not allowed.',
        ]);
    }

    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);
    $companyId = (int) $company['id'];

    [$tripId, $status, $fromDate, $toDate] = company_payment_filters($pdo, $companyId);

    auth_response(200, [
        'success' => true,
        'company_id' => $companyId,
        'payments' => fetch_company_payments($pdo, $companyId, $tripId, $status, $fromDate, $toDate),
    ]);
}

/**
 * One complete editable company row for the authenticated owner.
 *
 * NOTE: this never takes a company id from the browser. Ownership is
 * resolved from the authenticated session user via require_company_scope().
 */
function fetch_company_profile_row(PDO $pdo, int $companyId): ?array
{
    $stmt = $pdo->prepare('
        SELECT id, name, slug, description, logo, cover_image, phone, email, address, status
        FROM companies
        WHERE id = :id
        LIMIT 1
    ');
    $stmt->execute([':id' => $companyId]);
    $row = $stmt->fetch();
    return $row !== false ? $row : null;
}

/**
 * Shape the company profile fields exposed to the owner for viewing/editing.
 * Sensitive/internal data (user_id, created_at) is never included.
 */
function company_profile_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'slug' => $row['slug'],
        'description' => $row['description'],
        'email' => $row['email'],
        'phone' => $row['phone'],
        'address' => $row['address'],
        'logo' => $row['logo'],
        'cover_image' => $row['cover_image'],
        'status' => $row['status'],
    ];
}

/**
 * Validate an optional image value stored in companies.logo /
 * companies.cover_image. Empty clears the field (returns null). Two safe
 * formats are accepted to match the existing storage convention:
 *
 *   - a relative assets path such as "assets/images/companies/x.svg"
 *     (letters, digits, underscore, hyphen, single forward slashes, and an
 *     image extension only — no "..", no scheme, no spaces),
 *   - an absolute http(s) URL.
 *
 * Invalid values stop the request with a generic 422 — no SQL/PDO detail
 * leaks. NOTE: this repository has no upload mechanism; the field is a
 * stored path/URL string only.
 */
function company_image_url_or_error(string $value): ?string
{
    $value = trim($value);

    if ($value === '') {
        return null;
    }

    if (mb_strlen($value) > 255) {
        auth_response(422, [
            'success' => false,
            'message' => 'Image value must be at most 255 characters.',
        ]);
    }

    // Absolute http(s) URL.
    if (preg_match('#^https?://#i', $value) === 1) {
        if (filter_var($value, FILTER_VALIDATE_URL) === false) {
            auth_response(422, [
                'success' => false,
                'message' => 'Image URL must be a valid http(s) URL.',
            ]);
        }

        $scheme = strtolower((string) parse_url($value, PHP_URL_SCHEME));
        if ($scheme !== 'http' && $scheme !== 'https') {
            auth_response(422, [
                'success' => false,
                'message' => 'Image URL must use http or https.',
            ]);
        }

        return $value;
    }

    // Safe relative asset path (matches the existing stored format).
    if (preg_match('#^[A-Za-z0-9_\-]+(?:/[A-Za-z0-9_\-]+)*\.(?:png|jpe?g|gif|svg|webp|avif)$#', $value) === 1) {
        return $value;
    }

    auth_response(422, [
        'success' => false,
        'message' => 'Image must be a safe relative path or an http(s) URL.',
    ]);
}

/** Store an owner-uploaded company image and return its safe public path. */
function company_uploaded_image_or_error(?array $file, int $companyId, string $kind): ?string
{
    if ($file === null || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }

    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) ($file['tmp_name'] ?? ''))) {
        auth_response(422, ['success' => false, 'message' => 'The image upload could not be completed.']);
    }
    if ((int) ($file['size'] ?? 0) < 1 || (int) ($file['size'] ?? 0) > 5 * 1024 * 1024) {
        auth_response(422, ['success' => false, 'message' => 'Images must be smaller than 5 MB.']);
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file((string) $file['tmp_name']);
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($extensions[$mime])) {
        auth_response(422, ['success' => false, 'message' => 'Please upload a PNG, JPEG or WebP image.']);
    }

    $directory = __DIR__ . '/../assets/uploads/companies';
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
        auth_response(500, ['success' => false, 'message' => 'Image storage is temporarily unavailable.']);
    }
    $filename = 'company-' . $companyId . '-' . $kind . '-' . bin2hex(random_bytes(12)) . '.' . $extensions[$mime];
    if (!move_uploaded_file((string) $file['tmp_name'], $directory . '/' . $filename)) {
        auth_response(500, ['success' => false, 'message' => 'Image storage is temporarily unavailable.']);
    }

    return 'assets/uploads/companies/' . $filename;
}

/** GET /api/company.php?action=profile — the authenticated company's own profile. */
function handle_company_profile(PDO $pdo): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, [
            'success' => false,
            'message' => 'Method not allowed.',
        ]);
    }

    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);
    $profile = fetch_company_profile_row($pdo, (int) $company['id']);

    auth_response(200, [
        'success' => true,
        'company' => company_profile_payload($profile),
    ]);
}

/**
 * POST /api/company.php?action=profile_update — update the authenticated
 * company's own profile only.
 *
 * The company row is resolved from the session (companies.user_id); a
 * browser-supplied company_id is never read or trusted.
 */
function handle_company_profile_update(PDO $pdo): void
{
    require_company_post();
    $user = requireRole('company');
    $company = require_company_scope($pdo, (int) $user['id']);
    $companyId = (int) $company['id'];

    $input = company_input();
    $existing = fetch_company_profile_row($pdo, $companyId);

    $name = trim((string) ($input['name'] ?? ''));
    $description = trim((string) ($input['description'] ?? ''));
    $email = strtolower(trim((string) ($input['email'] ?? '')));
    $phone = trim((string) ($input['phone'] ?? ''));
    $address = trim((string) ($input['address'] ?? ''));
    $uploadedLogo = company_uploaded_image_or_error($_FILES['logo_file'] ?? null, $companyId, 'logo');
    $uploadedCover = company_uploaded_image_or_error($_FILES['cover_file'] ?? null, $companyId, 'cover');
    $logo = $uploadedLogo ?? ((string) ($input['remove_logo'] ?? '') === '1' ? null : ($existing['logo'] ?? null));
    $coverImage = $uploadedCover ?? ((string) ($input['remove_cover'] ?? '') === '1' ? null : ($existing['cover_image'] ?? null));

    if ($name === '') {
        auth_response(422, [
            'success' => false,
            'message' => 'Company name is required.',
        ]);
    }
    if (mb_strlen($name) > 160) {
        auth_response(422, [
            'success' => false,
            'message' => 'Company name must be at most 160 characters.',
        ]);
    }
    if (mb_strlen($description) > 4000) {
        auth_response(422, [
            'success' => false,
            'message' => 'Company description must be at most 4000 characters.',
        ]);
    }
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        auth_response(422, [
            'success' => false,
            'message' => 'Please enter a valid company email address.',
        ]);
    }
    if (mb_strlen($email) > 190) {
        auth_response(422, [
            'success' => false,
            'message' => 'Email must be at most 190 characters.',
        ]);
    }
    if ($phone !== '' && preg_match('/^[+0-9][0-9\-\s]{6,20}$/', $phone) !== 1) {
        auth_response(422, [
            'success' => false,
            'message' => 'Please enter a valid phone number.',
        ]);
    }
    if (mb_strlen($phone) > 30) {
        auth_response(422, [
            'success' => false,
            'message' => 'Phone must be at most 30 characters.',
        ]);
    }
    if (mb_strlen($address) > 255) {
        auth_response(422, [
            'success' => false,
            'message' => 'Address must be at most 255 characters.',
        ]);
    }

    $stmt = $pdo->prepare('
        UPDATE companies
        SET name = :name,
            description = :description,
            email = :email,
            phone = :phone,
            address = :address,
            logo = :logo,
            cover_image = :cover_image
        WHERE id = :id
    ');
    $stmt->execute([
        ':name' => $name,
        ':description' => $description !== '' ? $description : null,
        ':email' => $email !== '' ? $email : null,
        ':phone' => $phone !== '' ? $phone : null,
        ':address' => $address !== '' ? $address : null,
        ':logo' => $logo,
        ':cover_image' => $coverImage,
        ':id' => $companyId,
    ]);

    $updated = fetch_company_profile_row($pdo, $companyId);

    auth_response(200, [
        'success' => true,
        'message' => 'Company profile updated successfully.',
        'company' => company_profile_payload($updated),
    ]);
}
try {
    $pdo = db();
    $action = company_action();

    if ($action === 'list') {
        $destRows = fetch_company_destinations($pdo);
        $destMap = [];
        foreach ($destRows as $d) {
            $destMap[$d['company_id']][] = $d['to_city'];
        }

        $companies = [];
        foreach (company_profile_rows($pdo) as $row) {
            $companies[] = company_payload($row, $destMap[(int) $row['id']] ?? []);
        }

        auth_response(200, ['success' => true, 'companies' => $companies]);
    }

    if ($action === 'get') {
        $slug = trim((string) ($_GET['slug'] ?? ''));
        if ($slug === '') {
            auth_response(400, [
                'success' => false,
                'message' => 'A company slug is required.',
            ]);
        }

        $rows = company_profile_rows($pdo, $slug);
        if (!$rows) {
            auth_response(404, [
                'success' => false,
                'message' => 'Company not found.',
            ]);
        }
        $row = $rows[0];

        $destLists = fetch_company_destinations($pdo);
        $destMap = [];
        foreach ($destLists as $d) {
            $destMap[$d['company_id']][] = $d['to_city'];
        }

        $popularRoutes = fetch_popular_routes($pdo);
        $companyId = (int) $row['id'];

        $company = company_payload($row, $destMap[$companyId] ?? []);
        $company['fleet'] = fetch_fleet($pdo, $companyId);
        $company['reviews'] = fetch_reviews($pdo, $companyId);
        $company['trips'] = fetch_company_trips($pdo, $companyId);
        $company['popular_routes'] = $popularRoutes[$companyId] ?? [];

        auth_response(200, ['success' => true, 'company' => $company]);
    }

    if ($action === 'overview') {
        $user = requireRole('company');
        $company = resolve_company_by_user($pdo, (int) $user['id']);

        if ($company === null) {
            auth_response(404, [
                'success' => false,
                'message' => 'No linked company profile was found for this account.',
            ]);
        }

        auth_response(200, [
            'success' => true,
            'company' => [
                'id' => (int) $company['id'],
                'name' => $company['name'],
                'slug' => $company['slug'],
                'logo' => $company['logo'],
                'status' => $company['status'],
            ],
            'stats' => company_overview_stats($pdo, (int) $company['id']),
        ]);
    }

    if ($action === 'buses') {
        handle_buses($pdo);
    }
    if ($action === 'bus_create') {
        handle_bus_create($pdo);
    }
    if ($action === 'bus_update') {
        handle_bus_update($pdo);
    }
    if ($action === 'trips') {
        handle_trips($pdo);
    }
    if ($action === 'trip_create') {
        handle_trip_create($pdo);
    }
    if ($action === 'trip_update') {
        handle_trip_update($pdo);
    }
    if ($action === 'trip_status') {
        handle_trip_status($pdo);
    }
    if ($action === 'trip_delete') {
        handle_trip_delete($pdo);
    }
    if ($action === 'bookings') {
        handle_bookings($pdo);
    }
    if ($action === 'booking_create') {
        handle_company_booking_create($pdo);
    }
    if ($action === 'booking_cancel') {
        handle_booking_cancel($pdo);
    }
    if ($action === 'manifest') {
        handle_manifest($pdo);
    }
    if ($action === 'revenue') {
        handle_revenue($pdo);
    }
    if ($action === 'payments') {
        handle_payments($pdo);
    }
    if ($action === 'profile') {
        handle_company_profile($pdo);
    }
    if ($action === 'profile_update') {
        handle_company_profile_update($pdo);
    }

    auth_response(400, [
        'success' => false,
        'message' => 'Unsupported action. Use action=list, action=get, action=overview, action=buses, action=bus_create, action=bus_update, action=trips, action=trip_create, action=trip_update, action=trip_status, action=trip_delete, action=bookings, action=booking_create, action=booking_cancel, action=manifest, action=revenue, action=payments, action=profile or action=profile_update.',
    ]);
} catch (Throwable $e) {
    auth_response(500, [
        'success' => false,
        'message' => 'Company data is temporarily unavailable. Please try again later.',
    ]);
}
