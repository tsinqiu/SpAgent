-- Incremental migration 12: Automated crawled upcoming marathon events (Half & Full Marathon only)
-- Idempotent migration safe for repeated execution on existing databases.

CREATE TABLE IF NOT EXISTS MarathonEvents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_site VARCHAR(64) NOT NULL DEFAULT 'chinamarathon',
  source_event_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  event_date DATE NOT NULL,
  province VARCHAR(64) NOT NULL DEFAULT '',
  city VARCHAR(96) NOT NULL DEFAULT '',
  location_detail VARCHAR(255) NOT NULL DEFAULT '',
  race_category ENUM('full', 'half', 'full_half') NOT NULL,
  distance_label VARCHAR(64) NOT NULL,
  registration_status VARCHAR(64) NOT NULL DEFAULT '',
  registration_deadline DATE NULL,
  summary TEXT NULL,
  cover_url VARCHAR(512) NULL,
  source_url VARCHAR(512) NOT NULL,
  crawled_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY UQ_MarathonEvents_source (source_site, source_event_id),
  KEY IX_MarathonEvents_date_category (event_date, race_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
