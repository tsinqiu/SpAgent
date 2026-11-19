const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('../src/db');
const { ApiError } = require('../src/errors');
const { createCoachAgent } = require('../src/services/coachAgent');
const { interpretWithRules, checkConstraints } = require('../src/services/coachAgentRules');
const { changeAction } = require('../src/services/coachAgentService');
const trainingPlanService = require('../src/services/trainingPlanService');
const { addDays, localToday, readPlan } = require('../src/services/trainingPlanInput');

const userId = 41;
const first5k = '我每周二、四、日有空，未来四周想建立 5km 跑步习惯。';
const messageId = 'd032a6ab-e97e-4bb4-8b17-e0c2ab8fec3f';

function trainingContext(date, { hasHistory = false, demo = false } = {}) {
  return {
    asOf: date,
    windows: [7, 28].map(days => ({
      days, startDate: addDays(date, 1 - days), endDate: date,
      running: {
        activityCount: hasHistory ? 2 : 0, durationS: hasHistory ? 1200 : null,
        latestDate: hasHistory ? date : null, distanceM: hasHistory ? 2500 : null,
        trainingLoad: null, demoActivities: demo ? 2 : 0,
        coverage: { pace: hasHistory ? 2 : 0, load: 0 }
      },
      recovery: { sleepScore: { samples: 0 }, hrv: { samples: 0 } }
    }))
  };
}

function makeAgent(overrides = {}) {
  return createCoachAgent({
    readContext: async (owner, date) => {
      assert.equal(owner, userId);
      return trainingContext(date);
    },
    readActivePlan: async owner => {
      assert.equal(owner, userId);
      return null;
    },
    aiConfig: { agentUseDeepseek: false },
    ...overrides
  });
}

function weekdays(sessions) {
  return sessions.map(session => new Date(`${session.date}T00:00:00Z`).getUTCDay() || 7).sort();
}

test('a relative start date stays separate from weekly availability', () => {
  const intent = interpretWithRules('我想规律跑步，下周一开始，每周二、四、日有空。');
  const selection = checkConstraints(intent, '2026-11-19');
  assert.equal(selection.startDate, '2026-11-23');
  assert.deepEqual(selection.days, [2, 4, 7]);
});

test('Chinese first 5 km request produces four weeks on the selected days with an explicit no-history basis', async () => {
  const turn = await makeAgent()(first5k, userId);
  assert.deepEqual(turn.meta, { intentProvider: 'rules', fallback: false });
  assert.equal(turn.proposal.saveStatus, 'active');
  const draft = readPlan(turn.proposal.plan);
  assert.equal(draft.goalType, 'first_5k');
  assert.equal(draft.phases.length, 4);
  assert.equal(draft.sessions.length, 12);
  for (let index = 0; index < 12; index += 3) {
    assert.deepEqual(weekdays(draft.sessions.slice(index, index + 3)), [2, 4, 7]);
  }
  assert.ok(draft.sessions.every(session => session.type === 'easy' && session.durationS <= 900));
  assert.deepEqual(turn.cards.filter(card => card.type === 'tool_status').map(card => card.tool), [
    'get_training_context', 'get_active_plan', 'propose_training_plan'
  ]);
  const basis = turn.cards.find(card => card.type === 'evidence');
  assert.equal(basis.mode, '缺少历史数据的基础模板');
  assert.match(basis.ruleVersion, /^coach-/);
  assert.ok(basis.missing.includes('近 28 天跑步记录'));
  assert.ok(basis.missing.includes('HRV'));
  assert.deepEqual(basis.windows.map(({ days, runs, demo }) => ({ days, runs, demo })), [
    { days: 7, runs: 0, demo: false }, { days: 28, runs: 0, demo: false }
  ]);
});

test('adjacent days include shorter recovery and demo history is visible without automatic progression', async () => {
  const agent = makeAgent({
    readContext: async (_owner, date) => trainingContext(date, { hasHistory: true, demo: true }),
    readActivePlan: async () => ({ id: 8, name: '执行中的计划' })
  });
  const turn = await agent('想建立规律跑步习惯，每周一、日有空，每周训练两次。', userId);
  assert.equal(turn.proposal.saveStatus, 'draft');
  const { sessions } = readPlan(turn.proposal.plan);
  assert.equal(sessions.length, 8);
  for (let index = 0; index < 8; index += 2) {
    const week = sessions.slice(index, index + 2);
    assert.deepEqual(weekdays(week), [1, 7]);
    const recovery = week.find(session => session.type === 'recovery');
    const easy = week.find(session => session.type === 'easy');
    assert.deepEqual(weekdays([recovery]), [1]);
    assert.equal(easy.durationS, 600);
    assert.ok(recovery.durationS < easy.durationS);
  }
  const basis = turn.cards.find(card => card.type === 'evidence');
  assert.equal(basis.mode, '按近期训练量安排');
  assert.equal(basis.asOf, basis.windows[1].latestRun);
  assert.ok(basis.windows.every(window => window.demo && window.runs === 2 && window.load === null));
  assert.ok(basis.assumptions.some(assumption => assumption.includes('保持训练量')));
});

test('unapproved model tools and malformed output fall back without changing explicit user choices', async () => {
  for (const reply of [
    'not JSON',
    JSON.stringify({
      intent: 'plan', goalType: 'regular_running', weekdays: [1, 3], frequency: 2,
      tools: ['get_training_context', 'confirm_plan'], userId: 999
    })
  ]) {
    const agent = makeAgent({
      aiConfig: { agentUseDeepseek: true, deepseekApiKey: 'dummy-test-key' },
      complete: async messages => {
        assert.deepEqual(messages.map(message => message.role), ['system', 'user']);
        assert.equal(messages[1].content, first5k);
        return reply;
      }
    });
    const turn = await agent(first5k, userId);
    assert.deepEqual(turn.meta, { intentProvider: 'rules', fallback: true });
    const plan = readPlan(turn.proposal.plan);
    assert.equal(plan.goalType, 'first_5k');
    assert.deepEqual(weekdays(plan.sessions.slice(0, 3)), [2, 4, 7]);
    assert.equal(turn.cards.some(card => card.tool === 'confirm_plan'), false);
  }
});

test('a valid model intent can select the read tools and leaves plan generation to the rules', async () => {
  const agent = makeAgent({
    aiConfig: { agentUseDeepseek: true, deepseekApiKey: 'dummy-test-key' },
    complete: async () => JSON.stringify({
      intent: 'plan', goalType: 'first_5k', weekdays: [3, 6], frequency: 2,
      tools: ['get_active_plan', 'get_training_context']
    })
  });
  const turn = await agent('想准备 5000 米初体验', userId);
  assert.deepEqual(turn.meta, { intentProvider: 'deepseek', fallback: false });
  assert.deepEqual(turn.cards.filter(card => card.type === 'tool_status').map(card => card.tool), [
    'get_active_plan', 'get_training_context', 'propose_training_plan'
  ]);
  const plan = readPlan(turn.proposal.plan);
  assert.equal(plan.goalType, 'first_5k');
  assert.equal(plan.sessions.length, 8);
  assert.deepEqual(weekdays(plan.sessions.slice(0, 2)), [3, 6]);
});

test('unsafe goals, unspecified adjustments and incompatible training days return clarification without a draft', async t => {
  const read = t.mock.fn();
  const complete = t.mock.fn();
  const agent = makeAgent({ readContext: read, readActivePlan: read, complete });
  for (const text of [
    '小腿疼，还想安排四周首次 5 公里训练',
    '想调整正在执行的训练计划',
    '准备首次 5 公里，我每周二有空，每周跑三次'
  ]) {
    const turn = await agent(text, userId);
    assert.ok(turn.content);
    assert.equal(turn.proposal, undefined);
    assert.deepEqual(turn.cards, []);
  }
  assert.equal(read.mock.callCount(), 0);
  assert.equal(complete.mock.callCount(), 0);
});

const routeCases = [
  ['get', '/agent/conversations?before=31', 'list', [31]],
  ['post', '/agent/conversations', 'create', []],
  ['get', '/agent/conversations/19/messages?before=12', 'listMessages', [19, 12]],
  ['post', '/agent/conversations/19/messages', 'postMessage', [19, { message: first5k, clientMessageId: messageId }]],
  ['post', '/agent/actions/23/confirm', 'decision', [23, true]],
  ['post', '/agent/actions/23/reject', 'decision', [23, false]]
];

function authenticatedApp(agentService) {
  return createApp({
    agentService,
    authService: { async verifyToken() { return { id: userId, role: 'user' }; } }
  });
}

test('agent routes require authentication and pass only protected identity and validated input', async () => {
  const calls = [];
  const record = name => async (...args) => {
    calls.push([name, ...args]);
    return { operation: name };
  };
  const app = request(authenticatedApp({
    listConversations: record('list'), createConversation: record('create'),
    listMessages: record('listMessages'), postMessage: record('postMessage'), changeAction: record('decision')
  }));
  for (const [method, path, name] of routeCases) {
    const unauthorized = await app[method](`/api${path}`).expect(401);
    assert.equal(unauthorized.body.error.code, 'AUTH_REQUIRED');
    const req = app[method](`/api${path}`).set('Authorization', 'Bearer user');
    if (method === 'post') req.send({
      userId: 999, message: `  ${first5k}  `, clientMessageId: messageId.toUpperCase(), confirm: false
    });
    const res = await req.expect(name === 'create' ? 201 : 200);
    assert.deepEqual(res.body, { data: { operation: name }, meta: {} });
  }
  assert.deepEqual(calls, routeCases.map(([, , name, args]) => [name, userId, ...args]));
});

test('agent routes reject invalid IDs, messages and non-owned service results', async () => {
  const missing = async () => { throw new ApiError(404, 'Not found', 'AGENT_NOT_FOUND'); };
  const app = request(authenticatedApp({ listMessages: missing, postMessage: missing, changeAction: missing }));
  const auth = 'Bearer user';
  for (const payload of [
    { message: ' ', clientMessageId: messageId },
    { message: '跑'.repeat(1001), clientMessageId: messageId },
    { message: first5k, clientMessageId: 'invalid' }
  ]) {
    const res = await app.post('/api/agent/conversations/19/messages').set('Authorization', auth).send(payload).expect(400);
    assert.equal(res.body.error.code, 'INVALID_AGENT_MESSAGE');
  }
  const invalid = await app.get('/api/agent/conversations/19/messages?before=-1').set('Authorization', auth).expect(400);
  assert.equal(invalid.body.error.code, 'INVALID_PATH_PARAM');
  const conversation = await app.get('/api/agent/conversations/19/messages').set('Authorization', auth).expect(404);
  assert.equal(conversation.body.error.code, 'AGENT_NOT_FOUND');
  const action = await app.post('/api/agent/actions/23/confirm').set('Authorization', auth).expect(404);
  assert.equal(action.body.error.code, 'AGENT_NOT_FOUND');
});

test('action service applies a proposal once and handles rejection and expiry without creating a plan', async t => {
  const { proposal } = await makeAgent()(`${first5k}从 ${addDays(localToday(), 14)} 开始。`, userId);
  let row = {
    actionId: 23, actionType: 'create_plan', storedStatus: 'proposed', actionStatus: 'proposed',
    actionPayload: JSON.stringify(proposal), resultPlanId: null, failureCode: null
  };
  const connection = { async execute(sql, args) {
    if (sql.includes('FOR UPDATE')) {
      assert.deepEqual(args, [23, userId]);
      return [[{ id: row.actionId }]];
    }
    if (sql.includes('SELECT')) {
      assert.deepEqual(args, [23, userId]);
      return [[row]];
    }
    assert.match(sql, /UPDATE AgentActions/);
    assert.deepEqual(args.slice(-2), [23, userId]);
    row = { ...row, storedStatus: args[0], actionStatus: args[0], resultPlanId: args.length === 5 ? args[1] : null };
    return [];
  } };
  t.mock.method(db, 'transaction', async handler => handler(connection));
  const insertPlan = t.mock.method(trainingPlanService, 'createInTransaction', async (transaction, owner, plan, status) => {
    assert.equal(transaction, connection);
    assert.equal(owner, userId);
    assert.deepEqual(plan, readPlan(proposal.plan));
    assert.equal(status, 'active');
    return 61;
  });

  const applied = await changeAction(userId, 23, true);
  assert.equal(applied.status, 'applied');
  assert.equal(applied.planId, 61);
  assert.deepEqual(await changeAction(userId, 23, true), applied);
  assert.deepEqual(await changeAction(userId, 23, false), applied);

  row = { ...row, storedStatus: 'proposed', actionStatus: 'proposed', resultPlanId: null };
  const rejected = await changeAction(userId, 23, false);
  assert.equal(rejected.status, 'rejected');
  assert.deepEqual(await changeAction(userId, 23, true), rejected);

  row = { ...row, storedStatus: 'proposed', actionStatus: 'expired' };
  const expired = await changeAction(userId, 23, true);
  assert.equal(expired.status, 'expired');
  assert.equal(expired.planId, null);
  assert.equal(insertPlan.mock.callCount(), 1);
});
