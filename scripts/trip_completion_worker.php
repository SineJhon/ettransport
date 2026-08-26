<?php

declare(strict_types=1);

/**
 * ET Transport — Trip completion worker.
 *
 * CLI-ONLY. Synchronizes trips.status with the passage of the trip's
 * arrival boundary, which is DERIVED from departure datetime + route
 * duration. This is the ONLY responsibility of this worker:
 *
 * Exact completion boundary implemented here:
 *   status = 'scheduled' OR status = 'departed'
 *   AND route.duration IS NOT NULL
 *   AND DATE_ADD(
 *           TIMESTAMP(departure_date, departure_time),
 *           INTERVAL route.duration MINUTE
 *       ) < NOW()
 *       => status = 'completed'
 *
 * The boundary is computed with DATE_ADD over the FULL datetime, so
 * overnight trips (departure + duration crossing midnight) are handled
 * correctly. trips.arrival_time is TIME-only and is deliberately NOT used:
 * it cannot represent the day roll-over for overnight trips.
 *
 * Guarantees:
 *   - only trips.status is ever written
 *   - complete trips: scheduled OR departed whose arrival boundary passed
 *   - cancelled trips stay cancelled, completed trips stay completed
 *   - future trips are never modified
 *   - NULL-duration routes are simply skipped (never crashed on)
 *   - bookings / booking_passengers / payments / reviews / notifications
 *     / routes / buses / companies are never modified
 *   - the whole pass runs inside ONE transaction (rollback on failure)
 *   - idempotent: a second run after success transitions nothing new
 *   - global: no company / bus / user / passenger identifier is accepted,
 *     so ownership plays no role in what gets completed
 *   - refuses to run outside the CLI SAPI, so a browser request can never
 *     trigger it
 */

/* -------------------------------------------------------------
   CLI-only enforcement — nothing below may ever run over HTTP.
   ------------------------------------------------------------- */
if (php_sapi_name() !== 'cli') {
    $refusal = "Trip completion worker must be run from the command line.\n";
    if (defined('STDERR')) {
        fwrite(STDERR, $refusal);
    } else {
        header('Content-Type: text/plain; charset=utf-8');
        echo $refusal;
    }
    exit(1);
}

require_once __DIR__ . '/../config/database.php';

/**
 * Run the trip completion pass inside a single transaction.
 *
 * 1. BEGIN
 * 2. SELECT the eligible rows and lock them FOR UPDATE
 * 3. UPDATE exactly those rows to 'completed' (status-guarded so the pass
 *    is naturally idempotent: an already completed trip is no longer
 *    'scheduled'/'departed', so a second run never re-writes it)
 * 4. COMMIT
 *
 * @return array{transitioned:int} number of trips actually moved to completed
 */
function trip_completion_sync_pass(): array
{
    try {
        $pdo = db();
        $pdo->beginTransaction();

        /* 1. Eligible rows: past the arrival boundary, still active
              (scheduled/departed), on a route that HAS a duration.
              Locked FOR UPDATE for the rest of the transaction. */
        $select = $pdo->prepare("
            SELECT t.id
              FROM trips t
              JOIN routes r ON r.id = t.route_id
             WHERE t.status IN ('scheduled', 'departed')
               AND r.duration IS NOT NULL
               AND DATE_ADD(
                     TIMESTAMP(t.departure_date, t.departure_time),
                     INTERVAL r.duration MINUTE
                   ) < NOW()
             FOR UPDATE
        ");
        $select->execute();
        $rows = $select->fetchAll();
        $ids  = array_map('intval', array_column($rows, 'id'));

        $transitioned = 0;
        if (count($ids) > 0) {
            $placeholders = implode(', ', array_fill(0, count($ids), '?'));

            /* 2. Transition only what is STILL eligible. The status guard
                  makes the whole operation idempotent. */
            $update = $pdo->prepare("
                UPDATE trips
                   SET status = 'completed'
                 WHERE id IN (" . $placeholders . ")
                   AND status IN ('scheduled', 'departed')
            ");
            $update->execute($ids);
            $transitioned = $update->rowCount();
        }

        /* 3. Commit — the status flip either happened for the locked
              eligible rows or the transaction is rolled back entirely. */
        $pdo->commit();

        return ['transitioned' => $transitioned];
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw new RuntimeException('Trip completion sync failed. No trips were changed.');
    }
}

/* -------------------------------------------------------------
   Main — CLI  only (guarded above).
   ------------------------------------------------------------- */
try {
    $result = trip_completion_sync_pass();

    fwrite(
        STDOUT,
        'Trip completion worker: ' . $result['transitioned']
            . ' trip(s) transitioned to completed.' . PHP_EOL
    );

    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, 'Trip completion worker error: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}