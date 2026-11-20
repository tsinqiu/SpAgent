SET @add_garmin_lease = IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND LOWER(table_name) = 'syncjobs' AND column_name = 'lease_until'
  ),
  'SELECT 1',
  'ALTER TABLE SyncJobs
    ADD COLUMN lease_token CHAR(36) DEFAULT NULL,
    ADD COLUMN lease_until DATETIME(3) DEFAULT NULL,
    ADD COLUMN attempt_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN active_provider VARCHAR(40) GENERATED ALWAYS AS (
      CASE WHEN provider = ''garmin'' AND status IN (''queued'', ''running'') THEN provider ELSE NULL END
    ) VIRTUAL,
    ADD KEY IX_SyncJobs_worker_queue (provider, status, lease_until, id)'
);
PREPARE add_garmin_lease FROM @add_garmin_lease;
EXECUTE add_garmin_lease;
DEALLOCATE PREPARE add_garmin_lease;

SET @needs_garmin_guard = NOT EXISTS (
  SELECT 1 FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND LOWER(table_name) = 'syncjobs' AND index_name = 'UQ_SyncJobs_active_provider'
);

-- Unfinished jobs from the synchronous version have no restart information.
-- Keep their history and allow the user to submit a recoverable job.
UPDATE SyncJobs
SET status = 'failed', finished_at = CURRENT_TIMESTAMP(3),
    error_message = '同步在升级前中断，请重新发起。'
WHERE @needs_garmin_guard AND provider = 'garmin' AND status IN ('queued', 'running');

SET @add_garmin_guard = IF(
  @needs_garmin_guard,
  'ALTER TABLE SyncJobs ADD UNIQUE KEY UQ_SyncJobs_active_provider (user_id, active_provider)',
  'SELECT 1'
);
PREPARE add_garmin_guard FROM @add_garmin_guard;
EXECUTE add_garmin_guard;
DEALLOCATE PREPARE add_garmin_guard;
