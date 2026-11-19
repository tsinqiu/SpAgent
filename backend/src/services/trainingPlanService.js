const db = require('../db');
const { ApiError } = require('../errors');
const { addDays, localToday, weekdayLabels } = require('./trainingPlanInput');

const planColumns = `p.id, p.name, p.sport AS type, p.goal_type AS goalType,
  p.goal_description AS goal, p.start_date AS startDate, p.week_phases AS phases,
  p.status, p.version, p.created_at AS createdAt, p.updated_at AS updatedAt`;
const sessionColumns = `id, scheduled_date AS date, type, title, subtitle, note,
  distance_m AS distanceM, duration_s AS durationS, status`;
const sessionFields = ['type', 'title', 'subtitle', 'note', 'distanceM', 'durationS'];

function missing() {
  return new ApiError(404, 'Training plan or session not found', 'TRAINING_PLAN_NOT_FOUND');
}

function conflict(message, code = 'TRAINING_PLAN_CONFLICT') {
  return new ApiError(409, message, code);
}

function weekView(row, sessions, completedCount, sessionCount) {
  const { phases: storedPhases, ...plan } = row;
  const phases = typeof storedPhases === 'string' ? JSON.parse(storedPhases) : storedPhases;
  const today = localToday();
  const currentWeek = phases.findLastIndex((_, i) => addDays(plan.startDate, i * 7) <= today) + 1;
  const byDate = new Map(sessions?.map(session => [session.date, session]));
  const weekdays = new Set();
  const sessionsByWeek = [];
  const weeks = phases.map((phase, index) => {
    const week = { week: index + 1, phase };
    if (sessions) {
      week.days = weekdayLabels.map((_, dayIndex) => {
        const date = addDays(plan.startDate, index * 7 + dayIndex);
        const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
        const session = byDate.get(date);
        if (session) weekdays.add(weekday + 1);
        return { ...(session || { title: '休息日', type: 'rest', status: 'rest' }), date, day: weekdayLabels[weekday] };
      });
      sessionsByWeek.push(week.days.filter(day => day.id).length);
    }
    return week;
  });
  return {
    ...plan, weeks, currentWeek: currentWeek || 1, sessionCount, completedCount,
    progress: sessionCount ? Math.round(completedCount / sessionCount * 100) : 0,
    ...(sessions && {
      availableWeekdays: [...weekdays].sort(),
      weeklyFrequency: sessionsByWeek.every(count => count === sessionsByWeek[0]) ? sessionsByWeek[0] : null
    })
  };
}

async function list(userId) {
  const rows = await db.query(`
    SELECT ${planColumns},
      (SELECT COUNT(*) FROM TrainingSessions s WHERE s.plan_id = p.id) AS sessionCount,
      (SELECT COUNT(*) FROM TrainingSessions s WHERE s.plan_id = p.id AND s.status = 'completed') AS completedCount
    FROM TrainingPlans p WHERE p.user_id = ?
    ORDER BY FIELD(p.status, 'active', 'draft', 'archived'), p.id DESC`, [userId]);
  return rows.map(({ completedCount, sessionCount, ...row }) => (
    weekView(row, null, Number(completedCount), Number(sessionCount))
  ));
}

async function findPlan(connection, userId, planId, lock = false) {
  const [[plan]] = await connection.execute(
    `SELECT ${planColumns} FROM TrainingPlans p WHERE p.id = ? AND p.user_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [planId, userId]
  );
  if (!plan) throw missing();
  return plan;
}

async function getSessions(connection, planId) {
  const [rows] = await connection.execute(
    `SELECT ${sessionColumns} FROM TrainingSessions WHERE plan_id = ? ORDER BY scheduled_date`,
    [planId]
  );
  return rows;
}

async function detail(connection, userId, planId) {
  const plan = await findPlan(connection, userId, planId);
  const sessions = await getSessions(connection, planId);
  return weekView(plan, sessions, sessions.filter(s => s.status === 'completed').length, sessions.length);
}

function get(userId, planId) {
  return db.transaction(connection => detail(connection, userId, planId));
}

function planValues(plan) {
  return [plan.name, plan.type, plan.goalType, plan.goal, plan.startDate, JSON.stringify(plan.phases)];
}

function insertSessions(connection, planId, sessions) {
  if (!sessions.length) return;
  return connection.query(`
    INSERT INTO TrainingSessions (plan_id, scheduled_date, type, title, subtitle, note, distance_m, duration_s)
    VALUES ?`, [sessions.map(session => [planId, session.date, ...sessionFields.map(key => session[key])])]);
}

async function createInTransaction(connection, userId, plan, status = 'draft') {
  let result;
  try {
    [result] = await connection.execute(`
      INSERT INTO TrainingPlans
      (user_id, name, sport, goal_type, goal_description, start_date, week_phases, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [userId, ...planValues(plan), status]);
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY' || status !== 'active') throw error;
    throw conflict('Another plan is currently active', 'ACTIVE_TRAINING_PLAN_EXISTS');
  }
  await insertSessions(connection, result.insertId, plan.sessions);
  return result.insertId;
}

function create(userId, plan) {
  return db.transaction(async connection => {
    const id = await createInTransaction(connection, userId, plan);
    return detail(connection, userId, id);
  });
}

async function getActive(userId) {
  const [plan] = await db.query(`
    SELECT id, name, version FROM TrainingPlans WHERE user_id = ? AND status = 'active' LIMIT 1`, [userId]);
  return plan || null;
}

function change(userId, planId, version, action) {
  return db.transaction(async connection => {
    const plan = await findPlan(connection, userId, planId, true);
    if (plan.version !== version) throw conflict('Reload the plan before saving changes', 'TRAINING_PLAN_VERSION_CONFLICT');
    if (plan.status === 'archived') throw conflict('Archived plans are read-only');
    return action(connection, plan);
  });
}

function update(userId, planId, version, next) {
  return change(userId, planId, version, async (connection, plan) => {
    if (plan.status === 'active' && (plan.startDate !== next.startDate || plan.type !== next.type)) {
      throw conflict('An active plan keeps its start date and sport');
    }
    const existing = await getSessions(connection, planId);
    const requested = new Map(next.sessions.map(session => [session.date, session]));
    for (const session of existing) {
      const replacement = requested.get(session.date);
      const unchanged = replacement && sessionFields.every(key => session[key] === replacement[key]);
      if (session.status !== 'pending' && !unchanged) {
        throw conflict('Completed and skipped sessions keep their original dates and details');
      }
      if (!replacement) {
        await connection.execute('DELETE FROM TrainingSessions WHERE plan_id = ? AND id = ?', [planId, session.id]);
      } else if (!unchanged) {
        await connection.execute(`
          UPDATE TrainingSessions SET type = ?, title = ?, subtitle = ?, note = ?, distance_m = ?, duration_s = ?
          WHERE plan_id = ? AND id = ?`, [...sessionFields.map(key => replacement[key]), planId, session.id]);
      }
      requested.delete(session.date);
    }
    await insertSessions(connection, planId, [...requested.values()]);
    await connection.execute(`
      UPDATE TrainingPlans
      SET name = ?, sport = ?, goal_type = ?, goal_description = ?, start_date = ?, week_phases = ?, version = version + 1
      WHERE id = ? AND user_id = ?`, [...planValues(next), planId, userId]);
    return detail(connection, userId, planId);
  });
}

function setStatus(userId, planId, version, status) {
  return change(userId, planId, version, async (connection, plan) => {
    if (plan.status === status) return detail(connection, userId, planId);
    try {
      await connection.execute(
        'UPDATE TrainingPlans SET status = ?, version = version + 1 WHERE id = ? AND user_id = ?',
        [status, planId, userId]
      );
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      throw conflict('Archive the active plan before starting another', 'ACTIVE_TRAINING_PLAN_EXISTS');
    }
    return detail(connection, userId, planId);
  });
}

function setSessionStatus(userId, planId, sessionId, version, status) {
  return change(userId, planId, version, async (connection, plan) => {
    if (plan.status !== 'active') throw conflict('Activate the plan before recording progress');
    const [[session]] = await connection.execute(
      'SELECT status FROM TrainingSessions WHERE id = ? AND plan_id = ?', [sessionId, planId]
    );
    if (!session) throw missing();
    if (session.status !== status) {
      await connection.execute(
        'UPDATE TrainingSessions SET status = ? WHERE id = ? AND plan_id = ?', [status, sessionId, planId]
      );
      await connection.execute(
        'UPDATE TrainingPlans SET version = version + 1 WHERE id = ? AND user_id = ?', [planId, userId]
      );
    }
    return detail(connection, userId, planId);
  });
}

function remove(userId, planId, version) {
  return change(userId, planId, version, async (connection, plan) => {
    if (plan.status !== 'draft') throw conflict('Only draft plans can be deleted');
    await connection.execute('DELETE FROM TrainingPlans WHERE id = ? AND user_id = ?', [planId, userId]);
    return { id: planId, deleted: true };
  });
}

module.exports = { list, get, create, createInTransaction, getActive, update, setStatus, setSessionStatus, remove };
