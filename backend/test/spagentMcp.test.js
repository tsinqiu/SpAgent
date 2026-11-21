const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const jwt = require('jsonwebtoken');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const signingSecret = 'synthetic-mcp-test-secret';
const backendRoot = path.resolve(__dirname, '..');
const fixture = `
  const assert = require('node:assert/strict');
  const db = require('./src/db');
  require('./src/services/coachTelemetryService').getRunningPbsAndBands = async (userId, { startDate, endDate }) => {
    assert.equal(userId, 7);
    assert.equal(startDate, '2024-05-01');
    assert.equal(endDate, '2024-05-31');
    return { totalTimedRuns: 2, distanceBands: [{ band: '5K', count: 2 }] };
  };
  require('./src/services/trainingContextService').getRecoveryContext = async (userId, startDate, endDate) => {
    assert.equal(userId, 7);
    assert.equal(startDate, '2024-05-02');
    assert.equal(endDate, '2024-05-02');
    return { startDate, endDate, recovery: { hrv: { samples: 0, average: null } } };
  };
  db.query = async (sql, values) => {
    if (sql.includes('FROM Users')) {
      assert.deepEqual(values, [7]);
      return [{ id: 7, role: 'admin', status: 'active' }];
    }
    assert.match(sql, /a.owner_user_id = \\?/);
    assert.equal(values[sql.includes('>= ?') ? 2 : 1], 7);
    if (sql.includes('LIMIT ?')) {
      assert.equal(values.at(-1), 3);
      assert.equal(values.at(-2), 'strength_training');
      assert.match(sql, /ORDER BY a.training_timestamp DESC, a.id DESC/);
      return [{ date: '2024-05-02', activityType: 'strength_training', distanceM: 0, durationS: 1200, heartRate: null }];
    }
    return [{ count: 1, distanceSamples: 0, distanceM: null, durationSamples: 1, durationS: 1200, heartRateSamples: 0, heartRateSum: null, paceDistanceM: null, paceDurationS: null }];
  };
  require('./scripts/spagentMcp').startStdio().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
`;

async function connectClient(t, token) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['-e', fixture],
    cwd: backendRoot,
    env: { JWT_SECRET: signingSecret, SPAGENT_MCP_TOKEN: token },
    stderr: 'pipe'
  });
  const client = new Client({ name: 'spagent-mcp-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport, { timeout: 5000 });
  return client;
}

test('stdio tools advertise read-only access and scope queries to the signed-in owner', async t => {
  const client = await connectClient(t, jwt.sign({ sub: '7' }, signingSecret, { expiresIn: '1m' }));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), [
    'list_my_activities',
    'summarize_my_activities',
    'get_my_performance_evidence',
    'get_my_recovery_context',
    'get_my_athlete_profile',
    'analyze_my_activity_telemetry',
    'get_my_training_plans'
  ]);
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint && tool.inputSchema.additionalProperties === false));

  const result = await client.callTool({
    name: 'list_my_activities', arguments: { start: '2024-05-01', end: '2024-05-31', sport: 'strength_training', limit: 3 }
  });
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.structuredContent.activities, [
    { date: '2024-05-02', activityType: 'strength_training', distanceM: 0, durationS: 1200, heartRate: null }
  ]);
  assert.deepEqual(result.structuredContent.scope, {
    sport: 'strength_training', start: '2024-05-01', end: '2024-05-31', timezone: 'Asia/Shanghai'
  });
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);

  const summary = await client.callTool({ name: 'summarize_my_activities', arguments: { end: '2024-05-31' } });
  assert.equal(summary.structuredContent.summary.count, 1);
  assert.equal(summary.structuredContent.summary.distanceM, null);

  const performance = await client.callTool({ name: 'get_my_performance_evidence', arguments: {
    start: '2024-05-01', end: '2024-05-31'
  } });
  assert.deepEqual(performance.structuredContent.distanceBands, [{ band: '5K', count: 2 }]);
  const recovery = await client.callTool({ name: 'get_my_recovery_context', arguments: { start: '2024-05-02', end: '2024-05-02' } });
  assert.deepEqual(recovery.structuredContent.recovery.hrv, { samples: 0, average: null });
  for (const name of ['get_my_performance_evidence', 'get_my_recovery_context']) {
    assert.equal((await client.callTool({ name, arguments: { userId: 99 } })).isError, true);
  }

  for (const args of [{ userId: 99 }, { sport: 'unknown' }, { limit: 21 }, { start: '2024-02-30' }, { start: '2024-06-01', end: '2024-05-31' }]) {
    const invalid = await client.callTool({ name: 'list_my_activities', arguments: args });
    assert.equal(invalid.isError, true);
  }
});

test('stdio tools refuse activity data when the login token is expired', async t => {
  const client = await connectClient(t, jwt.sign({ sub: '7' }, signingSecret, { expiresIn: -1 }));
  const result = await client.callTool({ name: 'summarize_my_activities', arguments: {} });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /authentication failed/i);
  assert.equal(result.structuredContent, undefined);
});
