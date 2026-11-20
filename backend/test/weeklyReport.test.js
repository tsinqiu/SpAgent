const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const createApp = require('../src/app');
const activityService = require('../src/services/activityService');
const planService = require('../src/services/trainingPlanService');
const { getWeeklyReport } = require('../src/services/weeklyReportService');

test('weekly report uses the authenticated account even for an administrator', async () => {
  const calls = [];
  const app = request(createApp({
    authService: { verifyToken: async () => ({ id: 41, role: 'admin' }) },
    weeklyReportService: {
      async getWeeklyReport(...args) {
        calls.push(args);
        return { ok: true };
      }
    }
  }));
  const url = '/api/training/weekly-report?week_start=2026-11-16&owner=all&userId=7';
  await app.get(url).expect(401);
  const result = await app.get(url).set('Authorization', 'Bearer test-account').expect(200);
  assert.deepEqual(result.body, { data: { ok: true }, meta: {} });
  assert.deepEqual(calls, [[41, '2026-11-16']]);
});

test('weekly report fills seven dates, scopes queries, and preserves missing values', async t => {
  const activity = t.mock.method(activityService, 'getTimelineStats', async () => [
    { period: '2026-11-17', activityCount: 2, totalDurationS: '1800', totalDistanceM: '5000',
      durationSamples: 1, distanceSamples: 1, demoActivities: 1 },
    { period: '2026-11-19', activityCount: 1, totalDurationS: null, totalDistanceM: null,
      durationSamples: 0, distanceSamples: 0, demoActivities: 0 }
  ]);
  const sessions = [{ id: 23, date: '2026-11-22', status: 'pending' }];
  const plan = t.mock.method(planService, 'listWeeklySessions', async () => sessions);
  const report = await getWeeklyReport(41, undefined, '2026-11-19');
  assert.deepEqual(activity.mock.calls[0].arguments, [
    { owner: 'mine', ownerUserId: 41, groupBy: 'day', startDate: '2026-10-26', endDate: '2026-11-19' },
    { useTrainingDates: true }
  ]);
  assert.deepEqual(plan.mock.calls[0].arguments, [41, '2026-10-26', '2026-11-22']);
  assert.equal(report.timeZone, 'Asia/Shanghai');
  assert.equal(report.previousWeekStart, '2026-11-09');
  assert.equal(report.nextWeekStart, null);
  assert.equal(report.days.length, 7);
  assert.deepEqual(report.days[6], { date: '2026-11-22', activityCount: 0, durationS: null, distanceM: null });
  assert.deepEqual(report.actual, {
    activityCount: 3, activeDays: 2, durationS: 1800, distanceM: 5000,
    durationSamples: 1, distanceSamples: 1, demoActivities: 1
  });
  assert.deepEqual(report.sessions, sessions);
});

test('weekly execution trend separates weeks, unmeasured activities and tasks still to come', async t => {
  const activity = t.mock.method(activityService, 'getTimelineStats', async () => [
    { period: '2026-11-02', activityCount: 1, durationSamples: 0, distanceSamples: 0 },
    { period: '2026-11-09', activityCount: 2, durationSamples: 1, totalDurationS: 1800, demoActivities: 1 },
    { period: '2026-11-13', activityCount: 1, durationSamples: 1, totalDurationS: 1200 }
  ]);
  const plan = t.mock.method(planService, 'listWeeklySessions', async () => [
    { id: 7, date: '2026-11-11', status: 'completed', planStatus: 'archived' },
    { id: 8, date: '2026-11-12', status: 'skipped', planStatus: 'archived' },
    { id: 9, date: '2026-11-17', status: 'pending', planStatus: 'active' },
    { id: 10, date: '2026-11-19', status: 'pending', planStatus: 'active' },
    { id: 11, date: '2026-11-19', status: 'completed', planStatus: 'active' },
    { id: 12, date: '2026-11-21', status: 'pending', planStatus: 'active' }
  ]);
  const report = await getWeeklyReport(41, undefined, '2026-11-19');
  assert.equal(activity.mock.callCount(), 1);
  assert.equal(plan.mock.callCount(), 1);
  assert.deepEqual(report.trend.map(week => week.startDate), ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
  const [empty, unmeasured, archived, current] = report.trend;
  assert.deepEqual([empty.actual.activityCount, empty.actual.durationS], [0, null]);
  assert.deepEqual([unmeasured.actual.activityCount, unmeasured.actual.durationS], [1, null]);
  assert.equal(archived.actual.durationS, 3000);
  assert.equal(archived.actual.durationSamples, 2);
  assert.equal(archived.actual.demoActivities, 1);
  assert.deepEqual(archived.execution, { completed: 1, skipped: 1, overdue: 0, upcoming: 0, archivedResults: 2 });
  assert.deepEqual(current.execution, { completed: 1, skipped: 0, overdue: 1, upcoming: 2, archivedResults: 0 });
  assert.deepEqual(report.sessions.map(session => session.id), [9, 10, 11, 12]);
  assert.deepEqual(report.trend.map(week => week.isPartial), [false, false, false, true]);
});

test('weekly report rejects malformed, off-week and future dates before querying data', async () => {
  for (const week of ['2026-02-30', '2026-11-17', '2026-11-23', '1999-12-27', ['2026-11-16']]) {
    await assert.rejects(getWeeklyReport(41, week, '2026-11-19'), { statusCode: 400, code: 'INVALID_QUERY' });
  }
});

test('an empty past week can advance and has no estimated totals', async t => {
  t.mock.method(activityService, 'getTimelineStats', async () => []);
  t.mock.method(planService, 'listWeeklySessions', async () => []);
  const report = await getWeeklyReport(41, '2025-12-29', '2026-01-05');
  assert.equal(report.endDate, '2026-01-04');
  assert.equal(report.nextWeekStart, '2026-01-05');
  assert.deepEqual(report.actual, {
    activityCount: 0, activeDays: 0, durationS: null, distanceM: null,
    durationSamples: 0, distanceSamples: 0, demoActivities: 0
  });
});

test('trend begins at the earliest navigable week and handles year boundaries', async t => {
  t.mock.method(activityService, 'getTimelineStats', async () => []);
  t.mock.method(planService, 'listWeeklySessions', async () => []);
  const early = await getWeeklyReport(41, '2000-01-10', '2026-01-05');
  assert.deepEqual(early.trend.map(week => week.startDate), ['2000-01-03', '2000-01-10']);
  const report = await getWeeklyReport(41, '2025-12-29', '2026-01-05');
  assert.equal(report.trend.at(-1).endDate, '2026-01-04');
  assert.equal(report.trend.at(-1).isPartial, false);
});
