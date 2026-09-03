<?php

declare(strict_types=1);

function db_config(): array
{
    return [
        'host' => getenv('ET_DB_HOST') ?: '127.0.0.1',
        'port' => getenv('ET_DB_PORT') ?: '3306',
        'name' => getenv('ET_DB_NAME') ?: 'ethio_transport',
        'user' => getenv('ET_DB_USER') ?: 'root',
        'pass' => getenv('ET_DB_PASS') ?: '',
        'charset' => 'utf8mb4',
    ];
}

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $cfg = db_config();
    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=%s',
        $cfg['host'],
        $cfg['port'],
        $cfg['name'],
        $cfg['charset']
    );

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    try {
        $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], $options);
    } catch (Throwable $e) {
        throw new RuntimeException('Database connection failed. Check config/database.php or ET_DB_* environment variables.');
    }

    /* Fresh databases automatically get the development demo data on first
       connection (see config/demo-seed.php). Never touches non-empty DBs. */
    require_once __DIR__ . '/demo-seed.php';
    et_maybe_seed_demo();

    return $pdo;
}
