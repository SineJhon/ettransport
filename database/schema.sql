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
--   bookings ──< booking_passengers, payments
--   users ──< bookings, reviews, notifications
--
-- Passwords are NEVER stored in plain text. They are stored with
-- PHP password_hash() in users.password_hash.
--
-- Recommended setup order (see database/README.md):
--   1) create this database, 2) import this file. On first use the app
--      automatically creates the development demo data (config/demo-seed.php).
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
  seat_count INT UNSIGNED NOT NULL DEFAULT 51
    CONSTRAINT chk_buses_seat_count CHECK (seat_count = 51),
  registration_number VARCHAR(50) DEFAULT NULL,
  status ENUM('active', 'maintenance', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_buses_company_registration (company_id, registration_number),
  KEY idx_buses_company (company_id),
  KEY idx_buses_status (status),
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
-- Bootstrap admin
-- Do NOT insert a password hash here. On a fresh database the app
-- auto-creates the demo admin (config/demo-seed.php). See database/README.md.
-- ============================================================

