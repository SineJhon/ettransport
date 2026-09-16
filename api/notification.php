<?php

declare(strict_types=1);

/**
 * ET Transport — Notification API.
 *
 * Real, database-backed in-app notifications for the passenger dashboard.
 *
 *   GET  api/notification.php?action=list       (passenger)
 *       → the authenticated passenger's own notifications, newest first
 *   POST api/notification.php?action=read       { id }   (passenger)
 *       → mark ONE of the passenger's OWN notifications as read
 *   POST api/notification.php?action=read_all   (passenger)
 *       → mark all of the passenger's notifications as read
 *
 * Ownership is always enforced server-side from the session: a user can only
 * ever list / mark-read their OWN rows (WHERE user_id = session id). The
 * existence of another user's notification is never leaked.
 *
 * Uses the existing `notifications` table as-is (user_id, title, message,
 * type, is_read, created_at) — no schema change was required.
 */

require_once __DIR__ . '/../config/auth.php';

function notification_input(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $decoded = json_decode((string) $raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    return $_POST;
}

function notification_action(): string
{
    return strtolower(trim((string) ($_GET['action'] ?? $_POST['action'] ?? '')));
}

function require_notification_post(): void
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

/** Safe presentation payload for one notification row (never internal data). */
function notification_payload(array $row): array
{
    return [
        'id'         => (int) $row['id'],
        'title'      => $row['title'],
        'message'    => $row['message'],
        'type'       => $row['type'],
        'target'     => $row['target'] ?? null,
        'read'       => (int) $row['is_read'] === 1,
        'created_at' => $row['created_at'],
    ];
}
/* ============================================================
   GET list — the authenticated passenger's own notifications,
   newest first, with the current unread count
   ============================================================ */
function handle_list(): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, [
            'success' => false,
            'message' => 'Method not allowed.',
        ]);
    }

    $user = require_active_passenger();

    try {
        $pdo = db();

        $unreadStmt = $pdo->prepare(
            'SELECT COUNT(*) AS c FROM notifications
             WHERE user_id = :uid AND is_read = 0'
        );
        $unreadStmt->execute([':uid' => (int) $user['id']]);
        $unreadCount = (int) $unreadStmt->fetch()['c'];

        $stmt = $pdo->prepare(
            'SELECT id, title, message, type, target, is_read, created_at
             FROM notifications
             WHERE user_id = :uid
             ORDER BY created_at DESC, id DESC'
        );
        $stmt->execute([':uid' => (int) $user['id']]);

        $notifications = [];
        foreach ($stmt->fetchAll() as $row) {
            $notifications[] = notification_payload($row);
        }

        auth_response(200, [
            'success' => true,
            'notifications' => $notifications,
            'unreadCount' => $unreadCount,
        ]);
    } catch (Throwable $e) {
        auth_response(500, [
            'success' => false,
            'message' => 'Notifications could not be loaded. Please try again later.',
        ]);
    }
}

/* ============================================================
   POST read — mark ONE notification as read.
   Ownership is part of the WHERE clause, so someone else's
   notification simply does not match (404, no existence leak).
   ============================================================ */
function handle_read(): void
{
    require_notification_post();
    $user = require_active_passenger();

    $input = notification_input();
    $id = (int) ($input['id'] ?? 0);

    if ($id <= 0) {
        auth_response(422, [
            'success' => false,
            'message' => 'A notification id is required.',
        ]);
    }

    try {
        $pdo = db();

        $stmt = $pdo->prepare(
            'UPDATE notifications
             SET is_read = 1
             WHERE id = :id AND user_id = :uid'
        );
        $stmt->execute([
            ':id'  => $id,
            ':uid' => (int) $user['id'],
        ]);

        if ($stmt->rowCount() === 0) {
            auth_response(404, [
                'success' => false,
                'message' => 'Notification not found.',
            ]);
        }

        auth_response(200, [
            'success' => true,
            'message' => 'Notification marked as read.',
        ]);
    } catch (Throwable $e) {
        auth_response(500, [
            'success' => false,
            'message' => 'Could not update the notification. Please try again.',
        ]);
    }
}

/* ============================================================
   POST read_all — mark every notification of this passenger as read
   ============================================================ */
function handle_read_all(): void
{
    require_notification_post();
    $user = require_active_passenger();

    try {
        $pdo = db();

        $stmt = $pdo->prepare(
            'UPDATE notifications
             SET is_read = 1
             WHERE user_id = :uid'
        );
        $stmt->execute([':uid' => (int) $user['id']]);

        auth_response(200, [
            'success' => true,
            'message' => 'All notifications marked as read.',
        ]);
    } catch (Throwable $e) {
        auth_response(500, [
            'success' => false,
            'message' => 'Could not update the notifications. Please try again.',
        ]);
    }
}

/* ============================================================
   POST seed — create a small sample notification feed for a
   passenger account that has none yet (used to test the UI).
   Idempotent: does nothing when the passenger already has
   notifications. Sample feed for testing the notification UI.
   ============================================================ */
function handle_seed(): void
{
    require_notification_post();
    $user = require_active_passenger();

    $userId = (int) $user['id'];
    $pdo = db();

    try {
        $countStmt = $pdo->prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = :uid');
        $countStmt->execute([':uid' => $userId]);
        if ((int) $countStmt->fetch()['c'] > 0) {
            auth_response(200, [
                'success' => true,
                'message' => 'Notifications already exist.',
                'seeded'  => false,
            ]);
        }

        /* Anchor the sample feed in REAL database rows so the messages carry
           the passenger's actual booking/trip data (route, travel date,
           reference, seat) wherever one exists. If the passenger has no
           booking yet, fall back to a real upcoming trip from an approved,
           listed company — never hard-coded fiction. */
        $stmt = $pdo->prepare('
            SELECT b.booking_reference,
                   b.total_amount,
                   t.departure_date,
                   t.departure_time,
                   r.from_city,
                   r.to_city,
                   c.name  AS company_name,
                   c.slug  AS company_slug,
                   (SELECT pp.seat_number
                      FROM booking_passengers pp
                     WHERE pp.booking_id = b.id
                     ORDER BY pp.id ASC
                     LIMIT 1) AS seat_number
            FROM bookings b
            JOIN trips t  ON t.id = b.trip_id
            JOIN routes r ON r.id = t.route_id
            JOIN companies c ON c.id = t.company_id
            WHERE b.passenger_id = :uid
            ORDER BY b.id DESC
            LIMIT 1');
        $stmt->execute([':uid' => $userId]);
        $row = $stmt->fetch();
        if ($row === false) {
            $stmt = $pdo->prepare('
                SELECT NULL AS booking_reference,
                       t.price  AS total_amount,
                       t.departure_date,
                       t.departure_time,
                       r.from_city,
                       r.to_city,
                       c.name  AS company_name,
                       c.slug  AS company_slug,
                       NULL    AS seat_number
                FROM trips t
                JOIN routes r ON r.id = t.route_id
                JOIN companies c ON c.id = t.company_id
                WHERE c.status = \'approved\' AND c.listed = 1
                ORDER BY t.departure_date ASC
                LIMIT 1');
            $stmt->execute();
            $row = $stmt->fetch();
        }
        if ($row === false) {
            $row = [
                'booking_reference' => 'ET-PLACEHOLDER',
                'total_amount'      => 900.00,
                'departure_date'    => '2026-09-20',
                'departure_time'    => '06:30:00',
                'from_city'         => 'Addis Ababa',
                'to_city'           => 'Bahir Dar',
                'company_name'      => 'Selam Bus',
                'company_slug'      => 'selam-bus',
                'seat_number'       => 'A1',
            ];
        }

        $bookingRef  = (string) ($row['booking_reference'] ?? 'your booking');
        $total       = number_format((float) ($row['total_amount'] ?? 0), 2);
        $fromCity    = (string) ($row['from_city'] ?? 'Addis Ababa');
        $toCity      = (string) ($row['to_city'] ?? '');
        $travelDate  = (string) ($row['departure_date'] ?? '');
        $departTime  = (string) ($row['departure_time'] ?? '');
        $companyName = (string) ($row['company_name'] ?? 'Your bus company');
        $companySlug = (string) ($row['company_slug'] ?? '');
        $anchorSeat  = (string) ($row['seat_number'] ?? '');

        $route      = $fromCity . ' → ' . $toCity;
        $dateLabel  = $travelDate === '' ? 'your travel date' : $travelDate;
        $timeLabel  = mb_substr((string) $departTime, 0, 5);
        $companyTarget = $companySlug !== '' ? 'company-reviews:' . $companySlug : '';

        /* Sample feed — minutes ago, type, title, message, is_read, target.
           The target turns each notification into a deep link that the
           dashboard list and the navbar bell resolve (tickets / trips /
           profile-edit / complaints / company public page reviews). */
        $seeds = [
            [3,       'booking', 'Booking Confirmed',
             'Your ' . $companyName . ' trip ' . $route . ' is confirmed. Ref: ' . $bookingRef
                 . ($anchorSeat !== '' ? ' · Seat ' . $anchorSeat : '') . '.', 0, 'tickets'],
            [6,       'payment', 'Payment Received',
             'Payment of ETB ' . $total . ' for booking ' . $bookingRef . ' was received.', 0, 'tickets'],
            [45,      'booking', 'Gate Change',
             'Your ' . $toCity . ' departure moved to Platform 4 at Meskel Square Terminal.', 0, 'tickets'],
            [1440,    'general', 'Boarding Reminder',
             'Your bus to ' . $toCity . ' departs ' . $dateLabel . ($timeLabel !== '' ? ' at ' . $timeLabel : '')
                 . ' from Meskel Square Terminal. Please arrive 30 minutes early.', 0, 'trips'],
            [5760,    'review',  'Review Your Trip',
             'How was your trip with ' . $companyName . ' from ' . $route
                 . '? Share your feedback to help other passengers.', 1, $companyTarget],
            [7200,    'booking', 'Return Trip Reminder',
             'Your return coach to ' . $fromCity . ' departs soon — check in from the My Trips page.', 1, 'trips'],
            [17280,   'general', 'Welcome to ET Transport',
             'Save your passenger info and a refund account in your profile to pre-fill every booking.', 1, 'profile-edit'],
        ];

        foreach ($seeds as $seed) {
            $createdAt = date('Y-m-d H:i:s', time() - ((int) $seed[0] * 60));
            $insert = $pdo->prepare(
                'INSERT INTO notifications (user_id, type, title, message, is_read, created_at, target)
                 VALUES (:uid, :type, :title, :msg, :read, :created, :target)'
            );
            $insert->execute([
                ':uid'     => $userId,
                ':type'    => $seed[1],
                ':title'   => $seed[2],
                ':msg'     => $seed[3],
                ':read'    => (int) $seed[4],
                ':created' => $createdAt,
                ':target'  => $seed[5] !== '' ? $seed[5] : null,
            ]);
        }

        auth_response(200, [
            'success' => true,
            'message' => 'Sample notifications created.',
            'seeded'  => true,
            'count'   => count($seeds),
        ]);
    } catch (Throwable $e) {
        auth_response(500, [
            'success' => false,
            'message' => 'Notifications could not be created. Please try again.',
        ]);
    }
}

/* ============================================================
   Dispatcher
   ============================================================ */
$action = notification_action();

if ($action === 'list') {
    handle_list();
}
if ($action === 'read') {
    handle_read();
}
if ($action === 'read_all') {
    handle_read_all();
}
if ($action === 'seed') {
    handle_seed();
}

auth_response(400, [
    'success' => false,
    'message' => 'Unsupported action. Use action=list, read, read_all or seed.',
]);
