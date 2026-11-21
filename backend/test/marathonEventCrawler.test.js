const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('../src/db');
const {
  classifyMarathonRace,
  isDomesticEvent,
  parseDetailPageHtml,
  parseListPageHtml
} = require('../src/services/marathonEventCrawlerService');

test('classifyMarathonRace strictly retains half and full marathons while excluding 10K, trail, and fun runs', () => {
  assert.deepEqual(
    classifyMarathonRace('2027眉山仁寿半程马拉松暨跑遍四川（眉山站）'),
    { raceCategory: 'half', distanceLabel: '半马' }
  );
  assert.deepEqual(
    classifyMarathonRace('2027上海嘉定半程马拉松暨蒸蒸日上迎新跑'),
    { raceCategory: 'half', distanceLabel: '半马' }
  );
  assert.deepEqual(
    classifyMarathonRace(
      '2026海口马拉松',
      '设马拉松（42.195公里）（5000人）、半程马拉松（21.0975公里）（15000人）两个项目'
    ),
    { raceCategory: 'full_half', distanceLabel: '全马 / 半马' }
  );
  assert.deepEqual(
    classifyMarathonRace('2026南京马拉松', '仅设全程马拉松（42.195公里）项目'),
    { raceCategory: 'full', distanceLabel: '全马' }
  );

  // Non-HM/FM events must be excluded
  assert.equal(classifyMarathonRace('2026上海10公里精英赛'), null);
  assert.equal(classifyMarathonRace('2027 WSE 10KM OPEN 长沙站'), null);
  assert.equal(classifyMarathonRace('2027北京世园公园UTP100春季嘉年华'), null);
  assert.equal(classifyMarathonRace('2026乐安越野赛'), null);
  assert.equal(classifyMarathonRace('2027爱徒野成都“新年跑”为爱奔跑'), null);
  assert.equal(classifyMarathonRace('2026上海欢乐跑5公里'), null);
  assert.equal(classifyMarathonRace('2026石家庄马拉松线上春季赛'), null);
});

test('isDomesticEvent keeps Chinese mainland/HK/MO/TW events and filters overseas marathons', () => {
  assert.equal(isDomesticEvent('2026上海马拉松', '上海・黄浦区'), true);
  assert.equal(isDomesticEvent('2027渣打香港马拉松', '香港特别行政区・九龍尖沙咀'), true);
  assert.equal(isDomesticEvent('2027芝加哥马拉松', '美国・芝加哥・格兰特公园'), false);
  assert.equal(isDomesticEvent('2027柏林马拉松', '德国・柏林・勃兰登堡门'), false);
  assert.equal(isDomesticEvent('2027南非开普敦马拉松', '南非・开普敦'), false);
});

test('parseListPageHtml and parseDetailPageHtml extract structured race metadata', () => {
  const listHtml = `
    <a href="https://chinamarathon.com/events/83246" class="card">
      <img src="https://s.heilianapp.com/events/83246/logo.jpg" alt="logo" />
      <h3>2026海口马拉松</h3>
      <span> 2026年12月27日 </span>
      <span class="line-clamp-1"> 海南・海口市 </span>
    </a>
  `;
  const cards = parseListPageHtml(listHtml);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].sourceEventId, '83246');
  assert.equal(cards[0].eventDate, '2026-12-27');
  assert.equal(cards[0].province, '海南');
  assert.equal(cards[0].city, '海口市');

  const detailHtml = `
    <html><body>
      <div>国家/地区 中国大陆</div>
      <div>赛事简介 2026海口马拉松定于2026年12月27日开赛，设马拉松（42.195公里）、半程马拉松（21.0975公里）两个项目；2026年10月28日14:00-11月27日18:00开放报名，先报先得！</div>
      <div>亮点 年内最后一场省会马拉松</div>
    </body></html>
  `;
  const detail = parseDetailPageHtml(detailHtml, '2026-12-27');
  assert.equal(detail.registrationDeadline, '2026-11-27');
  assert.match(detail.summary, /42\.195公里/);
});

test('user-saved marathon events routes require auth and scope CRUD to the signed-in user', async (t) => {
  const savedRows = [];
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('INSERT INTO UserMarathonEvents')) {
      const [userId, eventKey, name, eventDate, city, distance, goal, note, sourceUrl] = params;
      savedRows.push({ id: 9, userId, eventKey, name, eventDate, city, distance, goal, note, sourceUrl });
      return { insertId: 9 };
    }
    if (sql.includes('DELETE FROM UserMarathonEvents')) {
      const [id, userId] = params;
      const before = savedRows.length;
      const idx = savedRows.findIndex((r) => r.id === id && r.userId === userId);
      if (idx >= 0) savedRows.splice(idx, 1);
      return { affectedRows: before - savedRows.length };
    }
    if (sql.includes('FROM UserMarathonEvents') && sql.includes('event_key = ?')) {
      return savedRows.filter((r) => r.userId === params[0] && r.eventKey === params[1]);
    }
    if (sql.includes('FROM UserMarathonEvents')) {
      return savedRows.filter((r) => r.userId === params[0]);
    }
    return [];
  });

  const app = request(createApp({
    authService: { verifyToken: async () => ({ id: 42, role: 'user' }) }
  }));

  await app.get('/api/explore/my-events').expect(401);
  await app.post('/api/explore/my-events').send({ name: '2026上海马拉松' }).expect(401);

  const created = await app
    .post('/api/explore/my-events')
    .set('Authorization', 'Bearer token')
    .send({ eventKey: 'crawl-64264', name: '2026上海马拉松', date: '2026-12-06', city: '上海', distance: '全马', goal: '2:58:00' })
    .expect(201);
  assert.equal(created.body.data.name, '2026上海马拉松');
  assert.equal(created.body.data.goal, '2:58:00');

  const listed = await app
    .get('/api/explore/my-events')
    .set('Authorization', 'Bearer token')
    .expect(200);
  assert.equal(listed.body.data.items.length, 1);

  await app.delete('/api/explore/my-events/9').set('Authorization', 'Bearer token').expect(200);
  await app.delete('/api/explore/my-events/9').set('Authorization', 'Bearer token').expect(404);
});
