-- 2026-09-02 — Company-dashboard booking cancellation: refund choice + reason.
--
-- Backfills the live dev database with the columns that schema.sql now
-- declares for fresh installs. Safe to re-run.
--
-- Apply with:
--   C:\xampp\mysql\bin\mysql.exe -u root < database\migrations\20260902_booking_cancel_refund.sql

USE ethio_transport;

ALTER TABLE `bookings`
  ADD COLUMN `cancellation_reason` VARCHAR(500) DEFAULT NULL AFTER `booking_status`,
  ADD COLUMN `refund_type` ENUM('none', 'full', 'half') NOT NULL DEFAULT 'none' AFTER `cancellation_reason`,
  ADD COLUMN `refunded_amount` DECIMAL(10, 2) DEFAULT NULL AFTER `refund_type`;