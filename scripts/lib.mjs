// Shared helpers for the Strava widget data pipeline (scrape.mjs + aggregate.mjs).

export function isoWeekStart(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

export function isoWeekOf(date) {
  const monday = isoWeekStart(date);
  const target = new Date(monday.getTime());
  target.setUTCDate(target.getUTCDate() + 3); // Thursday of this ISO week decides the year
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstMonday = isoWeekStart(firstThursday);
  const week = 1 + Math.round((target - new Date(Date.UTC(firstMonday.getUTCFullYear(), firstMonday.getUTCMonth(), firstMonday.getUTCDate()))) / (7 * 86400000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function isoDateStr(date) {
  return date.toISOString().slice(0, 10);
}

export function parseKm(text) {
  if (!text) return null;
  const match = String(text).match(/[\d.,]+/);
  if (!match) return null;
  return parseFloat(match[0].replace(',', '.'));
}

export function parseMeters(text) {
  if (!text) return 0;
  const match = String(text).match(/[\d.,]+/);
  if (!match) return 0;
  return parseFloat(match[0].replace(',', '.'));
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// Strava's widget renders timestamps like "Monday, May 11, 2026" in fixed English.
// Parsed manually (instead of `new Date(string)`) so the result never shifts by a day
// depending on the machine's local timezone.
export function parseWidgetDate(text) {
  if (!text) return null;
  const match = String(text).match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!match) return null;
  const monthIndex = MONTHS.indexOf(match[1].toLowerCase());
  if (monthIndex === -1) return null;
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  return new Date(Date.UTC(year, monthIndex, day));
}

export function parseDurationToSeconds(text) {
  if (!text) return null;
  const parts = text.trim().split(':').map(Number);
  if (!parts.length || parts.some(Number.isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}
