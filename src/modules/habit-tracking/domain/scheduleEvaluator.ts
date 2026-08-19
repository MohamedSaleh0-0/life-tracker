// Pure domain logic: is a habit scheduled on a given day, and what does
// that day's status classify as. No I/O. See design-habit-tracking.md
// §Architecture Overview (domain layer) and §Error Handling Strategy.

import { HabitDefinition, WeekStartsOn, DayStatus } from './types';

/** Formats a Date as a local YYYY-MM-DD string (never UTC, per REQ-C012). */
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
 * Internal weekday index for a date, fixed Monday=0..Sunday=6.
 * This is independent of the user's "week starts on" setting — that
 * setting never affects how weekday indices are computed or stored,
 * only display order and week-boundary placement (see weekBoundsFor).
 */
function internalWeekdayIndex(date: Date): number {
  const jsDay = date.getDay(); // 0=Sunday..6=Saturday
  return (jsDay + 6) % 7; // 0=Monday..6=Sunday
}

/**
 * Returns true if `habit` is scheduled to be actioned on `date`.
 *
 * - daily: every day from habit.createdAt onward.
 * - weekdays: only the configured weekday indices, from createdAt onward.
 * - weeklyQuota: every day is eligible (no single day is individually
 *   "required" — the quota constraint is evaluated per week by
 *   streakCalculator, not per day here).
 *
 * A date before habit.createdAt is never scheduled, regardless of mode
 * (habit doc Edge Case: "a habit created mid-week or mid-month — days
 * before its creation date are not counted as missed").
 */
export function isScheduledOn(habit: HabitDefinition, date: string): boolean {
  if (date < habit.createdAt) return false;

  switch (habit.schedule.mode) {
    case 'daily':
      return true;
    case 'weekdays': {
      const idx = internalWeekdayIndex(parseLocalDate(date));
      return habit.schedule.days.includes(idx);
    }
    case 'weeklyQuota':
      return true;
  }
}

/**
 * Classifies a single day for heatmap/history display (REQ-H012).
 *
 * For weeklyQuota habits, no single day is individually required, so a
 * day's status is only ever 'done' or 'not-scheduled' at the day level —
 * whether a *week* met its quota is a week-level concept handled by
 * streakCalculator, not represented in this per-day classification.
 */
export function classifyDay(
  habit: HabitDefinition,
  date: string,
  isLogged: boolean
): DayStatus {
  if (!isScheduledOn(habit, date)) return 'not-scheduled';

  if (habit.schedule.mode === 'weeklyQuota') {
    return isLogged ? 'done' : 'not-scheduled';
  }

  return isLogged ? 'done' : 'missed';
}

/**
 * Returns the [startDate, endDate] (inclusive, YYYY-MM-DD) of the week
 * containing `date`, per the weekStartsOn setting (REQ-C017).
 */
export function weekBoundsFor(
  date: string,
  weekStartsOn: WeekStartsOn
): [string, string] {
  const dt = parseLocalDate(date);
  const idx = internalWeekdayIndex(dt); // 0=Mon..6=Sun

  const offsetToStart = weekStartsOn === 'monday' ? idx : (idx + 1) % 7;
  const start = new Date(dt);
  start.setDate(dt.getDate() - offsetToStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return [toLocalDateString(start), toLocalDateString(end)];
}
