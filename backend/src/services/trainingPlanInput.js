const { ApiError } = require('../errors');
const { parseDate } = require('../http');

const sports = ['running', 'cycling', 'swimming'];
const goalTypes = ['custom', 'first_5k', 'regular_running'];
const sessionTypes = ['easy', 'aerobic', 'recovery', 'other'];
const sessionStatuses = ['pending', 'completed', 'skipped'];
const weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function invalid(message) {
  return new ApiError(400, message, 'INVALID_TRAINING_PLAN');
}

function text(value, name, max, required = false) {
  if (value == null) value = '';
  if (typeof value !== 'string') throw invalid(`${name} must be text`);
  const result = value.trim();
  if (result.length > max || (required && !result)) throw invalid(`Invalid ${name}`);
  return result;
}

function choice(value, values, name) {
  if (!values.includes(value)) throw invalid(`Invalid ${name}`);
  return value;
}

function integer(value, name, max) {
  if (!Number.isInteger(value) || value < 1 || value > max) throw invalid(`Invalid ${name}`);
  return value;
}

function addDays(date, count) {
  const day = new Date(`${date}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + count);
  return day.toISOString().slice(0, 10);
}

function localToday() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts().reduce((all, { type, value }) => ({ ...all, [type]: value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function readPlan(body = {}, { allowScheduleVariations = false } = {}) {
  if (!body || typeof body !== 'object') throw invalid('Plan body is required');
  const name = text(body.name, 'name', 120, true);
  const type = choice(body.type, sports, 'sport');
  const goalType = choice(body.goalType ?? 'custom', goalTypes, 'goalType');
  const goal = text(body.goal, 'goal', 500);
  const startDate = parseDate(body.startDate, 'startDate');
  const { weeks } = body;
  if (!startDate || startDate < '2000-01-01' || startDate > '9999-01-01') throw invalid('Invalid startDate');
  if (!Array.isArray(weeks) || weeks.length < 1 || weeks.length > 24) {
    throw invalid('weeks must contain 1 to 24 weeks');
  }
  if (goalType !== 'custom' && (type !== 'running' || weeks.length !== 4)) {
    throw invalid('Running goals require a four-week running plan');
  }
  const sessions = [];
  const phases = weeks.map((week, weekIndex) => {
    if (!Array.isArray(week?.days) || week.days.length !== 7) throw invalid('Each week must contain seven days');
    week.days.forEach((day, dayIndex) => {
      if (!day || typeof day !== 'object') throw invalid('Invalid training day');
      const title = text(day.title, 'title', 160);
      if (!title || title === '休息日') return;
      sessions.push({
        date: addDays(startDate, weekIndex * 7 + dayIndex),
        type: choice(day.type ?? 'other', sessionTypes, 'session type'),
        title,
        subtitle: text(day.subtitle, 'subtitle', 240),
        note: text(day.note, 'note', 500),
        distanceM: day.distanceM == null ? null : integer(day.distanceM, 'distanceM', 200000),
        durationS: day.durationS == null ? null : integer(day.durationS, 'durationS', 86400)
      });
    });
    return text(week.phase, 'phase', 80) || `第${weekIndex + 1}周`;
  });
  if (!sessions.length) throw invalid('At least one session is required');
  if (goalType !== 'custom') {
    const weekdays = weeks[0].days.map(day => Boolean(day.title?.trim() && day.title.trim() !== '休息日'));
    const slotIsTraining = day => Boolean(day.title?.trim() && day.title.trim() !== '休息日');
    if (weeks.some(week => {
      const count = week.days.filter(slotIsTraining).length;
      return count < 2 || count > 4 || (!allowScheduleVariations &&
        week.days.some((day, index) => weekdays[index] !== slotIsTraining(day)));
    })) {
      throw invalid('Choose the same 2 to 4 training days for each week');
    }
  }
  return { name, type, goalType, goal, startDate, phases, sessions };
}

function readVersion(value) {
  return integer(value, 'version', 4294967295);
}

module.exports = { addDays, localToday, readPlan, readVersion, sessionStatuses, choice, weekdayLabels };
