const { addDays, localToday, readPlan } = require('./trainingPlanInput');
const { parseDate } = require('../http');

const RULE_VERSION = 'coach-starter-v1';
const goalNames = { first_5k: '首次 5 公里', regular_running: '规律跑步' };
const trainingTools = ['get_training_context', 'get_active_plan'];
const weekdaysByText = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
const weekdayToken = '[一二三四五六日天1-7]';
const preference = [2, 6, 4, 7, 3, 5, 1];
const frequencyByText = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const namedStartOffsets = { 今天: 0, 明天: 1, 后天: 2 };
const sessionCapPrefix = '(?:每次|单次)\\s*(?:跑步|训练)?\\s*(?:时长|时间)?\\s*';
const sessionCapQualifier = '(?:最多|最长|上限(?:是|为)?|至多|不超过|不能超过|只能|只有)';
const sessionDuration = '(\\d+(?:\\.\\d+)?\\s*(?:小时|分钟|分)|半小时|[一二两三四五六七八九十]{1,3}分钟)';
const sessionCapPattern = new RegExp(`${sessionCapPrefix}${sessionCapQualifier}?\\s*${sessionDuration}`);
const durationOnlyPattern = new RegExp(`^${sessionDuration}[。！!]?$`);
const explicitCapPattern = new RegExp(`${sessionCapPrefix}${sessionCapQualifier}`);
const looseSessionCapPattern = new RegExp(`(?:只有|只能|(?:总时长|总时间)[：:]?\\s*${sessionCapQualifier})(?:训练|跑步)?\\s*${sessionDuration}`);
const defaultScheduleChoice = { label: '按默认安排', message: '按默认安排' };
const cancelScheduleChoice = { label: '取消', message: '取消本次计划' };

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

function parseSessionMinutes(value) {
  if (value === '半小时') return 30;
  if (/^\d/.test(value)) return Number.parseFloat(value) * (value.endsWith('小时') ? 60 : 1);
  const parts = value.match(/^([一二两三四五六七八九]?)(十)([一二三四五六七八九]?)分钟$/);
  if (parts) return (frequencyByText[parts[1]] ?? 1) * 10 + (frequencyByText[parts[3]] ?? 0);
  return frequencyByText[value.slice(0, -2)];
}

function hasSessionTimeConstraint(question) {
  const text = question.normalize('NFKC');
  return sessionCapPattern.test(text) || explicitCapPattern.test(text) || looseSessionCapPattern.test(text);
}

function isDurationConstrainedPlan(question) {
  return hasSessionTimeConstraint(question) && /走跑|跑步|训练|课表|热身/.test(question) && /计划|方案|安排|(?:怎么|如何)(?:练|跑|走)/.test(question);
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
  if (/马拉松|全马|半马|(?:10|十)\s*(?:公里|km)|配速提升|提速|破\s*\d|刷\s*pb|高强度|间歇跑|骑行|游泳/.test(text)) {
    return { intent: 'blocked', reply: '目前可生成首次 5 公里和规律跑步的四周轻松训练。你更想尝试哪个目标？' };
  }
  if (/(?:当前|我的|现有|执行中).{0,6}(?:计划|课表)/.test(text) && !/生成|制定|新建|做一|安排一/.test(text)) {
    return { intent: 'active_plan', tools: ['get_active_plan'] };
  }
  if (/(?:周|星期)[^！。；;，,]{0,18}(?:没空|没时间|不能(?:跑|练|训练)|不方便|不行)|(?:排除|避开|除(?:了)?)[^！。；;，,]{0,8}(?:周|星期)/.test(text)) {
    return { intent: 'blocked', reply: '请直接告诉我哪几天可以训练。我会按你选的 2–4 天安排。' };
  }
  const explicitGoal = /(?:(?<!\d)5\s*(?:公里|千米|k(?:m)?\b)|五公里|首次.{0,8}五千米)/i.test(text)
    ? 'first_5k'
    : /规律.{0,5}跑|跑步.{0,4}习惯/.test(text)
      ? 'regular_running' : null;
  const runningPlan = /(?:四|4)\s*周.{0,12}跑|跑.{0,8}(?:训练计划|课表|计划)/.test(text) ||
    /(?:按|沿用)(?:我的|已保存的)?(?:训练)?偏好.{0,6}(?:生成|制定|安排).{0,6}(?:计划|课表)/.test(text);
  const goalType = explicitGoal ?? (runningPlan ? 'regular_running' : null);
  const rawFrequency = (text.match(/每(?:周|星期)\s*(?:跑步|训练|跑)?\s*(\d{1,2}|[一二两三四五六七八九十])\s*(?:次|天)/) ||
    text.match(/^(\d{1,2}|[一二两三四五六七八九十])\s*次[。！!]?$/))?.[1];
  const frequency = rawFrequency == null ? null : (frequencyByText[rawFrequency] ?? Number(rawFrequency));
  const relative = text.match(/(本周|这周|下周|下星期|周|星期)\s*([一二三四五六日天1-7])\s*(?:开始|起步|起跑)/);
  const named = text.match(/(?:(今天|明天|后天)\s*(?:开始|起步|起跑)|^(今天|明天|后天)[。！!]?$)/);
  const relativeStart = relative ? {
    nextWeek: relative[1].startsWith('下'),
    weekday: weekdaysByText[relative[2]] ?? Number(relative[2])
  } : named ? { offset: namedStartOffsets[named[1] ?? named[2]] } : null;
  const weekdays = parseWeekdays(relative ? text.replace(relative[0], '') : text);
  const startDate = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  const limit = (text.match(sessionCapPattern) || text.match(durationOnlyPattern) || text.match(looseSessionCapPattern))?.[1]?.replace(/\s/g, '');
  const maxSessionMinutes = limit ? parseSessionMinutes(limit) : null;
  if ((limit || explicitCapPattern.test(text)) && (!Number.isSafeInteger(maxSessionMinutes) || maxSessionMinutes <= 0)) {
    return { intent: 'blocked', reply: '请用分钟注明单次训练时长上限，例如「每次最多 10 分钟」。' };
  }
  return goalType
    ? { intent: 'plan', goalType, explicitGoal, weekdays, frequency, startDate, relativeStart, maxSessionMinutes, tools: trainingTools }
    : { intent: 'clarify', weekdays, frequency, startDate, relativeStart, maxSessionMinutes };
}

function withTrainingPreferences(intent, preferences) {
  const savedGoal = intent.explicitGoal ? null : preferences.goalType;
  const savedWeekdays = intent.weekdays.length ? [] : preferences.weekdays;
  const preferenceNotes = [];
  if (savedGoal) preferenceNotes.push(`沿用已保存的跑步目标「${goalNames[savedGoal]}」。`);
  if (savedWeekdays.length) preferenceNotes.push('沿用已保存的常用训练日。');
  return {
    ...intent,
    goalType: savedGoal ?? intent.goalType,
    explicitGoal: savedGoal ?? intent.explicitGoal,
    weekdays: savedWeekdays.length ? savedWeekdays : intent.weekdays,
    preferenceNotes
  };
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
    explicitGoal: local.explicitGoal ?? (local.intent === 'clarify' ? data.goalType : null),
    goalType: local.explicitGoal ?? data.goalType,
    weekdays: local.weekdays,
    frequency: local.frequency ?? data.frequency,
    startDate: local.startDate,
    relativeStart: local.relativeStart,
    maxSessionMinutes: local.maxSessionMinutes,
    tools: data.tools
  };
}

function weekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

function relativeStartDate(relative, today) {
  const offset = relative.offset ?? ((relative.nextWeek ? 7 : 0) + relative.weekday - weekday(today));
  return addDays(today, offset);
}

function planInputs(intent, today) {
  const { goalType = null, weekdays = [], frequency = null, maxSessionMinutes = null, startDate, relativeStart } = intent;
  return { goalType, weekdays, frequency, maxSessionMinutes, startDate: startDate || (relativeStart ? relativeStartDate(relativeStart, today) : null) };
}

function resumePlanIntent(current, previous, today) {
  const { weekdays, frequency, maxSessionMinutes, startDate } = planInputs(current, today);
  const goal = current.explicitGoal ?? previous.goalType;
  return {
    intent: goal ? 'plan' : 'clarify',
    goalType: goal,
    explicitGoal: goal,
    weekdays: weekdays.length ? weekdays : previous.weekdays,
    frequency: frequency ?? previous.frequency,
    maxSessionMinutes: maxSessionMinutes ?? previous.maxSessionMinutes,
    startDate: startDate ?? previous.startDate,
    tools: trainingTools
  };
}

function createClarification(intent, previous, today, now, constraints) {
  const attempt = (previous?.attempt ?? 0) + 1;
  if (attempt > 2) {
    return { content: '这次先暂停。准备好后，可以用一条消息告诉我跑步目标和每周可训练的 2–4 天。', cards: [] };
  }
  const inputs = planInputs(intent, today);
  inputs.goalType = intent.explicitGoal ?? null;
  const fields = [
    ...(!intent.explicitGoal ? ['goalType'] : []),
    ...(!inputs.weekdays.length ? ['weekdays'] : []),
    ...(constraints?.field === 'startDate' ? ['startDate'] : []),
    ...(constraints?.field === 'weekdays' && inputs.weekdays.length ? ['weekdays'] : [])
  ];
  const content = [
    constraints?.reply,
    fields.includes('goalType') && '你的目标是首次完成 5 公里，还是建立规律跑步习惯？',
    fields.includes('weekdays') && !constraints?.reply && '每周哪 2–4 天方便训练？',
    '也可以回复「按默认安排」或「取消本次计划」。'
  ].filter(Boolean).join('');
  const choices = [
    ...(fields.includes('goalType') ? Object.values(goalNames).map(name => ({ label: name, message: name })) : []),
    defaultScheduleChoice, cancelScheduleChoice
  ];
  const expiresAt = new Date(now + 30 * 60 * 1000).toISOString();
  return { content, cards: [{ type: 'clarification', fields, choices, expiresAt }], clarification: { inputs, attempt, expiresAt, field: constraints?.field } };
}

function planWithDefaults(pending) {
  const defaults = { ...pending.inputs };
  if (pending.field === 'weekdays') {
    defaults.frequency = null;
    defaults.weekdays = [];
  }
  if (pending.field === 'startDate') defaults.startDate = null;
  return { ...defaults, intent: 'plan', goalType: defaults.goalType ?? 'regular_running', tools: trainingTools };
}

function checkConstraints(intent, today) {
  const frequency = intent.frequency ?? (intent.weekdays.length || 2);
  if (frequency < 2 || frequency > 4 || (intent.weekdays.length && intent.weekdays.length < frequency)) {
    return { field: 'weekdays', reply: '请选择每周 2–4 个训练日，并让训练次数不超过可用天数。比如每周二、四、日练三次。' };
  }
  const nextMonday = addDays(today, (8 - weekday(today)) % 7);
  let startDate = nextMonday;
  if (intent.startDate) {
    try {
      startDate = parseDate(intent.startDate, 'startDate');
      if (startDate < today || startDate > '9999-01-01') throw new Error('out of range');
    } catch {
      return { field: 'startDate', reply: '请提供从今天起的有效开始日期，格式为 YYYY-MM-DD。' };
    }
  } else if (intent.relativeStart) {
    startDate = relativeStartDate(intent.relativeStart, today);
    if (startDate < today) return { field: 'startDate', reply: '这个开始日已经过去，请选今天或之后的日期。' };
  }
  const days = preference.filter(day => !intent.weekdays.length || intent.weekdays.includes(day)).slice(0, frequency).sort();
  const assumptions = [
    ...(intent.preferenceNotes ?? []),
    ...(!intent.weekdays.length ? ['未指定可训练日，已选间隔较均衡的日期。'] : []),
    ...(!intent.startDate && !intent.relativeStart ? ['未指定开始日，按最近一个不早于今天的周一开始。'] : [])
  ];
  if (intent.maxSessionMinutes) assumptions.push(`按本轮要求，每次训练不超过 ${intent.maxSessionMinutes} 分钟。`);
  return { frequency, days, startDate, assumptions, maxSessionMinutes: intent.maxSessionMinutes };
}

function buildPlan(intent, constraints, context) {
  const [recent, month] = context.windows;
  const historyMins = Math.max(recent.running.durationS || 0, (month.running.durationS || 0) / 4) / 60;
  const hasHistory = month.running.activityCount > 0 && historyMins > 0;
  const hasRecovery = recent.recovery.sleepScore.samples > 0 || recent.recovery.hrv.samples > 0;
  const startingMinutes = hasHistory ? Math.min(20, Math.floor(historyMins / constraints.frequency)) : 15;
  const minutes = Math.max(1, Math.min(startingMinutes, constraints.maxSessionMinutes ?? Infinity));
  const weeks = ['适应', '保持', '建立', '巩固'].map((phase, weekIndex) => ({
    phase,
    days: Array.from({ length: 7 }, (_, index) => {
      const date = addDays(constraints.startDate, weekIndex * 7 + index);
      const day = weekday(date);
      if (!constraints.days.includes(day)) return { date };
      const followsTraining = constraints.days.includes(day === 1 ? 7 : day - 1);
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

module.exports = {
  interpretWithRules, withTrainingPreferences, validateModelIntent, checkConstraints, buildPlan, evidence, localToday,
  resumePlanIntent, createClarification, planWithDefaults, isDurationConstrainedPlan
};
