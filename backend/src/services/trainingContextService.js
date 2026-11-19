const activityService = require('./activityService');
const healthService = require('./healthService');
const { addDays, localToday } = require('./trainingPlanInput');

function summarizeMetric(rows, key, startDate) {
  const values = rows.filter(row => row.date >= startDate && row[key] != null);
  if (!values.length) return { samples: 0, average: null, latestDate: null, demoSamples: 0 };
  return {
    samples: values.length,
    average: Math.round(values.reduce((sum, row) => sum + row[key], 0) * 10 / values.length) / 10,
    latestDate: values[0].date,
    demoSamples: values.filter(row => row.isDemo === 1).length
  };
}

async function getContext(userId, endDate = localToday()) {
  const recovery = healthService.getRecoveryDays(userId, addDays(endDate, -27), endDate);
  const windows = [7, 28].map(async days => {
    const startDate = addDays(endDate, 1 - days);
    const [runs, { sleep, daily }] = await Promise.all([
      activityService.getSummaryStats({
        owner: 'mine', ownerUserId: userId, runningOnly: true, startDate, endDate
      }, { includeCoverage: true }),
      recovery
    ]);
    return {
      days, startDate, endDate,
      running: {
        activityCount: runs.activityCount, runningDays: runs.runningDays, distanceM: runs.totalDistanceM,
        durationS: runs.totalDurationS,
        avgPaceSecPerKm: runs.avgPaceSecPerKm, trainingLoad: runs.totalTrainingLoad,
        latestDate: runs.latestDate, demoActivities: runs.demoActivities,
        coverage: { distance: runs.distanceSamples, pace: runs.paceSamples, load: runs.loadSamples }
      },
      recovery: {
        sleepScore: summarizeMetric(sleep, 'sleepScore', startDate),
        sleepDurationS: summarizeMetric(sleep, 'sleepDurationS', startDate),
        hrv: summarizeMetric(sleep, 'hrv', startDate),
        restingHeartRate: summarizeMetric(daily, 'restingHeartRate', startDate)
      }
    };
  });
  return { asOf: endDate, timeZone: 'Asia/Shanghai', windows: await Promise.all(windows) };
}

module.exports = { getContext };
