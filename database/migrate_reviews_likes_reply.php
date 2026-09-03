<?php

declare(strict_types=1);

/**
 * ET Transport — one-time migration: add likes / reply columns to the
 * reviews table, plus the review_likes per-user table that backs the like
 * counter (and drives each user's personal liked state).
 *
 * Idempotent and safe to run repeatedly:
 *
 *     C:\xampp\php\php.exe database\migrate_reviews_likes_reply.php
 */

require_once __DIR__ . '/../config/database.php';

$pdo = db();

try {
    $columns = [];
    foreach ($pdo->query('SHOW COLUMNS FROM reviews') as $row) {
        $columns[$row['Field']] = true;
    }

    $changed = false;
    if (!isset($columns['likes'])) {
        $pdo->exec('ALTER TABLE reviews ADD COLUMN likes INT UNSIGNED NOT NULL DEFAULT 0 AFTER updated_at');
        $changed = true;
    }
    if (!isset($columns['reply'])) {
        $pdo->exec('ALTER TABLE reviews ADD COLUMN reply TEXT DEFAULT NULL AFTER likes');
        $changed = true;
    }
    if (!isset($columns['reply_at'])) {
        $pdo->exec('ALTER TABLE reviews ADD COLUMN reply_at TIMESTAMP NULL DEFAULT NULL AFTER reply');
        $changed = true;
    }

    $pdo->exec('CREATE TABLE IF NOT EXISTS review_likes (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        review_id BIGINT UNSIGNED NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_review_likes_review_user (review_id, user_id),
        KEY idx_review_likes_review (review_id),
        KEY idx_review_likes_user (user_id),
        CONSTRAINT fk_review_likes_review
            FOREIGN KEY (review_id) REFERENCES reviews(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
        CONSTRAINT fk_review_likes_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

    /* Keep the denormalized counter exact — rebuild it from the likes table. */
    $pdo->exec('UPDATE reviews r
        SET r.likes = (SELECT COUNT(*) FROM review_likes x WHERE x.review_id = r.id)');

    fwrite(STDOUT, "Review likes/reply columns and review_likes table ready" . ($changed ? " (columns added)." : ".") . "\n");
} catch (Throwable $e) {
    fwrite(STDERR, 'Migration failed: ' . $e->getMessage() . "\n");
    exit(1);
}