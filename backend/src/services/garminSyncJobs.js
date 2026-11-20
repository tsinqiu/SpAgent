const { randomUUID } = require('node:crypto');
const db = require('../db');
const { ApiError } = require('../errors');

const maxAttempts = 2;
const leaseLengthSeconds = 60;
const heartbeatMs = 15_000;
const jobColumns = `
  id, provider, job_type AS jobType, status,
  requested_at AS requestedAt, started_at AS startedAt, finished_at AS finishedAt,
  activity_count AS activityCount, error_message AS errorMessage`;

function decodeRequest(value) {
  const data = typeof value === 'string' ? JSON.parse(value) : value;
  return data?.request || {};
}

function recordOutcome(connection, jobId, userId, failure) {
  return connection.execute(`
    INSERT INTO SyncLogs (job_id, user_id, provider, level, message)
    VALUES (?, ?, 'garmin', ?, ?)`, [jobId, userId, failure ? 'error' : 'info', failure || 'Garmin 同步完成。']);
}

async function readOwnedJob(query, id, userId) {
  const [job] = await query(`SELECT ${jobColumns} FROM SyncJobs WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!job) throw new ApiError(404, 'Sync job not found', 'SYNC_JOB_NOT_FOUND');
  return job;
}

function getJob(id, user) {
  return readOwnedJob(db.query, id, user.id);
}

async function enqueue(payload, user) {
  return db.transaction(async connection => {
    const query = async (sql, args) => (await connection.execute(sql, args))[0];
    const [row] = await query(`
      SELECT status FROM SyncProviderConnections
      WHERE user_id = ? AND provider = 'garmin' FOR UPDATE`, [user.id]);
    if (row?.status !== 'connected') {
      throw new ApiError(400, 'Garmin account is not connected', 'GARMIN_ACCOUNT_NOT_CONNECTED');
    }
    const request = { startDate: payload.startDate, endDate: payload.endDate };
    const result = await query(`
      INSERT INTO SyncJobs (user_id, provider, job_type, status, raw_json)
      VALUES (?, 'garmin', ?, 'queued', ?)
      ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [user.id, payload.jobType || 'manual_sync', JSON.stringify({ request })]);
    return readOwnedJob(query, result.insertId, user.id);
  });
}

async function claim() {
  return db.transaction(async connection => {
    const [[row]] = await connection.query(`
      SELECT id, user_id AS userId, attempt_count AS attempts, raw_json AS payload
      FROM SyncJobs WHERE provider = 'garmin'
        AND (status = 'queued' OR (status = 'running' AND lease_until <= CURRENT_TIMESTAMP(3)))
      ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`);
    if (!row) return null;
    if (row.attempts >= maxAttempts) {
      const message = '同步中断，已达重试上限。请重新发起同步。';
      await connection.execute(`
        UPDATE SyncJobs SET status = 'failed', finished_at = CURRENT_TIMESTAMP(3),
          lease_token = NULL, lease_until = NULL, error_message = ?
        WHERE id = ?`, [message, row.id]);
      await recordOutcome(connection, row.id, row.userId, message);
      return null;
    }
    const token = randomUUID();
    await connection.execute(`
      UPDATE SyncJobs SET status = 'running', started_at = COALESCE(started_at, CURRENT_TIMESTAMP(3)),
        lease_token = ?, lease_until = CURRENT_TIMESTAMP(3) + INTERVAL ? SECOND, attempt_count = attempt_count + 1
      WHERE id = ?`, [token, leaseLengthSeconds, row.id]);
    return { ...row, token, request: decodeRequest(row.payload) };
  });
}

async function renew(job) {
  const result = await db.query(`
    UPDATE SyncJobs SET lease_until = CURRENT_TIMESTAMP(3) + INTERVAL ? SECOND
    WHERE id = ? AND lease_token = ? AND status = 'running' AND lease_until > CURRENT_TIMESTAMP(3)`,
  [leaseLengthSeconds, job.id, job.token]);
  return result.affectedRows === 1;
}

async function checkLease(job, connection) {
  const parameters = [job.id, job.userId, job.token];
  const sql = `
    SELECT id FROM SyncJobs
    WHERE id = ? AND user_id = ? AND lease_token = ? AND status = 'running'
      AND lease_until > CURRENT_TIMESTAMP(3)`;
  const rows = connection ? (await connection.execute(`${sql} FOR UPDATE`, parameters))[0] : await db.query(sql, parameters);
  if (!rows.length) throw new ApiError(409, 'Garmin worker lease was lost', 'GARMIN_JOB_LEASE_LOST');
  const ownerSql = `
    SELECT c.id FROM SyncProviderConnections c JOIN Users u ON u.id = c.user_id
    WHERE c.user_id = ? AND c.provider = 'garmin' AND c.status = 'connected' AND u.status = 'active'`;
  const owners = connection ? (await connection.execute(ownerSql, [job.userId]))[0] : await db.query(ownerSql, [job.userId]);
  if (!owners.length) throw new ApiError(400, 'Garmin account is not connected', 'GARMIN_ACCOUNT_NOT_CONNECTED');
}

function finish(job, result, failure) {
  return db.transaction(async connection => {
    const status = failure ? 'failed' : 'success';
    const metadata = result && {
      startDate: result.startDate, endDate: result.endDate, healthDaysImported: result.healthDaysImported
    };
    const [updated] = await connection.execute(`
      UPDATE SyncJobs SET status = ?, finished_at = CURRENT_TIMESTAMP(3), activity_count = GREATEST(activity_count, ?),
        raw_json = ?, error_message = ?, lease_token = NULL, lease_until = NULL
      WHERE id = ? AND lease_token = ? AND status = 'running' AND lease_until > CURRENT_TIMESTAMP(3)`,
    [status, result?.importedCount ?? 0, metadata ? JSON.stringify(metadata) : null, failure, job.id, job.token]);
    if (!updated.affectedRows) return;
    if (!failure) {
      await connection.execute(`
        UPDATE SyncProviderConnections SET last_sync_at = CURRENT_TIMESTAMP(3)
        WHERE user_id = ? AND provider = 'garmin' AND status = 'connected'`, [job.userId]);
    }
    await recordOutcome(connection, job.id, job.userId, failure);
  });
}

async function processJob(job, controller, runSync, pollHeartbeatMs) {
  const user = { id: job.userId };
  const { signal } = controller;
  let heartbeat;
  async function keepLease() {
    try {
      if (!signal.aborted && !await renew(job)) controller.abort();
    } catch {
      controller.abort();
    }
    if (!signal.aborted) heartbeat = setTimeout(keepLease, pollHeartbeatMs);
  }
  const guard = async connection => {
    signal.throwIfAborted();
    await checkLease(job, connection);
  };
  const recordImported = async (connection, count) => {
    await connection.execute(`
      UPDATE SyncJobs SET activity_count = activity_count + ?
      WHERE id = ? AND lease_token = ?`, [count, job.id, job.token]);
  };
  heartbeat = setTimeout(keepLease, pollHeartbeatMs);
  try {
    await guard();
    const result = await runSync(job.id, user, job.request, { guard, recordImported, signal, token: job.token });
    await guard();
    await finish(job, result, null);
  } catch (error) {
    if (signal.aborted || error.code === 'GARMIN_JOB_LEASE_LOST') return;
    const message = error.code === 'GARMIN_ACCOUNT_NOT_CONNECTED'
      ? 'Garmin 未连接，无法完成同步。'
      : 'Garmin 同步失败，请检查账号连接后重试。';
    await finish(job, null, message);
  } finally {
    clearTimeout(heartbeat);
    controller.abort();
  }
}

function startGarminWorker({ runSync, pollMs = 2000, pollHeartbeatMs = heartbeatMs }) {
  let active;
  let timer;
  let controller;
  let stopped = false;
  function tick() {
    if (stopped) return;
    controller = new AbortController();
    active = claim().then(job => {
      if (job && !stopped) return processJob(job, controller, runSync, pollHeartbeatMs);
    }).catch(error => {
      console.warn(`Garmin queue worker: ${error.code || error.name || 'unknown error'}`);
    }).finally(() => {
      if (!stopped) timer = setTimeout(tick, pollMs);
    });
  }
  tick();
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      await active;
    }
  };
}

module.exports = { enqueue, getJob, jobColumns, startGarminWorker };
