const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const createApp = require('../src/app');

function api(syncService) {
  return request(createApp({
    syncService,
    authService: { verifyToken: async () => ({ id: 23, role: 'user' }) }
  }));
}

test('Garmin enqueue returns an accepted job for the authenticated account without waiting for sync', async () => {
  const expected = { id: 17, status: 'queued', provider: 'garmin' };
  const app = api({
    async createJob(payload, user) {
      assert.deepEqual(payload, { provider: 'garmin', jobType: 'manual_sync' });
      assert.equal(user.id, 23);
      return expected;
    }
  });
  await app.post('/api/sync/jobs').send({ provider: 'garmin' }).expect(401);
  const res = await app.post('/api/sync/jobs').set('Authorization', 'Bearer test')
    .send({ provider: 'garmin', userId: 626 }).expect(202).expect('Location', '/api/sync/jobs/17');
  assert.deepEqual(res.body, { data: expected, meta: {} });
});

test('Garmin job status only passes the authenticated user and a validated job ID', async () => {
  const expected = { id: 17, status: 'running', provider: 'garmin' };
  const app = api({
    async getJob(id, user) {
      assert.equal(id, 17);
      assert.equal(user.id, 23);
      return expected;
    }
  });
  await app.get('/api/sync/jobs/17').expect(401);
  await app.get('/api/sync/jobs/0').set('Authorization', 'Bearer test').expect(400);
  const res = await app.get('/api/sync/jobs/17?user_id=626').set('Authorization', 'Bearer test').expect(200);
  assert.deepEqual(res.body, { data: expected, meta: {} });
});
