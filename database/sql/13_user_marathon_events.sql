-- Incremental migration 13: Per-user saved target marathon events ("我的赛事")
-- Persists user-saved target races in MySQL so they sync across devices and inform the AI Coach.

CREATE TABLE IF NOT EXISTS UserMarathonEvents (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  event_key VARCHAR(96) NOT NULL,
  name VARCHAR(255) NOT NULL,
  event_date DATE NULL,
  city VARCHAR(128) NOT NULL DEFAULT '',
  distance VARCHAR(64) NOT NULL DEFAULT '',
  goal VARCHAR(128) NOT NULL DEFAULT '',
  note TEXT NULL,
  source_url VARCHAR(512) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY UQ_UserMarathonEvents_user_key (user_id, event_key),
  KEY IX_UserMarathonEvents_user_date (user_id, event_date),
  CONSTRAINT FK_UserMarathonEvents_user FOREIGN KEY (user_id) REFERENCES Users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
