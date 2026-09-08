-- Run once for databases created before the guided parcel-status workflow.
ALTER TABLE parcels
  MODIFY status ENUM('received', 'sent', 'delivered', 'picked_up', 'returned_to_sender', 'lost')
  NOT NULL DEFAULT 'received';

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

-- Bring existing paid parcels into revenue reporting exactly once.
INSERT IGNORE INTO parcel_payments (parcel_id, company_id, amount, method, status, created_at)
SELECT id, company_id, price, 'cash', 'paid', created_at FROM parcels;
