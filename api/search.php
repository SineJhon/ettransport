<?php

declare(strict_types=1);

/**
 * ET Transport — Search API.
 *
 * Real, database-backed trip search.
 *
 *   GET api/search.php?from=Addis%20Ababa&to=Arba%20Minch&date=YYYY-MM-DD&passengers=1[&company=slug]
 *
 * Returns only matching origin, destination and departure_date trips that
 * still have enough seats for the requested passenger count. Available
 * seats are DERIVED from the real booking data (bus.seat_count minus the
 * number of booking_passengers rows for the trip) — no seat counter column.
 *
 * Public endpoint. Auth is not required (search + company discovery are
 * public by design); authorization is still enforced everywhere else.
 */

require_once __DIR__ . '/../config/auth.php';

if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    auth_response(405, [
        'success' => false,
        'message' => 'Method not allowed.',
    ]);
}

$from = trim((string) ($_GET['from'] ?? ''));
$to = trim((string) ($_GET['to'] ?? ''));
$date = trim((string) ($_GET['date'] ?? ''));
$passengers = (int) ($_GET['passengers'] ?? 1);
$companySlug = trim((string) ($_GET['company'] ?? ''));

if ($from === '' || $to === '') {
    auth_response(422, [
        'success' => false,
        'message' => 'Both "from" and "to" are required.',
    ]);
}

if ($date === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
    auth_response(422, [
        'success' => false,
        'message' => 'A valid travel date (YYYY-MM-DD) is required.',
    ]);
}

if ($passengers < 1 || $passengers > 10) {
    auth_response(422, [
        'success' => false,
        'message' => 'Passenger count must be between 1 and 10.',
    ]);
}

try {
    $pdo = db();

    $sql = '
        SELECT
            t.id                             AS trip_id,
            c.id                             AS company_id,
            c.slug                           AS company_slug,
            c.name                           AS company_name,
            c.status                         AS company_status,
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
            (b.seat_count - COALESCE(booked.seats_booked, 0)) AS available_seats,
            COALESCE(rev.avg_rating, 0)      AS rating,
            COALESCE(rev.review_count, 0)    AS review_count
        FROM trips t
        JOIN companies c ON c.id = t.company_id AND c.status = \'approved\'
        JOIN routes r ON r.id = t.route_id
        JOIN buses b ON b.id = t.bus_id
        LEFT JOIN (
            SELECT t2.id AS trip_id, COUNT(bp.id) AS seats_booked
            FROM trips t2
            JOIN bookings bk ON bk.trip_id = t2.id
            LEFT JOIN booking_passengers bp ON bp.booking_id = bk.id
            GROUP BY t2.id
        ) booked ON booked.trip_id = t.id
        LEFT JOIN (
            SELECT company_id, AVG(rating) AS avg_rating, COUNT(*) AS review_count
            FROM reviews
            WHERE status = \'approved\'
            GROUP BY company_id
        ) rev ON rev.company_id = c.id
        WHERE t.status = \'scheduled\'
          AND LOWER(r.from_city) = LOWER(:from)
          AND LOWER(r.to_city) = LOWER(:to)
          AND t.departure_date = :date';

    $params = [
        ':from' => $from,
        ':to' => $to,
        ':date' => $date,
    ];

    if ($companySlug !== '') {
        $sql .= ' AND c.slug = :company_slug';
        $params[':company_slug'] = $companySlug;
    }

    $sql .= ' HAVING available_seats >= :passengers ORDER BY t.departure_time ASC, c.name ASC';
    $params[':passengers'] = $passengers;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $trips = [];
    $companyMap = [];

    foreach ($rows as $row) {
        $rating = round((float) $row['rating'], 1);
        $reviewCount = (int) $row['review_count'];

        $trips[] = [
            'id' => (int) $row['trip_id'],
            'company_id' => (int) $row['company_id'],
            'company_slug' => $row['company_slug'],
            'company_name' => $row['company_name'],
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
            'rating' => $rating,
            'review_count' => $reviewCount,
            'amenities' => [],
        ];

        if (!isset($companyMap[$row['company_slug']])) {
            $companyMap[$row['company_slug']] = [
                'slug' => $row['company_slug'],
                'name' => $row['company_name'],
                'verified' => $row['company_status'] === 'approved',
                'rating' => $rating,
                'review_count' => $reviewCount,
            ];
        }
    }

    auth_response(200, [
        'success' => true,
        'trips' => $trips,
        'companies' => array_values($companyMap),
    ]);
} catch (Throwable $e) {
    auth_response(500, [
        'success' => false,
        'message' => 'Search failed. Please try again later.',
    ]);
}
