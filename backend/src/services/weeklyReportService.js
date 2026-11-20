const activityService = require('./activityService');
const planService = require('./trainingPlanService');
const { ApiError } = require('../errors');
const { parseDate } = require('../http');
const { addDays, localToday, mondayOf } = require('./trainingPlanInput');

const earliestWeek = '2000-01-03';
const trendWeekCount = 4;

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

function summarizeActivities(rows) {
  const durationSamples = sum(rows, 'durationSamples');
  const distanceSamples = sum(rows, 'distanceSamples');
  return {
    activityCount: sum(rows, 'activityCount'),
    activeDays: rows.filter(row => row.activityCount > 0).length,
    durationS: durationSamples ? Math.round(sum(rows, 'totalDurationS') * 100) / 100 : null,
    distanceM: distanceSamples ? Math.round(sum(rows, 'totalDistanceM') * 100) / 100 : null,
    durationSamples, distanceSamples, demoActivities: sum(rows, 'demoActivities')
  };
}

function summarizeExecution(sessions, asOf) {
  const counts = { completed: 0, skipped: 0, overdue: 0, upcoming: 0, archivedResults: 0 };
  for (const session of sessions) {
    if (session.planStatus === 'archived') counts.archivedResults += 1;
    if (session.status === 'pending') {
      counts[session.date < asOf ? 'overdue' : 'upcoming'] += 1;
    } else if (session.date <= asOf) {
      counts[session.status] += 1;
    } else {
      counts.upcoming += 1;
    }
  }
  return counts;
}

async function getWeeklyReport(userId, requestedWeek, asOf = localToday()) {
  const currentWeekStart = mondayOf(asOf);
  const startDate = parseDate(requestedWeek, 'week_start') ?? currentWeekStart;
  if (startDate < earliestWeek || startDate > currentWeekStart || mondayOf(startDate) !== startDate) {
    throw new ApiError(400, 'week_start must be a Monday between 2000-01-03 and the current week', 'INVALID_QUERY');
  }

  const endDate = addDays(startDate, 6);
  const lookbackDate = addDays(startDate, -7 * (trendWeekCount - 1));
  const trendStart = lookbackDate < earliestWeek ? earliestWeek : lookbackDate;
  const [activityRows, sessions] = await Promise.all([
    activityService.getTimelineStats({
      owner: 'mine', ownerUserId: userId, groupBy: 'day',
      startDate: trendStart, endDate: endDate < asOf ? endDate : asOf
    }, { useTrainingDates: true }),
    planService.listWeeklySessions(userId, trendStart, endDate)
  ]);

  const activityWeeks = Map.groupBy(activityRows, row => mondayOf(row.period));
  const sessionWeeks = Map.groupBy(sessions, row => mondayOf(row.date));
  const trend = [];
  for (let start = trendStart; start <= startDate; start = addDays(start, 7)) {
    const end = addDays(start, 6);
    trend.push({
      startDate: start,
      endDate: end,
      isPartial: end >= asOf,
      actual: summarizeActivities(activityWeeks.get(start) ?? []),
      execution: summarizeExecution(sessionWeeks.get(start) ?? [], asOf)
    });
  }

  const activityByDate = new Map((activityWeeks.get(startDate) ?? []).map(row => [row.period, row]));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(startDate, index);
    const activity = activityByDate.get(date);
    return {
      date,
      activityCount: Number(activity?.activityCount ?? 0),
      durationS: activity?.totalDurationS == null ? null : Number(activity.totalDurationS),
      distanceM: activity?.totalDistanceM == null ? null : Number(activity.totalDistanceM)
    };
  });
  return {
    asOf, startDate, endDate, timeZone: 'Asia/Shanghai',
    previousWeekStart: startDate > earliestWeek ? addDays(startDate, -7) : null,
    nextWeekStart: startDate < currentWeekStart ? addDays(startDate, 7) : null,
    currentWeekStart,
    actual: trend.at(-1).actual,
    days,
    sessions: sessionWeeks.get(startDate) ?? [],
    trend
  };
}

module.exports = { getWeeklyReport };
