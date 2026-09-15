-- ============================================================
-- ET Transport — database schema
-- MySQL / MariaDB (XAMPP compatible) · Engine: InnoDB · utf8mb4
--
-- The database is the eventual source of truth for the platform.
-- Three user roles only: passenger · company · admin  (no super admin)
--
-- Relationship overview:
--   users ──< companies (company owner account)
--   companies ──< buses, trips, parcels
--   routes ──< trips
--   trips ──< bookings
--   bookings ──< booking_passengers, paymentsss
--   users ──< bookings, reviews, notifications
--
-- Passwords are NEVER stored in plain text. They are stored with
-- PHP password_hash() in users.password_hash.
--
-- Recommended setup order (see database/README.md):
--   1) create this database, 2) import this file.
-- Importing this file restores the CURRENT state snapshot: the table
-- definitions below are followed by a full row snapshot (see the
-- "DATA SNAPSHOT" section at the bottom) with users, companies,
-- phones, amenities, buses, routes, trips, bookings and payments.
-- config/demo-seed.php still bootstraps a brand-new EMPTY database
-- (structure-only import) and never touches one that has data.
-- ============================================================

CREATE DATABASE IF NOT EXISTS ethio_transport
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ethio_transport;

-- ------------------------------------------------------------
-- users — every account on the platform (passenger / company / admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('passenger', 'company', 'admin') NOT NULL,
  status ENUM('active', 'pending', 'suspended', 'rejected') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  KEY idx_users_role (role),
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- companies — one company profile linked to one company user account.
-- Three independent lifecycle axes:
--   approval_status  companies.status   pending | approved | rejected
--   account_status   users.status       active  | suspended
--   listing_status   companies.listed   1 (on) | 0 (off)
--
-- A company may appear publicly ONLY when
--   approval_status='approved' AND account_status='active' AND listed=1.
-- A company may log in ONLY when
--   approval_status='approved' AND account_status='active'.
--
-- Suspension keeps approval_status='approved' and flips account_status to
-- 'suspended' + listed to 0 (the prior listing is remembered in
-- company_reason_history so an unsuspension can restore it).
--
-- NOTE: for an EXISTING database (created before website/head_office
-- were added) apply this once:
--   ALTER TABLE companies
--     ADD COLUMN website VARCHAR(255) DEFAULT NULL AFTER address,
--     ADD COLUMN head_office VARCHAR(255) DEFAULT NULL AFTER website;
--
-- And for a database created before the public-directory listing flag
-- was added, apply this once:
--   ALTER TABLE companies
--     ADD COLUMN listed TINYINT(1) NOT NULL DEFAULT 1 AFTER status;
--
-- And the company_reason_history audit table (rejection/suspension reasons +
-- listed_before restore) is auto-created by config/database.php, or by the
-- CREATE TABLE in this file for fresh installs.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  description TEXT DEFAULT NULL,
  logo VARCHAR(255) DEFAULT NULL,
  cover_image VARCHAR(255) DEFAULT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  email VARCHAR(190) DEFAULT NULL,
  address VARCHAR(255) DEFAULT NULL,
  website VARCHAR(255) DEFAULT NULL,
  head_office VARCHAR(255) DEFAULT NULL,
  -- Year the bus company was founded (public profile "Founded" section).
  -- NULL means the company has not set it yet.
  founded SMALLINT UNSIGNED DEFAULT NULL,
  status ENUM('pending', 'approved', 'suspended', 'rejected') NOT NULL DEFAULT 'pending',
  listed TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_companies_user_id (user_id),
  UNIQUE KEY uq_companies_slug (slug),
  KEY idx_companies_status (status),
  KEY idx_companies_name (name),
  CONSTRAINT fk_companies_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- company_branches — one company can run many offices/branches
-- (e.g. an "Arba Minch Branch"). Shown on the passenger-facing
-- profile and managed from the company dashboard.
-- is_head marks the main/head-office branch.
--
-- NOTE: for an EXISTING database created before this table was
-- added, run the whole table DDL below once (the CREATE TABLE
-- is idempotent — safe to paste into phpMyAdmin).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_branches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(190) NOT NULL,
  city VARCHAR(120) DEFAULT NULL,
  address VARCHAR(255) DEFAULT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  email VARCHAR(190) DEFAULT NULL,
  hours VARCHAR(255) DEFAULT NULL,
  is_head TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_company_branches_company (company_id),
  CONSTRAINT fk_company_branches_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- company_phones — one company can have several public contact
-- phone numbers (mobile AND landline, e.g. +251 91x xxx xxx or
-- +251 1xx xxx xxx). Shown on the passenger-facing profile and
-- managed from the company dashboard. companies.phone remains
-- the primary/first number so existing logins, lookups and the
-- admin list keep working unchanged.
--
-- NOTE: for an EXISTING database created before this table was
-- added, config/database.php's ensure_schema_columns() creates it
-- automatically (idempotent). Fresh installs get it from here.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_phones (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- company_amenities — onboard amenities a company offers. Shown
-- on the passenger-facing profile (Services & Amenities) and chosen
-- from an icon picker in the company dashboard profile editor.
-- The catalog the dashboard offers: Reclining Seats, Headrests,
-- Arm Support, AC, Entertainment, Snacks, Water, Wi-Fi, Luggage
-- Space, Multiple Pickup. The API keeps this list open (any short
-- label) so the catalog can evolve without a schema change.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_amenities (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- buses — fleet vehicles owned by a company
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  model VARCHAR(120) DEFAULT NULL,
  -- Platform policy: every bus on ET Transport is a STANDARD 51-seat coach.
  -- There is no luxury/vip class; every coach has A/C, seat chargers and
  -- the standard onboard amenities.
  bus_type ENUM('standard') NOT NULL DEFAULT 'standard',
  seat_count INT UNSIGNED NOT NULL DEFAULT 51,
  registration_number VARCHAR(50) DEFAULT NULL,
  image VARCHAR(255) DEFAULT NULL,
  status ENUM('active', 'maintenance', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_buses_company_registration (company_id, registration_number),
  KEY idx_buses_company (company_id),
  KEY idx_buses_status (status),
  CONSTRAINT chk_buses_seat_count CHECK (seat_count = 51),
  CONSTRAINT fk_buses_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- routes — a city-pair each company owns. duration is in minutes.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  from_city VARCHAR(120) NOT NULL,
  to_city VARCHAR(120) NOT NULL,
  -- Operation pickup / drop-off stations: JSON arrays of 1+ station names
  -- (e.g. ["Piassa", "Bole"]). Required on route create; shown on the public
  -- profile's popular-route card and on the booking seat page.
  pickup_stations TEXT NULL,
  dropoff_stations TEXT NULL,
  duration INT UNSIGNED DEFAULT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_routes_company_from_to (company_id, from_city, to_city),
  KEY idx_routes_status (status),
  KEY idx_routes_company (company_id),
  CONSTRAINT fk_routes_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT chk_routes_different_cities CHECK (from_city <> to_city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- trips — a company runs a bus on a route on a given date/time.
--
-- NOTE: There is intentionally NO available-seats counter here.
-- Seat availability is DERIVED from booking_passengers rows so the
-- database never ends up with two conflicting sources of truth.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trips (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  bus_id BIGINT UNSIGNED NOT NULL,
  route_id BIGINT UNSIGNED NOT NULL,
  departure_date DATE NOT NULL,
  departure_time TIME NOT NULL,
  arrival_time TIME DEFAULT NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  status ENUM('scheduled', 'departed', 'completed', 'cancelled') NOT NULL DEFAULT 'scheduled',
  -- Operator cancellation record (api/company.php action=trip_status): the
  -- reason given when a scheduled trip is cancelled, e.g. "route closing".
  cancellation_reason VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_trips_company (company_id),
  KEY idx_trips_bus (bus_id),
  KEY idx_trips_route (route_id),
  KEY idx_trips_route_date (route_id, departure_date),
  KEY idx_trips_departure_date (departure_date),
  KEY idx_trips_status (status),
  CONSTRAINT fk_trips_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_trips_bus
    FOREIGN KEY (bus_id) REFERENCES buses(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_trips_route
    FOREIGN KEY (route_id) REFERENCES routes(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT chk_trips_price CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- bookings — a passenger books a seat (or seats) on a trip.
-- booking_reference must be unique (e.g. ET-20260820-XXXXXX).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  passenger_id BIGINT UNSIGNED NOT NULL,
  trip_id BIGINT UNSIGNED NOT NULL,
  booking_reference VARCHAR(30) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'cash',
  -- Booking channel: 'online' (passenger books via the website) or 'office'
  -- (company staff books for a walk-in / phone passenger). Used by the admin
  -- revenue breakdown to separate the two sales channels.
  booking_source ENUM('online', 'office') NOT NULL DEFAULT 'online',
  payment_status ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  booking_status ENUM('pending', 'confirmed', 'cancelled', 'completed') NOT NULL DEFAULT 'pending',
  -- Operator cancellation record: who cancelled (via api/company.php
  -- action=booking_cancel), the given reason, whether a refund was issued
  -- ('none' / 'full' / 'half') and the exact refunded amount. Kept on the
  -- booking so the revenue / manifest views can reflect it without a new table.
  cancellation_reason VARCHAR(500) DEFAULT NULL,
  refund_type ENUM('none', 'full', 'half') NOT NULL DEFAULT 'none',
  refunded_amount DECIMAL(10, 2) DEFAULT NULL,
  -- Refund destination account supplied at booking time (office/walk-in or
  -- passenger web booking). Shown in the company cancellation dialog so a
  -- refund command references the exact account the money goes to. The bank
  -- is one of the known options, or the free-text name when "Other" is chosen.
  refund_account_name VARCHAR(120) DEFAULT NULL,
  refund_account_number VARCHAR(50) DEFAULT NULL,
  refund_bank VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bookings_reference (booking_reference),
  KEY idx_bookings_passenger (passenger_id),
  KEY idx_bookings_trip (trip_id),
  KEY idx_bookings_payment_status (payment_status),
  KEY idx_bookings_booking_status (booking_status),
  CONSTRAINT fk_bookings_passenger
    FOREIGN KEY (passenger_id) REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_bookings_trip
    FOREIGN KEY (trip_id) REFERENCES trips(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT chk_bookings_total CHECK (total_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- booking_passengers — one row per traveler on a booking.
-- Seat numbers are stored as data (not UI state). Availability is
-- derived by counting these rows per trip.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_passengers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  age TINYINT UNSIGNED DEFAULT NULL,
  gender ENUM('male', 'female', 'other') DEFAULT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  seat_number VARCHAR(10) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_booking_passengers_booking (booking_id),
  CONSTRAINT fk_booking_passengers_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- payments — one or more payments per booking.
-- Real Telebirr / CBE Birr / M-Pesa integrations come in a later
-- phase; for now this table is the persistent payment record.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  method VARCHAR(30) NOT NULL DEFAULT 'cash',
  transaction_reference VARCHAR(120) DEFAULT NULL,
  status ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_transaction_reference (transaction_reference),
  KEY idx_payments_booking (booking_id),
  CONSTRAINT fk_payments_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT chk_payments_amount CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- parcels — freight parcels a company ships with its scheduled buses.
-- Each parcel tracks a sender → recipient city pair, weight and a
-- simple lifecycle status. Reference numbers are unique and auto-generated
-- server-side (PCL-YYYYMMDD-XXXXXX), like booking references.
--
-- NOTE: for an EXISTING database created before parcels were added,
-- run the whole table DDL below once (the CREATE TABLE IF NOT EXISTS
-- is idempotent — safe to paste into phpMyAdmin).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parcels (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  reference VARCHAR(30) NOT NULL,
  sender_name VARCHAR(120) NOT NULL,
  sender_phone VARCHAR(30) NOT NULL,
  recipient_name VARCHAR(120) NOT NULL,
  recipient_phone VARCHAR(30) NOT NULL,
  from_city VARCHAR(120) NOT NULL,
  to_city VARCHAR(120) NOT NULL,
  weight_kg DECIMAL(8, 2) NOT NULL,
  parcel_type ENUM('document', 'standard', 'electronic', 'fragile', 'perishable') NOT NULL DEFAULT 'standard',
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  notes TEXT DEFAULT NULL,
  status ENUM('received', 'sent', 'delivered', 'picked_up', 'returned_to_sender', 'lost') NOT NULL DEFAULT 'received',
  trip_id BIGINT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_parcels_reference (reference),
  KEY idx_parcels_company (company_id),
  KEY idx_parcels_company_status (company_id, status),
  KEY idx_parcels_company_created (company_id, created_at),
  CONSTRAINT fk_parcels_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_parcels_trip
    FOREIGN KEY (trip_id) REFERENCES trips(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only operational records for every guided parcel status change.
CREATE TABLE IF NOT EXISTS parcel_status_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parcel_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  changed_by BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(32) NOT NULL,
  to_status VARCHAR(32) NOT NULL,
  details_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_parcel_status_log_parcel (parcel_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Financial ledger for parcel counter sales and loss refunds. Parcel sales are
-- created by company staff, so their reporting source is always 'office'.
CREATE TABLE IF NOT EXISTS parcel_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parcel_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  refunded_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  method VARCHAR(30) NOT NULL DEFAULT 'cash',
  transaction_reference VARCHAR(120) DEFAULT NULL,
  status ENUM('paid', 'refunded') NOT NULL DEFAULT 'paid',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_parcel_payments_parcel (parcel_id),
  KEY idx_parcel_payments_company (company_id, created_at),
  CONSTRAINT fk_parcel_payments_parcel FOREIGN KEY (parcel_id) REFERENCES parcels(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_parcel_payments_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- parcel_delete_log — audit trail for parcel deletions. A company
-- operator must supply BOTH their account password and a reason to
-- permanently delete a parcel; each deletion appends one row (never
-- overwritten) so a delete can be audited later.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parcel_delete_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  parcel_reference VARCHAR(30) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  deleted_by_user BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_parcel_delete_log_company (company_id),
  KEY idx_parcel_delete_log_parcel (parcel_reference),
  CONSTRAINT fk_parcel_delete_log_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_parcel_delete_log_user
    FOREIGN KEY (deleted_by_user) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- reviews — a passenger reviews a company (optionally tied to a
-- booking, enabling a future "verified purchase" badge).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  passenger_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED DEFAULT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment TEXT DEFAULT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  likes INT UNSIGNED NOT NULL DEFAULT 0,
  reply TEXT DEFAULT NULL,
  reply_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_reviews_passenger (passenger_id),
  KEY idx_reviews_company (company_id),
  KEY idx_reviews_booking (booking_id),
  KEY idx_reviews_status (status),
  CONSTRAINT fk_reviews_passenger
    FOREIGN KEY (passenger_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_reviews_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_reviews_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------
-- review_likes — which user liked which review (one row per user,
-- so likes are per-account and never inflatable by refreshing). The
-- reviews.likes counter is denormalized data kept in sync by the API.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_likes (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ------------------------------------------------------------
-- company_reason_history — audit trail for company rejections and
-- suspensions. One row is appended per action (never overwritten),
-- so re-suspending a company later preserves every prior reason.
-- listed_before records the company's public listing state at the
-- moment of a suspension so an unsuspension can restore it.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_reason_history (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- notifications — per-user in-app notifications.
-- type examples: booking, payment, review, promotion, system
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(190) NOT NULL,
  message TEXT DEFAULT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'general',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id),
  KEY idx_notifications_user_read (user_id, is_read),
  KEY idx_notifications_is_read (is_read),
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- complaints — passengers file a complaint about a company's
-- service (e.g. a cancelled bus, a lost parcel, late departure)
-- or about the ET Transport platform itself. target distinguishes
-- the two: 'company' complaints carry a company_id (the company
-- triages them from the company dashboard), 'platform' complaints
-- have company_id NULL and are handled by ET Transport support in
-- the admin dashboard. Status flow:
--   open → in_progress → resolved_pending → resolved (passenger
--   must confirm) OR back to in_progress. Company may close
--   (closed); a passenger can escalate (escalated) when the
--   company closes or stops responding, and an admin intervenes.
-- booking_id is optional context that passengers may attach (via
-- a booking reference) so staff can cross-check the journey.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaints (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  passenger_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED DEFAULT NULL,
  booking_id BIGINT UNSIGNED DEFAULT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'other',
  target ENUM('company', 'platform') NOT NULL DEFAULT 'company',
  subject VARCHAR(120) DEFAULT NULL,
  message TEXT NOT NULL,
  status ENUM('open', 'in_progress', 'resolved_pending', 'resolved', 'closed', 'escalated') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  response TEXT DEFAULT NULL,
  response_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_complaints_company (company_id),
  KEY idx_complaints_company_status (company_id, status),
  KEY idx_complaints_company_created (company_id, created_at),
  KEY idx_complaints_target (target),
  CONSTRAINT fk_complaints_passenger
    FOREIGN KEY (passenger_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_complaints_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_complaints_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- complaint_responses — a real chat thread on a complaint.
-- The company replies from the complaint chat and can add as many
-- follow-up messages as needed. Once a response is sent it cannot be
-- edited or deleted (enforced by api/company.php?action=complaint_update).
-- kind='status' rows are system status tellers ("Customer opened
-- complaint", "Company marked this as resolved"...) rendered as
-- centered chips in the chat; actor records who wrote the entry.
-- complaints.response / response_at stay as a denormalized copy of the
-- LATEST message so legacy read paths keep working.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaint_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  complaint_id BIGINT UNSIGNED NOT NULL,
  message TEXT NOT NULL,
  kind ENUM('message', 'status') NOT NULL DEFAULT 'message',
  actor ENUM('passenger', 'company', 'admin', 'system') NOT NULL DEFAULT 'company',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_complaint_responses_complaint (complaint_id),
  CONSTRAINT fk_complaint_responses_complaint
    FOREIGN KEY (complaint_id) REFERENCES complaints(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Bootstrap data
-- Every account row (admin, company owners, passengers) ships inside
-- the DATA SNAPSHOT below, so nothing needs to be re-created on a
-- fresh import. config/demo-seed.php remains as the fallback that
-- bootstraps only a database created structure-only (empty companies).
-- ============================================================
-- ============================================================
-- DATA SNAPSHOT - current live rows.
-- Appended automatically from the working database so importing this
-- file on any device reproduces today's state exactly (no manual
-- re-entry). Includes user accounts (passwords stored as bcrypt
-- hashes), companies, branches, phones, amenities, buses (with uploaded
-- photo paths), routes, the rolling trip schedule, trips, bookings,
-- passengers, payments, reviews and parcels.
--
-- Uploaded image FILES referenced here ship with the repository under
-- assets/uploads/companies and assets/uploads/buses - copy/commit the
-- whole repo and the photos travel with it.
--
-- To refresh this snapshot after more real work, dump the live DB with
--   C:\xampp\mysql\bin\mysqldump.exe -u root --no-create-info
--     --skip-comments --skip-triggers --no-create-db --complete-insert
--     --extended-insert ethio_transport
-- and replace everything between the markers below.
--
-- WARNING: this section INSERTs fixed ids. Import it only into an EMPTY
-- database (fresh install / restore). Re-importing over existing rows
-- with the same ids will fail with duplicate-key errors - that is a
-- safety signal, not a bug.
-- ============================================================

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

LOCK TABLES `booking_passengers` WRITE;
/*!40000 ALTER TABLE `booking_passengers` DISABLE KEYS */;
INSERT INTO `booking_passengers` (`id`, `booking_id`, `name`, `age`, `gender`, `phone`, `seat_number`, `created_at`) VALUES (1,1,'Hanna Alem',28,'female','+251 91 234 5566','A1','2026-09-14 21:28:48'),(2,2,'Debebe Jakson',45,'male','+251936913118','51','2026-09-15 03:50:29');
/*!40000 ALTER TABLE `booking_passengers` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `bookings` WRITE;
/*!40000 ALTER TABLE `bookings` DISABLE KEYS */;
INSERT INTO `bookings` (`id`, `passenger_id`, `trip_id`, `booking_reference`, `total_amount`, `payment_method`, `booking_source`, `payment_status`, `booking_status`, `cancellation_reason`, `refund_type`, `refunded_amount`, `refund_account_name`, `refund_account_number`, `refund_bank`, `created_at`, `updated_at`) VALUES (1,162,2941,'BK-SEED-HANNA01',900.00,'cash','online','paid','completed',NULL,'none',NULL,NULL,NULL,NULL,'2026-09-02 20:28:48','2026-09-02 20:28:48'),(2,163,2958,'ET-20260915-DNZDV7',1200.00,'cash','office','paid','confirmed',NULL,'none',NULL,'Debebe Jakson','10001634578','CBE','2026-09-15 03:50:29','2026-09-15 03:50:29');
/*!40000 ALTER TABLE `bookings` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `buses` WRITE;
/*!40000 ALTER TABLE `buses` DISABLE KEYS */;
INSERT INTO `buses` (`id`, `company_id`, `name`, `model`, `bus_type`, `seat_count`, `registration_number`, `image`, `status`, `created_at`, `updated_at`) VALUES (241,136,'Selam Bus Coach 1','Scania Touring','standard',51,'ET-SELA01','assets/uploads/buses/bus-241-758aecea98c9d1f2be16d54e.webp','active','2026-09-14 21:28:47','2026-09-15 06:12:59'),(242,136,'Selam Bus Coach 2','Yutong ZK6122H9','standard',51,'ET-SELA02','assets/uploads/buses/bus-242-e2a27b41f0ad1bf0e4d04464.webp','active','2026-09-14 21:28:47','2026-09-15 06:13:05'),(243,136,'Selam Bus Coach 3','Yutong ZK6122H9','standard',51,'ET-SELA03','assets/uploads/buses/bus-243-065e7b14ea74b25a530b6640.webp','active','2026-09-14 21:28:47','2026-09-15 06:13:13'),(244,137,'Sky Bus Coach 1','Higer A90','standard',51,'ET-SKY-01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(245,137,'Sky Bus Coach 2','Yutong ZK6107H','standard',51,'ET-SKY-02',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(246,138,'Yegna Bus Coach 1','MAN Lion’s Coach','standard',51,'ET-YEGN01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(247,138,'Yegna Bus Coach 2','Golden Dragon XML6125','standard',51,'ET-YEGN02',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(248,139,'Golden Bus Coach 1','Yutong ZK6107H','standard',51,'ET-GOLD01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(249,139,'Golden Bus Coach 2','King Long XMQ6898','standard',51,'ET-GOLD02',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(250,140,'Zemen Bus Coach 1','Neoplan Skyliner','standard',51,'ET-ZEME01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(251,140,'Zemen Bus Coach 2','Mercedes-Benz Tourismo','standard',51,'ET-ZEME02',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(252,141,'ODAA Bus Coach 1','Yutong ZK6122H9','standard',51,'ET-ODAA01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(253,141,'ODAA Bus Coach 2','Foton AUV BJ6129','standard',51,'ET-ODAA02',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(254,142,'Abay Bus Coach 1','Yutong ZK6107H','standard',51,'ET-ABAY01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(255,143,'Ethio Bus Coach 1','King Long XMQ6898','standard',51,'ET-ETHI01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(256,144,'Liyu Bus Coach 1','Neoplan Skyliner','standard',51,'ET-LIYU01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47');
/*!40000 ALTER TABLE `buses` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `companies` WRITE;
/*!40000 ALTER TABLE `companies` DISABLE KEYS */;
INSERT INTO `companies` (`id`, `user_id`, `name`, `slug`, `description`, `logo`, `cover_image`, `phone`, `email`, `address`, `website`, `head_office`, `founded`, `status`, `listed`, `created_at`, `updated_at`) VALUES (136,153,'Selam Bus','selam-bus','A trusted name on the Addis Ababa – Mekelle corridor.\r\n\r\nSelam Bus operates modern long-haul coaches on Ethiopia’s northern corridor, linking Addis Ababa with Mekelle, Bahir Dar and Gondar.','assets/uploads/companies/company-136-logo-fac0dbe69c1fc0d0c2580a48.webp','assets/uploads/companies/company-136-cover-94980b91e3da6feb44860bf4.webp','+251 91 140 3977','selam.bus@ethionet.et','Meskel Square, Finfine Building, 5th Floor','https://selambus.wordpress.com','Meskel Square, Finfine Building, 5th Floor, Kirkos Sub-City, Addis Ababa, Ethiopia',1996,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:42:27'),(137,154,'Sky Bus','sky-bus','Everyday departures to the lake cities of the south.\n\nSky Bus runs frequent services from Addis Ababa towards the Rift Valley lakes, serving Hawassa and Arba Minch.','assets/images/companies/sky-bus-logo.svg','assets/images/companies/cover-sky-bus.svg','+251 11 228 4455','info@skybus.example.com','Addis Ababa, Addis Ketema','https://skybus.example.com','Addis Ababa, Addis Ketema',2008,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(138,155,'Yegna Bus','yegna-bus','Comfortable daily services on the Bahir Dar – Gondar corridor.\n\nYegna Bus focuses on dependable daytime departures along the Bahir Dar and Gondar corridor.','assets/images/companies/yegna-bus-logo.svg','assets/images/companies/cover-yegna-bus.svg','+251 11 550 1290','info@yegnabus.example.com','Addis Ababa, Kazanchis','https://yegnabus.example.com','Addis Ababa, Kazanchis',2012,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(139,156,'Golden Bus','golden-bus','Daily commuter and long-haul links to eastern and central towns.\n\nGolden Bus connects Addis Ababa with Adama and Dessie with frequent departures.','assets/images/companies/golden-bus-logo.svg','assets/images/companies/cover-golden-bus.svg','+251 11 663 7020','info@goldenbus.example.com','Addis Ababa, Bole','https://goldenbus.example.com','Addis Ababa, Bole',2010,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(140,157,'Zemen Bus','zemen-bus','Premier service on the eastern corridor to Dire Dawa, Harar and Jijiga.\n\nZemen Bus runs premium coaches on the eastern corridor from Addis Ababa to Dire Dawa.','assets/images/companies/zemen-bus-logo.svg','assets/images/companies/cover-zemen-bus.svg','+251 11 778 1140','info@zemenbus.example.com','Addis Ababa, Bole','https://zemenbus.example.com','Addis Ababa, Bole',2009,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(141,158,'ODAA Bus','odaa-bus','Reliable routes to Jimma, Hawassa and the western belt.\n\nODAA Bus covers fast-growing southern and western routes, delivering value and predictable departures.','assets/images/companies/odaa-bus-logo.svg','assets/images/companies/cover-odaa-bus.svg','+251 11 442 9090','info@odaa.example.com','Addis Ababa, Kolfe','https://odaa.example.com','Addis Ababa, Kolfe',2015,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(142,159,'Abay Bus','abay-bus','Budget-friendly connections to the north-west.\n\nAbay Bus is known for dependable buses on the Addis Ababa – Bahir Dar corridor.','assets/images/companies/abay-bus-logo.svg','assets/images/companies/cover-abay-bus.svg','+251 11 554 7733','info@abaybus.example.com','Addis Ababa, Megenagna','https://abaybus.example.com','Addis Ababa, Megenagna',2011,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(143,160,'Ethio Bus','ethio-bus','Fast route coverage to the south and lake regions.\n\nEthio Bus serves key southern destinations with focused departures on fast-moving routes to Hawassa.','assets/images/companies/ethio-bus-logo.svg','assets/images/companies/cover-ethio-bus.svg','+251 11 445 8922','info@ethiobus.example.com','Addis Ababa, Meskel Square','https://ethiobus.example.com','Addis Ababa, Meskel Square',2016,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(144,161,'Liyu Bus','liyu-bus','Executive comfort on the north corridor to Mekelle.\n\nLiyu Bus offers premium comfort and regular departures for the Addis Ababa – Mekelle corridor.','assets/images/companies/liyu-bus-logo.svg','assets/images/companies/cover-liyu-bus.svg','+251 11 990 2133','info@liyubus.example.com','Addis Ababa, Piassa','https://liyubus.example.com','Addis Ababa, Piassa',2014,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47');
/*!40000 ALTER TABLE `companies` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `company_amenities` WRITE;
/*!40000 ALTER TABLE `company_amenities` DISABLE KEYS */;
INSERT INTO `company_amenities` (`id`, `company_id`, `amenity`, `sort_order`, `created_at`) VALUES (11,136,'Reclining Seats',0,'2026-09-15 04:02:04'),(12,136,'Headrests',1,'2026-09-15 04:02:04'),(13,136,'AC',2,'2026-09-15 04:02:04'),(14,136,'Water',3,'2026-09-15 04:02:04'),(15,136,'Snacks',4,'2026-09-15 04:02:04'),(16,136,'Wi-Fi',5,'2026-09-15 04:02:04'),(17,136,'Multiple Pickup',6,'2026-09-15 04:02:04'),(18,136,'Luggage Space',7,'2026-09-15 04:02:04'),(19,136,'Arm Support',8,'2026-09-15 04:02:04'),(20,136,'Entertainment',9,'2026-09-15 04:02:04');
/*!40000 ALTER TABLE `company_amenities` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `company_branches` WRITE;
/*!40000 ALTER TABLE `company_branches` DISABLE KEYS */;
INSERT INTO `company_branches` (`id`, `company_id`, `name`, `city`, `address`, `phone`, `email`, `hours`, `is_head`, `status`, `created_at`, `updated_at`) VALUES (1,136,'Head Office','Addis Ababa, Ethiopia','Meskel Square, Finfine Building, 5th Floor','+251115548800','selam.bus@ethionet.et','Mon - Mon ( 02:00 - 10:00 )',1,'active','2026-09-15 04:01:33','2026-09-15 04:01:33'),(2,136,'Arba Minch Branch','Arba Minch','Near Cayro Hotel, Arba Minch','+251915546783','arbaminchbranch@selambus.et','Mon - Mon ( 02:00 - 10:00 )',0,'active','2026-09-15 04:03:20','2026-09-15 04:04:08');
/*!40000 ALTER TABLE `company_branches` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `company_phones` WRITE;
/*!40000 ALTER TABLE `company_phones` DISABLE KEYS */;
INSERT INTO `company_phones` (`id`, `company_id`, `phone`, `label`, `is_default`, `sort_order`, `created_at`, `updated_at`) VALUES (2,137,'+251 11 228 4455',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(3,138,'+251 11 550 1290',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(4,139,'+251 11 663 7020',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(5,140,'+251 11 778 1140',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(6,141,'+251 11 442 9090',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(7,142,'+251 11 554 7733',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(8,143,'+251 11 445 8922',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(9,144,'+251 11 990 2133',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(21,136,'+251 91 140 3977',NULL,1,0,'2026-09-15 04:02:04','2026-09-15 04:02:04'),(22,136,'+251 91 140 3978',NULL,0,1,'2026-09-15 04:02:04','2026-09-15 04:02:04'),(23,136,'+251 11 554 8800',NULL,0,2,'2026-09-15 04:02:04','2026-09-15 04:02:04'),(24,136,'+251 11 554 8801',NULL,0,3,'2026-09-15 04:02:04','2026-09-15 04:02:04');
/*!40000 ALTER TABLE `company_phones` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `company_reason_history` WRITE;
/*!40000 ALTER TABLE `company_reason_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `company_reason_history` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `complaint_responses` WRITE;
/*!40000 ALTER TABLE `complaint_responses` DISABLE KEYS */;
/*!40000 ALTER TABLE `complaint_responses` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `complaints` WRITE;
/*!40000 ALTER TABLE `complaints` DISABLE KEYS */;
/*!40000 ALTER TABLE `complaints` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` (`id`, `user_id`, `title`, `message`, `type`, `is_read`, `created_at`) VALUES (1,163,'Ticket booked by office','Your ticket for Addis Ababa → Mekelle has been booked and confirmed. Seat 51 is reserved under booking ET-20260915-DNZDV7.','booking',0,'2026-09-15 03:50:29');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `parcel_delete_log` WRITE;
/*!40000 ALTER TABLE `parcel_delete_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `parcel_delete_log` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `parcel_payments` WRITE;
/*!40000 ALTER TABLE `parcel_payments` DISABLE KEYS */;
INSERT INTO `parcel_payments` (`id`, `parcel_id`, `company_id`, `amount`, `refunded_amount`, `method`, `transaction_reference`, `status`, `created_at`, `updated_at`) VALUES (1,1,136,450.00,0.00,'cash',NULL,'paid','2026-09-15 03:55:24','2026-09-15 03:55:24');
/*!40000 ALTER TABLE `parcel_payments` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `parcel_status_log` WRITE;
/*!40000 ALTER TABLE `parcel_status_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `parcel_status_log` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `parcels` WRITE;
/*!40000 ALTER TABLE `parcels` DISABLE KEYS */;
INSERT INTO `parcels` (`id`, `company_id`, `reference`, `sender_name`, `sender_phone`, `recipient_name`, `recipient_phone`, `from_city`, `to_city`, `weight_kg`, `parcel_type`, `price`, `notes`, `status`, `trip_id`, `created_at`, `updated_at`) VALUES (1,136,'PCL-20260915-FXGBWW','Alebachew Kassa','936913118','Alebachew Kassaye','936913119','Addis Ababa','Arba Minch',10.00,'perishable',450.00,NULL,'received',NULL,'2026-09-15 03:55:24','2026-09-15 03:55:24');
/*!40000 ALTER TABLE `parcels` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
INSERT INTO `payments` (`id`, `booking_id`, `amount`, `method`, `transaction_reference`, `status`, `created_at`, `updated_at`) VALUES (1,2,1200.00,'cash','OFFICE-20260915-9355b4a1','paid','2026-09-15 03:50:29','2026-09-15 03:50:29');
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `review_likes` WRITE;
/*!40000 ALTER TABLE `review_likes` DISABLE KEYS */;
INSERT INTO `review_likes` (`id`, `review_id`, `user_id`, `created_at`) VALUES (1,1,153,'2026-09-15 03:58:04');
/*!40000 ALTER TABLE `review_likes` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `reviews` WRITE;
/*!40000 ALTER TABLE `reviews` DISABLE KEYS */;
INSERT INTO `reviews` (`id`, `passenger_id`, `company_id`, `booking_id`, `rating`, `comment`, `status`, `created_at`, `updated_at`, `likes`, `reply`, `reply_at`) VALUES (1,162,136,1,5,'Smooth online booking and an on-time departure from Addis Ababa to Bahir Dar. The coach was clean, the crew kept everyone informed and the seats were comfortable for the whole ride. Absolutely recommend Selam Bus!','approved','2026-09-04 20:28:48','2026-09-15 03:58:07',1,'Thank you, Hanna! We are glad you enjoyed the trip — and happy to have you aboard again on the northern corridor anytime.','2026-09-15 03:58:07');
/*!40000 ALTER TABLE `reviews` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `routes` WRITE;
/*!40000 ALTER TABLE `routes` DISABLE KEYS */;
INSERT INTO `routes` (`id`, `company_id`, `from_city`, `to_city`, `pickup_stations`, `dropoff_stations`, `duration`, `status`, `created_at`, `updated_at`) VALUES (211,136,'Addis Ababa','Bahir Dar','[\"Addis Ababa (Central Station)\"]','[\"Bahir Dar (Central Station)\"]',540,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(212,136,'Addis Ababa','Mekelle','[\"Addis Ababa (Central Station)\"]','[\"Mekelle (Central Station)\"]',750,'active','2026-09-14 21:28:47','2026-09-14 21:45:15'),(213,137,'Addis Ababa','Hawassa','[\"Addis Ababa (Central Station)\"]','[\"Hawassa (Central Station)\"]',315,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(214,137,'Addis Ababa','Arba Minch','[\"Addis Ababa (Central Station)\"]','[\"Arba Minch (Central Station)\"]',510,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(215,138,'Addis Ababa','Bahir Dar','[\"Addis Ababa (Central Station)\"]','[\"Bahir Dar (Central Station)\"]',540,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(216,138,'Addis Ababa','Gondar','[\"Addis Ababa (Central Station)\"]','[\"Gondar (Central Station)\"]',750,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(217,139,'Addis Ababa','Dessie','[\"Addis Ababa (Central Station)\"]','[\"Dessie (Central Station)\"]',420,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(218,139,'Addis Ababa','Adama','[\"Addis Ababa (Central Station)\"]','[\"Adama (Central Station)\"]',100,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(219,140,'Addis Ababa','Dire Dawa','[\"Addis Ababa (Central Station)\"]','[\"Dire Dawa (Central Station)\"]',510,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(220,141,'Addis Ababa','Jimma','[\"Addis Ababa (Central Station)\"]','[\"Jimma (Central Station)\"]',480,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(221,141,'Addis Ababa','Hawassa','[\"Addis Ababa (Central Station)\"]','[\"Hawassa (Central Station)\"]',315,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(222,142,'Addis Ababa','Bahir Dar','[\"Addis Ababa (Central Station)\"]','[\"Bahir Dar (Central Station)\"]',540,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(223,143,'Addis Ababa','Hawassa','[\"Addis Ababa (Central Station)\"]','[\"Hawassa (Central Station)\"]',315,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(224,144,'Addis Ababa','Mekelle','[\"Addis Ababa (Central Station)\"]','[\"Mekelle (Central Station)\"]',750,'active','2026-09-14 21:28:47','2026-09-14 21:28:47');
/*!40000 ALTER TABLE `routes` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `trips` WRITE;
/*!40000 ALTER TABLE `trips` DISABLE KEYS */;
INSERT INTO `trips` (`id`, `company_id`, `bus_id`, `route_id`, `departure_date`, `departure_time`, `arrival_time`, `price`, `status`, `cancellation_reason`, `created_at`, `updated_at`) VALUES (2941,136,241,211,'2026-09-14','06:30:00','15:30:00',900.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2942,136,241,211,'2026-09-15','06:30:00','15:30:00',950.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2943,136,241,211,'2026-09-16','06:30:00','15:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2944,136,241,211,'2026-09-17','06:30:00','15:30:00',900.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2945,136,241,211,'2026-09-18','06:30:00','15:30:00',950.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2946,136,241,211,'2026-09-19','06:30:00','15:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2947,136,241,211,'2026-09-20','06:30:00','15:30:00',900.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2948,136,241,211,'2026-09-21','06:30:00','15:30:00',950.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2949,136,241,211,'2026-09-22','06:30:00','15:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2950,136,241,211,'2026-09-23','06:30:00','15:30:00',900.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2951,136,241,211,'2026-09-24','06:30:00','15:30:00',950.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2952,136,241,211,'2026-09-25','06:30:00','15:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2953,136,241,211,'2026-09-26','06:30:00','15:30:00',900.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2954,136,241,211,'2026-09-27','06:30:00','15:30:00',950.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2955,136,241,212,'2026-09-14','05:30:00','18:00:00',1200.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2956,136,241,212,'2026-09-15','05:30:00','18:00:00',1250.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2957,136,241,212,'2026-09-16','05:30:00','18:00:00',1180.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2958,136,241,212,'2026-09-17','05:30:00','18:00:00',1200.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2959,136,241,212,'2026-09-18','05:30:00','18:00:00',1250.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2960,136,241,212,'2026-09-19','05:30:00','18:00:00',1180.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2961,136,241,212,'2026-09-20','05:30:00','18:00:00',1200.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2962,136,241,212,'2026-09-21','05:30:00','18:00:00',1250.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2963,136,241,212,'2026-09-22','05:30:00','18:00:00',1180.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2964,136,241,212,'2026-09-23','05:30:00','18:00:00',1200.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2965,136,241,212,'2026-09-24','05:30:00','18:00:00',1250.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2966,136,241,212,'2026-09-25','05:30:00','18:00:00',1180.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2967,136,241,212,'2026-09-26','05:30:00','18:00:00',1200.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2968,136,241,212,'2026-09-27','05:30:00','18:00:00',1250.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2969,137,244,213,'2026-09-14','07:00:00','12:15:00',500.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2970,137,244,213,'2026-09-15','07:00:00','12:15:00',520.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2971,137,244,213,'2026-09-16','07:00:00','12:15:00',480.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2972,137,244,213,'2026-09-17','07:00:00','12:15:00',500.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2973,137,244,213,'2026-09-18','07:00:00','12:15:00',520.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2974,137,244,213,'2026-09-19','07:00:00','12:15:00',480.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2975,137,244,213,'2026-09-20','07:00:00','12:15:00',500.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2976,137,244,213,'2026-09-21','07:00:00','12:15:00',520.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2977,137,244,213,'2026-09-22','07:00:00','12:15:00',480.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2978,137,244,213,'2026-09-23','07:00:00','12:15:00',500.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2979,137,244,213,'2026-09-24','07:00:00','12:15:00',520.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2980,137,244,213,'2026-09-25','07:00:00','12:15:00',480.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2981,137,244,213,'2026-09-26','07:00:00','12:15:00',500.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2982,137,244,213,'2026-09-27','07:00:00','12:15:00',520.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2983,137,244,214,'2026-09-14','08:00:00','16:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2984,137,244,214,'2026-09-15','08:00:00','16:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2985,137,244,214,'2026-09-16','08:00:00','16:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2986,137,244,214,'2026-09-17','08:00:00','16:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2987,137,244,214,'2026-09-18','08:00:00','16:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2988,137,244,214,'2026-09-19','08:00:00','16:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2989,137,244,214,'2026-09-20','08:00:00','16:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2990,137,244,214,'2026-09-21','08:00:00','16:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2991,137,244,214,'2026-09-22','08:00:00','16:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2992,137,244,214,'2026-09-23','08:00:00','16:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2993,137,244,214,'2026-09-24','08:00:00','16:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2994,137,244,214,'2026-09-25','08:00:00','16:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2995,137,244,214,'2026-09-26','08:00:00','16:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2996,137,244,214,'2026-09-27','08:00:00','16:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2997,138,246,215,'2026-09-14','10:30:00','19:30:00',850.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2998,138,246,215,'2026-09-15','10:30:00','19:30:00',820.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2999,138,246,215,'2026-09-16','10:30:00','19:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3000,138,246,215,'2026-09-17','10:30:00','19:30:00',850.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3001,138,246,215,'2026-09-18','10:30:00','19:30:00',820.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3002,138,246,215,'2026-09-19','10:30:00','19:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3003,138,246,215,'2026-09-20','10:30:00','19:30:00',850.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3004,138,246,215,'2026-09-21','10:30:00','19:30:00',820.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3005,138,246,215,'2026-09-22','10:30:00','19:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3006,138,246,215,'2026-09-23','10:30:00','19:30:00',850.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3007,138,246,215,'2026-09-24','10:30:00','19:30:00',820.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3008,138,246,215,'2026-09-25','10:30:00','19:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3009,138,246,215,'2026-09-26','10:30:00','19:30:00',850.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3010,138,246,215,'2026-09-27','10:30:00','19:30:00',820.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3011,138,246,216,'2026-09-14','06:00:00','18:30:00',1050.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3012,138,246,216,'2026-09-15','06:00:00','18:30:00',1000.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3013,138,246,216,'2026-09-16','06:00:00','18:30:00',1100.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3014,138,246,216,'2026-09-17','06:00:00','18:30:00',1050.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3015,138,246,216,'2026-09-18','06:00:00','18:30:00',1000.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3016,138,246,216,'2026-09-19','06:00:00','18:30:00',1100.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3017,138,246,216,'2026-09-20','06:00:00','18:30:00',1050.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3018,138,246,216,'2026-09-21','06:00:00','18:30:00',1000.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3019,138,246,216,'2026-09-22','06:00:00','18:30:00',1100.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3020,138,246,216,'2026-09-23','06:00:00','18:30:00',1050.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3021,138,246,216,'2026-09-24','06:00:00','18:30:00',1000.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3022,138,246,216,'2026-09-25','06:00:00','18:30:00',1100.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3023,138,246,216,'2026-09-26','06:00:00','18:30:00',1050.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3024,138,246,216,'2026-09-27','06:00:00','18:30:00',1000.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3025,139,248,217,'2026-09-14','08:30:00','15:30:00',600.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3026,139,248,217,'2026-09-15','08:30:00','15:30:00',620.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3027,139,248,217,'2026-09-16','08:30:00','15:30:00',580.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3028,139,248,217,'2026-09-17','08:30:00','15:30:00',600.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3029,139,248,217,'2026-09-18','08:30:00','15:30:00',620.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3030,139,248,217,'2026-09-19','08:30:00','15:30:00',580.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3031,139,248,217,'2026-09-20','08:30:00','15:30:00',600.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3032,139,248,217,'2026-09-21','08:30:00','15:30:00',620.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3033,139,248,217,'2026-09-22','08:30:00','15:30:00',580.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3034,139,248,217,'2026-09-23','08:30:00','15:30:00',600.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3035,139,248,217,'2026-09-24','08:30:00','15:30:00',620.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3036,139,248,217,'2026-09-25','08:30:00','15:30:00',580.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3037,139,248,217,'2026-09-26','08:30:00','15:30:00',600.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3038,139,248,217,'2026-09-27','08:30:00','15:30:00',620.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3039,139,248,218,'2026-09-14','09:00:00','10:40:00',220.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3040,139,248,218,'2026-09-15','09:00:00','10:40:00',240.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3041,139,248,218,'2026-09-16','09:00:00','10:40:00',210.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3042,139,248,218,'2026-09-17','09:00:00','10:40:00',220.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3043,139,248,218,'2026-09-18','09:00:00','10:40:00',240.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3044,139,248,218,'2026-09-19','09:00:00','10:40:00',210.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3045,139,248,218,'2026-09-20','09:00:00','10:40:00',220.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3046,139,248,218,'2026-09-21','09:00:00','10:40:00',240.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3047,139,248,218,'2026-09-22','09:00:00','10:40:00',210.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3048,139,248,218,'2026-09-23','09:00:00','10:40:00',220.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3049,139,248,218,'2026-09-24','09:00:00','10:40:00',240.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3050,139,248,218,'2026-09-25','09:00:00','10:40:00',210.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3051,139,248,218,'2026-09-26','09:00:00','10:40:00',220.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3052,139,248,218,'2026-09-27','09:00:00','10:40:00',240.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3053,140,250,219,'2026-09-14','06:45:00','15:15:00',820.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3054,140,250,219,'2026-09-15','06:45:00','15:15:00',850.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3055,140,250,219,'2026-09-16','06:45:00','15:15:00',800.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3056,140,250,219,'2026-09-17','06:45:00','15:15:00',820.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3057,140,250,219,'2026-09-18','06:45:00','15:15:00',850.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3058,140,250,219,'2026-09-19','06:45:00','15:15:00',800.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3059,140,250,219,'2026-09-20','06:45:00','15:15:00',820.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3060,140,250,219,'2026-09-21','06:45:00','15:15:00',850.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3061,140,250,219,'2026-09-22','06:45:00','15:15:00',800.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3062,140,250,219,'2026-09-23','06:45:00','15:15:00',820.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3063,140,250,219,'2026-09-24','06:45:00','15:15:00',850.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3064,140,250,219,'2026-09-25','06:45:00','15:15:00',800.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3065,140,250,219,'2026-09-26','06:45:00','15:15:00',820.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3066,140,250,219,'2026-09-27','06:45:00','15:15:00',850.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3067,141,252,220,'2026-09-14','07:30:00','15:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3068,141,252,220,'2026-09-15','07:30:00','15:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3069,141,252,220,'2026-09-16','07:30:00','15:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3070,141,252,220,'2026-09-17','07:30:00','15:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3071,141,252,220,'2026-09-18','07:30:00','15:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3072,141,252,220,'2026-09-19','07:30:00','15:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3073,141,252,220,'2026-09-20','07:30:00','15:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3074,141,252,220,'2026-09-21','07:30:00','15:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3075,141,252,220,'2026-09-22','07:30:00','15:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3076,141,252,220,'2026-09-23','07:30:00','15:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3077,141,252,220,'2026-09-24','07:30:00','15:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3078,141,252,220,'2026-09-25','07:30:00','15:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3079,141,252,220,'2026-09-26','07:30:00','15:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3080,141,252,220,'2026-09-27','07:30:00','15:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3081,141,252,221,'2026-09-14','09:30:00','14:45:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3082,141,252,221,'2026-09-15','09:30:00','14:45:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3083,141,252,221,'2026-09-16','09:30:00','14:45:00',460.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3084,141,252,221,'2026-09-17','09:30:00','14:45:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3085,141,252,221,'2026-09-18','09:30:00','14:45:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3086,141,252,221,'2026-09-19','09:30:00','14:45:00',460.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3087,141,252,221,'2026-09-20','09:30:00','14:45:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3088,141,252,221,'2026-09-21','09:30:00','14:45:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3089,141,252,221,'2026-09-22','09:30:00','14:45:00',460.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3090,141,252,221,'2026-09-23','09:30:00','14:45:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3091,141,252,221,'2026-09-24','09:30:00','14:45:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3092,141,252,221,'2026-09-25','09:30:00','14:45:00',460.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3093,141,252,221,'2026-09-26','09:30:00','14:45:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3094,141,252,221,'2026-09-27','09:30:00','14:45:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3095,142,254,222,'2026-09-14','07:00:00','16:00:00',880.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3096,142,254,222,'2026-09-15','07:00:00','16:00:00',860.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3097,142,254,222,'2026-09-16','07:00:00','16:00:00',900.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3098,142,254,222,'2026-09-17','07:00:00','16:00:00',880.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3099,142,254,222,'2026-09-18','07:00:00','16:00:00',860.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3100,142,254,222,'2026-09-19','07:00:00','16:00:00',900.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3101,142,254,222,'2026-09-20','07:00:00','16:00:00',880.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3102,142,254,222,'2026-09-21','07:00:00','16:00:00',860.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3103,142,254,222,'2026-09-22','07:00:00','16:00:00',900.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3104,142,254,222,'2026-09-23','07:00:00','16:00:00',880.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3105,142,254,222,'2026-09-24','07:00:00','16:00:00',860.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3106,142,254,222,'2026-09-25','07:00:00','16:00:00',900.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3107,142,254,222,'2026-09-26','07:00:00','16:00:00',880.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3108,142,254,222,'2026-09-27','07:00:00','16:00:00',860.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3109,143,255,223,'2026-09-14','06:15:00','11:30:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3110,143,255,223,'2026-09-15','06:15:00','11:30:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3111,143,255,223,'2026-09-16','06:15:00','11:30:00',470.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3112,143,255,223,'2026-09-17','06:15:00','11:30:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3113,143,255,223,'2026-09-18','06:15:00','11:30:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3114,143,255,223,'2026-09-19','06:15:00','11:30:00',470.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3115,143,255,223,'2026-09-20','06:15:00','11:30:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3116,143,255,223,'2026-09-21','06:15:00','11:30:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3117,143,255,223,'2026-09-22','06:15:00','11:30:00',470.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3118,143,255,223,'2026-09-23','06:15:00','11:30:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3119,143,255,223,'2026-09-24','06:15:00','11:30:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3120,143,255,223,'2026-09-25','06:15:00','11:30:00',470.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3121,143,255,223,'2026-09-26','06:15:00','11:30:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3122,143,255,223,'2026-09-27','06:15:00','11:30:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3123,144,256,224,'2026-09-14','20:00:00','08:30:00',1350.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3124,144,256,224,'2026-09-15','20:00:00','08:30:00',1400.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3125,144,256,224,'2026-09-16','20:00:00','08:30:00',1300.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3126,144,256,224,'2026-09-17','20:00:00','08:30:00',1350.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3127,144,256,224,'2026-09-18','20:00:00','08:30:00',1400.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3128,144,256,224,'2026-09-19','20:00:00','08:30:00',1300.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3129,144,256,224,'2026-09-20','20:00:00','08:30:00',1350.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3130,144,256,224,'2026-09-21','20:00:00','08:30:00',1400.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3131,144,256,224,'2026-09-22','20:00:00','08:30:00',1300.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3132,144,256,224,'2026-09-23','20:00:00','08:30:00',1350.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3133,144,256,224,'2026-09-24','20:00:00','08:30:00',1400.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3134,144,256,224,'2026-09-25','20:00:00','08:30:00',1300.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3135,144,256,224,'2026-09-26','20:00:00','08:30:00',1350.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3136,144,256,224,'2026-09-27','20:00:00','08:30:00',1400.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48');
/*!40000 ALTER TABLE `trips` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` (`id`, `name`, `email`, `phone`, `password_hash`, `role`, `status`, `created_at`, `updated_at`) VALUES (152,'Platform Admin','admin@ettransport.com','+251900000001','$2y$10$MXCB3lTl8m8mz.J1fFCnienbgBXkImsiZKdvgEMeoT7LzwX4Lgswy','admin','active','2026-09-14 21:28:47','2026-09-15 07:51:38'),(153,'Selam Bus Owner','owner.selambus@ettransport.com',NULL,'$2y$10$bRogVgfE6OOzbB3xVkxMQuCQwzIvphAvAu/5oLrecCWOdnPH34Eay','company','active','2026-09-14 21:28:47','2026-09-15 07:51:38'),(154,'Sky Bus Owner','owner.skybus@ettransport.com',NULL,'$2y$10$/gwAHXZuojFNpQ13iYxX0OggPW6QU/DsZjEV40h16VB1aCcapYEUG','company','active','2026-09-14 21:28:47','2026-09-15 07:51:38'),(155,'Yegna Bus Owner','owner.yegnabus@ettransport.com',NULL,'$2y$10$YVEXly0qjH9UOBA5z/6Raeh2QuWpGgWnCkBdVqAGR860Pd3aLZhsq','company','active','2026-09-14 21:28:47','2026-09-15 07:51:38'),(156,'Golden Bus Owner','owner.goldenbus@ettransport.com',NULL,'$2y$10$nXZ0QeE3so3e/pEhNPc0geKV9gN1J3PJJSBIUaQ781gwseiDppBgm','company','active','2026-09-14 21:28:47','2026-09-15 07:51:38'),(157,'Zemen Bus Owner','owner.zemenbus@ettransport.com',NULL,'$2y$10$phfpSddpwDv2l79NjkgJZOiMPTBY4Ld9uz7l0CauU9EwxIIayIQcW','company','active','2026-09-14 21:28:47','2026-09-15 07:51:39'),(158,'ODAA Bus Owner','owner.odaabus@ettransport.com',NULL,'$2y$10$DEmsOGbWvJh01L.DNKTgPeBvP/Okm7PSocSD.YwU2hxk2EEhbevmi','company','active','2026-09-14 21:28:47','2026-09-15 07:51:39'),(159,'Abay Bus Owner','owner.abaybus@ettransport.com',NULL,'$2y$10$uj5bBL9nKWYVGeJDxft/3utJlT.aCzNCFSCzprlX/zh9k2WLC9ViO','company','active','2026-09-14 21:28:47','2026-09-15 07:51:39'),(160,'Ethio Bus Owner','owner.ethiobus@ettransport.com',NULL,'$2y$10$O.rS4xE2afRU2Pz2ZirHku4pbnL4cIMw0kB9iC5j3N6556f/tPPd2','company','active','2026-09-14 21:28:47','2026-09-15 07:51:39'),(161,'Liyu Bus Owner','owner.liyubus@ettransport.com',NULL,'$2y$10$JlwqPaTfV2BH5Gtxt2D.3evtZ9LKYW0OkrZbgFZUp6XfiGhaADdM2','company','active','2026-09-14 21:28:47','2026-09-15 07:51:39'),(162,'Hanna Alem','hanna.alem@ettransport.com','+251 91 234 5566','$2y$10$4gaETzapEQJgExfgEz9FWeP.DJMf66J.q8LVW2Qjr5p03tYHcOvD.','passenger','active','2026-09-14 21:28:48','2026-09-15 07:51:39'),(163,'Debebe Jakson','walkin-debebe-jakson-904d7997@ettransport.local','+251936913118','$2y$10$eo8ipj20XMFotoB2gBADyuNjScIYnuAIdkJCmHNXHuj.NwlfyZ/BS','passenger','active','2026-09-15 03:50:29','2026-09-15 03:50:29');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- ============================================================
-- End of DATA SNAPSHOT
-- ============================================================
