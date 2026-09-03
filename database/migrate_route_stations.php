<?php

declare(strict_types=1);

/**
 * ET Transport — one-time migration: add pickup/drop-off station columns to
 * the routes table (JSON text arrays), then backfill sensible defaults for
 * any existing routes that came from the pre-station schema.
 *
 * Idempotent and safe to run repeatedly:
 *
 *     C:\xampp\php\php.exe database\migrate_route_stations.php
 */

require_once __DIR__ . '/../config/database.php';

$pdo = db();

try {
    $columns = [];
    foreach ($pdo->query('SHOW COLUMNS FROM routes') as $row) {
        $columns[$row['Field']] = true;
    }

    $changed = false;
    if (!isset($columns['pickup_stations'])) {
        $pdo->exec('ALTER TABLE routes ADD COLUMN pickup_stations TEXT NULL AFTER to_city');
        $changed = true;
    }
    if (!isset($columns['dropoff_stations'])) {
        $pdo->exec('ALTER TABLE routes ADD COLUMN dropoff_stations TEXT NULL AFTER pickup_stations');
        $changed = true;
    }

    /* Backfill defaults only for rows with no stations yet — existing routes
       keep whatever the operator has already saved. */
    $pdo->exec("
        UPDATE routes
        SET pickup_stations = COALESCE(pickup_stations, JSON_ARRAY(CONCAT(from_city, ' (Central Station)'))),
            dropoff_stations = COALESCE(dropoff_stations, JSON_ARRAY(CONCAT(to_city, ' (Central Station)')))
        WHERE pickup_stations IS NULL OR dropoff_stations IS NULL
    ");

    fwrite(STDOUT, "Route station columns ready" . ($changed ? " (columns added)." : ".") . "\n");
} catch (Throwable $e) {
    fwrite(STDERR, 'Migration failed: ' . $e->getMessage() . "\n");
    exit(1);
}