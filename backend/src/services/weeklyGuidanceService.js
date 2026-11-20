const contextService = require('./trainingContextService');
const planService = require('./trainingPlanService');
const { buildRevision } = require('./coachRevisionRules');
const { addDays, localToday, mondayOf } = require('./trainingPlanInput');

const ruleVersion = 'weekly-guidance-v1';
const reductionPercent = 15;

async function reviewWeek(userId, asOf = localToday()) {
  const weekStart = mondayOf(asOf);
  const nextWeekStart = addDays(weekStart, 7);
  const nextWeekEnd = addDays(nextWeekStart, 6);
  const [context, active] = await Promise.all([
    contextService.getContext(userId, asOf),
    planService.getActive(userId)
  ]);
  const plan = active ? await planService.get(userId, active.id) : null;
  const [recent, month] = context.windows;
  const { sleepScore, sleepDurationS, hrv } = recent.recovery;
  const guidance = {
    asOf, weekStart, nextWeekStart, nextWeekEnd, ruleVersion,
    execution: null,
    windows: context.windows.map(({ days, startDate, endDate, running }) => ({
      days, startDate, endDate,
      runs: Number(running.activityCount), durationS: running.durationS,
      distanceM: running.distanceM, demoRuns: Number(running.demoActivities ?? 0)
    })),
    recovery: { sleepScore, sleepDurationS, hrvSamples: hrv.samples }
  };
  const result = (kind, summary, reasons, revision = null) => ({
    guidance: { ...guidance, kind, summary, reasons, previewAvailable: Boolean(revision) },
    revision
  });

  if (plan?.status !== 'active' || plan.type !== 'running') {
    return result('needs_data', '先启用一份跑步计划。', ['有计划任务后，可以根据完成情况回顾下周安排。']);
  }

  const sessions = plan.weeks.flatMap(week => week.days).filter(session => session.id);
  const due = sessions.filter(session =>
    session.date >= weekStart && (session.date < asOf || (session.date === asOf && session.status !== 'pending'))
  );
  const completed = due.filter(session => session.status === 'completed').length;
  const skipped = due.filter(session => session.status === 'skipped').length;
  guidance.execution = { due: due.length, completed, skipped, outstanding: due.length - completed - skipped };

  if (await planService.hasAppliedWeeklyRevision(userId, plan.id, weekStart)) {
    return result('applied', '本周建议已写入训练计划。', ['可在训练计划的修订历史查看变更。']);
  }

  const nextSessions = sessions.filter(session =>
    session.date >= nextWeekStart && session.date <= nextWeekEnd && session.status === 'pending' && !session.execution
  );
  if (!nextSessions.length) {
    return result('needs_data', '下周没有待训练任务。', ['可先在训练计划中安排下周的跑步。']);
  }

  const shortSleep = sleepDurationS.samples >= 2 && sleepDurationS.average != null && sleepDurationS.average < 6 * 3600;
  const lowSleepScore = sleepScore.samples >= 2 && sleepScore.average != null && sleepScore.average < 60;
  const recoveryReasons = [];
  if (shortSleep) recoveryReasons.push('近 7 天有记录的日均睡眠少于 6 小时。');
  if (lowSleepScore) recoveryReasons.push('近 7 天有记录的平均睡眠评分低于 60。');

  if (recent.running.activityCount < 1 || month.running.activityCount < 3 || !(recent.running.durationS > 0)) {
    return result('needs_data', '先补充近期跑步记录，再决定下周训练量。', [
      '当前需要近 7 天有可用跑步时长，且近 28 天至少有 3 条跑步记录。',
      ...recoveryReasons
    ]);
  }

  if (!due.length && !recoveryReasons.length) {
    return result('needs_data', '等本周有已到期任务，再回顾训练完成情况。', [
      '当天仍待完成和之后的任务暂不计入完成情况。'
    ]);
  }

  const reasons = [...recoveryReasons];
  if (due.length >= 2 && completed < due.length) {
    reasons.unshift(`本周已到期的 ${due.length} 项任务中完成了 ${completed} 项，先给下周留出余量。`);
  }
  if (!reasons.length) {
    return result('maintain', '按原计划安排下周训练。', [
      due.length === completed
        ? '已有结果的本周任务均已完成，近期跑步量有记录。'
        : '目前只有 1 项到期且未完成的任务，可再观察后续执行情况。'
    ]);
  }

  for (const session of nextSessions) {
    const revision = buildRevision(plan, { kind: 'reduce', from: session.date, percent: reductionPercent }, asOf);
    if (!revision.reply) {
      revision.weeklyReviewWeek = weekStart;
      revision.reason = `${reasons.join('')}建议将 ${session.date} 的单次训练量减少约 ${reductionPercent}%。`;
      return result('reduce', `建议将下周一次训练的目标量减少约 ${reductionPercent}%。`, reasons, revision);
    }
  }
  return result('needs_data', '可先补齐下周待训练任务的距离或时长目标。', reasons);
}

async function getWeeklyGuidance(userId) {
  return (await reviewWeek(userId)).guidance;
}

module.exports = { getWeeklyGuidance, reviewWeek };
