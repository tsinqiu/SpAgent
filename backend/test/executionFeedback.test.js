const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const createApp = require('../src/app');
const { ApiError } = require('../src/errors');
const { comparison, isTrusted } = require('../src/services/trainingExecutionService');
const { revisionIntent, buildRevision } = require('../src/services/coachRevisionRules');
const { reviseInTransaction } = require('../src/services/trainingPlanService');
const { addDays, localToday } = require('../src/services/trainingPlanInput');

const userId = 41;
const today = '2027-01-05';
const planned = { date: '2027-01-07', title: '轻松跑', distanceM: 5000, durationS: 1500, status: 'pending' };
const actual = { date: planned.date, name: '合成跑步', distanceM: 5250, durationS: 1470, source: 'demo_synthetic' };

test('execution comparison reports directional distance, time and pace deltas', () => {
  const result = comparison(planned, { ...actual, date: '2027-01-08' }, 'manual');
  assert.deepEqual(result.planned, {
    title: '轻松跑', date: '2027-01-07', distanceM: 5000, durationS: 1500, paceS: 300
  });
  assert.deepEqual(result.actual, {
    name: '合成跑步', date: '2027-01-08', source: 'demo_synthetic', distanceM: 5250, durationS: 1470, paceS: 280
  });
  assert.deepEqual(result.delta, { distanceM: 250, durationS: -30, paceS: -20 });
  assert.equal(result.method, 'manual');
  assert.match(result.review, /日期与原定日期不同/);
  assert.match(result.review, /少 30 秒/);
  assert.match(result.review, /多 250 米/);
});

test('missing targets and invalid readings stay null rather than becoming distance, time or pace differences', () => {
  const result = comparison(
    { ...planned, distanceM: null, durationS: 0 },
    { ...actual, distanceM: -6, durationS: 1200 },
    'manual'
  );
  assert.deepEqual(result.planned, {
    title: '轻松跑', date: planned.date, distanceM: null, durationS: null, paceS: null
  });
  assert.equal(result.actual.distanceM, null);
  assert.equal(result.actual.durationS, 1200);
  assert.equal(result.actual.paceS, null);
  assert.deepEqual(result.delta, { distanceM: null, durationS: null, paceS: null });
  assert.match(result.review, /数据不足/);
});

test('automatic trust requires one scheduled day, a pending task and all measured targets within tolerance', () => {
  assert.equal(isTrusted(planned, actual), true);
  assert.equal(isTrusted(planned, { ...actual, distanceM: 3500, durationS: 2025 }), true);
  assert.equal(isTrusted({ ...planned, distanceM: null }, actual), true);
  assert.equal(isTrusted(planned, { ...actual, date: '2027-01-08' }), false);
  assert.equal(isTrusted({ ...planned, status: 'completed' }, actual), false);
  assert.equal(isTrusted({ ...planned, status: 'skipped' }, actual), false);
  assert.equal(isTrusted({ ...planned, distanceM: null, durationS: null }, actual), false);
  assert.equal(isTrusted(planned, { ...actual, distanceM: 3499 }), false);
  assert.equal(isTrusted(planned, { ...actual, durationS: 2026 }), false);
  assert.equal(isTrusted(planned, { ...actual, durationS: null }), false);
});

function samplePlan() {
  return {
    id: 19, name: '四周轻松跑', version: 3,
    weeks: [{ days: [
      { id: 10, date: '2027-01-04', status: 'completed' },
      { id: 11, date: '2027-01-05', status: 'pending', execution: {} },
      { id: 12, date: '2027-01-06', status: 'skipped' },
      { ...planned, id: 13, type: 'easy' },
      { date: '2027-01-08' },
      { ...planned, id: 14, date: '2027-01-09', type: 'easy' },
      { date: '2027-01-10' }
    ] }]
  };
}

test('a Chinese scheduling conflict captures the exact before and after dates without changing the current plan', () => {
  const plan = samplePlan();
  const original = structuredClone(plan);
  const intent = revisionIntent('本周四有考试，把训练移到周五。', today);
  assert.deepEqual(intent, { kind: 'move', from: planned.date, to: '2027-01-08', scheduleConflict: true });

  const proposal = buildRevision(plan, intent, today);
  assert.equal(proposal.planId, 19);
  assert.equal(proposal.sessionId, 13);
  assert.equal(proposal.version, 3);
  assert.equal(proposal.kind, 'move');
  assert.deepEqual(proposal.before, {
    title: '轻松跑', type: 'easy', date: planned.date, distanceM: 5000, durationS: 1500
  });
  assert.deepEqual(proposal.after, { ...proposal.before, date: '2027-01-08' });
  assert.match(proposal.reason, /日程冲突/);
  assert.deepEqual(plan, original);
});

test('reduction targets the next eligible task and locked, occupied or out-of-week dates yield no revision', () => {
  const plan = samplePlan();
  const intent = revisionIntent('最近睡眠不足，下一次训练减少 20%。', today);
  assert.deepEqual(intent, { kind: 'reduce', from: null, percent: 20, recovery: true });
  const reduced = buildRevision(plan, intent, today);
  assert.equal(reduced.sessionId, 13);
  assert.deepEqual(reduced.after, { ...reduced.before, durationS: 1200, distanceM: 4000 });
  assert.ok(revisionIntent('下一次训练减少 45%', today).reply);
  assert.deepEqual(revisionIntent('回顾完成情况', today), { kind: 'review' });
  assert.equal(revisionIntent('不用调整训练', today), null);

  for (const date of ['2027-01-04', '2027-01-05', '2027-01-06']) {
    assert.match(buildRevision(plan, { kind: 'move', from: date, to: '2027-01-08' }, today).reply, /没有可调整/);
  }
  for (const date of ['2027-01-09', '2027-01-11']) {
    assert.match(buildRevision(plan, { kind: 'move', from: planned.date, to: date }, today).reply, /同一训练周的空闲日/);
  }
});

test('revision confirmation checks the current version and immutable task state before writing', async () => {
  const startDate = addDays(localToday(), 14);
  const session = { id: 13, date: startDate, status: 'pending', title: '轻松跑', type: 'easy', durationS: 1500, distanceM: 5000 };
  const plan = { id: 19, version: 3, startDate, type: 'running', status: 'active' };
  const revision = {
    planId: 19, sessionId: 13, version: 3, kind: 'move', reason: '测试改期',
    after: { date: addDays(startDate, 1) }
  };

  for (const [change, version, code] of [
    [{}, 4, 'TRAINING_PLAN_VERSION_CONFLICT'],
    [{ status: 'completed' }, 3, 'TRAINING_PLAN_CONFLICT'],
    [{ status: 'skipped' }, 3, 'TRAINING_PLAN_CONFLICT'],
    [{ snapshot: { method: 'manual' } }, 3, 'TRAINING_PLAN_CONFLICT']
  ]) {
    const connection = { async execute(sql, params) {
      if (sql.includes('FROM TrainingPlans')) {
        assert.match(sql, /FOR UPDATE/);
        assert.deepEqual(params, [19, userId]);
        return [[{ ...plan, version }]];
      }
      if (sql.includes('FROM TrainingSessions')) return [[{ ...session, ...change }]];
      assert.fail(`Unexpected write: ${sql}`);
    } };
    await assert.rejects(reviseInTransaction(connection, userId, revision, 23), { code });
  }
});

const routes = [
  ['get', '/training-sessions/13/activity-candidates', 'candidates', [13]],
  ['get', '/activities/27/plan-execution', 'execution', [27]],
  ['post', '/training-sessions/13/link-activity', 'link', [13, 27, 3]],
  ['get', '/training-plans/19/revisions?before=31', 'revisions', [19, 31]]
];

test('execution and revision routes require authentication and derive ownership from the current bearer token', async () => {
  const calls = [];
  const forOwner = (operation, missingCode) => async (owner, ...values) => {
    calls.push([operation, owner, ...values]);
    if (owner !== userId) throw new ApiError(404, 'Not found', missingCode);
    return { operation };
  };
  const app = request(createApp({
    authService: { async verifyToken(token) { return { id: token === 'owner' ? userId : 17, role: 'user' }; } },
    planService: { revisions: forOwner('revisions', 'TRAINING_PLAN_NOT_FOUND') },
    executionService: {
      activityCandidates: forOwner('candidates', 'EXECUTION_NOT_FOUND'),
      activityExecution: forOwner('execution', 'EXECUTION_NOT_FOUND'),
      linkActivity: forOwner('link', 'EXECUTION_NOT_FOUND')
    }
  }));
  const issue = (method, path, token) => {
    const req = app[method](`/api${path}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return method === 'post' ? req.send({ activityId: 27, version: 3, userId, method: 'automatic' }) : req;
  };
  for (const [method, path, operation] of routes) {
    const unauthenticated = await issue(method, path).expect(401);
    assert.equal(unauthenticated.body.error.code, 'AUTH_REQUIRED');
    const owner = await issue(method, path, 'owner').expect(200);
    assert.deepEqual(owner.body, { data: { operation }, meta: {} });
    const otherUser = await issue(method, path, 'other-user').expect(404);
    assert.equal(otherUser.body.error.code, operation === 'revisions' ? 'TRAINING_PLAN_NOT_FOUND' : 'EXECUTION_NOT_FOUND');
  }
  assert.deepEqual(calls, routes.flatMap(([, , operation, args]) => [[operation, userId, ...args], [operation, 17, ...args]]));
  const malformed = await app.post('/api/training-sessions/13/link-activity')
    .set('Authorization', 'Bearer owner').send({ activityId: 0, version: 3 }).expect(400);
  assert.equal(malformed.body.error.code, 'INVALID_PATH_PARAM');
  const noVersion = await app.post('/api/training-sessions/13/link-activity')
    .set('Authorization', 'Bearer owner').send({ activityId: 27 }).expect(400);
  assert.equal(noVersion.body.error.code, 'INVALID_TRAINING_PLAN');
  assert.equal(calls.length, 8);
});
