<?php

declare(strict_types=1);

/**
 * ET Transport — Trip status lifecycle worker.
 *
 * CLI-ONLY. Synchronizes trips.status with the passage of the trip's
 * departure datetime. This is the ONLY responsibility of this worker:
 *
 * Exact status rule implemented here (the only transition this task owns):
 *   status = 'scheduled'
 *   AND TIMESTAMP(departure_date, departure_time) < NOW()
 *       => status = 'departed'
 *
 * There is no arrival_date in the database, so no arrival/completion rule
 * is invented here. 'scheduled' -> 'departed' is the full lifecycle scope
 * of this worker; 'departed' -> 'completed' belongs to a separate task.
 *
 * Guarantees:
 *   - only trips.status is ever written
 *   - departed / completed / cancelled trips are never modified
 *   - future scheduled trips are never modified
 *   - the whole pass runs inside ONE transaction (rollback on failure)
 *   - idempotent: a second run after success changes nothing
 *   - global: no company / bus / user / passenger identifier is accepted
 *   - refuses to run outside the CLI SAPI, so a browser request can never
 *     trigger it
 */

/* -------------------------------------------------------------
   CLI-only enforcement — nothing below may ever run over HTTP.
   ------------------------------------------------------------- */
if (php_sapi_name() !== 'cli') {
    $refusal = "Trip status worker must be run from the command line.\n";
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
 * Run the trip status sync pass inside a single transaction.
 *
 * Trips that are still 'scheduled' and whose departure datetime has
 * already passed are moved to 'departed'. The status guard in the UPDATE
 * makes the pass naturally idempotent: rows already moved are no longer
 * 'scheduled', so re-running the worker never re-writes them.
 *
 * @return array{transitioned:int} number of trips actually moved to departed
 */
function trip_status_sync_pass(): array
{
    try {
        $pdo = db();
        $pdo->beginTransaction();

        $update = $pdo->prepare("
            UPDATE trips
               SET status = 'departed'
             WHERE status = 'scheduled'
               AND TIMESTAMP(departure_date, departure_time) < NOW()
        ");
        $update->execute();
        $transitioned = $update->rowCount();

        $pdo->commit();

        return ['transitioned' => $transitioned];
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw new RuntimeException('Trip status sync failed. No trips were changed.');
    }
}

/* -------------------------------------------------------------
   Main — CLI only (guarded above).
   ------------------------------------------------------------- */
try {
    $result = trip_status_sync_pass();

    fwrite(
        STDOUT,
        'Trip status worker: ' . $result['transitioned']
            . ' trip(s) transitioned from scheduled to departed.' . PHP_EOL
    );

    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, 'Trip status worker error: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}