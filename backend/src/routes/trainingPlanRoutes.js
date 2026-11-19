const express = require('express');
const defaultAuthService = require('../services/authService');
const defaultPlanService = require('../services/trainingPlanService');
const defaultContextService = require('../services/trainingContextService');
const defaultExecutionService = require('../services/trainingExecutionService');
const { authenticate } = require('../middleware/authMiddleware');
const { asyncHandler, parsePositiveId } = require('../http');
const { sendData, sendCreated } = require('../response');
const { readPlan, readVersion, choice, sessionStatuses } = require('../services/trainingPlanInput');

function createTrainingPlanRouter({
  authService = defaultAuthService,
  planService = defaultPlanService,
  contextService = defaultContextService,
  executionService = defaultExecutionService
} = {}) {
  const router = express.Router();
  const requireAuth = authenticate(authService);
  const planId = req => parsePositiveId(req.params.id, 'plan id');
  const version = req => readVersion(req.body?.version);
  const route = (method, path, handler, send = sendData) => {
    router[method](path, requireAuth, asyncHandler(async (req, res) => send(res, await handler(req))));
  };

  route('get', '/training/context', req => contextService.getContext(req.user.id));
  route('get', '/training-plans', req => planService.list(req.user.id));
  route('get', '/training-plans/:id', req => planService.get(req.user.id, planId(req)));
  route('post', '/training-plans', req => planService.create(req.user.id, readPlan(req.body)), sendCreated);
  route('put', '/training-plans/:id', req => planService.update(req.user.id, planId(req), version(req), req.body));
  route('get', '/training-plans/:id/revisions', req => planService.revisions(
    req.user.id, planId(req), req.query.before === undefined ? null : parsePositiveId(req.query.before, 'before')
  ));
  route('get', '/training-sessions/:id/activity-candidates', req => executionService.activityCandidates(req.user.id, planId(req)));
  route('get', '/activities/:id/plan-execution', req => executionService.activityExecution(req.user.id, planId(req)));
  route('post', '/training-sessions/:id/link-activity', req => executionService.linkActivity(
    req.user.id, planId(req), parsePositiveId(req.body?.activityId, 'activityId'), version(req)
  ));
  route('post', '/training-plans/:id/activate', req => planService.setStatus(req.user.id, planId(req), version(req), 'active'));
  route('post', '/training-plans/:id/archive', req => planService.setStatus(req.user.id, planId(req), version(req), 'archived'));
  route('delete', '/training-plans/:id', req => planService.remove(req.user.id, planId(req), version(req)));
  route('patch', '/training-plans/:id/sessions/:sessionId', req => planService.setSessionStatus(
    req.user.id, planId(req), parsePositiveId(req.params.sessionId, 'session id'), version(req),
    choice(req.body?.status, sessionStatuses, 'session status')
  ));
  return router;
}

module.exports = createTrainingPlanRouter;
