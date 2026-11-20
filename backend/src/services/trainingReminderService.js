const db = require('../db');
const { ApiError } = require('../errors');
const { addDays, localToday, mondayOf } = require('./trainingPlanInput');

async function getPreferences(userId) {
  const [row] = await db.query(`
    SELECT daily_training AS dailyTraining, weekly_report AS weeklyReport
    FROM TrainingReminderPreferences WHERE user_id = ?`, [userId]);
  return { dailyTraining: Boolean(row?.dailyTraining), weeklyReport: Boolean(row?.weeklyReport) };
}

async function savePreferences(userId, body) {
  const { dailyTraining, weeklyReport } = body ?? {};
  if (typeof dailyTraining !== 'boolean' || typeof weeklyReport !== 'boolean') {
    throw new ApiError(400, 'Both reminder preferences must be booleans', 'INVALID_REMINDER_PREFERENCES');
  }
  await db.query(`
    INSERT INTO TrainingReminderPreferences (user_id, daily_training, weekly_report)
    VALUES (?, ?, ?) AS settings
    ON DUPLICATE KEY UPDATE daily_training = settings.daily_training, weekly_report = settings.weekly_report`,
  [userId, dailyTraining, weeklyReport]);
  return { dailyTraining, weeklyReport };
}

async function dueReminders(userId, today) {
  const weekStart = mondayOf(today);
  const previousWeekStart = addDays(weekStart, -7);
  const [due] = await db.query(`
    SELECT p.id AS planId, s.id AS sessionId, s.title AS sessionTitle,
      CASE WHEN prefs.weekly_report THEN
        EXISTS (
          SELECT 1 FROM Activities a
          WHERE a.owner_user_id = prefs.user_id AND a.training_timestamp >= ? AND a.training_timestamp < ?
        ) OR EXISTS (
          SELECT 1 FROM TrainingPlans prior
          INNER JOIN TrainingSessions done ON done.plan_id = prior.id
          WHERE prior.user_id = prefs.user_id AND prior.status IN ('active', 'archived')
            AND done.scheduled_date >= ? AND done.scheduled_date < ? AND done.status IN ('completed', 'skipped')
        )
      ELSE 0 END AS weeklyDue
    FROM TrainingReminderPreferences prefs
    LEFT JOIN TrainingPlans p ON prefs.daily_training = TRUE AND p.active_owner_id = prefs.user_id
    LEFT JOIN TrainingSessions s ON s.plan_id = p.id AND s.scheduled_date = ? AND s.status = 'pending'
    WHERE prefs.user_id = ?`,
  [previousWeekStart, weekStart, previousWeekStart, weekStart, today, userId]);

  const reminders = [];
  if (due?.sessionId) {
    const { planId, sessionId, sessionTitle } = due;
    reminders.push({ kind: 'daily_training', periodStart: today, planId, sessionId, sessionTitle });
  }
  if (due?.weeklyDue) reminders.push({ kind: 'weekly_report', periodStart: previousWeekStart });
  return reminders;
}

function reminderKey({ kind, periodStart }) {
  return `${kind}:${periodStart}`;
}

async function findReminders(userId, due) {
  const pairs = due.map(() => '(?, ?)').join(', ');
  const rows = await db.query(`
    SELECT id, kind, period_start AS periodStart, dismissed_at AS dismissedAt
    FROM TrainingReminders WHERE user_id = ? AND (kind, period_start) IN (${pairs})`,
  [userId, ...due.flatMap(({ kind, periodStart }) => [kind, periodStart])]);
  return new Map(rows.map(row => [reminderKey(row), row]));
}

async function list(userId, asOf = localToday()) {
  const due = await dueReminders(userId, asOf);
  if (!due.length) return { asOf, reminders: [] };

  let stored = await findReminders(userId, due);
  const missing = due.filter(reminder => !stored.has(reminderKey(reminder)));
  if (missing.length) {
    const values = missing.map(() => '(?, ?, ?)').join(', ');
    await db.query(`
      INSERT INTO TrainingReminders (user_id, kind, period_start) VALUES ${values}
      ON DUPLICATE KEY UPDATE id = TrainingReminders.id`,
    missing.flatMap(({ kind, periodStart }) => [userId, kind, periodStart]));
    stored = await findReminders(userId, due);
  }

  const reminders = due.flatMap(reminder => {
    const row = stored.get(reminderKey(reminder));
    return row && !row.dismissedAt ? [{ id: row.id, ...reminder }] : [];
  });
  return { asOf, reminders };
}

async function dismiss(userId, reminderId) {
  const result = await db.query(`
    UPDATE TrainingReminders SET dismissed_at = COALESCE(dismissed_at, CURRENT_TIMESTAMP(3))
    WHERE user_id = ? AND id = ?`, [userId, reminderId]);
  if (!result.affectedRows) {
    const [row] = await db.query('SELECT id FROM TrainingReminders WHERE user_id = ? AND id = ?', [userId, reminderId]);
    if (!row) throw new ApiError(404, 'Reminder not found', 'REMINDER_NOT_FOUND');
  }
  return { dismissed: true };
}

module.exports = { getPreferences, savePreferences, list, dismiss };
