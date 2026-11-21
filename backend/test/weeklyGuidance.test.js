const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const createApp = require('../src/app');
const { runCoachHarness } = require('../src/services/coachHarness');
const contextService = require('../src/services/trainingContextService');
const planService = require('../src/services/trainingPlanService');
const guidanceService = require('../src/services/weeklyGuidanceService');
const { localToday, mondayOf } = require('../src/services/trainingPlanInput');

const today = '2026-11-20';
const owner = 41;

function samplePlan(secondStatus) {
  return {
    id: 11, name: '四周计划', version: 5, status: 'active', type: 'running',
    weeks: [
      { days: [
        { id: 1, date: '2026-11-17', status: 'completed' },
        { id: 2, date: '2026-11-19', status: secondStatus },
        { id: 3, date: today, status: 'pending' },
        { id: 4, date: '2026-11-22', status: 'pending', durationS: 2400 }
      ] },
      { days: [
        { id: 5, date: '2026-11-24', status: 'completed', durationS: 1200 },
        { id: 6, date: '2026-11-25', status: 'pending', title: '有氧跑', type: 'aerobic', distanceM: 4000, durationS: 1800 }
      ] }
    ]
  };
}

function stubWeek(t, { secondStatus = 'completed', history = true, lowSleep = false, applied = false } = {}) {
  const plan = samplePlan(secondStatus);
  t.mock.method(planService, 'getActive', async userId => {
    assert.equal(userId, owner);
    return { id: plan.id };
  });
  t.mock.method(planService, 'get', async (userId, planId) => {
    assert.deepEqual([userId, planId], [owner, plan.id]);
    return plan;
  });
  t.mock.method(planService, 'hasAppliedWeeklyRevision', async (userId, planId, date) => {
    assert.deepEqual([userId, planId, date], [owner, plan.id, '2026-11-16']);
    return applied;
  });
  t.mock.method(contextService, 'getContext', async (userId, date) => {
    assert.deepEqual([userId, date], [owner, today]);
    return {
      windows: [7, 28].map((days, index) => ({
        days, startDate: index ? '2026-10-24' : '2026-11-14', endDate: date,
        running: {
          activityCount: history ? [2, 4][index] : 0,
          durationS: history ? 3600 : null, distanceM: history ? 5000 : null, demoActivities: 0
        },
        recovery: {
          sleepScore: { samples: 0, average: null },
          sleepDurationS: { samples: lowSleep ? 2 : 0, average: lowSleep ? 18000 : null },
          hrv: { samples: 0 }
        }
      }))
    };
  });
}

test('weekly advice maintains a completed plan and excludes today’s pending and future sessions', async t => {
  stubWeek(t);
  const { guidance, revision } = await guidanceService.reviewWeek(owner, today);
  assert.deepEqual(guidance.execution, { due: 2, completed: 2, skipped: 0, outstanding: 0 });
  assert.equal(guidance.kind, 'maintain');
  assert.equal(guidance.previewAvailable, false);
  assert.equal(revision, null);
});

test('partial execution generates one 15% revision for a pending session next week', async t => {
  stubWeek(t, { secondStatus: 'skipped' });
  const { guidance, revision } = await guidanceService.reviewWeek(owner, today);
  assert.deepEqual(guidance.execution, { due: 2, completed: 1, skipped: 1, outstanding: 0 });
  assert.equal(guidance.kind, 'reduce');
  assert.equal(guidance.previewAvailable, true);
  assert.deepEqual([revision.weeklyReviewWeek, revision.version, revision.sessionId], ['2026-11-16', 5, 6]);
  assert.equal(revision.after.date, '2026-11-25');
  assert.equal(revision.after.distanceM, 3400);
  assert.equal(revision.after.durationS, 1530);
});

test('measured short sleep can trigger a conservative proposal with a visible reason', async t => {
  stubWeek(t, { lowSleep: true });
  const { guidance, revision } = await guidanceService.reviewWeek(owner, today);
  assert.equal(guidance.kind, 'reduce');
  assert.match(revision.reason, /日均睡眠少于 6 小时/);
});

test('missing running history leaves the plan unchanged even when a session was skipped', async t => {
  stubWeek(t, { secondStatus: 'skipped', history: false, lowSleep: true });
  const { guidance, revision } = await guidanceService.reviewWeek(owner, today);
  assert.equal(guidance.kind, 'needs_data');
  assert.equal(revision, null);
  assert.equal(guidance.recovery.sleepScore.average, null);
  assert.equal(guidance.windows[0].durationS, null);
});

test('a previously applied weekly revision cannot be proposed again', async t => {
  stubWeek(t, { secondStatus: 'skipped', applied: true });
  const { guidance, revision } = await guidanceService.reviewWeek(owner, today);
  assert.equal(guidance.kind, 'applied');
  assert.equal(revision, null);
});

test('coach previews the server revision via local rules and rejects a stale report', async t => {
  const date = mondayOf(localToday());
  const revision = { planId: 11, sessionId: 6 };
  const review = t.mock.method(guidanceService, 'reviewWeek', async userId => {
    assert.equal(userId, owner);
    return { guidance: { asOf: localToday() }, revision };
  });
  const turn = await runCoachHarness({
    message: `预览 ${date} 周报的下周训练调整`,
    userId: owner
  });
  assert.deepEqual(turn.proposal, { type: 'revise_plan', revision });
  const stale = await runCoachHarness({
    message: '预览 2000-01-03 周报的下周训练调整',
    userId: owner
  });
  assert.match(stale.content, /已经过期/);
  assert.equal(stale.proposal, undefined);
  assert.equal(review.mock.callCount(), 1);
});

test('weekly guidance is authenticated and ignores a caller-supplied account or date', async t => {
  const get = t.mock.method(guidanceService, 'getWeeklyGuidance', async () => ({ kind: 'maintain' }));
  const app = request(createApp({ authService: { verifyToken: async () => ({ id: owner, role: 'admin' }) } }));
  const url = '/api/training/weekly-guidance?userId=7&week_start=2000-01-03';
  await app.get(url).expect(401);
  const result = await app.get(url).set('Authorization', 'Bearer test-account').expect(200);
  assert.deepEqual(result.body, { data: { kind: 'maintain' }, meta: {} });
  assert.deepEqual(get.mock.calls[0].arguments, [owner]);
});
