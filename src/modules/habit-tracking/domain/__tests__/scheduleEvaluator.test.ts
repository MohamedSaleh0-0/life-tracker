import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isScheduledOn,
  classifyDay,
  weekBoundsFor,
  toLocalDateString,
  parseLocalDate,
} from '../scheduleEvaluator';
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

describe('isScheduledOn', () => {
  test('daily mode: scheduled every day from createdAt onward', () => {
    const habit = makeHabit({ schedule: { mode: 'daily' }, createdAt: '2026-01-01' });
    assert.equal(isScheduledOn(habit, '2026-01-01'), true);
    assert.equal(isScheduledOn(habit, '2026-06-15'), true);
    assert.equal(isScheduledOn(habit, '2025-12-31'), false); // before createdAt
  });

  test('weekdays mode: only scheduled on configured weekday indices', () => {
    // 2026-08-17 is a Monday. days: [0,2,4] = Mon, Wed, Fri.
    const habit = makeHabit({
      schedule: { mode: 'weekdays', days: [0, 2, 4] },
      createdAt: '2026-01-01',
    });
    assert.equal(isScheduledOn(habit, '2026-08-17'), true); // Monday
    assert.equal(isScheduledOn(habit, '2026-08-18'), false); // Tuesday
    assert.equal(isScheduledOn(habit, '2026-08-19'), true); // Wednesday
    assert.equal(isScheduledOn(habit, '2026-08-21'), true); // Friday
    assert.equal(isScheduledOn(habit, '2026-08-22'), false); // Saturday
    assert.equal(isScheduledOn(habit, '2026-08-23'), false); // Sunday
  });

  test('weekdays mode: weekday matching is invariant to weekStartsOn (not a parameter)', () => {
    // Internal weekday indices are fixed regardless of the global
    // "week starts on" display setting — isScheduledOn doesn't take
    // weekStartsOn as a parameter at all, by design.
    const habit = makeHabit({
      schedule: { mode: 'weekdays', days: [5, 6] }, // Sat, Sun
      createdAt: '2026-01-01',
    });
    assert.equal(isScheduledOn(habit, '2026-08-22'), true); // Saturday
    assert.equal(isScheduledOn(habit, '2026-08-23'), true); // Sunday
    assert.equal(isScheduledOn(habit, '2026-08-24'), false); // Monday
  });

  test('weeklyQuota mode: every day is eligible from createdAt onward', () => {
    const habit = makeHabit({
      schedule: { mode: 'weeklyQuota', timesPerWeek: 3 },
      createdAt: '2026-01-01',
    });
    for (const d of ['2026-08-17', '2026-08-18', '2026-08-23']) {
      assert.equal(isScheduledOn(habit, d), true);
    }
    assert.equal(isScheduledOn(habit, '2025-12-31'), false); // before createdAt
  });

  test('mid-week/mid-month creation: pre-creation dates excluded for all modes', () => {
    const daily = makeHabit({ schedule: { mode: 'daily' }, createdAt: '2026-08-10' });
    const weekdays = makeHabit({
      schedule: { mode: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] }, // every day
      createdAt: '2026-08-10',
    });
    const quota = makeHabit({
      schedule: { mode: 'weeklyQuota', timesPerWeek: 1 },
      createdAt: '2026-08-10',
    });
    for (const habit of [daily, weekdays, quota]) {
      assert.equal(isScheduledOn(habit, '2026-08-09'), false);
      assert.equal(isScheduledOn(habit, '2026-08-10'), true);
    }
  });
});

describe('classifyDay', () => {
  test('daily habit: done when logged, missed when scheduled but not logged', () => {
    const habit = makeHabit({ schedule: { mode: 'daily' }, createdAt: '2026-01-01' });
    assert.equal(classifyDay(habit, '2026-08-19', true), 'done');
    assert.equal(classifyDay(habit, '2026-08-19', false), 'missed');
    assert.equal(classifyDay(habit, '2025-12-31', false), 'not-scheduled');
  });

  test('weekdays habit: a non-scheduled day is not-scheduled, never missed', () => {
    const habit = makeHabit({
      schedule: { mode: 'weekdays', days: [0, 1, 2, 3, 4] }, // Mon-Fri
      createdAt: '2026-01-01',
    });
    assert.equal(classifyDay(habit, '2026-08-22', false), 'not-scheduled'); // Saturday
    assert.equal(classifyDay(habit, '2026-08-17', false), 'missed'); // Monday, not logged
    assert.equal(classifyDay(habit, '2026-08-17', true), 'done');
  });

  test('weeklyQuota habit: day-level status is only done or not-scheduled, never missed', () => {
    const habit = makeHabit({
      schedule: { mode: 'weeklyQuota', timesPerWeek: 3 },
      createdAt: '2026-01-01',
    });
    assert.equal(classifyDay(habit, '2026-08-19', true), 'done');
    assert.equal(classifyDay(habit, '2026-08-19', false), 'not-scheduled');
  });
});

describe('weekBoundsFor', () => {
  test('monday-start: 2026-08-19 (Wed) is in the Mon 08-17 .. Sun 08-23 week', () => {
    const [start, end] = weekBoundsFor('2026-08-19', 'monday');
    assert.equal(start, '2026-08-17');
    assert.equal(end, '2026-08-23');
  });

  test('sunday-start: 2026-08-19 (Wed) is in the Sun 08-16 .. Sat 08-22 week', () => {
    const [start, end] = weekBoundsFor('2026-08-19', 'sunday');
    assert.equal(start, '2026-08-16');
    assert.equal(end, '2026-08-22');
  });

  test('monday-start: a Sunday belongs to the week that started the prior Monday', () => {
    const [start, end] = weekBoundsFor('2026-08-23', 'monday'); // Sunday
    assert.equal(start, '2026-08-17');
    assert.equal(end, '2026-08-23');
  });

  test('sunday-start: a Sunday is the start of its own week', () => {
    const [start, end] = weekBoundsFor('2026-08-23', 'sunday'); // Sunday
    assert.equal(start, '2026-08-23');
    assert.equal(end, '2026-08-29');
  });
});

describe('toLocalDateString / parseLocalDate round-trip', () => {
  test('round-trips without UTC drift', () => {
    const original = '2026-01-01';
    const roundTripped = toLocalDateString(parseLocalDate(original));
    assert.equal(roundTripped, original);
  });
});
