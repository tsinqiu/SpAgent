const db = require('../db');
const config = require('../config');

const REQUIRED_SCHEMA = Object.freeze({
  Users: { columns: ['id', 'role', 'status'] },
  Activities: {
    columns: ['id', 'owner_user_id', 'data_source', 'is_manual', 'training_timestamp'],
    indexes: ['UQ_Activities_owner_garmin', 'IX_Activities_owner_training_timestamp']
  },
  ActivitySummaries: { columns: ['activity_id', 'activity_training_load'] },
  TrackPoints: {
    columns: [
      'activity_id',
      'sample_index',
      'sample_time_utc',
      'accuracy_m',
      'bearing_deg',
      'provider',
      'is_accepted',
      'reject_reason'
    ]
  },
  Shoes: {
    columns: [
      'id',
      'user_id',
      'name',
      'photo_path',
      'photo_original_name',
      'photo_mime_type',
      'photo_size_bytes',
      'target_distance_km',
      'initial_distance_km',
      'price'
    ]
  },
  DailyHealthSummaries: { columns: ['user_id', 'summary_date'] },
  SleepSummaries: { columns: ['user_id', 'sleep_date'] },
  TrainingStatusSnapshots: { columns: ['user_id', 'snapshot_date'] },
  TrainingPlans: {
    columns: ['id', 'user_id', 'start_date', 'week_phases', 'status', 'version', 'active_owner_id'],
    indexes: ['UQ_TrainingPlans_active_owner'],
    foreignKeys: ['FK_TrainingPlans_user']
  },
  TrainingSessions: {
    columns: ['id', 'plan_id', 'scheduled_date', 'status'],
    indexes: ['UQ_TrainingSessions_plan_date'],
    foreignKeys: ['FK_TrainingSessions_plan']
  },
  TrainingPreferences: {
    columns: ['user_id', 'goal_type', 'weekdays'],
    indexes: ['PRIMARY'],
    foreignKeys: ['FK_TrainingPreferences_user']
  },
  TrainingReminderPreferences: {
    columns: ['user_id', 'daily_training', 'weekly_report'],
    indexes: ['PRIMARY'],
    foreignKeys: ['FK_TrainingReminderPreferences_user']
  },
  TrainingReminders: {
    columns: ['id', 'user_id', 'kind', 'period_start', 'created_at', 'dismissed_at'],
    indexes: ['UQ_TrainingReminders_period'],
    foreignKeys: ['FK_TrainingReminders_user']
  },
  SyncJobs: {
    columns: ['id', 'status', 'active_provider', 'lease_token', 'lease_until', 'attempt_count'],
    indexes: ['UQ_SyncJobs_active_provider', 'IX_SyncJobs_worker_queue'],
    foreignKeys: ['FK_SyncJobs_user']
  },
  AgentConversations: {
    columns: ['id', 'user_id', 'title'],
    indexes: ['UQ_AgentConversations_owner'],
    foreignKeys: ['FK_AgentConversations_user']
  },
  AgentMessages: {
    columns: ['id', 'conversation_id', 'client_message_id', 'role', 'cards_json'],
    indexes: ['UQ_AgentMessages_turn_role'],
    foreignKeys: ['FK_AgentMessages_conversation']
  },
  AgentActions: {
    columns: ['id', 'user_id', 'status', 'expires_at', 'result_plan_id', 'payload_json'],
    indexes: ['UQ_AgentActions_message'],
    foreignKeys: ['FK_AgentActions_conversation_owner', 'FK_AgentActions_message']
  },
  TrainingSessionActivities: {
    columns: ['session_id', 'activity_id', 'link_method', 'comparison_json'],
    indexes: ['UQ_TrainingSessionActivities_activity'],
    foreignKeys: ['FK_TrainingSessionActivities_session', 'FK_TrainingSessionActivities_activity']
  },
  PlanRevisions: {
    columns: ['plan_id', 'action_id', 'from_version', 'to_version', 'diff_json', 'reason'],
    indexes: ['UQ_PlanRevisions_plan_version', 'UQ_PlanRevisions_action'],
    foreignKeys: ['FK_PlanRevisions_plan']
  },
  LoginAttempts: {
    columns: ['id', 'email', 'user_id', 'ip_address', 'user_agent', 'success', 'failure_reason', 'created_at'],
    indexes: ['IX_LoginAttempts_email_ip_time', 'IX_LoginAttempts_ip_time'],
    foreignKeys: ['FK_LoginAttempts_user']
  },
  SecurityEvents: {
    columns: [
      'id',
      'user_id',
      'event_type',
      'result',
      'ip_address',
      'user_agent',
      'resource_type',
      'resource_id',
      'detail_json',
      'created_at'
    ],
    indexes: ['IX_SecurityEvents_user_time', 'IX_SecurityEvents_type_time', 'IX_SecurityEvents_ip_time'],
    foreignKeys: ['FK_SecurityEvents_user']
  }
});

class DatabaseVerificationError extends Error {
  constructor(message, code, missing = undefined) {
    super(message);
    this.name = 'DatabaseVerificationError';
    this.code = code;
    this.missing = missing;
  }
}

function toKey(tableName, objectName) {
  return `${String(tableName).toLowerCase()}.${String(objectName).toLowerCase()}`;
}

function findMissing(rows, rowName, requirementName) {
  const available = new Set(rows.map((row) => toKey(row.tableName, row[rowName])));
  const missing = [];

  for (const [tableName, definition] of Object.entries(REQUIRED_SCHEMA)) {
    for (const objectName of definition[requirementName] || []) {
      const key = toKey(tableName, objectName);
      if (!available.has(key)) missing.push(`${tableName}.${objectName}`);
    }
  }

  return missing;
}

async function verifyDatabase({ query = db.query, databaseName = config.db.database } = {}) {
  try {
    const pingRows = await query('SELECT 1 AS ok');
    if (pingRows[0]?.ok !== 1) {
      throw new Error('database ping returned an unexpected result');
    }

    const columns = await query(
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ?`,
      [databaseName]
    );
    const indexes = await query(
      `SELECT DISTINCT TABLE_NAME AS tableName, INDEX_NAME AS indexName
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ?`,
      [databaseName]
    );
    const foreignKeys = await query(
      `SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS constraintName
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
      [databaseName]
    );

    const missing = {
      columns: findMissing(columns, 'columnName', 'columns'),
      indexes: findMissing(indexes, 'indexName', 'indexes'),
      foreignKeys: findMissing(foreignKeys, 'constraintName', 'foreignKeys')
    };
    const missingItems = Object.values(missing).flat();

    if (missingItems.length) {
      throw new DatabaseVerificationError(
        `Database schema is incomplete: ${missingItems.join(', ')}. `
          + 'For a new empty database, run npm run db:init. '
          + 'Apply npm run db:migrate to install the current planning and coach schema. '
          + 'For an existing database, consult database/README.md before applying migrations.',
        'DATABASE_SCHEMA_INCOMPLETE',
        missing
      );
    }

    return {
      status: 'ready',
      database: databaseName,
      checkedTables: Object.keys(REQUIRED_SCHEMA).length
    };
  } catch (error) {
    if (error instanceof DatabaseVerificationError) throw error;
    throw new DatabaseVerificationError(
      `Cannot connect to database ${databaseName}. Start MySQL and check the DB_* configuration.`,
      'DATABASE_UNAVAILABLE'
    );
  }
}

module.exports = {
  DatabaseVerificationError,
  REQUIRED_SCHEMA,
  verifyDatabase
};
