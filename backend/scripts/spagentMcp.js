const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const activityService = require('../src/services/activityService');
const { getRecoveryContext } = require('../src/services/trainingContextService');
const telemetry = require('../src/services/coachTelemetryService');
const authService = require('../src/services/authService');
const db = require('../src/db');
const { localToday, addDays } = require('../src/services/trainingPlanInput');

const activityFields = {
  sport: z.enum(activityService.coachActivitySports).optional().describe('Omit to include all activity types.'),
  start: z.iso.date().optional().describe('Inclusive start date in Asia/Shanghai. Omit to include older records.'),
  end: z.iso.date().optional().describe('Inclusive end date in Asia/Shanghai. Defaults to today.')
};
const activityListInput = z.strictObject({
  ...activityFields,
  limit: z.number().int().min(1).max(20).optional().describe('Maximum number of newest records. Defaults to 5.')
});
const activitySummaryInput = z.strictObject(activityFields);
const performanceInput = z.strictObject({
  ...activityFields,
  distancesKm: z.array(z.number().min(0.1).max(500)).min(1).max(6).optional()
    .describe('Distances explicitly requested by the user. Omit to review actual distance coverage.'),
  runningFocus: z.enum(['middle_long', 'middle', 'long', 'short']).optional()
});
const recoveryInput = z.strictObject({ start: z.iso.date().optional(), end: z.iso.date().optional() });
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function toolError(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function createMcpServer(token) {
  const server = new McpServer({ name: 'spagent-activity', version: '0.1.0' });

  async function readForOwner(handler) {
    let user;
    try {
      user = await authService.verifyToken(token);
    } catch {
      return toolError('SpAgent authentication failed. Supply a valid login token to the local process.');
    }

    try {
      const data = await handler(user.id);
      return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch {
      return toolError('SpAgent activity data is temporarily unavailable.');
    }
  }

  function read({ sport, start, end = localToday(), limit }, list) {
    if (end > localToday() || (start && start > end)) return toolError('Use an ordered, inclusive date range ending no later than today.');
    return readForOwner(async userId => {
      const result = await activityService.readCoachActivities(userId, { sport, start, end, limit: list ? limit ?? 5 : undefined });
      return { scope: { sport: sport ?? 'all', start: start ?? null, end, timezone: 'Asia/Shanghai' },
        ...(list ? { activities: result } : { summary: result }) };
    });
  }

  server.registerTool('list_my_activities', {
    title: 'List my newest activities',
    description: 'Read the authenticated account’s newest activities, ordered by training timestamp. Returns date, activity type, distance in metres, duration in seconds, and average heart rate in BPM when recorded.',
    inputSchema: activityListInput,
    annotations: readOnly
  }, args => read(args, true));
  server.registerTool('summarize_my_activities', {
    title: 'Summarize my activities',
    description: 'Read totals and measurement coverage for the authenticated account. Distances are in metres, durations in seconds, and heart rates in BPM. The pace sums include only records with both a positive distance and duration.',
    inputSchema: activitySummaryInput,
    annotations: readOnly
  }, args => read(args, false));
  server.registerTool('get_my_performance_evidence', {
    title: 'Read my performance evidence',
    description: 'Read measured running performance, distance bands and best efforts. Excludes demo records. Does not provide population ranks.',
    inputSchema: performanceInput,
    annotations: readOnly
  }, ({ start, end = localToday() }) => {
    if (end > localToday() || (start && start > end)) return toolError('Use an ordered date range ending no later than today.');
    return readForOwner(userId => telemetry.getRunningPbsAndBands(userId, {
      ...(start && { startDate: start }),
      endDate: end
    }));
  });
  server.registerTool('get_my_recovery_context', {
    title: 'Read my recovery metrics',
    description: 'Read sleep duration and score, HRV and resting heart rate with coverage by metric. Excludes demo records. Defaults to seven days.',
    inputSchema: recoveryInput,
    annotations: readOnly
  }, ({ end = localToday(), start = addDays(end, -6) }) => {
    if (end > localToday() || start > end || start < addDays(end, -89)) return toolError('Use up to 90 days ending no later than today.');
    return readForOwner(userId => getRecoveryContext(userId, start, end));
  });
  server.registerTool('get_my_athlete_profile', {
    title: 'Read my full athlete profile & physiology',
    description: 'Read comprehensive athlete overview including sport counts, Garmin VO2max, training status, ACWR, lactate threshold, race predictions, shoes, active plan, and coach memories.',
    inputSchema: z.strictObject({}),
    annotations: readOnly
  }, () => readForOwner(userId => telemetry.getAthleteProfile(userId, localToday())));
  server.registerTool('analyze_my_activity_telemetry', {
    title: 'Analyze single activity telemetry',
    description: 'Analyze per-km Laps splits, HR zones (Z1–Z5), and TrackPoints aerobic decoupling / cardiac drift for a specific activity owned by the authenticated user.',
    inputSchema: z.strictObject({ activityId: z.number().int().positive() }),
    annotations: readOnly
  }, ({ activityId }) => readForOwner(userId => telemetry.analyzeActivityTelemetry(userId, activityId)));
  server.registerTool('get_my_training_plans', {
    title: 'Read my training plans and execution',
    description: 'Read the authenticated account’s training plans, upcoming sessions, linked executions, and revision history.',
    inputSchema: z.strictObject({}),
    annotations: readOnly
  }, () => readForOwner(userId => telemetry.getTrainingPlansAndExecution(userId)));
  return server;
}

async function startStdio() {
  const token = process.env.SPAGENT_MCP_TOKEN?.trim();
  if (!token || token.length > 4096) throw new Error('Set SPAGENT_MCP_TOKEN to a valid SpAgent login token.');
  const server = createMcpServer(token);
  const transport = new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 32 * 1024 });
  transport.onclose = () => {
    process.stdin.off('end', closeTransport);
    db.closePool().catch(() => { process.exitCode = 1; });
  };
  const closeTransport = () => {
    server.close().catch(() => { process.exitCode = 1; });
  };
  process.stdin.once('end', closeTransport);
  await server.connect(transport);
}

if (require.main === module) {
  startStdio().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { startStdio };
