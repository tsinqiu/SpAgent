CREATE TABLE IF NOT EXISTS TrainingSessionActivities (
  session_id INT NOT NULL PRIMARY KEY,
  activity_id INT DEFAULT NULL,
  link_method ENUM('manual', 'automatic') NOT NULL,
  comparison_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY UQ_TrainingSessionActivities_activity (activity_id),
  CONSTRAINT FK_TrainingSessionActivities_session FOREIGN KEY (session_id)
    REFERENCES TrainingSessions(id) ON DELETE CASCADE,
  CONSTRAINT FK_TrainingSessionActivities_activity FOREIGN KEY (activity_id)
    REFERENCES Activities(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS PlanRevisions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL,
  action_id INT DEFAULT NULL,
  from_version INT UNSIGNED NOT NULL,
  to_version INT UNSIGNED NOT NULL,
  diff_json JSON NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY UQ_PlanRevisions_plan_version (plan_id, to_version),
  UNIQUE KEY UQ_PlanRevisions_action (action_id),
  CONSTRAINT FK_PlanRevisions_plan FOREIGN KEY (plan_id) REFERENCES TrainingPlans(id) ON DELETE CASCADE,
  CONSTRAINT FK_PlanRevisions_action FOREIGN KEY (action_id) REFERENCES AgentActions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @garmin_index_change = IF(
  EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND LOWER(table_name) = 'activities' AND index_name = 'UQ_Activities_garmin_activity_id'
  ),
  'ALTER TABLE Activities DROP INDEX UQ_Activities_garmin_activity_id, ADD UNIQUE INDEX UQ_Activities_owner_garmin (owner_user_id, garmin_activity_id)',
  'SELECT 1'
);
PREPARE garmin_index_statement FROM @garmin_index_change;
EXECUTE garmin_index_statement;
DEALLOCATE PREPARE garmin_index_statement;
