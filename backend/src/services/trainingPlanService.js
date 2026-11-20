const db = require('../db');
const { ApiError } = require('../errors');
const { parseDate } = require('../http');
const { addDays, localToday, mondayOf, readPlan, weekdayLabels } = require('./trainingPlanInput');
const { executionView } = require('./trainingExecutionService');

const planColumns = `p.id, p.name, p.sport AS type, p.goal_type AS goalType,
  p.goal_description AS goal, p.start_date AS startDate, p.week_phases AS phases,
  p.status, p.version, p.created_at AS createdAt, p.updated_at AS updatedAt`;
const sessionColumns = `s.id, s.scheduled_date AS date, s.type, s.title, s.subtitle, s.note,
  s.distance_m AS distanceM, s.duration_s AS durationS, s.status`;
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
    `SELECT ${sessionColumns}, e.activity_id AS activityId, e.comparison_json AS snapshot, e.created_at AS linkedAt
      FROM TrainingSessions s LEFT JOIN TrainingSessionActivities e ON e.session_id = s.id
      WHERE s.plan_id = ? ORDER BY s.scheduled_date`,
    [planId]
  );
  return rows.map(({ activityId, snapshot, linkedAt, ...row }) => ({
    ...row, execution: executionView({ activityId, snapshot, linkedAt })
  }));
}

async function detail(connection, userId, planId) {
  const plan = await findPlan(connection, userId, planId);
  const sessions = await getSessions(connection, planId);
  return weekView(plan, sessions, sessions.filter(s => s.status === 'completed').length, sessions.length);
}

function get(userId, planId) {
  return db.transaction(connection => detail(connection, userId, planId));
}

function listWeeklySessions(userId, startDate, endDate) {
  return db.query(`
    SELECT p.id AS planId, p.name AS planName, p.status AS planStatus,
      s.id, s.scheduled_date AS date, s.title, s.status, e.activity_id AS activityId
    FROM TrainingPlans p JOIN TrainingSessions s ON s.plan_id = p.id
    LEFT JOIN TrainingSessionActivities e ON e.session_id = s.id
    WHERE p.user_id = ? AND s.scheduled_date BETWEEN ? AND ?
      AND (p.status = 'active' OR (p.status = 'archived' AND s.status <> 'pending'))
    ORDER BY s.scheduled_date, s.id`, [userId, startDate, endDate]);
}

async function getToday(userId, date = localToday()) {
  const [row] = await db.query(`
    SELECT p.id AS planId, p.name AS planName, p.start_date AS startDate,
      ${sessionColumns}, e.activity_id AS activityId
    FROM TrainingPlans p
    LEFT JOIN TrainingSessions s ON s.plan_id = p.id AND s.scheduled_date = ?
    LEFT JOIN TrainingSessionActivities e ON e.session_id = s.id
    WHERE p.user_id = ? AND p.status = 'active'
    LIMIT 1`, [date, userId]);
  if (!row) return { date, plan: null, session: null };
  const { planId, planName, startDate, ...session } = row;
  return { date, plan: { id: planId, name: planName, startDate }, session: session.id == null ? null : session };
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

async function writeRevision(connection, plan, diff, reason, actionId = null) {
  await connection.execute(`
    INSERT INTO PlanRevisions (plan_id, action_id, from_version, to_version, diff_json, reason)
    VALUES (?, ?, ?, ?, ?, ?)`, [plan.id, actionId, plan.version, plan.version + 1, JSON.stringify(diff), reason]);
}

function sessionPreview(session) {
  if (!session) return null;
  return { date: session.date, title: session.title, type: session.type, subtitle: session.subtitle,
    note: session.note, distanceM: session.distanceM, durationS: session.durationS };
}

function update(userId, planId, version, input) {
  return change(userId, planId, version, async (connection, plan) => {
    const next = readPlan(input, { allowScheduleVariations: plan.status === 'active' });
    if (plan.status === 'active' && (plan.startDate !== next.startDate || plan.type !== next.type)) {
      throw conflict('An active plan keeps its start date and sport');
    }
    const existing = await getSessions(connection, planId);
    const requested = new Map(next.sessions.map(session => [session.date, session]));
    const diff = [];
    const beforeMetadata = { name: plan.name, goal: plan.goal, goalType: plan.goalType, phases: typeof plan.phases === 'string' ? JSON.parse(plan.phases) : plan.phases };
    const afterMetadata = { name: next.name, goal: next.goal, goalType: next.goalType, phases: next.phases };
    if (JSON.stringify(beforeMetadata) !== JSON.stringify(afterMetadata)) {
      diff.push({ kind: 'metadata', before: beforeMetadata, after: afterMetadata });
    }
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
      if (!unchanged) diff.push({ kind: 'session', before: sessionPreview(session), after: sessionPreview(replacement) });
      requested.delete(session.date);
    }
    await insertSessions(connection, planId, [...requested.values()]);
    for (const session of requested.values()) {
      diff.push({ kind: 'session', before: null, after: sessionPreview(session) });
    }
    await connection.execute(`
      UPDATE TrainingPlans
      SET name = ?, sport = ?, goal_type = ?, goal_description = ?, start_date = ?, week_phases = ?, version = version + 1
      WHERE id = ? AND user_id = ?`, [...planValues(next), planId, userId]);
    if (plan.status === 'active' && diff.length) await writeRevision(connection, plan, diff, '用户手动编辑训练计划');
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
    const [[session]] = await connection.execute(`
      SELECT s.status, s.scheduled_date AS date, e.session_id AS linked
      FROM TrainingSessions s LEFT JOIN TrainingSessionActivities e ON e.session_id = s.id
      WHERE s.id = ? AND s.plan_id = ?`, [sessionId, planId]);
    if (!session) throw missing();
    if (status === 'completed' && session.status !== 'completed' && session.date > localToday()) {
      throw conflict('A future training session cannot be marked completed', 'TRAINING_SESSION_NOT_STARTED');
    }
    if (session.linked && status !== 'completed') {
      throw conflict('A linked session stays completed', 'SESSION_ALREADY_LINKED');
    }
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

async function revisions(userId, planId, before) {
  if (!(await db.query('SELECT id FROM TrainingPlans WHERE id = ? AND user_id = ?', [planId, userId])).length) {
    throw missing();
  }
  const rows = await db.query(`
    SELECT r.id, r.from_version AS fromVersion, r.to_version AS toVersion,
      r.reason, r.diff_json AS changes, r.created_at AS createdAt
    FROM PlanRevisions r JOIN TrainingPlans p ON p.id = r.plan_id
    WHERE r.plan_id = ? AND p.user_id = ? AND (? IS NULL OR r.id < ?)
    ORDER BY r.id DESC LIMIT 21`, [planId, userId, before, before]);
  const history = rows.slice(0, 20).map(row => ({
    ...row, changes: typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
  }));
  return { revisions: history, nextBefore: rows.length > 20 ? history.at(-1).id : null };
}

function weekOffset(start, date) {
  return Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 604800000);
}

async function hasAppliedWeeklyRevision(userId, planId, weekStart, query = db.query) {
  const [row] = await query(`
    SELECT id FROM AgentActions
    WHERE user_id = ? AND status = 'applied' AND action_type = 'revise_plan' AND result_plan_id = ?
      AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.revision.weeklyReviewWeek')) = ?
    LIMIT 1`, [userId, planId, weekStart]);
  return Boolean(row);
}

async function reviseInTransaction(connection, userId, revision, actionId) {
  const plan = await findPlan(connection, userId, revision.planId, true);
  if (plan.version !== revision.version || plan.status !== 'active' || plan.type !== 'running') {
    throw conflict('This plan has changed. Generate a new proposal.', 'TRAINING_PLAN_VERSION_CONFLICT');
  }
  const sessions = await getSessions(connection, plan.id);
  const session = sessions.find(item => item.id === revision.sessionId);
  const { after, reason } = revision;
  const today = localToday();
  if (!session || session.status !== 'pending' || session.execution || session.date < today ||
      typeof reason !== 'string' || !reason.length || reason.length > 500 || !after ||
      !['move', 'reduce'].includes(revision.kind)) throw conflict('The training session is no longer eligible');

  if (revision.weeklyReviewWeek !== undefined) {
    const weekStart = mondayOf(today);
    const nextWeekStart = addDays(weekStart, 7);
    const query = async (sql, params) => (await connection.execute(sql, params))[0];
    if (revision.kind !== 'reduce' || revision.weeklyReviewWeek !== weekStart ||
        session.date < nextWeekStart || session.date > addDays(nextWeekStart, 6) ||
        await hasAppliedWeeklyRevision(userId, plan.id, weekStart, query)) {
      throw conflict('The weekly recommendation is no longer eligible');
    }
  }

  let date = session.date;
  let { durationS, distanceM } = session;
  if (revision.kind === 'move') {
    date = parseDate(after.date, 'date');
    if (!date || date < today || date === session.date || weekOffset(plan.startDate, date) !== weekOffset(plan.startDate, session.date) ||
        sessions.some(item => item.date === date)) throw conflict('The requested date is unavailable');
  } else {
    const validReduction = (before, next) => before === null ? next === null : Number.isInteger(next) &&
      next >= 1 && next <= before && next >= Math.floor(before * 0.7);
    if (!validReduction(durationS, after.durationS) || !validReduction(distanceM, after.distanceM) ||
        (durationS === after.durationS && distanceM === after.distanceM)) {
      throw conflict('The requested training reduction is out of bounds');
    }
    ({ durationS, distanceM } = after);
  }
  await connection.execute(`
    UPDATE TrainingSessions SET scheduled_date = ?, duration_s = ?, distance_m = ? WHERE id = ? AND plan_id = ?`,
  [date, durationS, distanceM, session.id, plan.id]);
  await connection.execute('UPDATE TrainingPlans SET version = version + 1 WHERE id = ? AND user_id = ?', [plan.id, userId]);
  await writeRevision(connection, plan, [{
    kind: 'session', before: sessionPreview(session), after: sessionPreview({ ...session, date, durationS, distanceM })
  }], reason, actionId);
  return plan.id;
}

module.exports = {
  listWeeklySessions, getToday,
  list, get, create, createInTransaction, getActive, update, setStatus, setSessionStatus, remove,
  revisions, reviseInTransaction, weekOffset, hasAppliedWeeklyRevision
};
