const TIME_ZONE = 'Asia/Kolkata';
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateInZone(at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(at).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function differenceDays(left, right) {
  return Math.round((Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86400000);
}

function scheduledFor(date, time) {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) throw new Error('INVALID_SCHEDULE');
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

function scheduledOn(task, date) {
  if (!DATE_RE.test(date) || date < task.start_date || (task.end_date && date > task.end_date)) return false;
  if (task.frequency_type === 'DAILY') return true;
  if (task.frequency_type === 'ONCE') return task.one_time_date === date;
  if (task.frequency_type === 'EVERY_N_DAYS') return differenceDays(date, task.start_date) % Number(task.interval_days) === 0;
  if (task.frequency_type === 'SELECTED_DAYS') {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return (Number(task.weekdays_mask) & (1 << weekday)) !== 0;
  }
  return false;
}

function derivedStatus(task, date, response, at = new Date()) {
  if (response) return response.status === 'SKIPPED' ? 'SKIPPED' : 'COMPLETED';
  const due = Date.parse(scheduledFor(date, task.scheduled_time));
  const open = due - Number(task.window_before_minutes || 0) * 60000;
  const close = due + Number(task.window_after_minutes || 0) * 60000;
  if (at.getTime() < open) return 'UPCOMING';
  if (at.getTime() <= close) return 'DUE';
  return 'MISSED';
}

module.exports = {
  TIME_ZONE,
  DATE_RE,
  TIME_RE,
  dateInZone,
  addDays,
  differenceDays,
  scheduledFor,
  scheduledOn,
  derivedStatus
};
