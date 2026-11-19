const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const createApp = require('../src/app');
const { ApiError } = require('../src/errors');
const { readPlan } = require('../src/services/trainingPlanInput');
const activityService = require('../src/services/activityService');
const healthService = require('../src/services/healthService');
const { getContext } = require('../src/services/trainingContextService');

function samplePlan() {
  return {
    name: '  第一个 5 公里  ',
    type: 'running',
    goalType: 'first_5k',
    goal: '完成 5 公里',
    startDate: '2028-02-28',
    weeks: Array.from({ length: 4 }, () => ({
      phase: '基础训练',
      days: [
        { title: '休息日' },
        { title: '轻松跑', type: 'easy', distanceM: 3000 },
        {},
        {},
        { title: '有氧跑', type: 'aerobic', durationS: 1800 },
        {},
        {}
      ]
    }))
  };
}

test('normalizes a four-week running plan and schedules sessions across leap day', () => {
  const plan = readPlan(samplePlan());
  assert.equal(plan.name, '第一个 5 公里');
  assert.equal(plan.goalType, 'first_5k');
  assert.equal(plan.phases.length, 4);
  assert.equal(plan.sessions.length, 8);
  assert.deepEqual(plan.sessions[0], {
    date: '2028-02-29', type: 'easy', title: '轻松跑', subtitle: '', note: '', distanceM: 3000, durationS: null
  });
  assert.equal(plan.sessions[7].date, '2028-03-24');
  assert.equal(plan.sessions[7].durationS, 1800);
});

test('rejects invalid dates, running schedules and session goals', () => {
  for (const [edit, code] of [
    [plan => { plan.startDate = '2027-02-29'; }, 'INVALID_QUERY'],
    [plan => { plan.weeks.pop(); }, 'INVALID_TRAINING_PLAN'],
    [plan => { plan.weeks[1].days.pop(); }, 'INVALID_TRAINING_PLAN'],
    [plan => { plan.weeks[1].days[1] = {}; }, 'INVALID_TRAINING_PLAN'],
    [plan => { plan.weeks[0].days[1].distanceM = '3000'; }, 'INVALID_TRAINING_PLAN'],
    [plan => { plan.type = 'swimming'; }, 'INVALID_TRAINING_PLAN']
  ]) {
    const plan = samplePlan();
    edit(plan);
    assert.throws(() => readPlan(plan), { statusCode: 400, code });
  }
});

const routes = [
  ['get', '/training/context'],
  ['get', '/training-plans'],
  ['get', '/training-plans/19'],
  ['post', '/training-plans'],
  ['put', '/training-plans/19'],
  ['post', '/training-plans/19/activate'],
  ['post', '/training-plans/19/archive'],
  ['delete', '/training-plans/19'],
  ['patch', '/training-plans/19/sessions/27']
];

function authedApp(services = {}) {
  return createApp({
    authService: {
      async verifyToken(token) {
        assert.equal(token, 'test-account');
        return { id: 41, role: 'user' };
      }
    },
    ...services
  });
}

test('requires a bearer token for every plan and training-context route', async () => {
  const app = request(createApp());
  for (const [method, path] of routes) {
    const res = await app[method](`/api${path}`).expect(401);
    assert.equal(res.body.error.code, 'AUTH_REQUIRED', `${method} ${path}`);
  }
});

test('routes use the authenticated user ID and preserve the plan response envelope', async () => {
  const calls = [];
  const record = operation => async (...args) => {
    calls.push([operation, ...args]);
    return { operation };
  };
  const planService = Object.fromEntries(
    ['list', 'get', 'create', 'update', 'setStatus', 'remove', 'setSessionStatus'].map(name => [name, record(name)])
  );
  const app = request(authedApp({ planService, contextService: { getContext: record('context') } }));
  const payload = { ...samplePlan(), ownerUserId: 7, userId: 7 };
  const plan = readPlan(payload);
  const body = { ...payload, version: 3, status: 'completed' };
  const operations = [
    ['context'], ['list'], ['get', 19], ['create', plan], ['update', 19, 3, body],
    ['setStatus', 19, 3, 'active'], ['setStatus', 19, 3, 'archived'], ['remove', 19, 3],
    ['setSessionStatus', 19, 27, 3, 'completed']
  ];

  for (const [index, [method, path]] of routes.entries()) {
    const [operation] = operations[index];
    const req = app[method](`/api${path}`).set('Authorization', 'Bearer test-account');
    if (method !== 'get') req.send(body);
    const res = await req.expect(operation === 'create' ? 201 : 200);
    assert.deepEqual(res.body, { data: { operation }, meta: {} });
  }
  assert.deepEqual(calls, operations.map(([operation, ...args]) => [operation, 41, ...args]));
});

test('malformed IDs, stale versions and unavailable plans retain their API errors', async () => {
  const app = request(authedApp({
    planService: {
      async get() {
        throw new ApiError(404, 'Training plan or session not found', 'TRAINING_PLAN_NOT_FOUND');
      },
      async setStatus() {
        throw new ApiError(409, 'Reload the plan before saving changes', 'TRAINING_PLAN_VERSION_CONFLICT');
      }
    }
  }));
  const token = 'Bearer test-account';
  const invalidId = await app.get('/api/training-plans/19foo').set('Authorization', token).expect(400);
  assert.equal(invalidId.body.error.code, 'INVALID_PATH_PARAM');
  const missing = await app.get('/api/training-plans/19').set('Authorization', token).expect(404);
  assert.equal(missing.body.error.code, 'TRAINING_PLAN_NOT_FOUND');
  const missingVersion = await app.post('/api/training-plans/19/activate').set('Authorization', token).send({}).expect(400);
  assert.equal(missingVersion.body.error.code, 'INVALID_TRAINING_PLAN');
  const stale = await app.post('/api/training-plans/19/activate').set('Authorization', token).send({ version: 2 }).expect(409);
  assert.equal(stale.body.error.code, 'TRAINING_PLAN_VERSION_CONFLICT');
});

test('training context uses the authenticated scope, exact windows and nullable recovery coverage', async t => {
  const activity = t.mock.method(activityService, 'getSummaryStats', async () => ({
    activityCount: 0, runningDays: 0, totalDistanceM: null, avgPaceSecPerKm: null,
    totalTrainingLoad: null, latestDate: null, demoActivities: 0, distanceSamples: 0, paceSamples: 0, loadSamples: 0
  }));
  const recovery = t.mock.method(healthService, 'getRecoveryDays', async () => ({
    sleep: [
      { date: '2028-03-01', sleepScore: 0, hrv: null, isDemo: 1 },
      { date: '2028-02-12', sleepScore: 80, hrv: 45, isDemo: 0 }
    ],
    daily: []
  }));
  const context = await getContext(41, '2028-03-01');
  assert.equal(context.asOf, '2028-03-01');
  assert.equal(context.timeZone, 'Asia/Shanghai');
  assert.deepEqual(recovery.mock.calls.map(call => call.arguments), [[41, '2028-02-03', '2028-03-01']]);
  assert.deepEqual(activity.mock.calls.map(call => call.arguments[0]), ['2028-02-24', '2028-02-03'].map(startDate => ({
    owner: 'mine', ownerUserId: 41, runningOnly: true, startDate, endDate: '2028-03-01'
  })));
  const [week, month] = context.windows;
  assert.deepEqual(week.recovery.sleepScore, { samples: 1, average: 0, latestDate: '2028-03-01', demoSamples: 1 });
  assert.deepEqual(week.recovery.hrv, { samples: 0, average: null, latestDate: null, demoSamples: 0 });
  assert.deepEqual(month.recovery.sleepScore, { samples: 2, average: 40, latestDate: '2028-03-01', demoSamples: 1 });
  assert.equal(month.recovery.hrv.latestDate, '2028-02-12');
});
