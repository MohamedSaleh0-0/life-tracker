import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateHabitStats, LoggedDaysLookup } from '../streakCalculator';
import { HabitDefinition } from '../types';

function makeHabit(overrides: Partial<HabitDefinition> = {}): HabitDefinition {
  return {
    id: 'h1',
    type: 'boolean',
    name: 'Test habit',
    icon: '✅',
    color: '#000000',
    schedule: { mode: 'daily' },
    trendVisible: true,
    archived: false,
    createdAt: '2026-01-01',
    order: 0,
    ...overrides,
  };
}

function loggedOn(dates: string[]): LoggedDaysLookup {
  const set = new Set(dates);
  return { isLoggedOn: (d) => set.has(d) };
}

describe('calculateHabitStats — daily habits', () => {
  test('consecutive logged days build an increasing current streak', () => {
    const habit = makeHabit({ schedule: { mode: 'daily' }, createdAt: '2026-08-15' });
    const log = loggedOn(['2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19']);
    const stats = calculateHabitStats(habit, log, '2026-08-19', '2026-08-01', 'monday');
    assert.equal(stats.currentStreak, 5);
    assert.equal(stats.longestStreak, 5);
  });

  test('a missed day resets current streak to 0 but preserves longest streak', () => {
    const habit = makeHabit({ schedule: { mode: 'daily' }, createdAt: '2026-08-10' });
    // Logged 10,11,12 (streak of 3), missed 13, then nothing since.
    const log = loggedOn(['2026-08-10', '2026-08-11', '2026-08-12']);
    const stats = calculateHabitStats(habit, log, '2026-08-14', '2026-08-01', 'monday');
    assert.equal(stats.currentStreak, 0);
    assert.equal(stats.longestStreak, 3);
  });

  test('completion rate over a range: half the scheduled days logged', () => {
    const habit = makeHabit({ schedule: { mode: 'daily' }, createdAt: '2026-08-01' });
    const log = loggedOn(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04']);
    // Range 08-01..08-08 = 8 scheduled days, 4 logged => 0.5
    const stats = calculateHabitStats(habit, log, '2026-08-08', '2026-08-01', 'monday');
    assert.equal(stats.completionRate, 0.5);
  });
});

describe('calculateHabitStats — weekdays habits', () => {
  test('a not-scheduled day (weekend) does not break the streak', () => {
    // Mon-Fri only. 2026-08-17=Mon .. 2026-08-21=Fri, all logged.
    // 08-22/23 = Sat/Sun, not scheduled, not logged. 08-24=Mon, logged.
    const habit = makeHabit({
      schedule: { mode: 'weekdays', days: [0, 1, 2, 3, 4] }, // Mon-Fri
      createdAt: '2026-08-17',
    });
    const log = loggedOn([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-24',
    ]);
    const stats = calculateHabitStats(habit, log, '2026-08-24', '2026-08-01', 'monday');
    assert.equal(stats.currentStreak, 6); // weekend gap doesn't break it
  });

  test('a genuinely missed scheduled weekday does break the streak', () => {
    const habit = makeHabit({
      schedule: { mode: 'weekdays', days: [0, 1, 2, 3, 4] }, // Mon-Fri
      createdAt: '2026-08-17',
    });
    // Logged Mon, Tue; missed Wed; logged Thu.
    const log = loggedOn(['2026-08-17', '2026-08-18', '2026-08-20']);
    const stats = calculateHabitStats(habit, log, '2026-08-20', '2026-08-01', 'monday');
    assert.equal(stats.currentStreak, 1); // only Thursday counts
    assert.equal(stats.longestStreak, 2); // Mon+Tue
  });
});

describe('calculateHabitStats — weeklyQuota habits', () => {
  test('meeting quota within a week counts that week as met', () => {
    const habit = makeHabit({
      schedule: { mode: 'weeklyQuota', timesPerWeek: 3 },
      createdAt: '2026-08-03', // a Monday
    });
    // Week 1 (08-03..08-09): 3 logs -> met.
    const log = loggedOn(['2026-08-03', '2026-08-05', '2026-08-07']);
    // Evaluate as of the end of week 1.
    const stats = calculateHabitStats(habit, log, '2026-08-09', '2026-08-03', 'monday');
    assert.equal(stats.currentStreak, 1);
    assert.equal(stats.completionRate, 1);
  });

  test('missing quota in a fully-elapsed week resets the week-streak', () => {
    const habit = makeHabit({
      schedule: { mode: 'weeklyQuota', timesPerWeek: 3 },
      createdAt: '2026-08-03', // Monday
    });
    // Week 1 (08-03..08-09): met (3 logs). Week 2 (08-10..08-16): only 1 log -> not met.
    const log = loggedOn(['2026-08-03', '2026-08-05', '2026-08-07', '2026-08-11']);
    const stats = calculateHabitStats(habit, log, '2026-08-16', '2026-08-03', 'monday');
    assert.equal(stats.currentStreak, 0);
    assert.equal(stats.longestStreak, 1);
  });

  test('an in-progress current week is never prematurely treated as missed', () => {
    const habit = makeHabit({
      schedule: { mode: 'weeklyQuota', timesPerWeek: 3 },
      createdAt: '2026-08-03', // Monday
    });
    // Week 1 fully elapsed and met. We're now mid-way through week 2
    // (08-10..08-16) with only 1 log so far, evaluated on 08-12 (Wed) —
    // the week isn't over yet, so it must not reset the streak.
    const log = loggedOn(['2026-08-03', '2026-08-05', '2026-08-07', '2026-08-11']);
    const stats = calculateHabitStats(habit, log, '2026-08-12', '2026-08-03', 'monday');
    assert.equal(stats.currentStreak, 1); // week 1 still counts; week 2 undecided
  });
});
