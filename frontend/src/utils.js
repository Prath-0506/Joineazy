export const fmtDate = (d) =>
  new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// "Due in 2 days" / "Overdue by 3 hr", with a tone the UI maps to a colour.
export function dueInfo(due, done) {
  const ms = new Date(due) - Date.now();
  const abs = Math.abs(ms);
  const n = abs < 36e5 ? Math.max(1, Math.round(abs / 6e4)) : abs < 864e5 ? Math.round(abs / 36e5) : Math.round(abs / 864e5);
  const unit = abs < 36e5 ? 'min' : abs < 864e5 ? 'hr' : n === 1 ? 'day' : 'days';
  if (ms < 0) return { text: `Overdue by ${n} ${unit}`, tone: done ? 'muted' : 'late' };
  return { text: `Due in ${n} ${unit}`, tone: !done && ms < 2 * 864e5 ? 'soon' : 'muted' };
}

export const toneClass = { late: 'text-red-700', soon: 'text-amber-600', muted: 'text-ink/70' };

// ISO string -> value for <input type="datetime-local"> in the user's own timezone.
export function toLocalInput(iso) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// Each course gets a stable accent colour derived from its code.
const ACCENTS = ['#0f6b5c', '#2d5a8a', '#8a3b2e', '#7a5c12', '#5b3f8c', '#3d6b2a'];
export const accent = (code = '') => ACCENTS[[...code].reduce((s, c) => s + c.charCodeAt(0), 0) % ACCENTS.length];

// Which badge describes this assignment for a student? Mirrors what the API reports.
export function studentBadge(a) {
  if (a.status === 'acknowledged') return a.late ? 'late' : 'acknowledged';
  if (a.status === 'no_group') return 'no_group';
  if (new Date(a.dueDate) < Date.now()) return 'overdue';
  return a.submissionType === 'group' && !a.isLeader ? 'waiting' : 'pending';
}
