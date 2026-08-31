// Pure domain logic: streak and completion-rate math. No I/O.

import { HabitDefinition, WeekStartsOn, HabitStats, HabitLogValue } from './types';
import { classifyDay, weekBoundsFor } from './scheduleEvaluator';
import { meetsCompletion } from './completion';
import { addDaysLocal } from '../../../core/date';

export interface LoggedDaysLookup {
  /** The raw logged value for a date, or undefined if nothing was logged that day. Streak/completion math applies meetsCompletion() to this itself — callers should not pre-filter to a boolean. */
  getValue(date: string): HabitLogValue | undefined;
}

type PeriodResult = 'met' | 'not-met' | 'not-scheduled';
interface Period {
  date: string;
  result: PeriodResult;
}

const addDays = addDaysLocal;

function buildDailyPeriods(
  habit: HabitDefinition,
  log: LoggedDaysLookup,
  fromDate: string,
  toDate: string
): Period[] {
  const periods: Period[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    const done = meetsCompletion(habit, log.getValue(cursor));
    const status = classifyDay(habit, cursor, done);
    const result: PeriodResult =
      status === 'done' ? 'met' : status === 'missed' ? 'not-met' : 'not-scheduled';
    periods.push({ date: cursor, result });
    cursor = addDays(cursor, 1);
  }
  return periods;
}

function buildWeeklyQuotaPeriods(
  habit: HabitDefinition,
  log: LoggedDaysLookup,
  fromDate: string,
  toDate: string,
  weekStartsOn: WeekStartsOn
): Period[] {
  if (habit.schedule.mode !== 'weeklyQuota') {
    throw new Error('buildWeeklyQuotaPeriods called on a non-weeklyQuota habit');
  }
  const quota = habit.schedule.timesPerWeek;

  const periods: Period[] = [];
  const seenWeekStarts = new Set<string>();
  let cursor = fromDate;

  while (cursor <= toDate) {
    const [weekStart, weekEnd] = weekBoundsFor(cursor, weekStartsOn);

    if (!seenWeekStarts.has(weekStart)) {
      seenWeekStarts.add(weekStart);

      const clampedStart = weekStart < habit.createdAt ? habit.createdAt : weekStart;
      if (clampedStart <= weekEnd) {
        const clampedEnd = weekEnd > toDate ? toDate : weekEnd;

        let loggedCount = 0;
        let w = clampedStart;
        while (w <= clampedEnd) {
          if (meetsCompletion(habit, log.getValue(w))) loggedCount++;
          w = addDays(w, 1);
        }

        const weekFullyElapsed = weekEnd <= toDate;
        let result: PeriodResult;
        if (loggedCount >= quota) {
          result = 'met';
        } else if (weekFullyElapsed) {
          result = 'not-met';
        } else {
          result = 'not-scheduled';
        }

        periods.push({ date: weekStart, result });
      }
    }

    cursor = addDays(cursor, 1);
  }

  return periods;
}

function currentStreakFromPeriods(periods: Period[]): number {
  let streak = 0;
  for (let i = periods.length - 1; i >= 0; i--) {
    const r = periods[i].result;
    if (r === 'not-scheduled') continue;
    if (r === 'met') {
      streak++;
      continue;
    }
    break;
  }
  return streak;
}

function longestStreakFromPeriods(periods: Period[]): number {
  let longest = 0;
  let running = 0;
  for (const p of periods) {
    if (p.result === 'not-scheduled') continue;
    if (p.result === 'met') {
      running++;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }
  return longest;
}

function completionRateFromPeriods(periods: Period[]): number {
  const scheduled = periods.filter((p) => p.result !== 'not-scheduled');
  if (scheduled.length === 0) return 0;
  const met = scheduled.filter((p) => p.result === 'met').length;
  return met / scheduled.length;
}

export function calculateHabitStats(
  habit: HabitDefinition,
  log: LoggedDaysLookup,
  today: string,
  rangeStart: string,
  weekStartsOn: WeekStartsOn
): HabitStats {
  const floorDate =
    habit.commitmentStartDate && habit.commitmentStartDate > habit.createdAt
      ? habit.commitmentStartDate
      : habit.createdAt;

  const fullHistory =
    habit.schedule.mode === 'weeklyQuota'
      ? buildWeeklyQuotaPeriods(habit, log, floorDate, today, weekStartsOn)
      : buildDailyPeriods(habit, log, floorDate, today);

  const rangePeriods = fullHistory.filter((p) => p.date >= rangeStart);

  return {
    currentStreak: currentStreakFromPeriods(fullHistory),
    longestStreak: longestStreakFromPeriods(fullHistory),
    completionRate: completionRateFromPeriods(rangePeriods),
  };
}
