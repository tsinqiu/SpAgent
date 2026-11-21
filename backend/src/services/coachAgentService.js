const { createHash } = require('node:crypto');
const { LRUCache } = require('lru-cache');
const db = require('../db');
const config = require('../config');
const { ApiError } = require('../errors');
const { readPlan, localToday } = require('./trainingPlanInput');
const trainingPlanService = require('./trainingPlanService');
const { runCoachHarness } = require('./coachHarness');
const telemetry = require('./coachTelemetryService');
const { buildContextPulse } = require('./coachVisualCards');

const pageSize = 40;
const inFlightMessages = new Map();
const pulseCache = new LRUCache({ max: 200, ttl: 30_000 });
const cardColumns = `
  a.id AS actionId, a.action_type AS actionType, a.payload_json AS actionPayload, a.status AS storedStatus,
  CASE WHEN a.status = 'proposed' AND a.expires_at <= UTC_TIMESTAMP(3) THEN 'expired' ELSE a.status END AS actionStatus,
  DATE_FORMAT(a.expires_at, '%Y-%m-%dT%H:%i:%sZ') AS expiresAt,
  a.result_plan_id AS resultPlanId, a.failure_code AS failureCode`;
const selectMessages = `
  SELECT m.id, m.client_message_id AS clientMessageId, m.role, m.content,
    m.cards_json AS payload, m.created_at AS createdAt, ${cardColumns}
  FROM AgentMessages m
  JOIN AgentConversations c ON c.id = m.conversation_id
  LEFT JOIN AgentActions a ON a.assistant_message_id = m.id`;

function missing() {
  return new ApiError(404, 'Conversation or action not found', 'AGENT_NOT_FOUND');
}

function decode(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function actionView(row) {
  const { saveStatus } = decode(row.actionPayload);
  return {
    id: row.actionId, type: row.actionType, status: row.actionStatus, expiresAt: row.expiresAt,
    saveStatus, planId: row.resultPlanId, failureCode: row.failureCode
  };
}

function messageView(row) {
  const { cards, meta, attachment } = decode(row.payload);
  const displayCards = (cards || []).map(card => card.type === 'tool_status' && typeof card.summary === 'string'
    ? { ...card, summary: card.summary.replace(/，排除演示(?:数据|记录)(?=。?$)/, '') }
    : card);
  let proposal = null;
  if (row.actionId) {
    const payload = decode(row.actionPayload);
    proposal = row.actionType === 'revise_plan'
      ? { type: 'plan_diff', revision: payload.revision, action: actionView(row) }
      : { type: 'plan_draft', plan: payload.plan, action: actionView(row) };
  }
  return {
    id: row.id, role: row.role, content: row.content, createdAt: row.createdAt, meta,
    ...(row.role === 'user' && attachment && { attachment }),
    cards: proposal ? [...displayCards, proposal] : displayCards
  };
}

async function listConversations(userId, before) {
  const rows = await db.query(`
    SELECT id, title, updated_at AS updatedAt FROM AgentConversations
    WHERE user_id = ? AND (? IS NULL OR id < ?)
    ORDER BY id DESC LIMIT 21`, [userId, before, before]);
  const conversations = rows.slice(0, 20);
  return { conversations, nextBefore: rows.length > 20 ? conversations.at(-1).id : null };
}

async function createConversation(userId) {
  const inserted = await db.query('INSERT INTO AgentConversations (user_id) VALUES (?)', [userId]);
  const [row] = await db.query(
    'SELECT id, title, updated_at AS updatedAt FROM AgentConversations WHERE id = ? AND user_id = ?',
    [inserted.insertId, userId]
  );
  return row;
}

async function renameConversation(userId, conversationId, title) {
  const clean = typeof title === 'string' ? title.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!clean || clean.length > 80) {
    throw new ApiError(400, '对话标题需在 1–80 字之间。', 'INVALID_CONVERSATION_TITLE');
  }
  const result = await db.query(
    'UPDATE AgentConversations SET title = ? WHERE id = ? AND user_id = ?',
    [clean, conversationId, userId]
  );
  if (!result.affectedRows) throw missing();
  const [row] = await db.query(
    'SELECT id, title, updated_at AS updatedAt FROM AgentConversations WHERE id = ? AND user_id = ?',
    [conversationId, userId]
  );
  return row;
}

async function deleteConversation(userId, conversationId) {
  const result = await db.query(
    'DELETE FROM AgentConversations WHERE id = ? AND user_id = ?',
    [conversationId, userId]
  );
  if (!result.affectedRows) throw missing();
  return { deleted: true, id: Number(conversationId) };
}

async function getContextPulse(user) {
  const cacheKey = `pulse:${user.id}`;
  const cached = pulseCache.get(cacheKey);
  if (cached) return cached;
  const profile = await telemetry.getAthleteProfile(user.id, localToday());
  const pulse = buildContextPulse(profile, user);
  pulseCache.set(cacheKey, pulse);
  return pulse;
}

function invalidatePulse(userId) {
  pulseCache.delete(`pulse:${userId}`);
}

async function requireConversation(query, userId, conversationId, lock = false) {
  const [row] = await query(
    `SELECT id, title FROM AgentConversations WHERE id = ? AND user_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [conversationId, userId]
  );
  if (!row) throw missing();
  return row;
}

async function listMessages(userId, conversationId, before) {
  await requireConversation(db.query, userId, conversationId);
  const rows = await db.query(`
    ${selectMessages}
    WHERE c.user_id = ? AND m.conversation_id = ? AND (? IS NULL OR m.id < ?)
    ORDER BY m.id DESC LIMIT ?`, [userId, conversationId, before, before, pageSize + 1]);
  const messages = rows.slice(0, pageSize).reverse().map(messageView);
  return { messages, nextBefore: rows.length > pageSize ? messages[0].id : null };
}

async function replay(query, userId, conversationId, clientMessageId, text, inputFingerprint) {
  const rows = await query(`
    ${selectMessages}
    WHERE c.user_id = ? AND m.conversation_id = ? AND m.client_message_id = ?
    ORDER BY m.id`, [userId, conversationId, clientMessageId]);
  if (!rows.length) return null;
  if (rows[0].content !== text || decode(rows[0].payload).inputFingerprint !== inputFingerprint) {
    throw new ApiError(409, 'This message ID was already used', 'AGENT_MESSAGE_CONFLICT');
  }
  return { messages: rows.map(messageView) };
}

async function latestAssistantMessage(query, userId, conversationId) {
  const [row] = await query(`
    SELECT m.id, m.cards_json AS payload FROM AgentMessages m
    JOIN AgentConversations c ON c.id = m.conversation_id
    WHERE c.user_id = ? AND m.conversation_id = ? AND m.role = 'assistant'
    ORDER BY m.id DESC LIMIT 1`, [userId, conversationId]);
  return row;
}

async function recentConversationMessages(userId, conversationId, assistantId) {
  const rows = await db.query(`
    SELECT m.role, m.content, m.cards_json AS payload FROM AgentMessages m
    JOIN AgentConversations c ON c.id = m.conversation_id
    WHERE c.user_id = ? AND m.conversation_id = ? AND m.id <= ?
    ORDER BY m.id DESC LIMIT 12`, [userId, conversationId, assistantId]);
  return rows.reverse().map(({ role, content, payload }) => {
    const data = decode(payload);
    return {
      role, content, includesAttachment: Boolean(data?.attachment),
      activityQuery: role === 'assistant' ? data?.activityQuery : undefined,
      coachScope: role === 'assistant' ? data?.coachScope : undefined
    };
  });
}

function attachmentLabel(file) {
  const utf8 = Buffer.from(file.originalname, 'latin1').toString('utf8');
  const name = utf8.includes('\uFFFD') ? file.originalname : utf8;
  return { name: name.replace(/[\p{Cc}\p{Cf}]/gu, '').slice(0, 150) || '附件' };
}

async function persistMessage(userId, conversationId, { clientMessageId, message, attachment, profile }, inputFingerprint, { onEvent, abortSignal } = {}) {
  await requireConversation(db.query, userId, conversationId);
  const prior = await replay(db.query, userId, conversationId, clientMessageId, message, inputFingerprint);
  if (prior) return prior;
  const previous = await latestAssistantMessage(db.query, userId, conversationId);
  const history = previous ? await recentConversationMessages(userId, conversationId, previous.id) : [];
  const turn = await runCoachHarness({
    message,
    userId,
    history,
    profile,
    attachment,
    aiConfig: config.ai,
    onEvent,
    abortSignal
  });
  if (turn.aborted && (!turn.content || turn.content === '已停止生成。')) {
    return { messages: [], aborted: true };
  }
  const displayAttachment = attachment ? attachmentLabel(attachment) : undefined;
  invalidatePulse(userId);

  return db.transaction(async connection => {
    const query = async (sql, args) => (await connection.execute(sql, args))[0];
    const conversation = await requireConversation(query, userId, conversationId, true);
    const saved = await replay(query, userId, conversationId, clientMessageId, message, inputFingerprint);
    if (saved) return saved;
    const current = await latestAssistantMessage(query, userId, conversationId);
    if (previous?.id !== current?.id) {
      throw new ApiError(409, 'A reply was added to this conversation. Please retry.', 'AGENT_CONVERSATION_UPDATED');
    }

    await query(`
      INSERT INTO AgentMessages (conversation_id, client_message_id, role, content, cards_json)
      VALUES (?, ?, 'user', ?, ?)`, [conversationId, clientMessageId, message,
      JSON.stringify({ cards: [], attachment: displayAttachment, inputFingerprint })]);
    const assistant = await query(`
      INSERT INTO AgentMessages (conversation_id, client_message_id, role, content, cards_json)
      VALUES (?, ?, 'assistant', ?, ?)`,
    [conversationId, clientMessageId, turn.content, JSON.stringify({
      cards: turn.cards || [], meta: turn.meta, attachment: attachment ? true : undefined
    })]);
    if (turn.proposal) {
      await query(`
        INSERT INTO AgentActions (conversation_id, user_id, assistant_message_id, action_type, payload_json, expires_at)
        VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3) + INTERVAL 30 MINUTE)`,
      [conversationId, userId, assistant.insertId, turn.proposal.type || 'create_plan', JSON.stringify(turn.proposal)]);
    }
    const title = ['训练计划对话', '新对话'].includes(conversation.title)
      ? Array.from(message).slice(0, 40).join('')
      : conversation.title;
    await query(
      'UPDATE AgentConversations SET title = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND user_id = ?',
      [title, conversationId, userId]
    );
    return replay(query, userId, conversationId, clientMessageId, message, inputFingerprint);
  });
}

async function postMessage(userId, conversationId, input, { onEvent, abortSignal } = {}) {
  const key = `${userId}:${conversationId}:${input.clientMessageId}`;
  const { profile, attachment } = input;
  let fingerprint;
  if (profile || attachment) {
    const hash = createHash('sha256').update(JSON.stringify([profile, attachment?.originalname, attachment?.mimetype]));
    if (attachment) hash.update(attachment.buffer);
    fingerprint = hash.digest('hex');
  }
  const existing = inFlightMessages.get(key);
  if (existing) {
    if (existing.message !== input.message || existing.fingerprint !== fingerprint) {
      throw new ApiError(409, 'This message ID was already used', 'AGENT_MESSAGE_CONFLICT');
    }
    return existing.result;
  }
  const result = persistMessage(userId, conversationId, input, fingerprint, { onEvent, abortSignal }).finally(() => inFlightMessages.delete(key));
  inFlightMessages.set(key, { message: input.message, fingerprint, result });
  return result;
}

async function findAction(connection, userId, actionId) {
  const [[row]] = await connection.execute(`
    SELECT ${cardColumns} FROM AgentActions a WHERE a.id = ? AND a.user_id = ?`, [actionId, userId]);
  return row;
}

function changeAction(userId, actionId, confirm) {
  return db.transaction(async connection => {
    const [[owned]] = await connection.execute(
      'SELECT id FROM AgentActions WHERE id = ? AND user_id = ? FOR UPDATE', [actionId, userId]
    );
    if (!owned) throw missing();
    const row = await findAction(connection, userId, actionId);
    if (row.storedStatus !== 'proposed') return actionView(row);
    if (row.actionStatus === 'expired' || !confirm) {
      const status = row.actionStatus === 'expired' ? 'expired' : 'rejected';
      await connection.execute('UPDATE AgentActions SET status = ? WHERE id = ? AND user_id = ?', [status, actionId, userId]);
      return actionView({ ...row, actionStatus: status });
    }

    const payload = decode(row.actionPayload);
    let planId = null;
    let failureCode = null;
    if (row.actionType === 'revise_plan') {
      try {
        planId = await trainingPlanService.reviseInTransaction(connection, userId, payload.revision, actionId);
      } catch (error) {
        if (!['TRAINING_PLAN_VERSION_CONFLICT', 'TRAINING_PLAN_CONFLICT', 'TRAINING_PLAN_NOT_FOUND'].includes(error.code)) throw error;
        failureCode = error.code === 'TRAINING_PLAN_NOT_FOUND' ? 'TRAINING_PLAN_VERSION_CONFLICT' : error.code;
      }
    } else if (row.actionType === 'create_plan' && ['active', 'draft'].includes(payload.saveStatus)) {
      const normalized = readPlan(payload.plan);
      if (normalized.startDate < localToday()) {
        failureCode = 'PLAN_START_DATE_PASSED';
      } else {
        try {
          planId = await trainingPlanService.createInTransaction(connection, userId, normalized, payload.saveStatus);
        } catch (error) {
          if (error.code !== 'ACTIVE_TRAINING_PLAN_EXISTS') throw error;
          failureCode = error.code;
        }
      }
    } else {
      throw new ApiError(409, 'Unsupported pending action', 'AGENT_ACTION_INVALID');
    }
    const status = planId ? 'applied' : 'failed';
    await connection.execute(`
      UPDATE AgentActions SET status = ?, confirmed_at = UTC_TIMESTAMP(3), result_plan_id = ?, failure_code = ?
      WHERE id = ? AND user_id = ?`, [status, planId, failureCode, actionId, userId]);
    invalidatePulse(userId);
    return actionView({ ...row, actionStatus: status, resultPlanId: planId, failureCode });
  });
}

module.exports = {
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  getContextPulse,
  invalidatePulse,
  listMessages,
  postMessage,
  changeAction
};
