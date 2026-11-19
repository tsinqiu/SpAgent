const { parseDate } = require('../http');
const { addDays } = require('./trainingPlanInput');

const dayNumbers = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
const datePattern = /\d{4}-\d{2}-\d{2}|今天|明天|后天|(?:本|这|下)?(?:周|星期)[一二三四五六日天1-7]/g;

function dateFrom(token, today, anchor = today) {
  if (/^\d/.test(token)) {
    try { return parseDate(token, 'date'); } catch { return null; }
  }
  const offset = ['今天', '明天', '后天'].indexOf(token);
  if (offset >= 0) return addDays(today, offset);
  const relative = /^[本这下]/.test(token);
  const base = relative ? today : anchor;
  const weekday = new Date(`${base}T00:00:00Z`).getUTCDay() || 7;
  const target = dayNumbers[token.at(-1)] ?? Number(token.at(-1));
  return addDays(base, target - weekday + (token.startsWith('下') ? 7 : 0));
}

function revisionIntent(message, today) {
  const text = message.normalize('NFKC').trim();
  if (/疼|受伤|胸痛|晕厥|手术|(?:不想|不用|不需要|不要)\s*(?:再|帮我)?\s*(?:调整|修改|改|减少|挪|移|减量)/.test(text)) return null;
  const reduce = /减量|减少|缩短|少跑|轻一点|减轻|(?:降低|下调).{0,6}(?:负荷|训练量)|睡眠不足|没睡好|恢复差|太累|疲劳/.test(text);
  const adjustment = /调整|修改|调整一下|改到|改为|挪到|移到|提前到|推迟到|改期|换到/.test(text);
  if (!adjustment && !reduce) {
    return /复盘|执行情况|完成情况/.test(text) ? { kind: 'review' } : null;
  }
  if (/加量|增加|加大|提高.*强度|加速|间歇|高强度/.test(text)) {
    return { reply: '这次可以安全地提出改期或减少单次训练量。你想改哪一天，或减短下一次训练吗？' };
  }
  const tokens = [...text.matchAll(datePattern)].map(match => match[0]);
  const targetOnly = tokens.length === 1 && /(?:到|改为)\s*(?:\d{4}|[本这下]?(?:周|星期)|今天|明天|后天)/.test(text);
  const from = !targetOnly && tokens[0] ? dateFrom(tokens[0], today) : null;
  const targetToken = targetOnly ? tokens[0] : tokens[1];
  const to = targetToken ? dateFrom(targetToken, today, from || today) : null;
  if (tokens.length > 2 || (tokens[0] && !targetOnly && !from) || (targetToken && !to)) {
    return { reply: '请一次给出一个有效的原日期及目标日期，例如「把本周四的训练移到周五」。' };
  }
  if (reduce && to) return { reply: '请先选择改期或减量其中一项，我会展示对应的改动。' };
  if (reduce) {
    const rawPercent = text.match(/(\d+)\s*%/)?.[1];
    const percent = rawPercent ? Number(rawPercent) : 15;
    if (percent < 5 || percent > 30) return { reply: '单次减量请指定 5% 至 30%，如「下一次训练减少 20%」。' };
    return { kind: 'reduce', from, percent, recovery: /睡眠|疲劳|太累|恢复/.test(text) };
  }
  if (!from && !to && !/下一次|下次|考试|没空|冲突/.test(text)) {
    return { reply: '你想改哪一天的训练？例如「本周四有考试，把训练移到周五」或「下一次训练减量 20%」。' };
  }
  if (!from && !to && /考试|没空|冲突/.test(text)) {
    return { reply: '请告诉我发生冲突的训练日期，我会先找本训练周可用的日期。' };
  }
  return { kind: 'move', from, to, scheduleConflict: /考试|没空|冲突/.test(text) };
}

function buildRevision(plan, intent, today) {
  const weeks = plan.weeks;
  const available = weeks.flatMap(week => week.days).filter(session =>
    session.id && session.status === 'pending' && !session.execution && session.date >= today
  );
  const session = intent.from ? available.find(item => item.date === intent.from) : available[0];
  if (!session) return { reply: '该日期没有可调整的待训练任务。已完成、跳过或已关联的任务会保留。' };
  const before = {
    date: session.date, title: session.title, type: session.type,
    distanceM: session.distanceM ?? null, durationS: session.durationS ?? null
  };
  const after = { ...before };
  let reason;
  if (intent.kind === 'move') {
    const week = weeks.find(item => item.days.some(day => day.id === session.id));
    const free = week.days.filter(day => !day.id && day.date >= today).map(day => day.date);
    const to = intent.to || free.find(date => date > session.date) || free[0];
    if (!to || !free.includes(to)) {
      return { reply: '目标日期不在同一训练周的空闲日内。请选择本训练周另一个尚未过去的空闲日。' };
    }
    after.date = to;
    reason = intent.scheduleConflict ? '避开你说明的日程冲突，保留本次训练量。' : '按你的请求改期，保留本次训练量。';
  } else {
    const reduce = value => value === null ? null : Math.max(1, Math.round(value * (1 - intent.percent / 100)));
    after.durationS = reduce(before.durationS);
    after.distanceM = reduce(before.distanceM);
    if (after.durationS === before.durationS && after.distanceM === before.distanceM) {
      return { reply: '这项任务缺少可调整的距离或时长目标。可以先在训练计划中补齐目标。' };
    }
    reason = intent.recovery
      ? `根据你描述的恢复情况，减少这一次训练的目标量约 ${intent.percent}%。`
      : `根据你的请求，减少这一次训练的目标量约 ${intent.percent}%。`;
  }
  return { planId: plan.id, planName: plan.name, version: plan.version, sessionId: session.id,
    kind: intent.kind, before, after, reason };
}

module.exports = { revisionIntent, buildRevision };
