// Pure domain logic: is a habit scheduled on a given day, and what does
// that day's status classify as. No I/O.

import { HabitDefinition, WeekStartsOn, DayStatus } from './types';
import { toLocalDateString, parseLocalDate } from '../../../core/date';

export { toLocalDateString, parseLocalDate };

function internalWeekdayIndex(date: Date): number {
  const jsDay = date.getDay();
  return (jsDay + 6) % 7;
}

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
 * Maps a "week starts on" setting to its fixed internal weekday index
 * (Monday=0..Sunday=6). Exported so the UI's weekday-picker display
 * order can reuse the same lookup rather than duplicating the mapping.
 */
export function weekStartInternalIndex(weekStartsOn: WeekStartsOn): number {
  switch (weekStartsOn) {
    case 'monday':
      return 0;
    case 'saturday':
      return 5;
    case 'sunday':
      return 6;
  }
}

/**
 * Returns the [startDate, endDate] (inclusive, YYYY-MM-DD) of the week
 * containing `date`, per the weekStartsOn setting (REQ-C017). Generic
 * over any start day via weekStartInternalIndex — adding Saturday as a
 * third option required no change here beyond that lookup.
 */
export function weekBoundsFor(
  date: string,
  weekStartsOn: WeekStartsOn
): [string, string] {
  const dt = parseLocalDate(date);
  const idx = internalWeekdayIndex(dt);
  const startIdx = weekStartInternalIndex(weekStartsOn);

  const offsetToStart = (idx - startIdx + 7) % 7;
  const start = new Date(dt);
  start.setDate(dt.getDate() - offsetToStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return [toLocalDateString(start), toLocalDateString(end)];
}
