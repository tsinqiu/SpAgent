const db = require('../db');
const activityService = require('./activityService');
const trainingPlanService = require('./trainingPlanService');
const trainingPreferenceService = require('./trainingPreferenceService');
const athleteMemoryService = require('./athleteMemoryService');
const { addDays, localToday } = require('./trainingPlanInput');

const ACTIVITY_TS = activityService.trainingActivityTimestamp;
const RUNNING_PREDICATE = activityService.runningActivityPredicate;

const SPORT_LABELS = Object.freeze({
  running: '跑步',
  cycling: '骑行',
  swimming: '游泳',
  strength_training: '力量训练',
  walking: '步行',
  hiking: '徒步',
  floor_climbing: '爬楼'
});

const SPORT_SQL_TYPES = Object.freeze({
  running: ['running', 'trail_running', 'treadmill_running', 'track_running', 'street_running'],
  cycling: ['cycling', 'road_biking', 'indoor_cycling', 'virtual_ride', 'mountain_biking'],
  swimming: ['swimming', 'lap_swimming', 'open_water_swimming'],
  strength_training: ['strength_training', 'fitness_equipment'],
  walking: ['walking', 'casual_walking', 'speed_walking'],
  hiking: ['hiking'],
  floor_climbing: ['floor_climbing', 'stair_climbing']
});

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pos(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function round(value, digits = 2) {
  const n = num(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function formatDuration(seconds) {
  const s = pos(seconds);
  if (!s) return null;
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = v => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function formatPace(distanceM, durationS) {
  const d = pos(distanceM);
  const t = pos(durationS);
  if (!d || !t) return null;
  const secPerKm = Math.round((t * 1000) / d);
  if (!Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 3600) return null;
  const min = Math.floor(secPerKm / 60);
  const sec = secPerKm % 60;
  return `${min}'${String(sec).padStart(2, '0')}"/km`;
}

function formatPaceFromSpeed(speedMps) {
  const v = pos(speedMps);
  if (!v) return null;
  // Garmin Connect stores LactateThreshold speed in 0.1 * m/s (e.g. 0.4527 => 4.527 m/s).
  const normalizedMps = v < 1.0 ? v * 10 : v;
  const secPerKm = Math.round(1000 / normalizedMps);
  if (!Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 3600) return null;
  return `${Math.floor(secPerKm / 60)}'${String(secPerKm % 60).padStart(2, '0')}"/km`;
}

function safeQuery(sql, params) {
  return db.query(sql, params).catch(error => {
    if (error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR') return [];
    throw error;
  });
}

function sportFilterSql(sport) {
  if (!sport || sport === 'all') return { clause: '', params: [] };
  const mapped = SPORT_SQL_TYPES[sport];
  if (mapped) {
    return {
      clause: ` AND a.activity_type IN (${mapped.map(() => '?').join(', ')})`,
      params: mapped
    };
  }
  return { clause: ' AND a.activity_type = ?', params: [sport] };
}

function normalizeSportKey(activityType) {
  const raw = String(activityType || '').toLowerCase();
  for (const [key, list] of Object.entries(SPORT_SQL_TYPES)) {
    if (list.includes(raw)) return key;
  }
  return raw || 'other';
}

function formatActivityRow(row) {
  const distM = pos(row.distanceM);
  const durS = pos(row.durationS);
  const sportKey = normalizeSportKey(row.activityType);
  return {
    activityId: Number(row.activityId),
    date: row.date,
    time: row.time || undefined,
    name: row.activityName || SPORT_LABELS[sportKey] || row.activityType,
    sport: sportKey,
    sportLabel: SPORT_LABELS[sportKey] || row.activityType,
    distanceKm: distM ? round(distM / 1000, 2) : null,
    durationS: durS ? Math.round(durS) : null,
    durationFormatted: formatDuration(durS),
    pacePerKm: sportKey === 'running' ? formatPace(distM, durS) : null,
    avgSpeedKmh: sportKey === 'cycling' && distM && durS ? round((distM / durS) * 3.6, 1) : null,
    avgHrBpm: pos(row.avgHr) ? Math.round(row.avgHr) : null,
    maxHrBpm: pos(row.maxHr) ? Math.round(row.maxHr) : null,
    avgCadence: pos(row.avgCadence) ? Math.round(row.avgCadence) : null,
    elevationGainM: num(row.elevationGainM) !== null ? Math.round(row.elevationGainM) : null,
    trainingLoad: pos(row.trainingLoad) ? Math.round(row.trainingLoad) : null,
    aerobicTE: pos(row.aerobicTE) ? round(row.aerobicTE, 1) : null,
    anaerobicTE: pos(row.anaerobicTE) ? round(row.anaerobicTE, 1) : null,
    trainingEffectLabel: row.trainingEffectLabel || null,
    vo2max: pos(row.vo2max) ? round(row.vo2max, 1) : null,
    rpe: pos(row.rpe) ? Math.round(row.rpe) : null,
    weather: row.weatherCondition || num(row.temperatureC) !== null
      ? { condition: row.weatherCondition || null, tempC: num(row.temperatureC), humidityPct: num(row.humidityPct) }
      : null,
    isDemo: row.dataSource === 'demo_synthetic'
  };
}

/**
 * Tool 1: Comprehensive Athlete Dossier (all-time sports, physiological markers,
 * Garmin VO2max/LT/RacePredictions, training load balance, shoes, preferences, memories, active plan).
 */
async function getAthleteProfile(userId, today = localToday()) {
  const recent28Start = addDays(today, -27) + ' 00:00:00.000';
  const recent7Start = addDays(today, -6) + ' 00:00:00.000';
  const todayEnd = today + ' 23:59:59.999';

  const [
    sportRows,
    runSummaryRows,
    latestRunRows,
    statusRows,
    ltRows,
    predictionRows,
    shoeRows,
    preferences,
    memories,
    activePlan
  ] = await Promise.all([
    safeQuery(
      `SELECT a.activity_type AS activityType,
         COUNT(*) AS count,
         ROUND(SUM(COALESCE(s.distance_m, 0)) / 1000, 2) AS totalDistanceKm,
         ROUND(SUM(COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s, 0)) / 3600, 1) AS totalHours,
         DATE_FORMAT(MIN(${ACTIVITY_TS}), '%Y-%m-%d') AS firstDate,
         DATE_FORMAT(MAX(${ACTIVITY_TS}), '%Y-%m-%d') AS lastDate
       FROM Activities a
       LEFT JOIN ActivitySummaries s ON s.activity_id = a.id
       WHERE a.owner_user_id = ? AND a.data_source <> 'demo_synthetic' AND ${ACTIVITY_TS} <= ?
       GROUP BY a.activity_type
       ORDER BY count DESC`,
      [userId, todayEnd]
    ),
    safeQuery(
      `SELECT COUNT(*) AS totalRuns,
         COUNT(DISTINCT DATE(${ACTIVITY_TS})) AS runningDays,
         ROUND(SUM(COALESCE(s.distance_m, 0)) / 1000, 2) AS totalDistanceKm,
         ROUND(SUM(COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s, 0)) / 3600, 1) AS totalHours,
         COUNT(CASE WHEN s.distance_m >= 20000 THEN 1 END) AS runs20KmPlus,
         ROUND(MAX(s.distance_m) / 1000, 2) AS longestRunKm,
         COUNT(CASE WHEN ${ACTIVITY_TS} >= ? THEN 1 END) AS runsLast28d,
         ROUND(SUM(CASE WHEN ${ACTIVITY_TS} >= ? THEN COALESCE(s.distance_m, 0) ELSE 0 END) / 1000, 2) AS distanceLast28dKm,
         COUNT(CASE WHEN ${ACTIVITY_TS} >= ? THEN 1 END) AS runsLast7d,
         ROUND(SUM(CASE WHEN ${ACTIVITY_TS} >= ? THEN COALESCE(s.distance_m, 0) ELSE 0 END) / 1000, 2) AS distanceLast7dKm,
         DATE_FORMAT(MIN(${ACTIVITY_TS}), '%Y-%m-%d') AS firstRunDate,
         DATE_FORMAT(MAX(${ACTIVITY_TS}), '%Y-%m-%d') AS lastRunDate
       FROM Activities a
       LEFT JOIN ActivitySummaries s ON s.activity_id = a.id
       WHERE a.owner_user_id = ? AND a.data_source <> 'demo_synthetic' AND ${ACTIVITY_TS} <= ? AND ${RUNNING_PREDICATE}`,
      [recent28Start, recent28Start, recent7Start, recent7Start, userId, todayEnd]
    ),
    safeQuery(
      `SELECT a.id AS activityId, a.activity_name AS activityName, a.activity_type AS activityType,
         a.data_source AS dataSource, a.perceived_effort AS rpe,
         a.weather_condition AS weatherCondition, a.temperature_c AS temperatureC, a.humidity_percent AS humidityPct,
         DATE_FORMAT(${ACTIVITY_TS}, '%Y-%m-%d') AS date,
         s.distance_m AS distanceM, COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s) AS durationS,
         s.avg_heart_rate_bpm AS avgHr, s.max_heart_rate_bpm AS maxHr, s.avg_cadence_spm AS avgCadence,
         s.elevation_gain_m AS elevationGainM, s.activity_training_load AS trainingLoad,
         s.aerobic_training_effect AS aerobicTE, s.anaerobic_training_effect AS anaerobicTE,
         s.training_effect_label AS trainingEffectLabel, s.vo2max
       FROM Activities a
       LEFT JOIN ActivitySummaries s ON s.activity_id = a.id
       WHERE a.owner_user_id = ? AND a.data_source <> 'demo_synthetic' AND ${ACTIVITY_TS} <= ? AND ${RUNNING_PREDICATE}
       ORDER BY ${ACTIVITY_TS} DESC, a.id DESC LIMIT 1`,
      [userId, todayEnd]
    ),
    safeQuery(
      `SELECT DATE_FORMAT(snapshot_date, '%Y-%m-%d') AS date, vo2max, training_status AS trainingStatus,
         load_balance AS loadBalance, acute_training_load AS acuteLoad, chronic_training_load AS chronicLoad,
         acute_chronic_workload_ratio AS acwr, acwr_status AS acwrStatus,
         optimal_load_min AS optimalLoadMin, optimal_load_max AS optimalLoadMax,
         low_aerobic_load AS lowAerobicLoad, low_aerobic_target_min AS lowAerobicMin, low_aerobic_target_max AS lowAerobicMax,
         high_aerobic_load AS highAerobicLoad, high_aerobic_target_min AS highAerobicMin, high_aerobic_target_max AS highAerobicMax,
         anaerobic_load AS anaerobicLoad, anaerobic_target_min AS anaerobicMin, anaerobic_target_max AS anaerobicMax,
         raw_json AS rawJson
       FROM TrainingStatusSnapshots
       WHERE user_id = ?
       ORDER BY snapshot_date DESC LIMIT 1`,
      [userId]
    ),
    safeQuery(
      `SELECT DATE_FORMAT(threshold_date, '%Y-%m-%d') AS date, heart_rate_bpm AS heartRateBpm,
         cycling_heart_rate_bpm AS cyclingHeartRateBpm, speed_mps AS speedMps,
         power_w AS powerW, power_to_weight AS powerToWeight
       FROM LactateThresholds
       WHERE user_id = ?
       ORDER BY threshold_date DESC LIMIT 1`,
      [userId]
    ),
    safeQuery(
      `SELECT DATE_FORMAT(prediction_date, '%Y-%m-%d') AS date,
         time_5k_s AS time5kS, time_10k_s AS time10kS,
         time_half_marathon_s AS timeHmS, time_marathon_s AS timeFmS
       FROM RacePredictions
       WHERE user_id = ?
       ORDER BY prediction_date DESC LIMIT 1`,
      [userId]
    ),
    safeQuery(
      `SELECT name, brand, model, ROUND(distance_km, 1) AS distanceKm,
         ROUND(target_distance_km, 0) AS targetDistanceKm, is_retired AS isRetired
       FROM Shoes
       WHERE user_id = ? AND is_retired = 0
       ORDER BY distance_km DESC LIMIT 5`,
      [userId]
    ),
    trainingPreferenceService.get(userId).catch(() => null),
    athleteMemoryService.listMemories(userId).catch(() => []),
    trainingPlanService.getActive(userId).catch(() => null)
  ]);

  const status = statusRows[0] || null;
  let preciseVo2max = status ? pos(status.vo2max) : null;
  let deviceName = null;
  if (status?.rawJson) {
    try {
      const parsed = typeof status.rawJson === 'string' ? JSON.parse(status.rawJson) : status.rawJson;
      const precise = pos(parsed?.mostRecentVO2Max?.generic?.vo2MaxPreciseValue);
      if (precise) preciseVo2max = round(precise, 1);
      deviceName = parsed?.mostRecentTrainingStatus?.recordedDevices?.[0]?.deviceName || null;
    } catch {
      // Ignore malformed raw JSON
    }
  }

  const lt = ltRows[0] || null;
  const rp = predictionRows[0] || null;
  const runSummary = runSummaryRows[0] || null;

  return {
    asOfDate: today,
    sportsOverview: sportRows.map(r => {
      const key = normalizeSportKey(r.activityType);
      return {
        sport: key,
        sportLabel: SPORT_LABELS[key] || r.activityType,
        count: Number(r.count),
        totalDistanceKm: num(r.totalDistanceKm),
        totalHours: num(r.totalHours),
        dateRange: r.firstDate ? `${r.firstDate} 至 ${r.lastDate}` : null
      };
    }),
    runningOverview: runSummary && Number(runSummary.totalRuns) > 0 ? {
      totalRuns: Number(runSummary.totalRuns),
      runningDays: Number(runSummary.runningDays),
      totalDistanceKm: num(runSummary.totalDistanceKm),
      totalHours: num(runSummary.totalHours),
      longestRunKm: num(runSummary.longestRunKm),
      runs20KmPlus: Number(runSummary.runs20KmPlus),
      dateSpan: `${runSummary.firstRunDate} 至 ${runSummary.lastRunDate}`,
      last28Days: { runs: Number(runSummary.runsLast28d), distanceKm: num(runSummary.distanceLast28dKm) },
      last7Days: { runs: Number(runSummary.runsLast7d), distanceKm: num(runSummary.distanceLast7dKm) },
      latestRun: latestRunRows[0] ? formatActivityRow(latestRunRows[0]) : null
    } : null,
    physiology: {
      deviceName,
      trainingStatus: status ? {
        date: status.date,
        vo2max: preciseVo2max,
        status: status.trainingStatus,
        loadBalance: status.loadBalance,
        acuteLoad: round(status.acuteLoad, 0),
        chronicLoad: round(status.chronicLoad, 0),
        acwr: round(status.acwr, 2),
        acwrStatus: status.acwrStatus,
        optimalLoadRange: status.optimalLoadMin && status.optimalLoadMax
          ? `${Math.round(status.optimalLoadMin)}–${Math.round(status.optimalLoadMax)}` : null,
        aerobicLoadBreakdown: {
          lowAerobic: { load: round(status.lowAerobicLoad, 0), target: `${Math.round(status.lowAerobicMin || 0)}–${Math.round(status.lowAerobicMax || 0)}` },
          highAerobic: { load: round(status.highAerobicLoad, 0), target: `${Math.round(status.highAerobicMin || 0)}–${Math.round(status.highAerobicMax || 0)}` },
          anaerobic: { load: round(status.anaerobicLoad, 0), target: `${Math.round(status.anaerobicMin || 0)}–${Math.round(status.anaerobicMax || 0)}` }
        }
      } : null,
      lactateThreshold: lt ? {
        date: lt.date,
        heartRateBpm: pos(lt.heartRateBpm),
        pacePerKm: formatPaceFromSpeed(lt.speedMps),
        runningFtpWatts: pos(lt.powerW),
        powerToWeightWKg: pos(lt.powerToWeight) ? round(lt.powerToWeight, 2) : null
      } : null,
      garminRacePredictions: rp ? {
        date: rp.date,
        fiveK: { time: formatDuration(rp.time5kS), pace: formatPace(5000, rp.time5kS) },
        tenK: { time: formatDuration(rp.time10kS), pace: formatPace(10000, rp.time10kS) },
        halfMarathon: { time: formatDuration(rp.timeHmS), pace: formatPace(21097.5, rp.timeHmS) },
        marathon: { time: formatDuration(rp.timeFmS), pace: formatPace(42195, rp.timeFmS) }
      } : null
    },
    activeShoes: shoeRows.map(s => ({
      name: s.name,
      brand: s.brand,
      model: s.model,
      distanceKm: num(s.distanceKm),
      targetDistanceKm: num(s.targetDistanceKm)
    })),
    activePlan: activePlan ? {
      id: activePlan.id,
      name: activePlan.name,
      type: activePlan.type,
      goalType: activePlan.goalType,
      startDate: activePlan.startDate,
      status: activePlan.status,
      version: activePlan.version
    } : null,
    preferences: preferences || null,
    memories: memories.map(m => ({ id: m.id, category: m.categoryLabel, content: m.content }))
  };
}

/**
 * Tool 2: Flexible Activity Query & Aggregation Engine
 */
async function queryActivities(userId, {
  sport = 'all',
  startDate = null,
  endDate = localToday(),
  minDistanceKm = null,
  maxDistanceKm = null,
  sortBy = 'newest',
  mode = 'list',
  limit = 10,
  includeDemo = false
} = {}) {
  const safeLimit = Math.max(1, Math.min(30, Number(limit) || 10));
  const safeEnd = endDate || localToday();
  const { clause: sportClause, params: sportParams } = sportFilterSql(sport);
  const where = ['a.owner_user_id = ?', `${ACTIVITY_TS} <= ?`];
  const params = [userId, safeEnd + ' 23:59:59.999'];
  if (!includeDemo) where.push("a.data_source <> 'demo_synthetic'");
  if (startDate) {
    where.push(`${ACTIVITY_TS} >= ?`);
    params.push(startDate + ' 00:00:00.000');
  }
  if (pos(minDistanceKm)) {
    where.push('s.distance_m >= ?');
    params.push(minDistanceKm * 1000);
  }
  if (pos(maxDistanceKm)) {
    where.push('s.distance_m <= ?');
    params.push(maxDistanceKm * 1000);
  }

  const baseFrom = `FROM Activities a LEFT JOIN ActivitySummaries s ON s.activity_id = a.id WHERE ${where.join(' AND ')}${sportClause}`;
  const allParams = [...params, ...sportParams];

  if (mode === 'summary') {
    const [row] = await safeQuery(
      `SELECT COUNT(*) AS count,
         COUNT(DISTINCT DATE(${ACTIVITY_TS})) AS activeDays,
         SUM(COALESCE(s.distance_m, 0)) AS totalDistanceM,
         SUM(COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s, 0)) AS totalDurationS,
         SUM(CASE WHEN s.distance_m > 0 AND COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s) > 0 THEN s.distance_m ELSE 0 END) AS paceDistM,
         SUM(CASE WHEN s.distance_m > 0 AND COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s) > 0 THEN COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s) ELSE 0 END) AS paceDurS,
         AVG(NULLIF(s.avg_heart_rate_bpm, 0)) AS avgHr,
         SUM(COALESCE(s.elevation_gain_m, 0)) AS totalElevationM,
         SUM(COALESCE(s.activity_training_load, 0)) AS totalLoad,
         MAX(s.distance_m) AS maxDistanceM,
         DATE_FORMAT(MIN(${ACTIVITY_TS}), '%Y-%m-%d') AS firstDate,
         DATE_FORMAT(MAX(${ACTIVITY_TS}), '%Y-%m-%d') AS lastDate
       ${baseFrom}`,
      allParams
    );
    const count = Number(row?.count || 0);
    return {
      mode: 'summary',
      scope: { sport, startDate, endDate: safeEnd },
      count,
      activeDays: Number(row?.activeDays || 0),
      dateSpan: row?.firstDate ? `${row.firstDate} 至 ${row.lastDate}` : null,
      totalDistanceKm: round((row?.totalDistanceM || 0) / 1000, 2),
      avgDistanceKm: count ? round((row?.totalDistanceM || 0) / 1000 / count, 2) : null,
      totalDurationFormatted: formatDuration(row?.totalDurationS),
      totalHours: round((row?.totalDurationS || 0) / 3600, 1),
      overallPacePerKm: sport === 'running' ? formatPace(row?.paceDistM, row?.paceDurS) : null,
      avgHrBpm: pos(row?.avgHr) ? Math.round(row.avgHr) : null,
      totalElevationGainM: round(row?.totalElevationM, 0),
      totalTrainingLoad: round(row?.totalLoad, 0),
      longestDistanceKm: pos(row?.maxDistanceM) ? round(row.maxDistanceM / 1000, 2) : null
    };
  }

  if (mode === 'monthly_trend' || mode === 'weekly_trend') {
    const bucketExpr = mode === 'monthly_trend'
      ? `DATE_FORMAT(${ACTIVITY_TS}, '%Y-%m')`
      : `DATE_FORMAT(DATE_SUB(DATE(${ACTIVITY_TS}), INTERVAL WEEKDAY(${ACTIVITY_TS}) DAY), '%Y-%m-%d')`;
    const rows = await safeQuery(
      `SELECT ${bucketExpr} AS period,
         COUNT(*) AS count,
         SUM(COALESCE(s.distance_m, 0)) AS totalDistanceM,
         SUM(COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s, 0)) AS totalDurationS,
         SUM(CASE WHEN s.distance_m > 0 AND COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s) > 0 THEN s.distance_m ELSE 0 END) AS paceDistM,
         SUM(CASE WHEN s.distance_m > 0 AND COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s) > 0 THEN COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s) ELSE 0 END) AS paceDurS,
         AVG(NULLIF(s.avg_heart_rate_bpm, 0)) AS avgHr,
         SUM(COALESCE(s.activity_training_load, 0)) AS totalLoad
       ${baseFrom}
       GROUP BY period
       ORDER BY period DESC
       LIMIT ?`,
      [...allParams, safeLimit]
    );
    return {
      mode,
      scope: { sport, startDate, endDate: safeEnd },
      periods: rows.reverse().map(r => ({
        period: r.period,
        count: Number(r.count),
        distanceKm: round((r.totalDistanceM || 0) / 1000, 2),
        hours: round((r.totalDurationS || 0) / 3600, 1),
        avgPacePerKm: sport === 'running' ? formatPace(r.paceDistM, r.paceDurS) : null,
        avgHrBpm: pos(r.avgHr) ? Math.round(r.avgHr) : null,
        trainingLoad: round(r.totalLoad, 0)
      }))
    };
  }

  const orderMap = {
    newest: `${ACTIVITY_TS} DESC, a.id DESC`,
    oldest: `${ACTIVITY_TS} ASC, a.id ASC`,
    fastest_pace: `(s.distance_m IS NULL OR s.distance_m <= 0 OR COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s) IS NULL) ASC, (COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s) / NULLIF(s.distance_m, 0)) ASC, ${ACTIVITY_TS} DESC`,
    longest_distance: `COALESCE(s.distance_m, 0) DESC, ${ACTIVITY_TS} DESC`,
    highest_load: `COALESCE(s.activity_training_load, 0) DESC, ${ACTIVITY_TS} DESC`,
    highest_hr: `COALESCE(s.avg_heart_rate_bpm, 0) DESC, ${ACTIVITY_TS} DESC`
  };
  const orderSql = orderMap[sortBy] || orderMap.newest;

  const rows = await safeQuery(
    `SELECT a.id AS activityId, a.activity_name AS activityName, a.activity_type AS activityType,
       a.data_source AS dataSource, a.perceived_effort AS rpe,
       a.weather_condition AS weatherCondition, a.temperature_c AS temperatureC, a.humidity_percent AS humidityPct,
       DATE_FORMAT(${ACTIVITY_TS}, '%Y-%m-%d') AS date,
       DATE_FORMAT(${ACTIVITY_TS}, '%H:%i') AS time,
       s.distance_m AS distanceM, COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s) AS durationS,
       s.avg_heart_rate_bpm AS avgHr, s.max_heart_rate_bpm AS maxHr, s.avg_cadence_spm AS avgCadence,
       s.elevation_gain_m AS elevationGainM, s.activity_training_load AS trainingLoad,
       s.aerobic_training_effect AS aerobicTE, s.anaerobic_training_effect AS anaerobicTE,
       s.training_effect_label AS trainingEffectLabel, s.vo2max
     ${baseFrom}
     ORDER BY ${orderSql}
     LIMIT ?`,
    [...allParams, safeLimit]
  );

  return {
    mode: 'list',
    scope: { sport, startDate, endDate: safeEnd, sortBy, limit: safeLimit },
    count: rows.length,
    activities: rows.map(formatActivityRow)
  };
}

/**
 * Tool 3: Running Personal Bests & Distance Band Coverage
 */
async function getRunningPbsAndBands(userId, { distancesKm = [], startDate = null, endDate = localToday() } = {}) {
  const safeEnd = endDate || localToday();
  const where = [
    'a.owner_user_id = ?',
    "a.data_source <> 'demo_synthetic'",
    `${ACTIVITY_TS} <= ?`,
    RUNNING_PREDICATE,
    's.distance_m > 0',
    'COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s) > 0'
  ];
  const params = [userId, safeEnd + ' 23:59:59.999'];
  if (startDate) {
    where.push(`${ACTIVITY_TS} >= ?`);
    params.push(startDate + ' 00:00:00.000');
  }

  const standardBands = [
    { label: '800m–1.2km', minM: 750, maxM: 1250 },
    { label: '1.5km 档 (1.25–2.2km)', minM: 1250, maxM: 2200 },
    { label: '3km 档 (2.5–3.8km)', minM: 2500, maxM: 3800 },
    { label: '5km 档 (4.7–5.5km)', minM: 4700, maxM: 5500 },
    { label: '8–12km (10km 档)', minM: 8000, maxM: 12000 },
    { label: '12–18km (15km 档)', minM: 12000, maxM: 18000 },
    { label: '半马档 (18–24km)', minM: 18000, maxM: 24000 },
    { label: '长距离 24–38km', minM: 24000, maxM: 38000 },
    { label: '全马档 (38km+)', minM: 38000, maxM: 500000 }
  ];

  const requested = Array.isArray(distancesKm)
    ? distancesKm.filter(d => Number.isFinite(d) && d >= 0.1 && d <= 500).slice(0, 6)
    : [];
  const bands = requested.length
    ? requested.map(km => ({
        label: km < 1 ? `${Math.round(km * 1000)}m` : `${km}km`,
        minM: km * 1000 * 0.96,
        maxM: km * 1000 * 1.04
      }))
    : standardBands;

  const rows = await safeQuery(
    `SELECT a.id AS activityId, a.activity_name AS activityName,
       DATE_FORMAT(${ACTIVITY_TS}, '%Y-%m-%d') AS date,
       s.distance_m AS distanceM,
       COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s) AS durationS,
       s.avg_heart_rate_bpm AS avgHr, s.max_heart_rate_bpm AS maxHr,
       s.activity_training_load AS trainingLoad
     FROM Activities a
     JOIN ActivitySummaries s ON s.activity_id = a.id
     WHERE ${where.join(' AND ')}`,
    params
  );

  const bandResults = bands.map(band => {
    const matches = rows.filter(r => r.distanceM >= band.minM && r.distanceM < band.maxM);
    if (!matches.length) {
      return requested.length ? { band: band.label, count: 0, fastest: null } : null;
    }
    matches.sort((a, b) => (a.durationS / a.distanceM) - (b.durationS / b.distanceM));
    const best = matches[0];
    return {
      band: band.label,
      count: matches.length,
      fastest: {
        activityId: Number(best.activityId),
        date: best.date,
        name: best.activityName,
        distanceKm: round(best.distanceM / 1000, 2),
        durationFormatted: formatDuration(best.durationS),
        pacePerKm: formatPace(best.distanceM, best.durationS),
        avgHrBpm: pos(best.avgHr) ? Math.round(best.avgHr) : null,
        maxHrBpm: pos(best.maxHr) ? Math.round(best.maxHr) : null,
        trainingLoad: pos(best.trainingLoad) ? Math.round(best.trainingLoad) : null
      }
    };
  }).filter(Boolean);

  let longest = null;
  if (rows.length) {
    const maxRow = rows.reduce((best, r) => (r.distanceM > best.distanceM ? r : best), rows[0]);
    longest = {
      activityId: Number(maxRow.activityId),
      date: maxRow.date,
      name: maxRow.activityName,
      distanceKm: round(maxRow.distanceM / 1000, 2),
      durationFormatted: formatDuration(maxRow.durationS),
      pacePerKm: formatPace(maxRow.distanceM, maxRow.durationS),
      avgHrBpm: pos(maxRow.avgHr) ? Math.round(maxRow.avgHr) : null
    };
  }

  return {
    scope: { startDate, endDate: safeEnd, requestedDistancesKm: requested },
    totalTimedRuns: rows.length,
    distanceBands: bandResults,
    longestRun: longest
  };
}

/**
 * Tool 4: Deep IoT Telemetry Analyzer for a single Activity
 * Reads Laps (splits), ActivityZones (HR zones), and TrackPoints (computes Aerobic Decoupling / HR Drift & pacing stability).
 */
async function analyzeActivityTelemetry(userId, activityId) {
  const id = Number(activityId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { error: '请提供有效的 activityId。' };
  }

  const [activityRow] = await safeQuery(
    `SELECT a.id AS activityId, a.activity_name AS activityName, a.activity_type AS activityType,
       a.data_source AS dataSource, a.perceived_effort AS rpe, a.location_name AS locationName,
       a.weather_condition AS weatherCondition, a.temperature_c AS temperatureC, a.humidity_percent AS humidityPct,
       DATE_FORMAT(${ACTIVITY_TS}, '%Y-%m-%d') AS date, DATE_FORMAT(${ACTIVITY_TS}, '%H:%i') AS time,
       s.distance_m AS distanceM, COALESCE(NULLIF(s.elapsed_duration_s, 0), s.duration_s) AS durationS,
       s.moving_duration_s AS movingDurationS, s.calories,
       s.avg_heart_rate_bpm AS avgHr, s.max_heart_rate_bpm AS maxHr,
       s.avg_cadence_spm AS avgCadence, s.max_cadence_spm AS maxCadence,
       s.avg_stride_length_cm AS avgStrideLengthCm, s.avg_power_w AS avgPowerW,
       s.elevation_gain_m AS elevationGainM, s.elevation_loss_m AS elevationLossM,
       s.activity_training_load AS trainingLoad,
       s.aerobic_training_effect AS aerobicTE, s.anaerobic_training_effect AS anaerobicTE,
       s.training_effect_label AS trainingEffectLabel, s.vo2max, s.body_battery_delta AS bodyBatteryDelta
     FROM Activities a
     LEFT JOIN ActivitySummaries s ON s.activity_id = a.id
     WHERE a.id = ? AND a.owner_user_id = ?
     LIMIT 1`,
    [id, userId]
  );

  if (!activityRow) {
    return { error: '未找到该条运动记录或无权查看。' };
  }

  const [laps, zones, trackPoints] = await Promise.all([
    safeQuery(
      `SELECT lap_index AS lapIndex, total_distance_m AS distanceM,
         COALESCE(NULLIF(total_timer_time_s, 0), total_elapsed_time_s) AS durationS,
         avg_speed_mps AS avgSpeedMps,
         avg_heart_rate_bpm AS avgHr, max_heart_rate_bpm AS maxHr,
         avg_cadence AS avgCadence, avg_power_w AS avgPowerW
       FROM Laps
       WHERE activity_id = ?
       ORDER BY lap_index ASC
       LIMIT 60`,
      [id]
    ),
    safeQuery(
      `SELECT zone_type AS zoneType, zone_index AS zoneIndex, duration_s AS durationS
       FROM ActivityZones
       WHERE activity_id = ?
       ORDER BY zone_type ASC, zone_index ASC`,
      [id]
    ),
    safeQuery(
      `SELECT sample_index AS idx, speed_mps AS speedMps, heart_rate_bpm AS hr, cadence, altitude_m AS alt
       FROM TrackPoints
       WHERE activity_id = ? AND speed_mps > 0.5 AND heart_rate_bpm > 60
       ORDER BY sample_index ASC`,
      [id]
    )
  ]);

  const formattedLaps = laps.map((l, i) => ({
    lap: l.lapIndex ?? i + 1,
    distanceKm: pos(l.distanceM) ? round(l.distanceM / 1000, 2) : null,
    durationFormatted: formatDuration(l.durationS),
    pacePerKm: formatPace(l.distanceM, l.durationS) || (pos(l.avgSpeedMps) && l.avgSpeedMps >= 1.0 ? formatPaceFromSpeed(l.avgSpeedMps) : null),
    avgHrBpm: pos(l.avgHr) ? Math.round(l.avgHr) : null,
    maxHrBpm: pos(l.maxHr) ? Math.round(l.maxHr) : null,
    cadence: pos(l.avgCadence) ? Math.round(l.avgCadence) : null,
    powerW: pos(l.avgPowerW) ? Math.round(l.avgPowerW) : null
  }));

  // Compute HR Zone distribution
  const hrZonesRaw = zones.filter(z => /heart|hr/i.test(String(z.zoneType || '')) || z.zoneType === 'HR');
  const totalZoneS = hrZonesRaw.reduce((acc, z) => acc + (pos(z.durationS) || 0), 0);
  const hrZones = totalZoneS > 0 ? hrZonesRaw.map(z => ({
    zone: `Z${z.zoneIndex}`,
    minutes: round((pos(z.durationS) || 0) / 60, 1),
    percent: round(((pos(z.durationS) || 0) / totalZoneS) * 100, 1)
  })) : [];

  // Compute Aerobic Decoupling (Pw:HR / Speed:HR Cardiac Drift) & Half-Split Analysis from TrackPoints
  let telemetryAnalytics = null;
  if (trackPoints.length >= 60) {
    // Drop first 5% warm-up samples so initial HR ramp doesn't skew decoupling.
    const startIdx = Math.floor(trackPoints.length * 0.05);
    const steady = trackPoints.slice(startIdx);
    const mid = Math.floor(steady.length / 2);
    const firstHalf = steady.slice(0, mid);
    const secondHalf = steady.slice(mid);

    const avg = (arr, fn) => arr.reduce((sum, item) => sum + fn(item), 0) / arr.length;
    const sp1 = avg(firstHalf, p => Number(p.speedMps));
    const hr1 = avg(firstHalf, p => Number(p.hr));
    const sp2 = avg(secondHalf, p => Number(p.speedMps));
    const hr2 = avg(secondHalf, p => Number(p.hr));

    const ef1 = sp1 / hr1;
    const ef2 = sp2 / hr2;
    const decouplingPct = round(((ef1 - ef2) / ef1) * 100, 1);

    const pace1Sec = Math.round(1000 / sp1);
    const pace2Sec = Math.round(1000 / sp2);
    const paceDiffSec = pace2Sec - pace1Sec; // negative => negative split (faster 2nd half)

    let splitStrategy = '配速非常均匀 (Even Split)';
    if (paceDiffSec <= -5) splitStrategy = `后半程加速 (Negative Split，快约 ${Math.abs(paceDiffSec)} 秒/公里)`;
    else if (paceDiffSec >= 8) splitStrategy = `后半程掉速 (Positive Split，慢约 ${paceDiffSec} 秒/公里)`;

    let decouplingAssessment = '有氧基础极稳（心率漂移 < 5%）';
    if (decouplingPct >= 8) decouplingAssessment = '后半程心率漂移较明显（≥ 8%），可能受配速偏快、补水或疲劳影响';
    else if (decouplingPct >= 5) decouplingAssessment = '轻度心率漂移（5%–8%），属于正常长距离疲劳信号';

    telemetryAnalytics = {
      validTrackPoints: trackPoints.length,
      firstHalf: {
        avgPacePerKm: formatPace(1000, pace1Sec),
        avgHrBpm: Math.round(hr1)
      },
      secondHalf: {
        avgPacePerKm: formatPace(1000, pace2Sec),
        avgHrBpm: Math.round(hr2)
      },
      aerobicDecouplingPct: decouplingPct,
      decouplingAssessment,
      splitStrategy
    };
  }

  // Compute 24-bin Pace & HR Sparkline profile directly from TrackPoints (works even when Laps lack distance)
  let paceProfile = [];
  if (trackPoints.length >= 20) {
    const bins = Math.min(24, Math.max(8, Math.floor(trackPoints.length / 20)));
    const step = trackPoints.length / bins;
    for (let b = 0; b < bins; b++) {
      const slice = trackPoints.slice(Math.floor(b * step), Math.floor((b + 1) * step));
      if (!slice.length) continue;
      const avgSp = slice.reduce((acc, p) => acc + Number(p.speedMps), 0) / slice.length;
      const avgHr = slice.reduce((acc, p) => acc + Number(p.hr), 0) / slice.length;
      if (avgSp > 1.0) {
        const paceSec = Math.round(1000 / avgSp);
        paceProfile.push({
          lap: b + 1,
          paceSec,
          pacePerKm: formatPace(1000, paceSec),
          avgHr: Math.round(avgHr)
        });
      }
    }
  }

  return {
    summary: {
      ...formatActivityRow(activityRow),
      locationName: activityRow.locationName || null,
      avgStrideLengthCm: pos(activityRow.avgStrideLengthCm) ? round(activityRow.avgStrideLengthCm, 1) : null,
      avgPowerW: pos(activityRow.avgPowerW) ? Math.round(activityRow.avgPowerW) : null,
      elevationLossM: num(activityRow.elevationLossM) !== null ? Math.round(activityRow.elevationLossM) : null,
      bodyBatteryDelta: num(activityRow.bodyBatteryDelta)
    },
    telemetryAnalytics,
    hrZones,
    paceProfile,
    lapsCount: formattedLaps.length,
    laps: formattedLaps.length <= 25
      ? formattedLaps
      : [...formattedLaps.slice(0, 12), { note: `...省略中间 ${formattedLaps.length - 20} 段...` }, ...formattedLaps.slice(-8)]
  };
}

/**
 * Tool 5: Health, Sleep, HRV, Stress, Body Battery & Training Status Trends
 * Automatically resolves the athlete's latest synced period if recent calendar days have no records.
 */
async function getHealthAndRecovery(userId, { startDate = null, endDate = localToday(), days = 14 } = {}) {
  const safeDays = Math.max(1, Math.min(90, Number(days) || 14));
  let resolvedEnd = endDate || localToday();
  let resolvedStart = startDate || addDays(resolvedEnd, -(safeDays - 1));
  let usedLatestAvailableWindow = false;

  if (!startDate) {
    const [latestCheck] = await safeQuery(
      `SELECT GREATEST(
         COALESCE((SELECT MAX(sleep_date) FROM SleepSummaries WHERE user_id = ?), '1970-01-01'),
         COALESCE((SELECT MAX(summary_date) FROM DailyHealthSummaries WHERE user_id = ?), '1970-01-01'),
         COALESCE((SELECT MAX(snapshot_date) FROM TrainingStatusSnapshots WHERE user_id = ?), '1970-01-01')
       ) AS latestDate`,
      [userId, userId, userId]
    );
    const latestDate = latestCheck?.latestDate && latestCheck.latestDate !== '1970-01-01' ? String(latestCheck.latestDate).slice(0, 10) : null;
    if (latestDate && latestDate < resolvedStart) {
      resolvedEnd = latestDate;
      resolvedStart = addDays(resolvedEnd, -(safeDays - 1));
      usedLatestAvailableWindow = true;
    }
  }

  const [sleepRows, healthRows, statusRows] = await Promise.all([
    safeQuery(
      `SELECT DATE_FORMAT(sleep_date, '%Y-%m-%d') AS date, duration_s AS durationS,
         deep_sleep_s AS deepS, light_sleep_s AS lightS, rem_sleep_s AS remS, awake_s AS awakeS,
         COALESCE(
           NULLIF(CAST(JSON_UNQUOTE(JSON_EXTRACT(raw_json, '$.dailySleepDTO.sleepScores.overall.value')) AS UNSIGNED), 0),
           sleep_score
         ) AS sleepScore,
         avg_hrv AS avgHrv, hrv_status AS hrvStatus,
         avg_heart_rate_during_sleep AS sleepHr
       FROM SleepSummaries
       WHERE user_id = ? AND sleep_date >= ? AND sleep_date <= ?
       ORDER BY sleep_date ASC`,
      [userId, resolvedStart, resolvedEnd]
    ),
    safeQuery(
      `SELECT DATE_FORMAT(summary_date, '%Y-%m-%d') AS date, steps,
         resting_heart_rate_bpm AS rhr, avg_stress_level AS avgStress,
         min_body_battery AS minBB, max_body_battery AS maxBB,
         body_battery_charged AS bbCharged, body_battery_drained AS bbDrained
       FROM DailyHealthSummaries
       WHERE user_id = ? AND summary_date >= ? AND summary_date <= ?
       ORDER BY summary_date ASC`,
      [userId, resolvedStart, resolvedEnd]
    ),
    safeQuery(
      `SELECT DATE_FORMAT(snapshot_date, '%Y-%m-%d') AS date, vo2max, training_status AS status,
         acute_training_load AS acuteLoad, chronic_training_load AS chronicLoad,
         acute_chronic_workload_ratio AS acwr, acwr_status AS acwrStatus
       FROM TrainingStatusSnapshots
       WHERE user_id = ? AND snapshot_date >= ? AND snapshot_date <= ?
       ORDER BY snapshot_date ASC`,
      [userId, resolvedStart, resolvedEnd]
    )
  ]);

  const mean = values => {
    const valid = values.map(num).filter(v => v !== null && v > 0);
    return valid.length ? round(valid.reduce((a, b) => a + b, 0) / valid.length, 1) : null;
  };

  const hrvValues = sleepRows.map(r => num(r.avgHrv)).filter(v => v !== null && v > 0);
  const sleepHours = sleepRows.map(r => pos(r.durationS) ? r.durationS / 3600 : null).filter(Boolean);

  return {
    window: {
      startDate: resolvedStart,
      endDate: resolvedEnd,
      usedLatestSyncedWindow: usedLatestAvailableWindow,
      note: usedLatestAvailableWindow
        ? `当前近 ${safeDays} 天无新同步，已自动读取最近有健康数据的时段（${resolvedStart} 至 ${resolvedEnd}）。`
        : undefined
    },
    sleepAndHrv: sleepRows.length ? {
      daysRecorded: sleepRows.length,
      avgSleepHours: mean(sleepHours),
      minSleepHours: sleepHours.length ? round(Math.min(...sleepHours), 1) : null,
      maxSleepHours: sleepHours.length ? round(Math.max(...sleepHours), 1) : null,
      avgSleepScore: mean(sleepRows.map(r => r.sleepScore)),
      avgDeepSleepHours: mean(sleepRows.map(r => pos(r.deepS) ? r.deepS / 3600 : null)),
      avgRemSleepHours: mean(sleepRows.map(r => pos(r.remS) ? r.remS / 3600 : null)),
      avgHrvMs: mean(hrvValues),
      hrvRangeMs: hrvValues.length ? `${Math.round(Math.min(...hrvValues))}–${Math.round(Math.max(...hrvValues))}` : null,
      latestHrvStatus: sleepRows.at(-1)?.hrvStatus || null,
      recentNights: sleepRows.slice(-7).map(r => ({
        date: r.date,
        sleepHours: pos(r.durationS) ? round(r.durationS / 3600, 1) : null,
        score: pos(r.sleepScore),
        hrvMs: pos(r.avgHrv) ? Math.round(r.avgHrv) : null,
        hrvStatus: r.hrvStatus || null
      }))
    } : null,
    dailyHealth: healthRows.length ? {
      daysRecorded: healthRows.length,
      avgSteps: mean(healthRows.map(r => r.steps)),
      avgRestingHrBpm: mean(healthRows.map(r => r.rhr)),
      avgStressLevel: mean(healthRows.map(r => r.avgStress)),
      avgMaxBodyBattery: mean(healthRows.map(r => r.maxBB)),
      avgMinBodyBattery: mean(healthRows.map(r => r.minBB)),
      recentDays: healthRows.slice(-7).map(r => ({
        date: r.date,
        steps: pos(r.steps),
        rhr: pos(r.rhr),
        avgStress: pos(r.avgStress) ? Math.round(r.avgStress) : null,
        bodyBattery: r.minBB != null && r.maxBB != null ? `${r.minBB}–${r.maxBB}` : null
      }))
    } : null,
    trainingStatusTrend: statusRows.length ? {
      daysRecorded: statusRows.length,
      latest: statusRows.at(-1),
      earliest: statusRows[0],
      vo2maxStart: pos(statusRows[0]?.vo2max),
      vo2maxEnd: pos(statusRows.at(-1)?.vo2max),
      avgAcwr: mean(statusRows.map(r => r.acwr))
    } : null
  };
}

/**
 * Tool 6: Training Plans, Execution Diffs & Revision History
 */
async function getTrainingPlansAndExecution(userId) {
  const plans = await trainingPlanService.list(userId);
  const active = plans.find(p => p.status === 'active') || null;
  let activeDetails = null;
  let revisions = [];
  if (active) {
    [activeDetails, revisions] = await Promise.all([
      trainingPlanService.get(userId, active.id),
      trainingPlanService.revisions(userId, active.id).then(r => r.revisions || []).catch(() => [])
    ]);
  }

  let executionSummary = null;
  let upcomingSessions = [];
  let recentSessions = [];
  if (activeDetails) {
    const allSessions = activeDetails.weeks.flatMap((w, wi) =>
      w.days.filter(d => d.id).map(d => ({ week: wi + 1, phase: w.phase, ...d }))
    );
    const today = localToday();
    const completed = allSessions.filter(s => s.status === 'completed').length;
    const skipped = allSessions.filter(s => s.status === 'skipped').length;
    const pending = allSessions.filter(s => s.status === 'pending').length;
    executionSummary = { totalSessions: allSessions.length, completed, skipped, pending };
    upcomingSessions = allSessions.filter(s => s.date >= today && s.status === 'pending').slice(0, 10).map(s => ({
      sessionId: s.id, date: s.date, week: s.week, phase: s.phase,
      title: s.title, subtitle: s.subtitle, type: s.type,
      targetDistanceKm: pos(s.distanceM) ? round(s.distanceM / 1000, 2) : null,
      targetDurationMin: pos(s.durationS) ? Math.round(s.durationS / 60) : null,
      status: s.status
    }));
    recentSessions = allSessions.filter(s => s.date <= today).slice(-6).map(s => ({
      sessionId: s.id, date: s.date, title: s.title, status: s.status,
      execution: s.execution ? {
        actualDate: s.execution.actual?.date,
        actualDistanceKm: pos(s.execution.actual?.distanceM) ? round(s.execution.actual.distanceM / 1000, 2) : null,
        actualDurationFormatted: formatDuration(s.execution.actual?.durationS),
        review: s.execution.review
      } : null
    }));
  }

  return {
    plansCount: plans.length,
    plans: plans.slice(0, 6).map(p => ({
      id: p.id, name: p.name, type: p.type, goalType: p.goalType,
      status: p.status, startDate: p.startDate, version: p.version
    })),
    activePlan: activeDetails ? {
      id: activeDetails.id,
      name: activeDetails.name,
      goal: activeDetails.goal,
      type: activeDetails.type,
      startDate: activeDetails.startDate,
      version: activeDetails.version,
      executionSummary,
      upcomingSessions,
      recentSessions,
      recentRevisions: revisions.slice(0, 5)
    } : null
  };
}

module.exports = {
  getAthleteProfile,
  queryActivities,
  getRunningPbsAndBands,
  analyzeActivityTelemetry,
  getHealthAndRecovery,
  getTrainingPlansAndExecution,
  formatDuration,
  formatPace,
  formatPaceFromSpeed
};
