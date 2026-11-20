SET @training_timestamp_change = IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND LOWER(table_name) = 'activities' AND column_name = 'training_timestamp'
  ),
  'SELECT 1',
  'ALTER TABLE Activities ADD COLUMN training_timestamp DATETIME(3) GENERATED ALWAYS AS (
    CASE WHEN data_source = ''live_workout'' OR local_start_time IS NULL
      THEN DATE_ADD(start_time_utc, INTERVAL 8 HOUR) ELSE local_start_time END
  ) VIRTUAL'
);
PREPARE training_timestamp_statement FROM @training_timestamp_change;
EXECUTE training_timestamp_statement;
DEALLOCATE PREPARE training_timestamp_statement;

SET @training_timestamp_index_change = IF(
  EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND LOWER(table_name) = 'activities' AND index_name = 'IX_Activities_owner_training_timestamp'
  ),
  'SELECT 1',
  'ALTER TABLE Activities ADD INDEX IX_Activities_owner_training_timestamp (owner_user_id, training_timestamp)'
);
PREPARE training_timestamp_index_statement FROM @training_timestamp_index_change;
EXECUTE training_timestamp_index_statement;
DEALLOCATE PREPARE training_timestamp_index_statement;
