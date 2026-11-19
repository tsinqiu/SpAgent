CREATE TABLE IF NOT EXISTS TrainingPlans (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  sport VARCHAR(20) NOT NULL,
  goal_type VARCHAR(24) NOT NULL,
  goal_description VARCHAR(500) NOT NULL,
  start_date DATE NOT NULL,
  week_phases JSON NOT NULL,
  status ENUM('draft', 'active', 'archived') NOT NULL DEFAULT 'draft',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  active_owner_id INT GENERATED ALWAYS AS (CASE WHEN status = 'active' THEN user_id ELSE NULL END) VIRTUAL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY UQ_TrainingPlans_active_owner (active_owner_id),
  KEY IX_TrainingPlans_user_status (user_id, status, id),
  CONSTRAINT FK_TrainingPlans_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS TrainingSessions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL,
  scheduled_date DATE NOT NULL,
  type ENUM('easy', 'aerobic', 'recovery', 'other') NOT NULL,
  title VARCHAR(160) NOT NULL,
  subtitle VARCHAR(240) NOT NULL DEFAULT '',
  note VARCHAR(500) NOT NULL DEFAULT '',
  distance_m INT UNSIGNED DEFAULT NULL,
  duration_s INT UNSIGNED DEFAULT NULL,
  status ENUM('pending', 'completed', 'skipped') NOT NULL DEFAULT 'pending',
  UNIQUE KEY UQ_TrainingSessions_plan_date (plan_id, scheduled_date),
  CONSTRAINT FK_TrainingSessions_plan FOREIGN KEY (plan_id) REFERENCES TrainingPlans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
