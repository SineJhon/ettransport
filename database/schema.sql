-- ============================================================
-- ET Transport — database schema
-- MySQL / MariaDB (XAMPP compatible) · Engine: InnoDB · utf8mb4
--
-- The database is the eventual source of truth for the platform.
-- Three user roles only: passenger · company · admin  (no super admin)
--
-- Relationship overview:
--   users ──< companies (company owner account)
--   companies ──< buses, trips
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
-- status supports the admin approval workflow:
--   pending → approved → suspended | rejected
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
-- buses — fleet vehicles owned by a company
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  model VARCHAR(120) DEFAULT NULL,
  bus_type ENUM('standard', 'luxury', 'vip') NOT NULL DEFAULT 'standard',
  seat_count INT UNSIGNED NOT NULL DEFAULT 45,
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

-- ============================================================
-- Bootstrap admin
-- Do NOT insert a password hash here. On a fresh database the app
-- auto-creates the demo admin (config/demo-seed.php). See database/README.md.
-- ============================================================

