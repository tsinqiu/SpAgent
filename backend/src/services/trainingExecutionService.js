const db = require('../db');
const { ApiError } = require('../errors');
const { addDays, localToday } = require('./trainingPlanInput');

const running = "(a.sport_code = 1 OR a.activity_type = 'running' OR RIGHT(a.activity_type, 8) = '_running')";
const activityDate = `DATE(CASE WHEN a.data_source = 'live_workout' OR a.local_start_time IS NULL
  THEN DATE_ADD(a.start_time_utc, INTERVAL 8 HOUR) ELSE a.local_start_time END)`;
const activityColumns = `a.id, a.activity_name AS name, ${activityDate} AS date,
  a.data_source AS source, ct.distance_m AS distanceM, ct.duration_s AS durationS,
  ${running} AS isRunning`;
const activityTables = 'Activities a LEFT JOIN ActivitySummaries ct ON ct.activity_id = a.id';
const sessionColumns = 's.id, s.scheduled_date AS date, s.title, s.status, s.distance_m AS distanceM, s.duration_s AS durationS';

function missing() {
  return new ApiError(404, 'Activity or training session not found', 'EXECUTION_NOT_FOUND');
}

function conflict(message, code = 'EXECUTION_CONFLICT') {
  return new ApiError(409, message, code);
}

const amount = value => value != null && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const rounded = value => Math.round(value * 10) / 10;

function comparison(session, activity, method) {
  function measures(row) {
    const distanceM = amount(row.distanceM);
    const durationS = amount(row.durationS);
    return { distanceM, durationS, paceS: distanceM && durationS ? rounded(durationS * 1000 / distanceM) : null };
  }
  const planned = { title: session.title, date: session.date, ...measures(session) };
  const actual = { name: activity.name || '跑步记录', date: activity.date, source: activity.source, ...measures(activity) };
  const delta = Object.fromEntries(['distanceM', 'durationS', 'paceS'].map(key => [
    key, planned[key] === null || actual[key] === null ? null : rounded(actual[key] - planned[key])
  ]));
  const review = [];
  if (actual.date !== planned.date) review.push('实际运动日期与原定日期不同。');
  if (delta.durationS !== null && delta.durationS !== 0) {
    const seconds = Math.abs(delta.durationS);
    const duration = seconds < 60 ? `${seconds} 秒` : `${rounded(seconds / 60)} 分钟`;
    review.push(`实际时长比计划${delta.durationS > 0 ? '多' : '少'} ${duration}。`);
  }
  if (delta.distanceM !== null && delta.distanceM !== 0) {
    review.push(`实际距离比计划${delta.distanceM > 0 ? '多' : '少'} ${Math.round(Math.abs(delta.distanceM))} 米。`);
  }
  if (!review.length) {
    review.push(delta.durationS === null && delta.distanceM === null
      ? '已记录本次训练。可用目标或实测数据不足，暂无法计算训练量偏差。'
      : '已记录本次训练。可比较的训练量与原计划一致。');
  }
  return { planned, actual, delta, review: review.join(''), method };
}

function executionView(row) {
  if (!row?.snapshot) return null;
  const snapshot = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
  return { ...snapshot, activityId: row.activityId, linkedAt: row.linkedAt };
}

function isTrusted(session, activity) {
  if (session.date !== activity.date || session.status !== 'pending') return false;
  if (!amount(activity.distanceM) || !amount(activity.durationS)) return false;
  const targets = [['distanceM', 0.30], ['durationS', 0.35]].filter(([key]) => amount(session[key]));
  return targets.length > 0 && targets.every(([key, tolerance]) =>
    Math.abs(activity[key] - session[key]) <= session[key] * tolerance
  );
}

async function getActivity(query, userId, activityId, lock = false) {
  const [activity] = await query(`
    SELECT ${activityColumns} FROM ${activityTables}
    WHERE a.id = ? AND a.owner_user_id = ?${lock ? ' FOR UPDATE' : ''}`, [activityId, userId]);
  if (!activity) throw missing();
  return activity;
}

async function getSession(query, userId, sessionId, lock = false) {
  const [session] = await query(`
    SELECT ${sessionColumns}, s.plan_id AS planId, p.name AS planName, p.status AS planStatus, p.sport,
      p.version, e.activity_id AS activityId, e.comparison_json AS snapshot, e.created_at AS linkedAt
    FROM TrainingSessions s JOIN TrainingPlans p ON p.id = s.plan_id
    LEFT JOIN TrainingSessionActivities e ON e.session_id = s.id
    WHERE s.id = ? AND p.user_id = ?${lock ? ' FOR UPDATE' : ''}`, [sessionId, userId]);
  if (!session) throw missing();
  return session;
}

async function activityCandidates(userId, sessionId) {
  const session = await getSession(db.query, userId, sessionId);
  if (session.planStatus !== 'active' || session.sport !== 'running' || session.status === 'skipped' ||
      session.snapshot || session.date > localToday()) return [];
  return db.query(`
    SELECT ${activityColumns} FROM ${activityTables}
    LEFT JOIN TrainingSessionActivities e ON e.activity_id = a.id
    WHERE a.owner_user_id = ? AND ${running} AND e.session_id IS NULL
      AND ${activityDate} BETWEEN ? AND ?
    ORDER BY ABS(DATEDIFF(${activityDate}, ?)), a.id DESC LIMIT 25`,
  [userId, addDays(session.date, -7), minDate(addDays(session.date, 7), localToday()), session.date]);
}

const minDate = (a, b) => a < b ? a : b;

async function activityExecution(userId, activityId) {
  const activity = await getActivity(db.query, userId, activityId);
  const [link] = await db.query(`
    SELECT s.plan_id AS planId, p.name AS planName, e.session_id AS sessionId, e.activity_id AS activityId,
      e.comparison_json AS snapshot, e.created_at AS linkedAt
    FROM TrainingSessionActivities e JOIN TrainingSessions s ON s.id = e.session_id
    JOIN TrainingPlans p ON p.id = s.plan_id WHERE e.activity_id = ? AND p.user_id = ?`, [activityId, userId]);
  if (link) return { execution: { ...executionView(link), planId: link.planId, planName: link.planName, sessionId: link.sessionId }, candidates: [] };
  if (!activity.isRunning || !activity.date || activity.date > localToday()) return { execution: null, candidates: [] };
  const candidates = await db.query(`
    SELECT ${sessionColumns}, p.id AS planId, p.name AS planName, p.version
    FROM TrainingSessions s JOIN TrainingPlans p ON p.id = s.plan_id
    LEFT JOIN TrainingSessionActivities e ON e.session_id = s.id
    WHERE p.user_id = ? AND p.status = 'active' AND p.sport = 'running'
      AND s.status IN ('pending', 'completed') AND e.session_id IS NULL
      AND s.scheduled_date BETWEEN ? AND ?
    ORDER BY ABS(DATEDIFF(s.scheduled_date, ?)), s.scheduled_date LIMIT 20`,
  [userId, addDays(activity.date, -7), minDate(addDays(activity.date, 7), localToday()), activity.date]);
  return { execution: null, candidates };
}

function linkActivity(userId, sessionId, activityId, version, method = 'manual') {
  return db.transaction(async connection => {
    const query = async (sql, args) => (await connection.execute(sql, args))[0];
    const reference = await getSession(query, userId, sessionId);
    const [plan] = await query('SELECT id FROM TrainingPlans WHERE id = ? AND user_id = ? FOR UPDATE', [reference.planId, userId]);
    if (!plan) throw missing();
    const session = await getSession(query, userId, sessionId, true);
    const activity = await getActivity(query, userId, activityId, true);
    if (session.activityId === activityId) return executionView(session);
    if (session.snapshot) throw conflict('This session already has a recorded execution', 'SESSION_ALREADY_LINKED');
    if (session.planStatus !== 'active' || session.sport !== 'running' || session.status === 'skipped' ||
        !activity.isRunning || !activity.date || activity.date > localToday() || session.date > localToday() ||
        activity.date < addDays(session.date, -7) || activity.date > addDays(session.date, 7)) {
      throw conflict('This running activity and session cannot be linked');
    }
    if (method === 'automatic') {
      if (!isTrusted(session, activity)) return null;
      const matching = await query(`
        SELECT a.id FROM ${activityTables} WHERE a.owner_user_id = ?
        AND ${running} AND ${activityDate} = ? AND ct.distance_m > 0 AND ct.duration_s > 0
        LIMIT 2 FOR SHARE`, [userId, activity.date]);
      if (matching.length !== 1 || matching[0].id !== activityId) return null;
    } else if (session.version !== version) {
      throw conflict('Refresh this plan before linking an activity', 'TRAINING_PLAN_VERSION_CONFLICT');
    }
    const snapshot = comparison(session, activity, method);
    try {
      await query(`
        INSERT INTO TrainingSessionActivities (session_id, activity_id, link_method, comparison_json)
        VALUES (?, ?, ?, ?)`, [sessionId, activityId, method, JSON.stringify(snapshot)]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw conflict('This activity is already linked to a session', 'ACTIVITY_ALREADY_LINKED');
      throw error;
    }
    await query("UPDATE TrainingSessions SET status = 'completed' WHERE id = ?", [sessionId]);
    await query('UPDATE TrainingPlans SET version = version + 1 WHERE id = ? AND user_id = ?', [session.planId, userId]);
    return executionView(await getSession(query, userId, sessionId, true));
  });
}

async function autoLinkImported(userId, activityIds) {
  let linked = 0;
  let skipped = 0;
  let errors = 0;
  for (const activityId of activityIds) {
    try {
      const { execution, candidates } = await activityExecution(userId, activityId);
      if (execution || !candidates.length) continue;
      const activity = await getActivity(db.query, userId, activityId);
      const matches = candidates.filter(candidate => isTrusted(candidate, activity));
      if (matches.length !== 1) {
        skipped++;
        continue;
      }
      if (await linkActivity(userId, matches[0].id, activityId, null, 'automatic')) linked++;
      else skipped++;
    } catch (error) {
      if (error instanceof ApiError) skipped++;
      else errors++;
    }
  }
  return { linked, skipped, errors };
}

module.exports = { activityCandidates, activityExecution, linkActivity, autoLinkImported, comparison, executionView, isTrusted };
