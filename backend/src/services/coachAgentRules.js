const { addDays, localToday, readPlan } = require('./trainingPlanInput');
const { parseDate } = require('../http');

const RULE_VERSION = 'coach-starter-v1';
const goalNames = { first_5k: '首次 5 公里', regular_running: '规律跑步' };
const trainingTools = ['get_training_context', 'get_active_plan'];
const weekdaysByText = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
const weekdayToken = '[一二三四五六日天1-7]';
const preference = [2, 6, 4, 7, 3, 5, 1];
const frequencyByText = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function parseWeekdays(text) {
  const groups = text.matchAll(new RegExp(
    `(?:周|星期|礼拜)\\s*(${weekdayToken}(?!\\s*[次天])(?:\\s*[、,，/和及与]\\s*(?:(?:周|星期|礼拜)\\s*)?${weekdayToken})*)`,
    'gu'
  ));
  const values = [...groups].flatMap(group => (
    [...group[1].matchAll(new RegExp(weekdayToken, 'gu'))].map(([day]) => weekdaysByText[day] ?? Number(day))
  ));
  if (/周末/.test(text)) values.push(6, 7);
  return [...new Set(values)].sort();
}

function interpretWithRules(message) {
  const text = message.normalize('NFKC').toLowerCase();
  if (/疼|受伤|胸痛|晕厥|刚做完手术/.test(text)) {
    return { intent: 'blocked', reply: '你提到了疼痛或受伤。建议先暂停增加训练负荷，按需要咨询专业人士。' };
  }
  if (/不(?:用|想|要|需要)(?:再|帮我|制定|生成|做|建)*.{0,3}(?:计划|课表)/.test(text)) {
    return { intent: 'blocked', reply: '这次先不生成草案。需要安排训练时，再告诉我目标和可训练的日期。' };
  }
  if (/(?:调整|修改|改到|改为|挪到|移到|取消).{0,12}(?:计划|训练|周[一二三四五六日]|课表)|(?:计划|课表).{0,8}(?:调整|修改|改到|挪到|取消)/.test(text)) {
    return { intent: 'blocked', reply: '可以在「训练计划」中手动调整现有课表。这里可以按新的目标和可训练日生成一份新草案。' };
  }
  if (/马拉松|半马|(?:10|十)\s*(?:公里|km)|配速提升|提速|破\s*\d|刷\s*pb|高强度|间歇跑|骑行|游泳/.test(text)) {
    return { intent: 'blocked', reply: '目前可生成首次 5 公里和规律跑步的四周轻松训练。你更想尝试哪个目标？' };
  }
  if (/(?:当前|我的|现有|执行中).{0,6}(?:计划|课表)/.test(text) && !/生成|制定|新建|做一|安排一/.test(text)) {
    return { intent: 'active_plan', tools: ['get_active_plan'] };
  }
  if (/(?:周|星期)[^！。；;，,]{0,18}(?:没空|没时间|不能(?:跑|练|训练)|不方便|不行)|(?:排除|避开|除(?:了)?)[^！。；;，,]{0,8}(?:周|星期)/.test(text)) {
    return { intent: 'blocked', reply: '请直接告诉我哪几天可以训练。我会按你选的 2–4 天安排。' };
  }
  const goalType = /(?:(?<!\d)5\s*(?:公里|千米|k(?:m)?\b)|五公里|首次.{0,8}五千米)/i.test(text)
    ? 'first_5k'
    : /规律.{0,5}跑|跑步.{0,4}习惯|(?:四|4)\s*周.{0,12}跑|跑.{0,8}(?:训练计划|课表|计划)/.test(text)
      ? 'regular_running' : null;
  const rawFrequency = text.match(/每(?:周|星期)\s*(?:跑步|训练|跑)?\s*(\d{1,2}|[一二两三四五六七八九十])\s*(?:次|天)/)?.[1];
  const frequency = rawFrequency == null ? null : (frequencyByText[rawFrequency] ?? Number(rawFrequency));
  const relative = text.match(/(本周|这周|下周|下星期)\s*([一二三四五六日天1-7])\s*(?:开始|起步|起跑)/);
  const relativeStart = relative && {
    nextWeek: relative[1].startsWith('下'),
    weekday: weekdaysByText[relative[2]] ?? Number(relative[2])
  };
  const weekdays = parseWeekdays(relative ? text.replace(relative[0], '') : text);
  const startDate = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  return goalType
    ? { intent: 'plan', goalType, weekdays, frequency, startDate, relativeStart, tools: trainingTools }
    : { intent: 'clarify', reply: '你想在四周内准备首次 5 公里，还是建立规律跑步习惯？也可以一起告诉我每周哪几天有空。' };
}

function validateModelIntent(data, local) {
  if (!data || typeof data !== 'object') return null;
  if (data.intent === 'clarify') return local.intent === 'clarify' ? local : null;
  if (data.intent === 'active_plan' && local.intent !== 'plan') {
    return { intent: 'active_plan', tools: ['get_active_plan'] };
  }
  if (data.intent !== 'plan' || !Object.hasOwn(goalNames, data.goalType) ||
      !Array.isArray(data.weekdays) || data.weekdays.length > 7 ||
      data.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7) ||
      (data.frequency !== null && (!Number.isInteger(data.frequency) || data.frequency < 1 || data.frequency > 7)) ||
      !Array.isArray(data.tools) || data.tools.length !== 2 ||
      new Set(data.tools).size !== 2 || data.tools.some(tool => !trainingTools.includes(tool))) return null;
  return {
    intent: 'plan',
    goalType: local.goalType ?? data.goalType,
    weekdays: local.weekdays?.length ? local.weekdays : [...new Set(data.weekdays)].sort(),
    frequency: local.frequency ?? data.frequency,
    startDate: local.startDate,
    relativeStart: local.relativeStart,
    tools: data.tools
  };
}

function weekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

function checkConstraints(intent, today) {
  const frequency = intent.frequency ?? (intent.weekdays.length || 2);
  if (frequency < 2 || frequency > 4 || (intent.weekdays.length && intent.weekdays.length < frequency)) {
    return { reply: '请选择每周 2–4 个训练日，并让训练次数不超过可用天数。比如每周二、四、日练三次。' };
  }
  const nextMonday = addDays(today, (8 - weekday(today)) % 7);
  let startDate = nextMonday;
  if (intent.startDate) {
    try {
      startDate = parseDate(intent.startDate, 'startDate');
      if (startDate < today || startDate > '9999-01-01') throw new Error('out of range');
    } catch {
      return { reply: '请提供从今天起的有效开始日期，格式为 YYYY-MM-DD。' };
    }
  } else if (intent.relativeStart) {
    const { nextWeek, weekday: startWeekday } = intent.relativeStart;
    startDate = addDays(today, (nextWeek ? 7 : 0) + startWeekday - weekday(today));
    if (startDate < today) return { reply: '这个开始日已经过去，请选今天或之后的日期。' };
  }
  const days = preference.filter(day => !intent.weekdays.length || intent.weekdays.includes(day)).slice(0, frequency).sort();
  const assumptions = [
    ...(!intent.weekdays.length ? ['未指定可训练日，已选间隔较均衡的日期。'] : []),
    ...(!intent.startDate && !intent.relativeStart ? ['未指定开始日，按最近一个不早于今天的周一开始。'] : [])
  ];
  return { frequency, days, startDate, assumptions };
}

function buildPlan(intent, constraints, context) {
  const [recent, month] = context.windows;
  const historyMins = Math.max(recent.running.durationS || 0, (month.running.durationS || 0) / 4) / 60;
  const hasHistory = month.running.activityCount > 0 && historyMins > 0;
  const hasRecovery = recent.recovery.sleepScore.samples > 0 || recent.recovery.hrv.samples > 0;
  const startingMinutes = hasHistory ? Math.min(20, Math.floor(historyMins / constraints.frequency)) : 15;
  const base = Math.max(1, startingMinutes);
  const step = hasHistory && hasRecovery ? Math.floor(base / 10) : 0;
  const weeks = ['适应', '保持', '建立', '巩固'].map((phase, weekIndex) => ({
    phase,
    days: Array.from({ length: 7 }, (_, index) => {
      const date = addDays(constraints.startDate, weekIndex * 7 + index);
      const day = weekday(date);
      if (!constraints.days.includes(day)) return { date };
      const followsTraining = constraints.days.includes(day === 1 ? 7 : day - 1);
      const minutes = base + (weekIndex >= 2 ? step : 0);
      if (followsTraining) {
        return {
          date, type: 'recovery', title: '走跑恢复',
          durationS: Math.max(1, Math.floor(minutes / 2)) * 60,
          subtitle: '与上一训练日相邻，缩短时长并以步行为主。'
        };
      }
      return {
        date, type: 'easy', title: intent.goalType === 'first_5k' || !hasHistory ? '轻松跑走' : '轻松跑',
        durationS: minutes * 60, subtitle: '保持可轻松交谈的强度，按状态切换步行。'
      };
    })
  }));
  const plan = {
    name: `${goalNames[intent.goalType]} · 四周训练`, type: 'running', goalType: intent.goalType,
    goal: intent.goalType === 'first_5k' ? '以轻松跑走建立习惯，为首次完成 5 公里做准备。' : '建立固定的低强度跑步习惯。',
    startDate: constraints.startDate, weeks
  };
  readPlan(plan);
  return { plan, hasHistory, hasRecovery };
}

function evidence(context, { hasHistory, hasRecovery }, assumptions) {
  const month = context.windows[1];
  const missing = [
    ...(!month.running.activityCount ? ['近 28 天跑步记录'] : []),
    ...(!month.running.durationS ? ['有效训练时长'] : []),
    ...(!month.running.coverage.pace ? ['有效配速'] : []),
    ...(!month.running.coverage.load ? ['训练负荷'] : []),
    ...(!month.recovery.sleepScore.samples ? ['睡眠评分'] : []),
    ...(!month.recovery.hrv.samples ? ['HRV'] : [])
  ];
  return {
    asOf: context.asOf, ruleVersion: RULE_VERSION, missing,
    mode: hasHistory ? '按近期训练量安排' : '缺少历史数据的基础模板',
    assumptions: [
      ...assumptions,
      ...(hasHistory ? ['以近 7 天跑步时长和近 28 天周均时长估算每次起步时长。'] : []),
      ...(hasRecovery ? [] : ['近 7 天缺少睡眠评分或 HRV 依据，保持训练量。'])
    ],
    windows: context.windows.map(({ days, startDate, endDate, running, recovery }) => ({
      days, startDate, endDate, runs: running.activityCount, latestRun: running.latestDate,
      distanceM: running.distanceM, durationS: running.durationS, load: running.trainingLoad, sleepSamples: recovery.sleepScore.samples,
      hrvSamples: recovery.hrv.samples,
      demo: Boolean(running.demoActivities || Object.values(recovery).some(metric => metric.demoSamples))
    }))
  };
}

module.exports = { interpretWithRules, validateModelIntent, checkConstraints, buildPlan, evidence, localToday };
