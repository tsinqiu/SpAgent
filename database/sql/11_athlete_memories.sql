-- Incremental migration 11: Persistent per-user athlete memory for the AI Coach Agent.
-- Safe to run repeatedly on existing SpAgent / motionanalysis databases.

CREATE TABLE IF NOT EXISTS AthleteMemories (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'note',
  content VARCHAR(500) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'agent',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY IX_AthleteMemories_user_updated (user_id, updated_at),
  CONSTRAINT FK_AthleteMemories_user FOREIGN KEY (user_id) REFERENCES Users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
