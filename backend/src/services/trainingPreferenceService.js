const db = require('../db');
const { ApiError } = require('../errors');
const { runningGoalTypes } = require('./trainingPlanInput');

function emptyPreferences() {
  return { goalType: null, weekdays: [] };
}

function readPreferences(body) {
  const { goalType, weekdays } = body ?? {};
  if (goalType !== null && !runningGoalTypes.includes(goalType)) {
    throw new ApiError(400, 'Choose a supported goal or null', 'INVALID_TRAINING_PREFERENCES');
  }
  if (!Array.isArray(weekdays) ||
      (weekdays.length !== 0 && (weekdays.length < 2 || weekdays.length > 4)) ||
      weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7) ||
      new Set(weekdays).size !== weekdays.length) {
    throw new ApiError(400, 'Choose 2–4 distinct weekdays (Monday is 1) or an empty list', 'INVALID_TRAINING_PREFERENCES');
  }
  return { goalType, weekdays: weekdays.toSorted() };
}

async function get(userId) {
  const [row] = await db.query('SELECT goal_type AS goalType, weekdays FROM TrainingPreferences WHERE user_id = ?', [userId]);
  if (!row) return emptyPreferences();
  return { goalType: row.goalType, weekdays: typeof row.weekdays === 'string' ? JSON.parse(row.weekdays) : row.weekdays };
}

async function clear(userId) {
  await db.query('DELETE FROM TrainingPreferences WHERE user_id = ?', [userId]);
  return emptyPreferences();
}

async function save(userId, preferences) {
  const { goalType, weekdays } = readPreferences(preferences);
  if (goalType === null && !weekdays.length) return clear(userId);
  await db.query(`
    INSERT INTO TrainingPreferences (user_id, goal_type, weekdays)
    VALUES (?, ?, ?) AS prefs
    ON DUPLICATE KEY UPDATE goal_type = prefs.goal_type, weekdays = prefs.weekdays`,
  [userId, goalType, JSON.stringify(weekdays)]);
  return { goalType, weekdays };
}

module.exports = { get, save, clear };
