CREATE TABLE IF NOT EXISTS TrainingPreferences (
  user_id INT NOT NULL PRIMARY KEY,
  goal_type ENUM('first_5k', 'regular_running') DEFAULT NULL,
  weekdays JSON NOT NULL,
  CONSTRAINT FK_TrainingPreferences_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
