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
            'SELECT id, title, message, type, is_read, created_at
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

auth_response(400, [
    'success' => false,
    'message' => 'Unsupported action. Use action=list, read or read_all.',
]);
