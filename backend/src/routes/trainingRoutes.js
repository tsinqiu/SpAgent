const express = require('express');
const defaultActivityService = require('../services/activityService');
const defaultAuthService = require('../services/authService');
const defaultPerformanceProfileService = require('../services/performanceProfileService');
const { asyncHandler } = require('../http');
const { authenticate } = require('../middleware/authMiddleware');
const { sendData } = require('../response');
const { parseTrainingFilters, sendCachedStats } = require('./analyticsHelpers');

function createTrainingRouter(
  activityService = defaultActivityService,
  authService = defaultAuthService,
  performanceProfileService = defaultPerformanceProfileService
) {
  const router = express.Router();
  const requireAuth = authenticate(authService);

  router.get('/training/load-balance', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, parseTrainingFilters(req.query, req.user), filters => activityService.getLoadBalance(filters))
  ));

  router.get('/training/performance-profile', requireAuth, asyncHandler(async (req, res) => {
    const profile = await performanceProfileService.getPerformanceProfile(req.user);
    sendData(res, profile);
  }));

  return router;
}

module.exports = createTrainingRouter;
