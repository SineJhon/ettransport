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
