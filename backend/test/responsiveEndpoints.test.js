const assert = require('node:assert/strict');
const { test } = require('node:test');
const request = require('supertest');
const createApp = require('../src/app');
const statsCache = require('../src/cache/statsCache');

test('equivalent concurrent stats requests load once and remain scoped to the authenticated user', async () => {
  if (!statsCache.stats().enabled) return;
  statsCache.clear();
  const calls = [];
  const app = createApp({
    authService: { verifyToken: async token => ({ id: Number(token), role: 'user' }) },
    activityService: {
      async getMetricTrends(filters) {
        calls.push(filters.ownerUserId);
        await new Promise(resolve => setTimeout(resolve, 30));
        return { distance_m: [{ date: '2026-11-20', value: filters.ownerUserId }] };
      }
    }
  });
  try {
    const paths = ['', '?range=3m', '?activity_type=all', '?debug=any'].map(query => '/api/stats/metric-trends' + query);
    const replies = await Promise.all(paths.map(path => request(app).get(path).set('Authorization', 'Bearer 17').expect(200)));
    assert.equal(replies.every(reply => reply.body.data.distance_m[0].value === 17), true);
    const other = await request(app).get(paths[0]).set('Authorization', 'Bearer 18').expect(200);
    assert.equal(other.body.data.distance_m[0].value, 18);
    assert.deepEqual(calls, [17, 18]);
  } finally {
    statsCache.clear();
  }
});

test('invalidating stats during a read prevents that read from repopulating the cache', async () => {
  if (!statsCache.stats().enabled) return;
  const req = { path: '/example', user: { id: 1, role: 'user' } };
  const filters = { ownerUserId: 1 };
  const original = Promise.withResolvers();
  const pending = statsCache.load(req, filters, () => original.promise);
  statsCache.clear();
  const fresh = await statsCache.load(req, filters, async () => 'fresh');
  original.resolve('old');
  assert.equal((await pending).data, 'old');
  assert.equal(fresh.data, 'fresh');
  assert.deepEqual(await statsCache.load(req, filters, () => assert.fail('expected cached data')), { data: 'fresh', hit: true });
  statsCache.clear();
});
