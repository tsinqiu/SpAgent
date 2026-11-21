const express = require('express');
const defaultActivityService = require('../services/activityService');
const defaultAuthService = require('../services/authService');
const { ApiError } = require('../errors');
const { asyncHandler } = require('../http');
const { authenticate } = require('../middleware/authMiddleware');
const {
  TIMELINE_GROUPS,
  parseActivityFilters,
  parseEnum,
  parseSummaryFilters,
  parseTrainingFilters,
  parseTrendFilters,
  parseYearMonth,
  sendCachedStats
} = require('./analyticsHelpers');

function createStatsRouter(activityService = defaultActivityService, authService = defaultAuthService) {
  const router = express.Router();
  const requireAuth = authenticate(authService);

  router.get('/stats/activity-types', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, parseActivityFilters(req.query, req.user), filters => activityService.getActivityTypeStats(filters))
  ));

  router.get('/stats/summary', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, parseSummaryFilters(req.query, req.user), filters => activityService.getSummaryStats(filters))
  ));

  router.get('/stats/metric-trend', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, parseTrendFilters(req.query, req.user), filters => activityService.getMetricTrend(filters))
  ));
  router.get('/stats/metric-trends', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, parseTrainingFilters(req.query, req.user), filters => activityService.getMetricTrends(filters))
  ));

  router.get('/stats/calendar', requireAuth, asyncHandler((req, res) => {
    const month = parseYearMonth(req.query.month, 'month');
    if (!month) {
      throw new ApiError(400, 'month is required', 'INVALID_QUERY');
    }

    return sendCachedStats(req, res, { ...parseActivityFilters(req.query, req.user), month },
      filters => activityService.getCalendarStats(filters));
  }));

  router.get('/stats/heatmap', requireAuth, asyncHandler((req, res) => {
    const rawYear = req.query.year ? String(req.query.year).trim() : 'rolling';
    let year = null;
    if (rawYear && rawYear !== 'rolling') {
      if (!/^\d{4}$/.test(rawYear)) {
        throw new ApiError(400, 'year must be "rolling" or a 4-digit year', 'INVALID_QUERY');
      }
      year = rawYear;
    }

    return sendCachedStats(
      req,
      res,
      { ...parseActivityFilters(req.query, req.user, { withDates: false }), year },
      filters => activityService.getActivityHeatmap(filters)
    );
  }));

  router.get('/stats/timeline', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, {
      ...parseSummaryFilters(req.query, req.user),
      groupBy: parseEnum(req.query.group_by, TIMELINE_GROUPS, 'group_by', 'day')
    }, filters => activityService.getTimelineStats(filters))
  ));

  router.get('/stats/heart-rate-zones', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, parseActivityFilters(req.query, req.user), filters => activityService.getHeartRateZones(filters))
  ));

  router.get('/stats/personal-bests', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, parseActivityFilters(req.query, req.user), filters => activityService.getPersonalBests(filters))
  ));

  return router;
}

module.exports = createStatsRouter;
