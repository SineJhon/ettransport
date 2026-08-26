<?php

declare(strict_types=1);

/**
 * ET Transport — Review API.
 *
 * Real, database-backed passenger reviews.
 *
 *   GET  api/review.php?action=list&company_id=ID     (public)
 *   POST api/review.php?action=create   { booking_id, rating, comment }  (passenger)
 *
 * Server-side rules (the client is never trusted):
 *   - a passenger may only review a booking they own;
 *   - the reviewed company is always derived from the booking's trip in
 *     MySQL (company_id / passenger_id from the browser are never trusted);
 *   - a booking is reviewable only once it is COMPLETED (the schema's
 *     explicit per-booking completion status) and is not cancelled;
 *   - a passenger cannot create more than one review per booking (409);
 *   - the "verified purchase" flag is real: it is true only for reviews
 *     created against an eligible real booking owned by the passenger
 *     (i.e. the review row has a booking_id), never a made-up value.
 *
 * No schema changes were required: reviews, users, companies, trips and
 * bookings already exist; booking_status already includes 'completed'.
 */

require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/../config/notifications.php';

const REVIEW_COMMENT_MAX = 1000;

function review_input(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $decoded = json_decode((string) $raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    return $_POST;
}

function review_action(): string
{
    return strtolower(trim((string) ($_GET['action'] ?? '')));
}

function require_review_post(): void
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

/** Public review shape used by the existing company-profile UI. */
function review_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['passenger_name'] ?? '',
        'rating' => (int) $row['rating'],
        'comment' => $row['comment'] ?? null,
        'created_at' => $row['created_at'] ?? '',
        // A review is verified because it is linked to a real eligible
        // booking owned by the passenger (booking_id is not null).
        'verified' => ($row['booking_id'] ?? null) !== null,
    ];
}


/**
 * The booking row (with its trip + company) owned by the given passenger.
 * Ownership is part of the WHERE clause — never trusted from the browser.
 */
function find_reviewable_booking(PDO $pdo, int $bookingId, int $passengerId): ?array
{
    $stmt = $pdo->prepare('
        SELECT
            b.id,
            b.booking_status,
            b.passenger_id,
            t.id AS trip_id,
            t.company_id,
            c.name AS company_name
        FROM bookings b
        JOIN trips t ON t.id = b.trip_id
        JOIN companies c ON c.id = t.company_id
        WHERE b.id = :id AND b.passenger_id = :uid
        LIMIT 1');
    $stmt->execute([':id' => $bookingId, ':uid' => $passengerId]);

    $row = $stmt->fetch();
    return $row !== false ? $row : null;
}

/** True when this passenger already reviewed this booking (duplicate guard). */
function review_exists(PDO $pdo, int $bookingId, int $passengerId): bool
{
    $stmt = $pdo->prepare('
        SELECT id FROM reviews
        WHERE booking_id = :bid AND passenger_id = :uid
        LIMIT 1');
    $stmt->execute([':bid' => $bookingId, ':uid' => $passengerId]);
    return $stmt->fetch() !== false;
}


function handle_list(): void
{
    $companyId = (int) ($_GET['company_id'] ?? 0);

    if ($companyId <= 0) {
        auth_response(422, [
            'success' => false,
            'message' => 'A company id is required.',
        ]);
    }

    $pdo = db();

    $companyStmt = $pdo->prepare('SELECT id FROM companies WHERE id = :id LIMIT 1');
    $companyStmt->execute([':id' => $companyId]);
    if ($companyStmt->fetch() === false) {
        auth_response(404, [
            'success' => false,
            'message' => 'Company not found.',
        ]);
    }

    /* Average rating + review count computed from the REAL reviews table. */
    $aggStmt = $pdo->prepare('
        SELECT COUNT(*) AS cnt, COALESCE(AVG(rating), 0) AS avg_rating
        FROM reviews
        WHERE company_id = :cid');
    $aggStmt->execute([':cid' => $companyId]);
    $agg = $aggStmt->fetch();

    /* Newest reviews first. */
    $listStmt = $pdo->prepare('
        SELECT
            r.id,
            r.rating,
            r.comment,
            r.created_at,
            r.booking_id,
            u.name AS passenger_name
        FROM reviews r
        JOIN users u ON u.id = r.passenger_id
        WHERE r.company_id = :cid
        ORDER BY r.created_at DESC, r.id DESC');
    $listStmt->execute([':cid' => $companyId]);

    $reviews = [];
    foreach ($listStmt->fetchAll() as $row) {
        $reviews[] = review_payload($row);
    }

    auth_response(200, [
        'success' => true,
        'rating' => round((float) ($agg['avg_rating'] ?? 0), 1),
        'reviewCount' => (int) ($agg['cnt'] ?? 0),
        'reviews' => $reviews,
    ]);
}


function handle_create(): void
{
    require_review_post();
    $user = require_active_passenger();

    $input = review_input();
    $bookingId = (int) ($input['booking_id'] ?? 0);
    $rating = (int) ($input['rating'] ?? 0);
    $comment = trim((string) ($input['comment'] ?? ''));
    $comment = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $comment) ?? '';

    if ($bookingId <= 0) {
        auth_response(422, [
            'success' => false,
            'message' => 'A booking id is required.',
        ]);
    }

    if ($rating < 1 || $rating > 5) {
        auth_response(422, [
            'success' => false,
            'message' => 'Rating must be an integer between 1 and 5.',
        ]);
    }

    if (mb_strlen($comment) > REVIEW_COMMENT_MAX) {
        auth_response(422, [
            'success' => false,
            'message' => 'Comment must be at most ' . REVIEW_COMMENT_MAX . ' characters.',
        ]);
    }

    $pdo = db();

    try {
        $booking = find_reviewable_booking($pdo, $bookingId, (int) $user['id']);

        /* Not found (either no such booking, or not owned by this passenger).
           404 keeps the existence of other passengers' bookings private. */
        if ($booking === null) {
            auth_response(404, [
                'success' => false,
                'message' => 'Booking not found or not eligible for review.',
            ]);
        }

        if ($booking['booking_status'] === 'cancelled') {
            auth_response(422, [
                'success' => false,
                'message' => 'Cancelled bookings cannot be reviewed.',
            ]);
        }

        /* Only a completed / travelled trip is eligible. booking_status is the
           schema's explicit per-booking completion status. */
        if ($booking['booking_status'] !== 'completed') {
            auth_response(422, [
                'success' => false,
                'message' => 'Only completed trips can be reviewed.',
            ]);
        }

        if (review_exists($pdo, $bookingId, (int) $user['id'])) {
            auth_response(409, [
                'success' => false,
                'message' => 'You have already reviewed this booking.',
            ]);
        }

        /* The reviewed company comes from the booking's trip in MySQL — never
           from the browser. passenger_id comes from the session. */
        $ins = $pdo->prepare('
            INSERT INTO reviews (passenger_id, company_id, booking_id, rating, comment)
            VALUES (:uid, :cid, :bid, :rating, :comment)');
        $ins->execute([
            ':uid' => (int) $user['id'],
            ':cid' => (int) $booking['company_id'],
            ':bid' => $bookingId,
            ':rating' => $rating,
            ':comment' => $comment === '' ? null : $comment,
        ]);

        $newId = (int) $pdo->lastInsertId();

        /* Real notification: review submitted. Created ONLY after the review row
           is inserted (invalid / duplicate / rejected reviews return before this
           point and never create one). The company name comes from MySQL via the
           booking's trip. The review id is the application-level dedup token. */
        try {
            createNotification(
                $pdo,
                (int) $user['id'],
                'review',
                'Review Submitted',
                'Your review for ' . $booking['company_name'] . ' has been submitted successfully.',
                'review-created:' . $newId
            );
        } catch (Throwable $e) {
            /* Best-effort only — never let a notification failure alter the response. */
        }

        $loadStmt = $pdo->prepare('
            SELECT r.id, r.rating, r.comment, r.created_at, r.booking_id, u.name AS passenger_name
            FROM reviews r
            JOIN users u ON u.id = r.passenger_id
            WHERE r.id = :id
            LIMIT 1');
        $loadStmt->execute([':id' => $newId]);
        $row = $loadStmt->fetch();

        auth_response(201, [
            'success' => true,
            'message' => 'Review submitted.',
            'review' => $row !== false ? review_payload($row) : null,
        ]);
    } catch (Throwable $e) {
        auth_response(500, [
            'success' => false,
            'message' => 'The review could not be saved. Please try again later.',
        ]);
    }
}

$action = review_action();

if ($action === 'list') {
    handle_list();
}
if ($action === 'create') {
    handle_create();
}

auth_response(400, [
    'success' => false,
    'message' => 'Unsupported action. Use action=list or action=create.',
]);

