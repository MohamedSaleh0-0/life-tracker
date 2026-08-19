// Pure domain logic: streak and completion-rate math. No I/O.
// See design-habit-tracking.md §Architecture Overview (domain layer),
// REQ-H009-H011.

import { HabitDefinition, WeekStartsOn, HabitStats } from './types';
import { classifyDay, weekBoundsFor, parseLocalDate, toLocalDateString } from './scheduleEvaluator';

/** Callback-shaped lookup so streakCalculator stays decoupled from
 *  whatever data structure the infrastructure layer reads log files into. */
export interface LoggedDaysLookup {
  isLoggedOn(date: string): boolean;
}

type PeriodResult = 'met' | 'not-met' | 'not-scheduled';
interface Period {
  date: string; // for daily/weekdays: the day itself; for weeklyQuota: the week's start date
  result: PeriodResult;
}

function addDays(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return toLocalDateString(d);
}

/**
 * Builds one Period per calendar day for daily/weekdays-mode habits.
 * A 'not-scheduled' day never breaks a streak (REQ-H009) and never
 * enters the completion-rate denominator.
 */
function buildDailyPeriods(
  habit: HabitDefinition,
  log: LoggedDaysLookup,
  fromDate: string,
  toDate: string
): Period[] {
  const periods: Period[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    const status = classifyDay(habit, cursor, log.isLoggedOn(cursor));
    const result: PeriodResult =
      status === 'done' ? 'met' : status === 'missed' ? 'not-met' : 'not-scheduled';
    periods.push({ date: cursor, result });
    cursor = addDays(cursor, 1);
  }
  return periods;
}

/**
 * Builds one Period per calendar week for weeklyQuota-mode habits.
 * A week only counts as 'not-met' once it has fully elapsed relative to
 * `toDate` — an in-progress week is never prematurely treated as missed,
 * so checking your streak mid-week doesn't reset it just because you
 * haven't hit quota yet with days still remaining.
 */
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
          if (log.isLoggedOn(w)) loggedCount++;
          w = addDays(w, 1);
        }

        const weekFullyElapsed = weekEnd <= toDate;
        let result: PeriodResult;
        if (loggedCount >= quota) {
          result = 'met';
        } else if (weekFullyElapsed) {
          result = 'not-met';
        } else {
          // Quota not yet reached, but the week isn't over — don't
          // count it either way yet.
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
    break; // first 'not-met' walking backward ends the current streak
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

/**
 * Computes current streak, longest streak (both over the habit's full
 * history, per REQ-H009/H010), and completion rate over `rangeStart..today`
 * (per REQ-H011, a selectable range).
 */
export function calculateHabitStats(
  habit: HabitDefinition,
  log: LoggedDaysLookup,
  today: string,
  rangeStart: string,
  weekStartsOn: WeekStartsOn
): HabitStats {
  const fullHistory =
    habit.schedule.mode === 'weeklyQuota'
      ? buildWeeklyQuotaPeriods(habit, log, habit.createdAt, today, weekStartsOn)
      : buildDailyPeriods(habit, log, habit.createdAt, today);

  const rangePeriods = fullHistory.filter((p) => p.date >= rangeStart);

  return {
    currentStreak: currentStreakFromPeriods(fullHistory),
    longestStreak: longestStreakFromPeriods(fullHistory),
    completionRate: completionRateFromPeriods(rangePeriods),
  };
}
