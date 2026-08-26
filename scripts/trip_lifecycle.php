<?php

declare(strict_types=1);

/**
 * ET Transport — Passenger booking lifecycle: completion worker.
 *
 * CLI-ONLY. Completes bookings that are still pending/confirmed once their
 * trip departure datetime has passed. Safe to run repeatedly (idempotent).
 *
 * Exact lifecycle rule implemented here:
 *   booking_status IN ('pending','confirmed')
 *   AND TIMESTAMP(trips.departure_date, trips.departure_time) < NOW()
 *       => booking_status = 'completed'
 *
 * Guarantees:
 *   - cancelled / completed bookings are never touched
 *   - payment_status is never modified
 *   - seats (booking_passengers) are never released
 *   - trips.status is never modified
 *   - all completion updates happen in ONE transaction (rollback on failure)
 *   - a "Trip Completed" notification is created per completed booking,
 *     deduplicated by the booking reference, and a notification failure never
 *     breaks the successful completion
 *   - the script refuses to run outside the CLI SAPI, so a passenger can never
 *     invoke it through a normal browser request
 */

/* -------------------------------------------------------------
   CLI-only enforcement — nothing below may ever run over HTTP.
   ------------------------------------------------------------- */
if (php_sapi_name() !== 'cli') {
    $refusal = "Trip lifecycle worker must be run from the command line.\n";
    if (defined('STDERR')) {
        fwrite(STDERR, $refusal);
    } else {
        header('Content-Type: text/plain; charset=utf-8');
        echo $refusal;
    }
    exit(1);
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/notifications.php';
/**
 * Run the lifecycle completion pass inside a single transaction.
 *
 * @return array{completed:int, eligible:int, notified:int}
 *         completed = bookings actually transitioned to completed;
 *         eligible  = bookings that matched at fetch time;
 *         notified  = Trip Completed notifications created (best effort).
 */
function lifecycle_completion_pass(): array
{
    try {
        $pdo = db();
        $pdo->beginTransaction();

        /* 1. Find the eligible bookings and lock them for the transaction. */
        $select = $pdo->prepare('
            SELECT
                b.id,
                b.passenger_id,
                b.booking_reference,
                t.departure_date,
                r.from_city,
                r.to_city
            FROM bookings b
            JOIN trips t   ON t.id = b.trip_id
            JOIN routes r  ON r.id = t.route_id
            WHERE b.booking_status IN (\'pending\', \'confirmed\')
              AND TIMESTAMP(t.departure_date, t.departure_time) < NOW()
            FOR UPDATE
        ');
        $select->execute();
        $affected = $select->fetchAll();

        /* 2. Transition only rows that are STILL pending/confirmed and whose
              departure datetime has passed — this is what makes re-running
              the worker naturally idempotent. */
        if (count($affected) > 0) {
            $ids = array_map('intval', array_column($affected, 'id'));
            $placeholders = implode(', ', array_fill(0, count($ids), '?'));

            $update = $pdo->prepare('
                UPDATE bookings
                   SET booking_status = \'completed\'
                 WHERE id IN (' . $placeholders . ')
                   AND booking_status IN (\'pending\', \'confirmed\')
                   AND trip_id IN (
                       SELECT id FROM trips
                        WHERE TIMESTAMP(departure_date, departure_time) < NOW()
                   )
            ');
            $update->execute($ids);
/* Keep only the bookings that are provably completed inside this
               transaction, so notifications are never created for a row that
               slipped out of the pending/confirmed guard. */
            $verify = $pdo->prepare('
                SELECT id
                FROM bookings
                WHERE id IN (' . $placeholders . ')
                  AND booking_status = \'completed\'
            ');
            $verify->execute($ids);

            $completedIds = array_map('intval', array_column($verify->fetchAll(), 'id'));
            $affected = array_values(array_filter(
                $affected,
                static fn (array $row): bool => in_array((int) $row['id'], $completedIds, true)
            ));
        }

        /* 3. Commit BEFORE any notification work — the completion update is
              the only business change and it happens once, in this transaction. */
        $pdo->commit();

        $completed = count($affected);

        /* 4. Best-effort notifications, strictly after commit. A failure here
              must never undo (or re-run) the completed transition. */
        $notified = 0;
        foreach ($affected as $row) {
            $reference = (string) $row['booking_reference'];

            try {
                createNotification(
                    $pdo,
                    (int) $row['passenger_id'],
                    'booking',
                    'Trip Completed',
                    'Your booking ' . $reference . ' (' . $row['from_city'] . ' → ' . $row['to_city']
                        . ') on ' . $row['departure_date'] . ' is complete. You can now review this trip.',
                    'booking-completed:' . $reference
                );
                $notified++;
            } catch (Throwable $e) {
                /* A notification failure is never allowed to break the completion. */
            }
        }

        return [
            'completed' => $completed,
            'eligible'  => $completed,
            'notified'  => $notified,
        ];
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw new RuntimeException('Trip completion failed. No bookings were changed.');
    }
}

/* -------------------------------------------------------------
   Main — CLI only (guarded above).
   ------------------------------------------------------------- */
try {
    $result = lifecycle_completion_pass();

    fwrite(
        STDOUT,
        'Trip lifecycle worker: ' . $result['completed'] . ' booking(s) completed, '
            . $result['notified'] . ' notification(s) created.' . PHP_EOL
    );

    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, 'Trip lifecycle worker error: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}