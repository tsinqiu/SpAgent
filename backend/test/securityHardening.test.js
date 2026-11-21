const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const createApp = require('../src/app');
const { validateProductionConfig } = require('../src/serverStartup');

async function startTestServer(app) {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

function createAuthStub() {
  return {
    async verifyToken() {
      return { id: 7, username: 'runner', email: 'runner@example.com', role: 'user', status: 'active' };
    },
    async register(payload) {
      return {
        token: 'test-token',
        user: { id: 8, username: payload.username, email: payload.email, role: 'user', status: 'active' }
      };
    }
  };
}

function createSecurityStub() {
  const events = [];
  return {
    events,
    async assertLoginAllowed() {},
    async recordLoginAttempt() {},
    async recordSecurityEvent(event) {
      events.push(event);
    }
  };
}

test('registration honors ALLOW_PUBLIC_REGISTRATION=false and REGISTRATION_INVITE_CODE', async () => {
  const securityStub = createSecurityStub();
  const closedApp = createApp({
    authService: createAuthStub(),
    securityService: securityStub,
    authConfig: { allowPublicRegistration: false, registrationInviteCode: '' }
  });
  const closedSrv = await startTestServer(closedApp);
  try {
    const cfgRes = await fetch(`${closedSrv.baseUrl}/api/system/public-config`);
    const cfgBody = await cfgRes.json();
    assert.equal(cfgBody.data.auth.allowPublicRegistration, false);
    assert.equal(cfgBody.data.auth.inviteCodeRequired, false);

    // Security headers check
    assert.equal(cfgRes.headers.get('x-frame-options'), 'DENY');
    assert.equal(cfgRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.match(cfgRes.headers.get('permissions-policy') || '', /microphone=\(self\)/);

    const regRes = await fetch(`${closedSrv.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'bot', email: 'bot@example.com', password: 'password123' })
    });
    assert.equal(regRes.status, 403);
    const regBody = await regRes.json();
    assert.equal(regBody.error.code, 'REGISTRATION_DISABLED');
  } finally {
    await closedSrv.close();
  }

  const inviteApp = createApp({
    authService: createAuthStub(),
    securityService: securityStub,
    authConfig: { allowPublicRegistration: true, registrationInviteCode: 'SPAGENT-2026' }
  });
  const inviteSrv = await startTestServer(inviteApp);
  try {
    const cfgRes = await fetch(`${inviteSrv.baseUrl}/api/system/public-config`);
    const cfgBody = await cfgRes.json();
    assert.equal(cfgBody.data.auth.inviteCodeRequired, true);
    assert.equal(JSON.stringify(cfgBody).includes('SPAGENT-2026'), false);

    const badRes = await fetch(`${inviteSrv.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', email: 'alice@example.com', password: 'password123', inviteCode: 'WRONG' })
    });
    assert.equal(badRes.status, 403);
    assert.equal((await badRes.json()).error.code, 'INVALID_INVITE_CODE');

    const okRes = await fetch(`${inviteSrv.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', email: 'alice@example.com', password: 'password123', inviteCode: 'SPAGENT-2026' })
    });
    assert.equal(okRes.status, 201);
  } finally {
    await inviteSrv.close();
  }
});

test('register endpoint enforces dedicated rate limiting', async () => {
  const app = createApp({
    authService: createAuthStub(),
    securityService: createSecurityStub(),
    authConfig: { allowPublicRegistration: true, registrationInviteCode: 'CODE123' },
    securityConfig: {
      globalRateLimitWindowMs: 60000,
      globalRateLimitMax: 100,
      authRateLimitWindowMs: 60000,
      authRateLimitMax: 100,
      registerRateLimitWindowMs: 60000,
      registerRateLimitMax: 2
    }
  });
  const srv = await startTestServer(app);
  try {
    const reqInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'u1', email: 'u1@example.com', password: 'password123', inviteCode: 'WRONG' })
    };
    assert.equal((await fetch(`${srv.baseUrl}/api/auth/register`, reqInit)).status, 403);
    assert.equal((await fetch(`${srv.baseUrl}/api/auth/register`, reqInit)).status, 403);
    const third = await fetch(`${srv.baseUrl}/api/auth/register`, reqInit);
    assert.equal(third.status, 429);
    assert.equal((await third.json()).error.code, 'REGISTER_RATE_LIMITED');
  } finally {
    await srv.close();
  }
});

test('GET /api/stats/heatmap validates year and scopes to authenticated user', async () => {
  let receivedFilters = null;
  const app = createApp({
    authService: createAuthStub(),
    activityService: {
      async getActivityHeatmap(filters) {
        receivedFilters = filters;
        return {
          range: { mode: filters.year ? 'year' : 'rolling', year: filters.year ? Number(filters.year) : null, startDate: '2026-01-01', endDate: '2026-12-31' },
          availableYears: [2026, 2025],
          summary: { activeDays: 2, totalCount: 2, totalDistanceKm: 20, totalDurationMin: 95, totalCalories: 1400, totalLoad: 210, longestStreak: 2, currentStreak: 0, latestActiveDate: '2026-06-29' },
          days: [
            { date: '2026-06-28', count: 1, distanceKm: 10, durationMin: 47, calories: 700, load: 105 },
            { date: '2026-06-29', count: 1, distanceKm: 10, durationMin: 48, calories: 700, load: 105 }
          ]
        };
      }
    }
  });
  const srv = await startTestServer(app);
  try {
    const unauth = await fetch(`${srv.baseUrl}/api/stats/heatmap`);
    assert.equal(unauth.status, 401);

    const badYear = await fetch(`${srv.baseUrl}/api/stats/heatmap?year=202`, {
      headers: { Authorization: 'Bearer fake' }
    });
    assert.equal(badYear.status, 400);

    const ok = await fetch(`${srv.baseUrl}/api/stats/heatmap?year=2026&activity_type=running`, {
      headers: { Authorization: 'Bearer fake' }
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.data.summary.activeDays, 2);
    assert.equal(receivedFilters.ownerUserId, 7);
    assert.equal(receivedFilters.owner, 'mine');
    assert.equal(receivedFilters.year, '2026');
    assert.equal(receivedFilters.activityType, 'running');
  } finally {
    await srv.close();
  }
});

test('validateProductionConfig rejects unsafe production settings and accepts hardened config', () => {
  assert.throws(
    () => validateProductionConfig({
      auth: { jwtSecret: 'short', allowPublicRegistration: false },
      db: { password: '' },
      cors: { origins: ['*'] },
      server: { host: '127.0.0.1' },
      security: { trustProxy: true }
    }, 'production', { warn() {} }),
    /JWT_SECRET.*DB_PASSWORD.*CORS_ORIGIN/
  );

  const warnings = [];
  const valid = validateProductionConfig({
    auth: { jwtSecret: 'a'.repeat(48), allowPublicRegistration: true, registrationInviteCode: '' },
    db: { password: 'strong-db-password' },
    cors: { origins: ['https://spagent.example.com'] },
    server: { host: '127.0.0.1' },
    security: { trustProxy: true }
  }, 'production', { warn: msg => warnings.push(msg) });
  assert.equal(valid.ok, true);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /REGISTRATION_INVITE_CODE/);
});
