// The one shared local-date function set (REQ-C012). Every module's
// "what is today" and date-formatting logic must go through this file —
// never UTC-based parsing (`.toISOString()`), which previously caused
// day-rollover bugs for UTC+2/+3 users. See PROJECT_PRINCIPLES.md
// §Storage Model.

/** Formats a Date as a local YYYY-MM-DD string. */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses a YYYY-MM-DD string into a local Date at midnight. */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns today's local date as YYYY-MM-DD. Accepts an injectable clock
 * (defaulting to the real Date) so callers can test against a fixed
 * "today" without depending on wall-clock time.
 */
export function getTodayLocal(now: () => Date = () => new Date()): string {
  return toLocalDateString(now());
}

/** Adds `n` days to a YYYY-MM-DD local date string. */
export function addDaysLocal(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return toLocalDateString(d);
}

/**
 * Adds `n` months to a YYYY-MM-DD local date string, optionally pinning
 * the result to a specific day-of-month (used by Money Management's
 * recurring entries, REQ-M018's monthly/yearly frequency + day-of-month).
 * Relies on JS Date's own month-overflow rollover (e.g. month 13 becomes
 * January of the next year), so this also correctly implements "yearly"
 * as addMonthsLocal(date, 12, dayOfMonth).
 */
export function addMonthsLocal(dateStr: string, n: number, dayOfMonth?: number): string {
  const d = parseLocalDate(dateStr);
  const targetDay = dayOfMonth ?? d.getDate();
  const result = new Date(d.getFullYear(), d.getMonth() + n, targetDay);
  return toLocalDateString(result);
}
