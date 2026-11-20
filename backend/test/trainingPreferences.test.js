const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('../src/db');
const preferences = require('../src/services/trainingPreferenceService');

test('training preferences use the authenticated account for reading, saving and clearing', async t => {
  const calls = [];
  const sample = { goalType: 'first_5k', weekdays: [2, 4] };
  for (const operation of ['get', 'save', 'clear']) {
    t.mock.method(preferences, operation, async (...args) => {
      calls.push([operation, ...args]);
      return operation === 'clear' ? { goalType: null, weekdays: [] } : sample;
    });
  }
  const app = request(createApp({ authService: { verifyToken: async () => ({ id: 41, role: 'admin' }) } }));
  const url = '/api/training/preferences?userId=7';
  for (const method of ['get', 'put', 'delete']) {
    await app[method](url).expect(401);
    const action = app[method](url).set('Authorization', 'Bearer test-account');
    if (method === 'put') action.send(sample);
    const { body } = await action.expect(200);
    assert.deepEqual(body.data, method === 'delete' ? { goalType: null, weekdays: [] } : sample);
  }
  assert.deepEqual(calls, [['get', 41], ['save', 41, sample], ['clear', 41]]);
});

test('preference storage normalizes weekdays, preserves unset fields and clears empty preferences', async t => {
  const query = t.mock.method(db, 'query', async () => []);
  assert.deepEqual(await preferences.get(41), { goalType: null, weekdays: [] });
  assert.deepEqual(await preferences.save(41, { goalType: null, weekdays: [6, 2] }), { goalType: null, weekdays: [2, 6] });
  assert.deepEqual(query.mock.calls[1].arguments[1], [41, null, '[2,6]']);
  assert.deepEqual(await preferences.save(41, { goalType: null, weekdays: [] }), { goalType: null, weekdays: [] });
  assert.match(query.mock.calls[2].arguments[0], /DELETE FROM TrainingPreferences WHERE user_id = \?/);
  assert.deepEqual(query.mock.calls[2].arguments[1], [41]);
});

test('preference validation rejects ambiguous days and unsupported goals before writing', async t => {
  const query = t.mock.method(db, 'query', async () => assert.fail('Invalid preferences reached the database'));
  const invalid = [
    { goalType: 'custom', weekdays: [2, 4] },
    { goalType: null, weekdays: [2] },
    { goalType: null, weekdays: [1, 2, 3, 4, 5] },
    { goalType: 'first_5k', weekdays: [2, 2] },
    { goalType: null, weekdays: [2, '4'] },
    { goalType: null, weekdays: [0, 8] },
    {},
    null
  ];
  for (const body of invalid) {
    await assert.rejects(preferences.save(41, body), { code: 'INVALID_TRAINING_PREFERENCES', statusCode: 400 });
  }
  assert.equal(query.mock.callCount(), 0);
});
