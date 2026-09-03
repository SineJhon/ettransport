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
function review_payload(array $row, ?int $viewerId = null): array
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
        'likes' => (int) ($row['likes'] ?? 0),
        'liked' => $viewerId !== null && (int) ($row['liked_by_viewer'] ?? 0) === 1,
        'reply' => isset($row['reply']) && $row['reply'] !== null && $row['reply'] !== '' ? $row['reply'] : null,
        'reply_at' => $row['reply_at'] ?? null,
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

    $viewer = getCurrentUser();
    $viewerId = ($viewer !== null && ($viewer['status'] ?? '') === 'active') ? (int) $viewer['id'] : null;

    /* Newest reviews first. */
    $listStmt = $pdo->prepare('
        SELECT
            r.id,
            r.rating,
            r.comment,
            r.created_at,
            r.booking_id,
            r.likes,
            r.reply,
            r.reply_at,
            u.name AS passenger_name,
            (SELECT 1 FROM review_likes rl WHERE rl.review_id = r.id AND rl.user_id = :viewer) AS liked_by_viewer
        FROM reviews r
        JOIN users u ON u.id = r.passenger_id
        WHERE r.company_id = :cid
        ORDER BY r.created_at DESC, r.id DESC');
    $listStmt->execute([':viewer' => $viewerId ?? 0, ':cid' => $companyId]);

    $reviews = [];
    foreach ($listStmt->fetchAll() as $row) {
        $reviews[] = review_payload($row, $viewerId);
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
            SELECT r.id, r.rating, r.comment, r.created_at, r.booking_id, u.name AS passenger_name, r.likes, r.reply, r.reply_at, 0 AS liked_by_viewer
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

/** The company profile linked to an operator account (ownership for replies). */
function review_company_by_user(PDO $pdo, int $userId): ?array
{
    $stmt = $pdo->prepare('
        SELECT id, name, slug, logo, status
        FROM companies
        WHERE user_id = :user_id
        LIMIT 1');
    $stmt->execute([':user_id' => $userId]);
    $row = $stmt->fetch();
    return $row !== false ? $row : null;
}

/** Toggle the current user's like on a review (any signed-in active user). */
function handle_like(): void
{
    require_review_post();
    $user = requireLogin();
    if (($user['status'] ?? '') !== 'active') {
        auth_response(403, ['success' => false, 'message' => 'Your account is not active.']);
    }

    $input = review_input();
    $reviewId = (int) ($input['review_id'] ?? 0);

    if ($reviewId <= 0) {
        auth_response(422, ['success' => false, 'message' => 'A review id is required.']);
    }

    $pdo = db();
    $checkStmt = $pdo->prepare('SELECT id FROM reviews WHERE id = :id LIMIT 1');
    $checkStmt->execute([':id' => $reviewId]);
    if ($checkStmt->fetch() === false) {
        auth_response(404, ['success' => false, 'message' => 'Review not found.']);
    }

    $userId = (int) $user['id'];
    $likeStmt = $pdo->prepare('SELECT id FROM review_likes WHERE review_id = :rid AND user_id = :uid LIMIT 1');
    $likeStmt->execute([':rid' => $reviewId, ':uid' => $userId]);
    $existing = $likeStmt->fetch();

    if ($existing) {
        $pdo->prepare('DELETE FROM review_likes WHERE id = :id')->execute([':id' => (int) $existing['id']]);
        $liked = false;
    } else {
        $pdo->prepare('INSERT INTO review_likes (review_id, user_id) VALUES (:rid, :uid)')->execute([':rid' => $reviewId, ':uid' => $userId]);
        $liked = true;
    }

    /* Rebuild the denormalized counter from the real likes rows. */
    $pdo->prepare('UPDATE reviews SET likes = (SELECT COUNT(*) FROM review_likes WHERE review_id = :rid) WHERE id = :rid2')
        ->execute([':rid' => $reviewId, ':rid2' => $reviewId]);

    $countStmt = $pdo->prepare('SELECT likes FROM reviews WHERE id = :id LIMIT 1');
    $countStmt->execute([':id' => $reviewId]);
    $row = $countStmt->fetch();

    auth_response(200, [
        'success' => true,
        'message' => $liked ? 'Review liked.' : 'Review unliked.',
        'liked' => $liked,
        'likes' => (int) ($row['likes'] ?? 0),
    ]);
}

/**
 * A company replies to a review left for its own company. The review row's
 * company_id (from MySQL, never the browser) must match the session
 * company's id. Sending an empty reply removes the reply.
 */
function handle_reply(): void
{
    require_review_post();
    $user = requireRole('company');
    if (($user['status'] ?? '') !== 'active') {
        auth_response(403, ['success' => false, 'message' => 'Your account is not active.']);
    }

    $input = review_input();
    $reviewId = (int) ($input['review_id'] ?? 0);
    $reply = trim((string) ($input['reply'] ?? ''));
    $reply = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $reply) ?? '';

    if ($reviewId <= 0) {
        auth_response(422, ['success' => false, 'message' => 'A review id is required.']);
    }
    if (mb_strlen($reply) > 1000) {
        auth_response(422, ['success' => false, 'message' => 'Reply must be at most 1000 characters.']);
    }

    $pdo = db();
    $company = review_company_by_user($pdo, (int) $user['id']);
    if ($company === null) {
        auth_response(404, ['success' => false, 'message' => 'No linked company profile was found for this account.']);
    }

    $selStmt = $pdo->prepare('
        SELECT r.id, r.company_id, r.passenger_id, u.name AS passenger_name
        FROM reviews r
        JOIN users u ON u.id = r.passenger_id
        WHERE r.id = :id
        LIMIT 1');
    $selStmt->execute([':id' => $reviewId]);
    $review = $selStmt->fetch();
    if ($review === false) {
        auth_response(404, ['success' => false, 'message' => 'Review not found.']);
    }
    if ((int) $review['company_id'] !== (int) $company['id']) {
        auth_response(403, ['success' => false, 'message' => 'You can only reply to reviews for your own company.']);
    }

    if ($reply === '') {
        $pdo->prepare('UPDATE reviews SET reply = NULL, reply_at = NULL WHERE id = :id')->execute([':id' => $reviewId]);
    } else {
        $pdo->prepare('UPDATE reviews SET reply = :reply, reply_at = NOW() WHERE id = :id')->execute([':reply' => $reply, ':id' => $reviewId]);
    }

    $loadStmt = $pdo->prepare('
        SELECT r.id,r.rating,r.comment,r.created_at,r.booking_id,u.name AS passenger_name,r.likes,r.reply,r.reply_at,0 AS liked_by_viewer
        FROM reviews r
        JOIN users u ON u.id = r.passenger_id
        WHERE r.id = :id
        LIMIT 1');
    $loadStmt->execute([':id' => $reviewId]);
    $row = $loadStmt->fetch();

    auth_response(200, [
        'success' => true,
        'message' => 'Review replied.',
        'review' => $row !== false ? review_payload($row) : null,
    ]);
}

$action = review_action();

if ($action === 'list') {
    handle_list();
}
if ($action === 'create') {
    handle_create();
}
if ($action === 'like') {
    handle_like();
}
if ($action === 'reply') {
    handle_reply();
}

auth_response(400, [
    'success' => false,
    'message' => 'Unsupported action. Use action=list, action=create, action=like or action=reply.',
]);

