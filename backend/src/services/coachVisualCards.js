function paceStringToSeconds(pace) {
  if (typeof pace !== 'string') return null;
  const match = pace.match(/^(\d+)'(\d{2})"/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function buildVisualCardForTool(toolName, output) {
  if (!output || output.error) return null;

  if (toolName === 'analyze_activity_telemetry' && output.summary) {
    const s = output.summary;
    const lapPoints = (output.laps || [])
      .filter(l => l && !l.note && l.pacePerKm && (l.distanceKm == null || l.distanceKm >= 0.4))
      .map(l => ({
        lap: l.lap,
        pacePerKm: l.pacePerKm,
        paceSec: paceStringToSeconds(l.pacePerKm),
        avgHr: l.avgHrBpm || null
      }))
      .filter(l => l.paceSec !== null);

    const profilePoints = Array.isArray(output.paceProfile)
      ? output.paceProfile.filter(p => Number.isFinite(p?.paceSec) && p.paceSec > 0)
      : [];
    const laps = lapPoints.length >= 3 ? lapPoints : profilePoints;

    return {
      type: 'telemetry_card',
      activityId: s.activityId,
      title: s.name || s.sportLabel || '单次运动',
      date: s.date,
      weather: s.weather
        ? [s.weather.condition, s.weather.tempC != null ? `${Math.round(s.weather.tempC)}°C` : null, s.weather.humidityPct != null ? `湿度 ${s.weather.humidityPct}%` : null].filter(Boolean).join(' · ')
        : null,
      metrics: [
        s.distanceKm != null && { label: '距离', value: `${s.distanceKm} km` },
        s.durationFormatted && { label: '用时', value: s.durationFormatted },
        s.pacePerKm && { label: '均配速', value: s.pacePerKm },
        s.avgHrBpm != null && { label: '均心率', value: `${s.avgHrBpm} bpm` },
        s.avgCadence != null && { label: '步频', value: `${s.avgCadence} spm` }
      ].filter(Boolean).slice(0, 4),
      analytics: output.telemetryAnalytics ? {
        firstHalfPace: output.telemetryAnalytics.firstHalf?.avgPacePerKm || null,
        firstHalfHr: output.telemetryAnalytics.firstHalf?.avgHrBpm || null,
        secondHalfPace: output.telemetryAnalytics.secondHalf?.avgPacePerKm || null,
        secondHalfHr: output.telemetryAnalytics.secondHalf?.avgHrBpm || null,
        decouplingPct: output.telemetryAnalytics.aerobicDecouplingPct,
        splitStrategy: output.telemetryAnalytics.splitStrategy
      } : null,
      hrZones: (output.hrZones || []).slice(0, 5),
      lapSeries: laps.slice(0, 45)
    };
  }

  if (toolName === 'get_health_and_recovery' && (output.sleepAndHrv || output.dailyHealth)) {
    const sh = output.sleepAndHrv;
    const dh = output.dailyHealth;
    const ts = output.trainingStatusTrend;
    return {
      type: 'recovery_card',
      dateRange: output.window ? `${output.window.startDate} 至 ${output.window.endDate}` : '',
      metrics: [
        sh?.avgSleepHours != null && { label: '均睡眠', value: `${sh.avgSleepHours} h` },
        sh?.avgSleepScore != null && { label: '睡眠分', value: `${Math.round(sh.avgSleepScore)}` },
        sh?.avgHrvMs != null && { label: '均 HRV', value: `${Math.round(sh.avgHrvMs)} ms` },
        dh?.avgRestingHrBpm != null && { label: '静息心率', value: `${Math.round(dh.avgRestingHrBpm)} bpm` }
      ].filter(Boolean).slice(0, 4),
      hrvStatus: sh?.latestHrvStatus || null,
      acwr: ts?.latest?.acwr ?? ts?.avgAcwr ?? null,
      acwrStatus: ts?.latest?.acwrStatus || null,
      nights: (sh?.recentNights || []).slice(-7).map(n => ({
        date: n.date.slice(5),
        sleepHours: n.sleepHours,
        score: n.score,
        hrvMs: n.hrvMs,
        hrvStatus: n.hrvStatus
      }))
    };
  }

  if (toolName === 'query_activities' && ['monthly_trend', 'weekly_trend'].includes(output.mode) && output.periods?.length >= 2) {
    return {
      type: 'trend_card',
      mode: output.mode,
      title: output.mode === 'monthly_trend' ? '月度跑量趋势' : '周度跑量趋势',
      sport: output.scope?.sport || 'all',
      periods: output.periods.slice(-8).map(p => ({
        label: output.mode === 'monthly_trend' ? p.period.slice(2) : p.period.slice(5),
        distanceKm: p.distanceKm ?? 0,
        count: p.count ?? 0,
        avgPace: p.avgPacePerKm || null
      }))
    };
  }

  if (toolName === 'get_athlete_profile' && output.physiology?.trainingStatus?.vo2max) {
    const ts = output.physiology.trainingStatus;
    const lt = output.physiology.lactateThreshold;
    const rp = output.physiology.garminRacePredictions;
    return {
      type: 'dossier_card',
      deviceName: output.physiology.deviceName || 'Garmin',
      asOf: ts.date || output.runningOverview?.latestRun?.date || output.asOfDate,
      vo2max: ts.vo2max,
      acwr: ts.acwr,
      acwrStatus: ts.acwrStatus,
      lactatePace: lt?.pacePerKm || null,
      lactateHr: lt?.heartRateBpm || null,
      runningFtpW: lt?.runningFtpWatts || null,
      predictions: rp ? [
        rp.fiveK?.time && { label: '5K', time: rp.fiveK.time },
        rp.tenK?.time && { label: '10K', time: rp.tenK.time },
        rp.halfMarathon?.time && { label: '半马', time: rp.halfMarathon.time },
        rp.marathon?.time && { label: '全马', time: rp.marathon.time }
      ].filter(Boolean) : []
    };
  }

  return null;
}

function extractFollowups(rawText, toolsCalled = []) {
  const text = typeof rawText === 'string' ? rawText : '';
  let cleanText = text;
  let parsedFollowups = [];

  const match = text.match(/<!--\s*followups\s*:\s*(\[[\s\S]*?\])\s*-->\s*$/);
  if (match) {
    cleanText = text.slice(0, match.index).trimEnd();
    try {
      const arr = JSON.parse(match[1]);
      if (Array.isArray(arr)) {
        parsedFollowups = arr
          .filter(item => typeof item === 'string' && item.trim().length >= 4 && item.trim().length <= 42)
          .map(item => item.trim())
          .slice(0, 3);
      }
    } catch {
      parsedFollowups = [];
    }
  } else {
    // Strip any incomplete trailing marker if stream truncated
    cleanText = text.replace(/<!--\s*followups[\s\S]*$/i, '').trimEnd();
  }

  if (!parsedFollowups.length) {
    const set = new Set(toolsCalled);
    if (set.has('propose_training_plan') || set.has('propose_plan_revision')) {
      parsedFollowups = ['解释一下这份课表的强度配比', '如果周中临时加班怎么微调？'];
    } else if (set.has('analyze_activity_telemetry')) {
      parsedFollowups = ['针对这次后半程表现，下阶段该怎么练？', '看看我同期的睡眠和 HRV 状态'];
    } else if (set.has('get_health_and_recovery')) {
      parsedFollowups = ['按我目前的恢复状态，明天适合什么强度？', '帮我定制一份兼顾恢复的 4 周课表'];
    } else if (set.has('get_athlete_profile') || set.has('get_running_pbs_and_bands')) {
      parsedFollowups = ['深度拆解我最长那次跑步的分段和心率漂移', '按我的真实水平排一份 4 周进阶计划', '看看我近期的睡眠和 HRV 恢复状态'];
    }
  }

  return { cleanText, followups: parsedFollowups };
}

function getBeijingHour() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hour12: false
  }).formatToParts();
  return Number(parts.find(p => p.type === 'hour')?.value ?? 12);
}

function buildContextPulse(profile, user) {
  const hour = getBeijingHour();
  const greetingPrefix = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const name = user?.username && user.username !== 'demo' ? user.username : '跑者';

  const run = profile?.runningOverview;
  const ts = profile?.physiology?.trainingStatus;
  const lt = profile?.physiology?.lactateThreshold;
  const activePlan = profile?.activePlan;

  const pills = [];
  if (ts?.vo2max) {
    pills.push({
      label: 'VO2max',
      value: String(ts.vo2max),
      tone: 'emerald',
      prompt: '结合我的 VO2max 和各项跑步数据，客观评估一下我现在的竞技水平和潜力上限'
    });
  }
  if (lt?.pacePerKm) {
    pills.push({
      label: '乳酸阈值',
      value: lt.pacePerKm.replace('/km', ''),
      tone: 'blue',
      prompt: '根据我的乳酸阈值配速和心率，帮我划定轻松跑、马拉松配速、阈值跑和间歇跑的训练区间'
    });
  }
  if (ts?.acwr != null) {
    pills.push({
      label: '负荷比',
      value: `${ts.acwr}${ts.acwrStatus === 'OPTIMAL' ? ' · 最佳' : ''}`,
      tone: ts.acwrStatus === 'OPTIMAL' ? 'emerald' : 'amber',
      prompt: '分析一下我近期的急慢性负荷比、低/高有氧负荷平衡以及有没有过度训练风险'
    });
  }
  if (run?.totalRuns) {
    pills.push({
      label: '累计跑量',
      value: `${Math.round(run.totalDistanceKm)} km`,
      tone: 'neutral',
      prompt: '按月汇总一下我的跑量变化和训练趋势，点评训练节奏稳不稳'
    });
  }

  const starters = [];
  if (run?.totalRuns) {
    starters.push({
      tag: '能力画像',
      title: '全面评估我的中长跑水平',
      desc: `整合 ${run.totalRuns} 次跑步、VO2max 与全距离 PB`,
      prompt: '结合我全部数据，客观评估一下我中长跑什么水平？'
    });
    if (run.longestRunKm >= 15) {
      starters.push({
        tag: 'IoT 遥测',
        title: `拆解我的 ${run.longestRunKm}km 最长距离`,
        desc: '逐公里分段、心率区间与有氧解耦漂移',
        prompt: '帮我找到最长那次跑步，深度拆解分段配速、心率区间和有氧解耦'
      });
    } else {
      starters.push({
        tag: '遥测复盘',
        title: '复盘最近一次跑步表现',
        desc: '分段配速、心率区间与步频经济性',
        prompt: '帮我深度拆解最近一次跑步的分段配速、心率区间和有氧漂移'
      });
    }
    starters.push({
      tag: '恢复监控',
      title: '看看睡眠、HRV 与训练负荷',
      desc: '排查过度疲劳与有氧/无氧负荷平衡',
      prompt: '看看我近期有记录的睡眠、HRV 和训练负荷状态怎么样，有没有练过头？'
    });
    starters.push(activePlan
      ? {
          tag: '执行中计划',
          title: `查看「${activePlan.name}」进度`,
          desc: '核对下一次课表安排或按状态微调',
          prompt: '帮我看看当前执行中的训练计划进度和下一次课表安排'
        }
      : {
          tag: '专属排课',
          title: '定制 4 周个性化进阶计划',
          desc: '按真实阈值配速生成可审批课表卡片',
          prompt: '根据我现在的真实水平，帮我制定一份下周一开始的 4 周、每周二四六日训练的跑步进阶计划，直接出草案卡片给我确认'
        });
  } else {
    starters.push(
      { tag: '新手起步', title: '制定我的首次 5 公里计划', desc: '每周 3 次循序渐进，确认后自动入库', prompt: '我是新手，每周二、四、日有空，帮我制定一份 4 周首次 5 公里跑步计划' },
      { tag: '训练方法', title: '什么是 80/20 极化训练？', desc: '基于运动科学知识库讲解配速分配', prompt: '讲讲 80/20 极化训练和轻松跑心率控制的核心原理' },
      { tag: '跑者力量', title: '跑者必练的防伤力量动作', desc: '提升跑步经济性、预防膝踝劳损', prompt: '跑者每周应该怎么安排防伤和提升经济性的力量训练？' },
      { tag: '数据接入', title: '如何导入 Garmin 或 FIT 数据？', desc: '了解同步运动与健康指标的完整方式', prompt: '我现在还没有同步运动记录，接下来怎么开始用 SpAgent 配合训练最好？' }
    );
  }

  return {
    greeting: `${greetingPrefix}，${name}`,
    subtitle: run?.totalRuns
      ? `${profile?.physiology?.deviceName ? profile.physiology.deviceName + ' · ' : ''}已同步 ${run.totalRuns} 次跑步（截至 ${run.latestRun?.date || profile.asOfDate}）`
      : '随时查运动数据、拆解配速心率，或定制你的专属训练计划',
    pills: pills.slice(0, 4),
    starters: starters.slice(0, 4),
    memoriesCount: profile?.memories?.length || 0,
    hasActivePlan: Boolean(activePlan)
  };
}

module.exports = {
  buildVisualCardForTool,
  extractFollowups,
  buildContextPulse
};
