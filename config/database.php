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

        /* companies.founded — founding year shown in the public profile's
           "Founded" section and editable from the company dashboard. Fresh
           installs already get the column from schema.sql; this adds it to
           databases created before it existed. */
        $stmt = $pdo->prepare(
            "SELECT COUNT(*)
               FROM information_schema.columns
              WHERE table_schema = DATABASE()
                AND table_name = 'companies'
                AND column_name = 'founded'"
        );
        $stmt->execute();
        if ((int) $stmt->fetchColumn() === 0) {
            $pdo->exec("ALTER TABLE companies ADD COLUMN founded SMALLINT UNSIGNED DEFAULT NULL AFTER head_office");
        }

        /* company_phones — multiple public contact phone numbers per company
           (mobile AND landline, e.g. +251 91x xxx xxx or +251 1xx xxx xxx).
           Idempotent, same pattern as company_reason_history below. */
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS company_phones (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                company_id BIGINT UNSIGNED NOT NULL,
                phone VARCHAR(30) NOT NULL,
                label VARCHAR(60) DEFAULT NULL,
                is_default TINYINT(1) NOT NULL DEFAULT 0,
                sort_order SMALLINT NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_company_phones_company (company_id),
                CONSTRAINT fk_company_phones_company
                    FOREIGN KEY (company_id) REFERENCES companies(id)
                    ON DELETE CASCADE
                    ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );

        /* Back-fill the phones table from companies.phone for companies that
           predate multi-phone support, so every company has at least its
           primary number in the new table without duplicating rows. */
        $pdo->exec(
            "INSERT INTO company_phones (company_id, phone, is_default, sort_order)
             SELECT c.id, c.phone, 1, 0
               FROM companies c
              WHERE c.phone IS NOT NULL
                AND c.phone <> ''
                AND NOT EXISTS (
                    SELECT 1 FROM company_phones cp
                     WHERE cp.company_id = c.id AND cp.phone = c.phone
                )"
        );

        /* company_amenities — onboard amenities a company offers (shown on
           the public profile and chosen in the dashboard profile editor).
           Idempotent, same pattern as company_phones below. */
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS company_amenities (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                company_id BIGINT UNSIGNED NOT NULL,
                amenity VARCHAR(80) NOT NULL,
                sort_order SMALLINT NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_company_amenities_company_amenity (company_id, amenity),
                KEY idx_company_amenities_company (company_id),
                CONSTRAINT fk_company_amenities_company
                    FOREIGN KEY (company_id) REFERENCES companies(id)
                    ON DELETE CASCADE
                    ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );

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

        /* bookings.booking_source — 'online' vs 'office' sales channel used by
           the admin revenue breakdown. Fresh installs already get the column
           from schema.sql; this adds it to databases created before it existed.
           Existing rows are backfilled ONCE: office/walk-in bookings were
           created for synthetic passengers with a 'walkin-...@ettransport.local'
           email, everything else defaults to 'online'. */
        $stmt = $pdo->prepare(
            "SELECT COUNT(*)
               FROM information_schema.columns
              WHERE table_schema = DATABASE()
                AND table_name = 'bookings'
                AND column_name = 'booking_source'"
        );
        $stmt->execute();
        if ((int) $stmt->fetchColumn() === 0) {
            $pdo->exec("ALTER TABLE bookings ADD COLUMN booking_source ENUM('online', 'office') NOT NULL DEFAULT 'online' AFTER payment_method");
            $pdo->exec(
                "UPDATE bookings b
                    JOIN users u ON u.id = b.passenger_id
                    SET b.booking_source = 'office'
                  WHERE u.email LIKE 'walkin-%@ettransport.local'"
            );
        }

        /* Platform policy: every bus is ONLY a STANDARD 51-seat coach — there is
           no luxury/vip class and no other capacity. Normalize any rows created
           before this policy (demo seed or manual), then lock the columns so
           nothing else can ever be stored. All steps are guarded by schema /
           data checks so they are cheap no-ops once the upgrade has run. */
        $stmt = $pdo->prepare(
            "SELECT COUNT(*)
               FROM buses
              WHERE bus_type <> 'standard' OR seat_count <> 51"
        );
        $stmt->execute();
        if ((int) $stmt->fetchColumn() > 0) {
            $pdo->exec("UPDATE buses SET bus_type = 'standard', seat_count = 51");
        }

        $stmt = $pdo->prepare(
            "SELECT COUNT(*)
               FROM information_schema.columns
              WHERE table_schema = DATABASE()
                AND table_name = 'buses'
                AND column_name = 'bus_type'
                AND column_type <> 'enum(''standard'')'"
        );
        $stmt->execute();
        if ((int) $stmt->fetchColumn() > 0) {
            $pdo->exec("ALTER TABLE buses MODIFY bus_type ENUM('standard') NOT NULL DEFAULT 'standard'");
            $pdo->exec("ALTER TABLE buses MODIFY seat_count INT UNSIGNED NOT NULL DEFAULT 51");
        }

        /* DB-level guard so a 51-seat capacity can never be written directly. */
        $stmt = $pdo->prepare(
            "SELECT COUNT(*)
               FROM information_schema.TABLE_CONSTRAINTS
              WHERE table_schema = DATABASE()
                AND table_name = 'buses'
                AND constraint_type = 'CHECK'
                AND constraint_name = 'chk_buses_seat_count'"
        );
        $stmt->execute();
        if ((int) $stmt->fetchColumn() === 0) {
            $pdo->exec("ALTER TABLE buses ADD CONSTRAINT chk_buses_seat_count CHECK (seat_count = 51)");
        }
    } catch (Throwable $e) {
        /* Non-fatal on upgrade path — surfaces only if the app cannot query the schema. */
    }
}
