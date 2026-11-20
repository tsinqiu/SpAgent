CREATE TABLE IF NOT EXISTS TrainingReminderPreferences (
  user_id INT NOT NULL PRIMARY KEY,
  daily_training BOOLEAN NOT NULL DEFAULT FALSE,
  weekly_report BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT FK_TrainingReminderPreferences_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS TrainingReminders (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  kind ENUM('daily_training', 'weekly_report') NOT NULL,
  period_start DATE NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  dismissed_at TIMESTAMP(3) NULL DEFAULT NULL,
  UNIQUE KEY UQ_TrainingReminders_period (user_id, kind, period_start),
  CONSTRAINT FK_TrainingReminders_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
