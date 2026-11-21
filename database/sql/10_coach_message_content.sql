-- Keep the API input limit. Widen storage for verified record lists and cited replies.
SET @widen_coach_message = IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND LOWER(table_name) = 'agentmessages'
      AND column_name = 'content' AND data_type = 'varchar'
  ),
  'ALTER TABLE AgentMessages MODIFY COLUMN content TEXT NOT NULL',
  'SELECT 1'
);
PREPARE widen_coach_message FROM @widen_coach_message;
EXECUTE widen_coach_message;
DEALLOCATE PREPARE widen_coach_message;
