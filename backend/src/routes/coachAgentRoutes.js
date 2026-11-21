const express = require('express');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');
const defaultAuthService = require('../services/authService');
const defaultAgentService = require('../services/coachAgentService');
const defaultMemoryService = require('../services/athleteMemoryService');
const { authenticate } = require('../middleware/authMiddleware');
const { asyncHandler, parsePositiveId } = require('../http');
const { sendData, sendCreated } = require('../response');
const { ApiError } = require('../errors');
const { readCoachProfile } = require('../services/coachProfile');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 4, fieldSize: 8 * 1024, parts: 6 }
}).single('attachment');

function parseMessage(body, attachment) {
  if (body?.message !== undefined && typeof body.message !== 'string') {
    throw new ApiError(400, 'Invalid message text', 'INVALID_AGENT_MESSAGE');
  }
  const text = body?.message?.trim() || (attachment ? '请分析这个附件。' : '');
  const id = body?.clientMessageId;
  if (!text || text.length > 1000 || typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError(400, 'A message of 1–1000 characters and a UUID v4 are required', 'INVALID_AGENT_MESSAGE');
  }
  const profile = readCoachProfile(body?.coachRole, body?.coachInstructions);
  return {
    message: text,
    clientMessageId: id.toLowerCase(),
    ...(attachment && { attachment }),
    ...(profile.role !== 'general' || profile.instructions ? { profile } : {})
  };
}

function writeSse(res, event, data) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function createCoachAgentRouter({
  authService = defaultAuthService,
  agentService = defaultAgentService,
  memoryService = defaultMemoryService
} = {}) {
  const router = express.Router();
  const requireAuth = authenticate(authService);
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    keyGenerator: req => String(req.user.id),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'AGENT_RATE_LIMITED', message: 'Too many requests' } })
  });
  const before = req => req.query.before === undefined ? null : parsePositiveId(req.query.before, 'before');
  const id = req => parsePositiveId(req.params.id);
  let activeUploads = 0;

  async function extractMessagePayload(req, res) {
    if (!req.is('multipart/form-data')) {
      return { payload: parseMessage(req.body), release: () => {} };
    }
    if (activeUploads >= 4) throw new ApiError(429, 'Too many active attachment requests', 'AGENT_UPLOAD_BUSY');
    activeUploads++;
    try {
      await new Promise((resolve, reject) => upload(req, res, error => {
        if (!error) return resolve();
        if (error.code === 'LIMIT_FILE_SIZE') {
          return reject(new ApiError(413, '单份附件不能超过 8 MB。', 'AGENT_ATTACHMENT_TOO_LARGE'));
        }
        if (error instanceof multer.MulterError) {
          return reject(new ApiError(400, '请上传一个附件，并检查消息字段。', 'INVALID_AGENT_ATTACHMENT'));
        }
        return reject(error);
      }));
      if (!req.file) throw new ApiError(400, 'An attachment is required', 'AGENT_ATTACHMENT_REQUIRED');
      return {
        payload: parseMessage(req.body, req.file),
        release: () => { activeUploads = Math.max(0, activeUploads - 1); }
      };
    } catch (error) {
      activeUploads = Math.max(0, activeUploads - 1);
      throw error;
    }
  }

  router.get('/agent/context-pulse', requireAuth, asyncHandler(async (req, res) => {
    sendData(res, await agentService.getContextPulse(req.user));
  }));

  router.get('/agent/conversations', requireAuth, asyncHandler(async (req, res) => {
    sendData(res, await agentService.listConversations(req.user.id, before(req)));
  }));

  router.post('/agent/conversations', requireAuth, limiter, asyncHandler(async (req, res) => {
    sendCreated(res, await agentService.createConversation(req.user.id));
  }));

  router.patch('/agent/conversations/:id', requireAuth, asyncHandler(async (req, res) => {
    sendData(res, await agentService.renameConversation(req.user.id, id(req), req.body?.title));
  }));

  router.delete('/agent/conversations/:id', requireAuth, asyncHandler(async (req, res) => {
    sendData(res, await agentService.deleteConversation(req.user.id, id(req)));
  }));

  router.get('/agent/conversations/:id/messages', requireAuth, asyncHandler(async (req, res) => {
    sendData(res, await agentService.listMessages(req.user.id, id(req), before(req)));
  }));

  router.post('/agent/conversations/:id/messages', requireAuth, limiter, asyncHandler(async (req, res) => {
    const conversationId = id(req);
    const { payload, release } = await extractMessagePayload(req, res);
    try {
      sendData(res, await agentService.postMessage(req.user.id, conversationId, payload));
    } finally {
      release();
    }
  }));

  router.post('/agent/conversations/:id/messages/stream', requireAuth, limiter, asyncHandler(async (req, res) => {
    const conversationId = id(req);
    const { payload, release } = await extractMessagePayload(req, res);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const result = await agentService.postMessage(req.user.id, conversationId, payload, {
        abortSignal: controller.signal,
        onEvent: event => {
          if (event.type === 'status') writeSse(res, 'status', event);
          else if (event.type === 'delta') writeSse(res, 'delta', { text: event.text });
          else if (event.type === 'card') writeSse(res, 'card', { card: event.card });
          else if (event.type === 'followups') writeSse(res, 'followups', { items: event.items });
          else if (event.type === 'proposal_ready') writeSse(res, 'proposal_ready', { kind: event.kind });
        }
      });
      if (!controller.signal.aborted) {
        writeSse(res, 'done', result);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const code = error instanceof ApiError ? error.code : 'AGENT_STREAM_ERROR';
        const message = error instanceof ApiError ? error.message : '在线分析暂时遇到问题，请重试。';
        writeSse(res, 'error', { code, message, status: error.statusCode || error.status || 500 });
      }
    } finally {
      release();
      if (!res.writableEnded) res.end();
    }
  }));

  for (const decision of ['confirm', 'reject']) {
    router.post(`/agent/actions/:id/${decision}`, requireAuth, asyncHandler(async (req, res) => {
      sendData(res, await agentService.changeAction(req.user.id, id(req), decision === 'confirm'));
    }));
  }

  // Persistent Athlete Memory API (per authenticated user)
  router.get('/agent/memories', requireAuth, asyncHandler(async (req, res) => {
    sendData(res, { memories: await memoryService.listMemories(req.user.id) });
  }));

  router.post('/agent/memories', requireAuth, limiter, asyncHandler(async (req, res) => {
    const memory = await memoryService.saveMemory(req.user.id, {
      category: req.body?.category,
      content: req.body?.content,
      source: 'user'
    });
    sendCreated(res, { memory });
  }));

  router.delete('/agent/memories/:id', requireAuth, asyncHandler(async (req, res) => {
    sendData(res, await memoryService.deleteMemory(req.user.id, id(req)));
  }));

  return router;
}

module.exports = createCoachAgentRouter;
