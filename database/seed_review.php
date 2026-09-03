<?php

declare(strict_types=1);

/**
 * ET Transport — development seed: one real, verified passenger review.
 *
 * Insert a genuine review row (with a backing completed booking so the
 * "Verified Passenger" badge is honest), plus a company reply so the reply
 * feature has data on the public profile immediately.
 *
 * Idempotent: safe to run repeatedly (never duplicates rows).
 *
 *     C:\xampp\php\php.exe database\seed_review.php
 */

require_once __DIR__ . '/../config/database.php';

$pdo = db();

try {
    $pdo->beginTransaction();

    /* ---------- 1. passenger ---------- */
    $email = 'hanna.alem@ettransport.local';
    $selUser = $pdo->prepare('SELECT id, name FROM users WHERE email = :email LIMIT 1');
    $selUser->execute([':email' => $email]);
    $user = $selUser->fetch();
    if ($user) {
        $passengerId = (int) $user['id'];
        fwrite(STDOUT, "  passenger exists : {$email}\n");
    } else {
        $insUser = $pdo->prepare('INSERT INTO users (name, email, phone, password_hash, role, status)
            VALUES (:name, :email, :phone, :password_hash, :role, :status)');
        $insUser->execute([
            ':name' => 'Hanna Alem',
            ':email' => $email,
            ':phone' => '+251 91 234 5566',
            ':password_hash' => password_hash('SeedPass123!', PASSWORD_DEFAULT),
            ':role' => 'passenger',
            ':status' => 'active',
        ]);
        $passengerId = (int) $pdo->lastInsertId();
        fwrite(STDOUT, "  passenger created : Hanna Alem ({$email})\n");
    }

    /* ---------- 2. company + a seeded trip --------------------------------- */
    $selComp = $pdo->prepare('SELECT id FROM companies WHERE slug = :slug LIMIT 1');
    $selComp->execute([':slug' => 'selam-bus']);
    $company = $selComp->fetch();
    if (!$company) {
        throw new RuntimeException('Selam Bus company not found — run database\seed_transport.php first.');
    }
    $companyId = (int) $company['id'];

    $selTrip = $pdo->prepare('SELECT id, price FROM trips WHERE company_id = :cid ORDER BY id LIMIT 1');
    $selTrip->execute([':cid' => $companyId]);
    $trip = $selTrip->fetch();
    if (!$trip) {
        throw new RuntimeException('No trips for Selam Bus — run database\seed_transport.php first.');
    }
    $tripId = (int) $trip['id'];
    $amount = (float) $trip['price'];

    /* ---------- 3. verified booking (completed) --------------------------- */
    $bookingRef = 'BK-SEED-HANNA01';
    $selBooking = $pdo->prepare('SELECT id FROM bookings WHERE booking_reference = :ref LIMIT 1');
    $selBooking->execute([':ref' => $bookingRef]);
    $booking = $selBooking->fetch();
    if ($booking) {
        $bookingId = (int) $booking['id'];
    } else {
        $insBooking = $pdo->prepare('INSERT INTO bookings
            (passenger_id, trip_id, booking_reference, total_amount, payment_method,
             payment_status, booking_status, created_at, updated_at)
            VALUES (:uid, :tid, :ref, :amount, :method, :pstatus, :bstatus, :created, :updated)');
        $created12 = date('Y-m-d H:i:s', strtotime('-12 days'));
        $insBooking->execute([
            ':uid' => $passengerId,
            ':tid' => $tripId,
            ':ref' => $bookingRef,
            ':amount' => $amount,
            ':method' => 'cash',
            ':pstatus' => 'paid',
            ':bstatus' => 'completed',
            ':created' => $created12,
            ':updated' => $created12,
        ]);
        $bookingId = (int) $pdo->lastInsertId();

        $insPax = $pdo->prepare('INSERT INTO booking_passengers
            (booking_id, name, age, gender, phone, seat_number)
            VALUES (:bid, :name, :age, :gender, :phone, :seat)');
        $insPax->execute([
            ':bid' => $bookingId,
            ':name' => 'Hanna Alem',
            ':age' => 28,
            ':gender' => 'female',
            ':phone' => '+251 91 234 5566',
            ':seat' => 'A1',
        ]);
        fwrite(STDOUT, "  verified booking created : {$bookingRef}\n");
    }

    /* ---------- 4. the review + company reply -------------------------------- */
    $selReview = $pdo->prepare('SELECT id FROM reviews WHERE passenger_id = :uid AND company_id = :cid LIMIT 1');
    $selReview->execute([':uid' => $passengerId, ':cid' => $companyId]);
    if ($selReview->fetch()) {

        fwrite(STDOUT, "  review exists ; skipped\n");
    } else {
        $insReview = $pdo->prepare('INSERT INTO reviews
            (passenger_id, company_id, booking_id, rating, comment, status,
             created_at, updated_at, reply, reply_at)
            VALUES (:uid, :cid, :bid, :rating, :comment, :status, :created, :updated, :reply, :reply_at)');
        $created10 = date('Y-m-d H:i:s', strtotime('-10 days'));
        $replied2 = date('Y-m-d H:i:s', strtotime('-2 days'));
        $insReview->execute([
            ':uid' => $passengerId,
            ':cid' => $companyId,
            ':bid' => $bookingId,
            ':rating' => 5,
            ':comment' => 'Smooth online booking and an on-time departure from Addis Ababa to Bahir Dar. The coach was clean, the crew kept everyone informed and the seats were comfortable for the whole ride. Absolutely recommend Selam Bus!',
            ':status' => 'approved',
            ':created' => $created10,
            ':updated' => $created10,
            ':reply' => 'Thank you, Hanna! We are glad you enjoyed the trip — and happy to have you aboard again on the northern corridor anytime.',
            ':reply_at' => $replied2,
        ]);
        fwrite(STDOUT, "  review created (rating 5, verified, with company reply).\n");
    }

    $pdo->commit();
    fwrite(STDOUT, "Review seed complete.\n");
} catch (Throwable $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    fwrite(STDERR, 'Seed failed: ' . $e->getMessage() . "\n");
    exit(1);
}
