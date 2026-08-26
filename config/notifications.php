<?php

declare(strict_types=1);

/**
 * ET Transport — shared notification helper.
 *
 * A small, reusable way for backend actions (booking, payment, cancellation,
 * review) to record a per-user in-app notification in the existing
 * `notifications` table.
 *
 * The schema has no reference column and no unique re-notification
 * constraint, so duplicate protection is done at the application level:
 * each caller supplies a unique `dedupToken` (the booking reference, payment
 * transaction reference or review id) and the helper skips the insert when a
 * notification of the same `type` for the same user whose message already
 * contains that token is present. This is a best-effort guard, NOT an
 * ACID-guaranteed unique constraint — see the final report's documented
 * limitation.
 *
 * The recipient user id is ALWAYS passed in by the caller from the
 * authenticated session — never from the browser.
 */

/**
 * Return true when the user already has a notification of the given type
 * whose message contains the dedup token (application-level duplicate guard).
 */
function notification_exists(PDO $pdo, int $userId, string $type, string $dedupToken): bool
{
    $stmt = $pdo->prepare(
        'SELECT id FROM notifications
         WHERE user_id = :uid AND type = :type AND message LIKE :token
         LIMIT 1'
    );
    $stmt->execute([
        ':uid'   => $userId,
        ':type'  => $type,
        ':token' => '%' . $dedupToken . '%',
    ]);

    return $stmt->fetch() !== false;
}

/**
 * Insert a notification for a user.
 *
 * @param PDO         $pdo        Active PDO connection (inside or outside a transaction).
 * @param int         $userId     The authenticated recipient's user id (session-derived).
 * @param string      $type       Short category: booking|payment|review|general.
 * @param string      $title      Short title (schema: VARCHAR 190).
 * @param string      $message    Body of the notification.
 * @param string|null $dedupToken Optional unique token that prevents an
 *                                accidental duplicate for the same real event.
 */
function createNotification(
    PDO $pdo,
    int $userId,
    string $type,
    string $title,
    string $message,
    ?string $dedupToken = null
): void {
    $userId = (int) $userId;
    if ($userId <= 0) {
        return;
    }

    if ($dedupToken !== null && notification_exists($pdo, $userId, $type, $dedupToken)) {
        return;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO notifications (user_id, title, message, type)
         VALUES (:uid, :title, :message, :type)'
    );
    $stmt->execute([
        ':uid'     => $userId,
        ':title'   => $title,
        ':message' => $message,
        ':type'    => $type,
    ]);
}
