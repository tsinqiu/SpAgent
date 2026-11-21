const RULE_ENGINE_VERSION = 'readiness-rules-v1';
const predictionCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const RISK_ORDER = { green: 0, yellow: 1, orange: 2, red: 3 };
const WEATHER_RISK_ORDER = { low: 0, medium: 1, high: 2 };

function toNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function nullableNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function round(value, digits = 1) {
  const numberValue = nullableNumber(value);
  if (numberValue === null) return null;
  const factor = 10 ** digits;
  return Math.round(numberValue * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function dateOnly(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function daysBetween(latestDate, value) {
  const latest = dateOnly(latestDate);
  const current = dateOnly(value);
  if (!latest || !current) return null;
  const latestMs = Date.parse(`${latest}T00:00:00Z`);
  const currentMs = Date.parse(`${current}T00:00:00Z`);
  if (!Number.isFinite(latestMs) || !Number.isFinite(currentMs)) return null;
  return Math.floor((latestMs - currentMs) / 86400000);
}

function latestByDate(rows, dateKey) {
  return (rows || [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => String(b[dateKey] || '').localeCompare(String(a[dateKey] || '')))[0] || null;
}

function valuesInWindow(rows, latestDate, dateKey, days) {
  return (rows || []).filter((row) => {
    const diff = daysBetween(latestDate, row?.[dateKey]);
    return diff !== null && diff >= 0 && diff < days;
  });
}

function sumBy(rows, mapper) {
  return rows.reduce((sum, row) => sum + toNumber(mapper(row), 0), 0);
}

function avgBy(rows, mapper) {
  const values = rows.map(mapper).map(nullableNumber).filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentileRank(value, values) {
  const numericValue = nullableNumber(value);
  const numericValues = values.map(nullableNumber).filter((item) => item !== null);
  if (numericValue === null) return 50;
  if (!numericValues.length) return numericValue > 0 ? 50 : 0;
  const belowOrEqual = numericValues.filter((item) => item <= numericValue).length;
  return round((belowOrEqual / numericValues.length) * 100, 1) || 0;
}

function safeRatio(value, baseline, fallback = 0) {
  const numericValue = toNumber(value, 0);
  const numericBaseline = toNumber(baseline, 0);
  if (numericBaseline <= 0) return numericValue > 0 ? fallback : 0;
  return round(numericValue / numericBaseline, 3) || 0;
}

function dailyActivityTotals(activities, latestDate, days) {
  const totals = new Map();
  for (const activity of valuesInWindow(activities, latestDate, 'localDate', days)) {
    const diff = daysBetween(latestDate, activity.localDate);
    if (diff === null || diff === 0) continue;
    const day = dateOnly(activity.localDate);
    if (!day) continue;
    const current = totals.get(day) || { date: day, load: 0, distanceKm: 0, durationH: 0 };
    current.load += toNumber(activity.activityTrainingLoad, 0);
    current.distanceKm += toNumber(activity.distanceM, 0) / 1000;
    current.durationH += toNumber(activity.durationS, 0) / 3600;
    totals.set(day, current);
  }
  return [...totals.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function coverage(rows, latestDate, dateKey, days, predicate = () => true) {
  const coveredDays = new Set(
    valuesInWindow(rows, latestDate, dateKey, days)
      .filter(predicate)
      .map((row) => dateOnly(row?.[dateKey]))
      .filter(Boolean)
  );
  return round(coveredDays.size / days, 3) || 0;
}

function buildDataCompleteness(context = {}) {
  const latestDate = context.asOf || context.latestDate || new Date().toISOString().slice(0, 10);
  const activities = context.activities || [];
  const sleepRows = context.sleepRows || [];
  const trainingRows = context.trainingRows || [];
  const sleepCoverage14d = coverage(sleepRows, latestDate, 'sleepDate', 14);
  const weatherCoverage14d = coverage(activities, latestDate, 'localDate', 14, (activity) =>
    activity.weatherCondition || activity.temperatureC !== null || activity.humidityPercent !== null || activity.feelsLikeC !== null
  );
  const hrvCoverage14d = coverage(sleepRows, latestDate, 'sleepDate', 14, (row) => nullableNumber(row.avgHrv) !== null);
  const trainingStatusCoverage14d = coverage(trainingRows, latestDate, 'snapshotDate', 14);
  const score = round(((sleepCoverage14d + weatherCoverage14d + hrvCoverage14d + trainingStatusCoverage14d) / 4) * 100, 1) || 0;

  return {
    sleepCoverage14d,
    weatherCoverage14d,
    hrvCoverage14d,
    trainingStatusCoverage14d,
    score
  };
}

function weatherConditionRisk(condition) {
  const text = String(condition || '').toLowerCase();
  if (/雷|暴|storm|thunder|snow|冰|雪/.test(text)) return 2;
  if (/雨|rain|shower|wind|风/.test(text)) return 1;
  return 0;
}

function assessWeather(features) {
  const feelsLike = nullableNumber(features.feels_like_c);
  const humidity = nullableNumber(features.humidity_percent);
  const conditionRisk = toNumber(features.weather_condition_risk, 0);
  let score = conditionRisk;
  const reasons = [];

  if (feelsLike !== null && feelsLike >= 35) {
    score += 2;
    reasons.push('体感温度较高');
  } else if (feelsLike !== null && feelsLike >= 30 && humidity !== null && humidity >= 70) {
    score += 1;
    reasons.push('高温高湿');
  }

  if (conditionRisk >= 2) reasons.push('雷雨或恶劣天气');
  else if (conditionRisk >= 1) reasons.push('降雨或大风');

  const level = score >= 2 ? 'high' : score >= 1 ? 'medium' : 'low';
  return { level, score, reasons };
}

function buildFeatureSet(overview = {}, context = {}) {
  const latestDate = context.asOf || context.latestDate || new Date().toISOString().slice(0, 10);
  const activities = context.activities || [];
  const sleepRows = context.sleepRows || [];
  const healthRows = context.healthRows || [];
  const trainingRows = context.trainingRows || [];
  const latestSleep = latestByDate(sleepRows, 'sleepDate') || {};
  const latestHealth = latestByDate(healthRows, 'summaryDate') || {};
  const latestTraining = latestByDate(trainingRows, 'snapshotDate') || {};
  const latestWeather = context.latestWeather || activities.find((activity) =>
    activity.weatherCondition || activity.temperatureC !== null || activity.humidityPercent !== null || activity.feelsLikeC !== null
  ) || {};
  const latestLoad = overview.trainingLoad?.at(-1) || {};
  const features = {};

  for (const days of [1, 7, 28]) {
    const rows = valuesInWindow(activities, latestDate, 'localDate', days);
    features[`distance_${days}d`] = round(sumBy(rows, (row) => row.distanceM) / 1000, 3) || 0;
    features[`load_${days}d`] = round(sumBy(rows, (row) => row.activityTrainingLoad), 2) || 0;
  }

  const history90 = dailyActivityTotals(activities, latestDate, 90);
  const history28 = dailyActivityTotals(activities, latestDate, 28);
  const historyForPercentiles = history90.length ? history90 : dailyActivityTotals(activities, latestDate, 365);
  features.session_load_percentile_90d = percentileRank(features.load_1d, historyForPercentiles.map((item) => item.load));
  const longRunBaseline = Math.max(0, ...history28.map((item) => item.distanceKm));
  features.long_run_ratio_28d = safeRatio(features.distance_1d, longRunBaseline, 1);
  features.load_spike_ratio_28d = safeRatio(features.load_1d, avgBy(history28, (item) => item.load), 1);

  features.atl = round(latestLoad.atl ?? latestTraining.acuteTrainingLoad, 2) || 0;
  features.ctl = round(latestLoad.ctl ?? latestTraining.chronicTrainingLoad, 2) || 0;
  features.tsb = round(latestLoad.tsb ?? (features.ctl - features.atl), 2) || 0;
  features.acwr_7_28 = round(
    latestTraining.acuteChronicWorkloadRatio
      ?? (features.load_28d > 0 ? features.load_7d / (features.load_28d / 4) : 0),
    3
  ) || 0;

  features.sleep_score = round(latestSleep.sleepScore, 1) || 0;
  features.sleep_duration_h = round(toNumber(latestSleep.durationS, 0) / 3600, 2) || 0;
  const sleep3d = valuesInWindow(sleepRows, latestDate, 'sleepDate', 3);
  features.sleep_debt_3d = round(sumBy(sleep3d, (row) => Math.max(0, 7 - toNumber(row.durationS, 0) / 3600)), 2) || 0;
  features.avg_hrv = round(latestSleep.avgHrv, 1) || 0;
  const hrvBaseline = avgBy(sleepRows, (row) => row.avgHrv);
  features.hrv_delta_pct = hrvBaseline > 0 ? round(((features.avg_hrv - hrvBaseline) / hrvBaseline) * 100, 2) : 0;

  features.resting_hr = round(latestHealth.restingHeartRateBpm, 1) || 0;
  const restingHrBaseline = avgBy(healthRows, (row) => row.restingHeartRateBpm);
  features.resting_hr_delta = restingHrBaseline > 0 ? round(features.resting_hr - restingHrBaseline, 2) : 0;
  features.avg_stress = round(latestHealth.avgStressLevel ?? latestSleep.avgSleepStress, 1) || 0;
  features.body_battery_drained = round(latestHealth.bodyBatteryDrained, 1) || 0;

  features.temperature_c = round(latestWeather.temperatureC, 1) || 0;
  features.humidity_percent = round(latestWeather.humidityPercent, 1) || 0;
  features.feels_like_c = round(latestWeather.feelsLikeC, 1) || features.temperature_c;
  features.weather_condition_risk = weatherConditionRisk(latestWeather.weatherCondition);
  const weather = assessWeather(features);
  features.weather_risk_level = WEATHER_RISK_ORDER[weather.level];

  const completeness = buildDataCompleteness(context);
  features.sleep_coverage_14d = completeness.sleepCoverage14d;
  features.weather_coverage_14d = completeness.weatherCoverage14d;
  features.hrv_coverage_14d = completeness.hrvCoverage14d;
  features.training_status_coverage_14d = completeness.trainingStatusCoverage14d;
  features.data_completeness_score = completeness.score;
  return features;
}

function riskMax(left, right) {
  return RISK_ORDER[right] > RISK_ORDER[left] ? right : left;
}

function evaluateReadiness(features) {
  const weather = assessWeather(features);
  const reasons = [];
  let score = 0;
  let recoverySignalCount = 0;
  const loadHabitSpike = (
    toNumber(features.session_load_percentile_90d, 50) >= 85
    || toNumber(features.load_spike_ratio_28d, 0) >= 1.35
    || toNumber(features.long_run_ratio_28d, 0) >= 1.2
  );
  const dataCompleteness = {
    sleepCoverage14d: round(features.sleep_coverage_14d, 3) || 0,
    weatherCoverage14d: round(features.weather_coverage_14d, 3) || 0,
    hrvCoverage14d: round(features.hrv_coverage_14d, 3) || 0,
    trainingStatusCoverage14d: round(features.training_status_coverage_14d, 3) || 0,
    score: round(features.data_completeness_score, 1) || 0
  };

  if (features.sleep_score > 0 && features.sleep_score < 60) recoverySignalCount += 1;
  else if (features.sleep_duration_h > 0 && features.sleep_duration_h < 6) recoverySignalCount += 1;
  if (features.hrv_delta_pct <= -15) recoverySignalCount += 1;
  if (features.resting_hr_delta >= 5) recoverySignalCount += 1;
  if (features.avg_stress >= 50) recoverySignalCount += 1;
  if (features.body_battery_drained >= 60) recoverySignalCount += 1;

  if (features.tsb < -25 && (loadHabitSpike || recoverySignalCount >= 2)) {
    score += 3;
    reasons.push('TSB 显著偏低');
  } else if (features.tsb < -10 && recoverySignalCount >= 2) {
    score += 1;
    reasons.push('TSB 偏低');
  }

  if (features.acwr_7_28 >= 1.5 && (loadHabitSpike || recoverySignalCount >= 2)) {
    score += 2;
    reasons.push('近期负荷增长过快');
  } else if (features.acwr_7_28 >= 1.3 && loadHabitSpike) {
    score += 1;
    reasons.push('近期负荷上升');
  }

  if (features.sleep_score > 0 && features.sleep_score < 60) {
    score += 2;
    reasons.push('睡眠评分偏低');
  } else if (features.sleep_duration_h > 0 && features.sleep_duration_h < 6) {
    score += 1;
    reasons.push('睡眠时长不足');
  }

  if (features.hrv_delta_pct <= -15) {
    score += 1;
    reasons.push('HRV 低于近期基线');
  }
  if (features.resting_hr_delta >= 5) {
    score += 1;
    reasons.push('静息心率高于近期基线');
  }
  if (features.avg_stress >= 50) {
    score += 1;
    reasons.push('压力水平偏高');
  }
  if (features.body_battery_drained >= 60) {
    score += 1;
    reasons.push('Body Battery 消耗较大');
  }

  score += weather.score;
  reasons.push(...weather.reasons);

  let riskLevel = score >= 6 ? 'red' : score >= 3 ? 'orange' : score >= 1 ? 'yellow' : 'green';
  const readinessScore = clamp(Math.round(100 - score * 12 - Math.min(features.sleep_debt_3d * 4, 16)), 0, 100);
  const readinessLevel = readinessScore >= 75 ? 'high' : readinessScore >= 55 ? 'medium' : 'low';

  let loadAction = 'maintain';
  if (riskLevel === 'red') loadAction = 'rest';
  else if (riskLevel === 'orange') loadAction = 'reduce';
  else if (features.tsb > 8 && features.acwr_7_28 <= 1.2 && weather.level === 'low') loadAction = 'progress';

  if (weather.level === 'high' && loadAction === 'progress') loadAction = 'maintain';
  if (weather.level === 'high' && loadAction === 'maintain') loadAction = 'reduce';

  const trainingModifier = weather.level === 'high'
    ? (features.weather_condition_risk >= 1 ? 'indoor_preferred' : 'reduce_intensity')
    : riskLevel === 'red'
      ? 'avoid_hard_session'
      : 'normal';
  const primaryRecommendation = loadAction === 'rest'
    ? 'rest'
    : features.sleep_score > 0 && features.sleep_score < 60
      ? 'sleep_focus'
      : weather.level === 'high'
        ? 'hydration'
        : loadAction === 'progress'
          ? 'normal_training'
          : 'easy_aerobic';
  const recommendationTypes = [
    primaryRecommendation,
    weather.level === 'high' ? 'hydration' : null,
    features.sleep_score > 0 && features.sleep_score < 65 ? 'sleep_focus' : null,
    loadAction === 'reduce' ? 'mobility' : null
  ].filter(Boolean);

  riskLevel = weather.level === 'high' ? riskMax(riskLevel, 'yellow') : riskLevel;

  return {
    readinessScore,
    readinessLevel,
    recoveryRisk: readinessLevel === 'low' ? 'high' : readinessLevel === 'medium' ? 'medium' : 'low',
    riskLevel,
    loadAction,
    trainingModifier,
    weatherRisk: weather.level,
    primaryRecommendation,
    recommendationTypes: [...new Set(recommendationTypes)],
    topFactors: [...new Set([...(weather.level === 'high' ? weather.reasons : []), ...reasons])].slice(0, 5),
    dataCompleteness,
    confidence: 0.72,
    modelVersion: RULE_ENGINE_VERSION,
    provider: 'rules',
    fallback: false
  };
}

function cacheKeyFor(context = {}) {
  const signals = context.signals || {};
  return [
    context.userId || 'anonymous',
    context.latestDate || 'unknown',
    signals.activityCount28d || 0,
    signals.healthDays14d || 0,
    signals.sleepDays14d || 0,
    signals.trainingDays14d || 0
  ].join(':');
}

async function predict({ overview = {}, context = {} } = {}) {
  const key = cacheKeyFor(context);
  const cached = predictionCache.get(key);
  if (cached && Date.now() - cached.createdAt <= CACHE_TTL_MS) {
    return cached.value;
  }

  const features = buildFeatureSet(overview, context);
  const value = evaluateReadiness(features);
  predictionCache.set(key, { createdAt: Date.now(), value });
  if (predictionCache.size > 100) {
    predictionCache.delete(predictionCache.keys().next().value);
  }
  return value;
}

function summarizePrediction(prediction) {
  if (!prediction) return JSON.stringify({ available: false });
  return JSON.stringify({
    available: true,
    readinessScore: prediction.readinessScore,
    readinessLevel: prediction.readinessLevel,
    recoveryRisk: prediction.recoveryRisk,
    riskLevel: prediction.riskLevel,
    loadAction: prediction.loadAction,
    trainingModifier: prediction.trainingModifier,
    weatherRisk: prediction.weatherRisk,
    primaryRecommendation: prediction.primaryRecommendation,
    topFactors: prediction.topFactors || [],
    dataCompleteness: prediction.dataCompleteness,
    modelVersion: prediction.modelVersion,
    provider: prediction.provider
  });
}

async function getHealth() {
  return {
    status: 'ok',
    provider: 'rules',
    modelVersion: RULE_ENGINE_VERSION,
    cacheSize: predictionCache.size
  };
}

module.exports = {
  RULE_ENGINE_VERSION,
  buildFeatureSet,
  evaluateReadiness,
  predict,
  summarizePrediction,
  getHealth
};
