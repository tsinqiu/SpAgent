const express = require('express');
const { rateLimit } = require('express-rate-limit');
const defaultAuthService = require('../services/authService');
const defaultAgentService = require('../services/coachAgentService');
const { authenticate } = require('../middleware/authMiddleware');
const { asyncHandler, parsePositiveId } = require('../http');
const { sendData, sendCreated } = require('../response');
const { ApiError } = require('../errors');

function parseMessage(body) {
  const text = typeof body?.message === 'string' ? body.message.trim() : '';
  const id = body?.clientMessageId;
  if (!text || text.length > 1000 || typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError(400, 'A message of 1–1000 characters and a UUID v4 are required', 'INVALID_AGENT_MESSAGE');
  }
  return { message: text, clientMessageId: id.toLowerCase() };
}

function createCoachAgentRouter({ authService = defaultAuthService, agentService = defaultAgentService } = {}) {
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

  router.get('/agent/conversations', requireAuth, asyncHandler(async (req, res) => {
    sendData(res, await agentService.listConversations(req.user.id, before(req)));
  }));
  router.post('/agent/conversations', requireAuth, limiter, asyncHandler(async (req, res) => {
    sendCreated(res, await agentService.createConversation(req.user.id));
  }));
  router.get('/agent/conversations/:id/messages', requireAuth, asyncHandler(async (req, res) => {
    sendData(res, await agentService.listMessages(req.user.id, id(req), before(req)));
  }));
  router.post('/agent/conversations/:id/messages', requireAuth, limiter, asyncHandler(async (req, res) => {
    sendData(res, await agentService.postMessage(req.user.id, id(req), parseMessage(req.body)));
  }));
  for (const decision of ['confirm', 'reject']) {
    router.post(`/agent/actions/:id/${decision}`, requireAuth, asyncHandler(async (req, res) => {
      sendData(res, await agentService.changeAction(req.user.id, id(req), decision === 'confirm'));
    }));
  }
  return router;
}

module.exports = createCoachAgentRouter;
