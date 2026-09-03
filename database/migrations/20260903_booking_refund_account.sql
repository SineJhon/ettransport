-- 2026-09-03 — Booking refund destination account (name + number).
--
-- Backfills the live dev database with the columns that schema.sql now
-- declares for fresh installs. Safe to re-run.
--
-- Apply with:
--   C:\xampp\mysql\bin\mysql.exe -u root < database\migrations\20260903_booking_refund_account.sql

USE ethio_transport;

ALTER TABLE `bookings`
  ADD COLUMN `refund_account_name` VARCHAR(120) DEFAULT NULL AFTER `refunded_amount`,
  ADD COLUMN `refund_account_number` VARCHAR(50) DEFAULT NULL AFTER `refund_account_name`;