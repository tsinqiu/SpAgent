const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('../src/db');
const reminders = require('../src/services/trainingReminderService');

test('reminder requests are uncached, use the authenticated account and validate the dismissal ID', async t => {
  const calls = [];
  for (const operation of ['getPreferences', 'savePreferences', 'list', 'dismiss']) {
    t.mock.method(reminders, operation, async (...args) => {
      calls.push([operation, ...args]);
      return {};
    });
  }
  const app = request(createApp({ authService: { verifyToken: async () => ({ id: 41, role: 'admin' }) } }));
  const pathname = '/api/training/reminders';
  const preferences = { dailyTraining: true, weeklyReport: false, userId: 7 };
  await app.get(pathname).expect(401);
  await app.put(`${pathname}/preferences`).send(preferences).expect(401);
  await app.post(`${pathname}/42/dismiss`).expect(401);
  await app.get(`${pathname}?userId=7&asOf=2099-01-01`).set('Authorization', 'Bearer fixture').expect(200).expect('Cache-Control', 'no-store');
  await app.get(`${pathname}/preferences?userId=7`).set('Authorization', 'Bearer fixture').expect(200);
  await app.put(`${pathname}/preferences`).set('Authorization', 'Bearer fixture').send(preferences).expect(200);
  await app.post(`${pathname}/wrong/dismiss`).set('Authorization', 'Bearer fixture').expect(400);
  await app.post(`${pathname}/42/dismiss`).set('Authorization', 'Bearer fixture').send({ userId: 7 }).expect(200);
  assert.deepEqual(calls, [
    ['list', 41], ['getPreferences', 41], ['savePreferences', 41, preferences], ['dismiss', 41, 42]
  ]);
});

test('disabled preferences are the default and invalid updates never query storage', async t => {
  const query = t.mock.method(db, 'query', async () => []);
  assert.deepEqual(await reminders.getPreferences(5), { dailyTraining: false, weeklyReport: false });
  assert.deepEqual(await reminders.list(5, '2026-11-20'), { asOf: '2026-11-20', reminders: [] });
  assert.equal(query.mock.callCount(), 2);
  await assert.rejects(reminders.savePreferences(5, { dailyTraining: true }), { statusCode: 400 });
  await assert.rejects(reminders.savePreferences(5, { dailyTraining: 'true', weeklyReport: false }), { statusCode: 400 });
  assert.equal(query.mock.callCount(), 2);
});

test('qualified reminders materialize their own period once and preserve current titles and dismissal', async t => {
  const daily = { id: 24, kind: 'daily_training', periodStart: '2026-11-20', dismissedAt: null };
  const weekly = { id: 25, kind: 'weekly_report', periodStart: '2026-11-09', dismissedAt: '2026-11-16 10:00:00' };
  let stored = [weekly];
  let pending = true;
  const query = t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('FROM TrainingReminderPreferences prefs')) {
      assert.deepEqual(params, ['2026-11-09', '2026-11-16', '2026-11-09', '2026-11-16', '2026-11-20', 5]);
      return [{ weeklyDue: true, planId: 5, sessionId: pending ? 19 : null, sessionTitle: '轻松跑' }];
    }
    if (sql.includes('INSERT INTO TrainingReminders')) {
      assert.match(sql, /ON DUPLICATE KEY UPDATE/);
      assert.deepEqual(params, [5, 'daily_training', '2026-11-20']);
      stored = [daily, weekly];
      return { affectedRows: 1 };
    }
    assert.match(sql, /FROM TrainingReminders WHERE user_id = \?/);
    assert.equal(params[0], 5);
    return stored;
  });
  const expected = { asOf: '2026-11-20', reminders: [{
    id: 24, kind: 'daily_training', periodStart: '2026-11-20', planId: 5, sessionId: 19, sessionTitle: '轻松跑'
  }] };
  assert.deepEqual(await reminders.list(5, '2026-11-20'), expected);
  assert.deepEqual(await reminders.list(5, '2026-11-20'), expected);
  pending = false;
  assert.deepEqual(await reminders.list(5, '2026-11-20'), { asOf: '2026-11-20', reminders: [] });
  assert.equal(query.mock.calls.filter(({ arguments: [sql] }) => sql.includes('INSERT INTO')).length, 1);
});

test('dismissal is account scoped and repeated dismissals are safe', async t => {
  t.mock.method(db, 'query', async (sql, [account, id]) => {
    assert.equal(id, 25);
    assert.match(sql, /WHERE user_id = \? AND id = \?/);
    if (sql.includes('COALESCE(dismissed_at,')) return { affectedRows: 0 };
    return account === 5 ? [{ id }] : [];
  });
  assert.deepEqual(await reminders.dismiss(5, 25), { dismissed: true });
  await assert.rejects(reminders.dismiss(7, 25), { statusCode: 404, code: 'REMINDER_NOT_FOUND' });
});
