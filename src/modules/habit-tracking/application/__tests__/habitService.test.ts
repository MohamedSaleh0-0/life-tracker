import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HabitService, DeleteRequiresConfirmationError } from '../habitService';
import { HabitSettingsStore } from '../../infrastructure/habitSettingsStore';
import { HabitLogFile } from '../../infrastructure/habitLogFile';
import { FakeSettingsAdapter } from '../../infrastructure/__tests__/fakeSettingsAdapter';
import { FakeVaultAdapter } from '../../infrastructure/__tests__/fakeVaultAdapter';

function makeService(fixedToday = '2026-08-19') {
  const settingsStore = new HabitSettingsStore(new FakeSettingsAdapter());
  const logFile = new HabitLogFile(new FakeVaultAdapter());
  let idCounter = 0;
  const service = new HabitService({
    settingsStore,
    logFile,
    idGenerator: () => `id${++idCounter}`,
    clock: () => new Date(`${fixedToday}T12:00:00`),
  });
  return { service, settingsStore, logFile };
}

describe('HabitService.createHabit', () => {
  test('generates an id, sets createdAt to today, sensible defaults', async () => {
    const { service } = makeService('2026-08-19');
    const habit = await service.createHabit({
      type: 'boolean',
      name: 'Meditate',
      icon: '🧘',
      color: '#000',
      schedule: { mode: 'daily' },
    });
    assert.equal(habit.id, 'id1');
    assert.equal(habit.createdAt, '2026-08-19');
    assert.equal(habit.trendVisible, true);
    assert.equal(habit.archived, false);
  });

  test('order increments across successive creations', async () => {
    const { service } = makeService();
    const a = await service.createHabit({
      type: 'boolean',
      name: 'A',
      icon: '✅',
      color: '#000',
      schedule: { mode: 'daily' },
    });
    const b = await service.createHabit({
      type: 'boolean',
      name: 'B',
      icon: '✅',
      color: '#000',
      schedule: { mode: 'daily' },
    });
    assert.equal(a.order, 0);
    assert.equal(b.order, 1);
  });
});

describe('HabitService daily check-in flow', () => {
  test('a scheduled, unlogged habit appears in pending; logging it moves it to completed', async () => {
    const { service } = makeService('2026-08-19');
    const habit = await service.createHabit({
      type: 'boolean',
      name: 'Meditate',
      icon: '🧘',
      color: '#000',
      schedule: { mode: 'daily' },
    });

    let pending = await service.getPendingForToday();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, habit.id);

    await service.editTodayLog(habit.id, true);

    pending = await service.getPendingForToday();
    assert.equal(pending.length, 0);

    const completed = await service.getCompletedForToday();
    assert.equal(completed.length, 1);
    assert.equal(completed[0].value, true);
  });

  test('editing today\'s value updates it without creating a duplicate entry', async () => {
    const { service } = makeService('2026-08-19');
    const habit = await service.createHabit({
      type: 'numeric',
      name: 'Steps',
      icon: '👟',
      color: '#000',
      schedule: { mode: 'daily' },
      target: { value: 8000, unit: 'steps' },
    });

    await service.editTodayLog(habit.id, 3000);
    await service.editTodayLog(habit.id, 8500);

    const completed = await service.getCompletedForToday();
    assert.equal(completed.length, 1);
    assert.equal(completed[0].value, 8500);
  });

  test('logging a numeric value below target still counts as done (resolved Edge Case)', async () => {
    const { service } = makeService('2026-08-19');
    const habit = await service.createHabit({
      type: 'numeric',
      name: 'Steps',
      icon: '👟',
      color: '#000',
      schedule: { mode: 'daily' },
      target: { value: 8000, unit: 'steps' },
    });

    await service.editTodayLog(habit.id, 1000);
    const completed = await service.getCompletedForToday();
    assert.equal(completed.length, 1);
  });

  test('an archived habit never appears in pending or completed', async () => {
    const { service } = makeService('2026-08-19');
    const habit = await service.createHabit({
      type: 'boolean',
      name: 'Old habit',
      icon: '📦',
      color: '#000',
      schedule: { mode: 'daily' },
    });
    await service.archiveHabit(habit.id);

    assert.deepEqual(await service.getPendingForToday(), []);
    assert.deepEqual(await service.getCompletedForToday(), []);
  });
});

describe('HabitService.deleteHabit', () => {
  test('deletes immediately when there is no history', async () => {
    const { service, settingsStore } = makeService();
    const habit = await service.createHabit({
      type: 'boolean',
      name: 'Fresh habit',
      icon: '🌱',
      color: '#000',
      schedule: { mode: 'daily' },
    });
    await service.deleteHabit(habit.id);
    assert.equal(await settingsStore.get(habit.id), undefined);
  });

  test('throws DeleteRequiresConfirmationError when history exists and not confirmed', async () => {
    const { service } = makeService('2026-08-19');
    const habit = await service.createHabit({
      type: 'boolean',
      name: 'Habit with history',
      icon: '📈',
      color: '#000',
      schedule: { mode: 'daily' },
    });
    await service.editTodayLog(habit.id, true);

    await assert.rejects(
      () => service.deleteHabit(habit.id),
      DeleteRequiresConfirmationError
    );
  });

  test('deletes when confirmed: true, even with history, and does not throw', async () => {
    const { service, settingsStore } = makeService('2026-08-19');
    const habit = await service.createHabit({
      type: 'boolean',
      name: 'Habit with history',
      icon: '📈',
      color: '#000',
      schedule: { mode: 'daily' },
    });
    await service.editTodayLog(habit.id, true);

    await service.deleteHabit(habit.id, true);
    assert.equal(await settingsStore.get(habit.id), undefined);
  });
});

describe('HabitService.getHabitHistory', () => {
  test('reflects streak/completion-rate math from the domain layer end-to-end', async () => {
    const { service: pastService, settingsStore, logFile } = makeService('2026-08-17');
    const habit = await pastService.createHabit({
      type: 'boolean',
      name: 'Streak test',
      icon: '🔥',
      color: '#000',
      schedule: { mode: 'daily' },
    });

    const todayService = new HabitService({
      settingsStore,
      logFile,
      idGenerator: () => 'unused',
      clock: () => new Date('2026-08-19T12:00:00'),
    });

    await todayService.logHabit(habit.id, '2026-08-17', true);
    await todayService.logHabit(habit.id, '2026-08-18', true);
    await todayService.logHabit(habit.id, '2026-08-19', true);

    const stats = await todayService.getHabitHistory(habit.id, '2026-08-01', 'monday');
    assert.equal(stats.currentStreak, 3);
    assert.equal(stats.longestStreak, 3);
  });

  test('throws for an unknown habit id', async () => {
    const { service } = makeService();
    await assert.rejects(() => service.getHabitHistory('nope', '2026-08-01', 'monday'));
  });

  test('returns a day-by-day classification array covering the requested range, for the heatmap', async () => {
    const { service: pastService, settingsStore, logFile } = makeService('2026-08-15');
    const habit = await pastService.createHabit({
      type: 'boolean',
      name: 'Heatmap test',
      icon: '🗓️',
      color: '#000',
      schedule: { mode: 'daily' },
    });

    const todayService = new HabitService({
      settingsStore,
      logFile,
      idGenerator: () => 'unused',
      clock: () => new Date('2026-08-17T12:00:00'),
    });
    await todayService.logHabit(habit.id, '2026-08-15', true);
    await todayService.logHabit(habit.id, '2026-08-17', true);

    const result = await todayService.getHabitHistory(habit.id, '2026-08-15', 'monday');
    const byDate = new Map(result.days.map((d) => [d.date, d.status]));
    assert.equal(byDate.get('2026-08-15'), 'done');
    assert.equal(byDate.get('2026-08-16'), 'missed');
    assert.equal(byDate.get('2026-08-17'), 'done');
  });
});
