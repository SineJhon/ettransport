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

    ensure_schema_columns($pdo);

    return $pdo;
}

/**
 * Lightweight, idempotent schema upgrade for databases created before a
 * column was added. schema.sql remains the single source of truth for fresh
 * installs; this only back-fills columns that are missing in existing DBs.
 *
 * Runs at most once per PHP process (static guard). Non-fatal: read-only and
 * admin paths keep working even if the upgrade cannot run (e.g. read-only
 * shared hosting), because callers still tolerate a missing column.
 */
function ensure_schema_columns(PDO $pdo): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

    try {
        $stmt = $pdo->prepare(
            "SELECT COUNT(*)
               FROM information_schema.columns
              WHERE table_schema = DATABASE()
                AND table_name = 'companies'
                AND column_name = 'listed'"
        );
        $stmt->execute();

        if ((int) $stmt->fetchColumn() === 0) {
            $pdo->exec("ALTER TABLE companies ADD COLUMN listed TINYINT(1) NOT NULL DEFAULT 1 AFTER status");
        }

        /* company_reason_history — rejection/suspension audit trail (idempotent). */
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS company_reason_history (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                company_id BIGINT UNSIGNED NOT NULL,
                action_type ENUM('rejected', 'suspended') NOT NULL,
                reason VARCHAR(500) NOT NULL,
                admin_user_id BIGINT UNSIGNED NOT NULL,
                listed_before TINYINT(1) DEFAULT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_company_reason_history_company (company_id),
                KEY idx_company_reason_history_action (company_id, action_type),
                CONSTRAINT fk_company_reason_history_company
                    FOREIGN KEY (company_id) REFERENCES companies(id)
                    ON DELETE CASCADE
                    ON UPDATE CASCADE,
                CONSTRAINT fk_company_reason_history_admin
                    FOREIGN KEY (admin_user_id) REFERENCES users(id)
                    ON DELETE CASCADE
                    ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    } catch (Throwable $e) {
        /* Non-fatal on upgrade path — surfaces only if the app cannot query the schema. */
    }
}
