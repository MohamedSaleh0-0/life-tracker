import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DataPointService,
  DeleteRequiresConfirmationError,
  InvalidEntryValueError,
} from '../dataPointService';
import { DataPointSettingsStore } from '../../infrastructure/dataPointSettingsStore';
import { DataPointLogFile } from '../../infrastructure/dataPointLogFile';
import { FakeSettingsAdapter } from '../../../../core/ports/__tests__/fakeSettingsAdapter';
import { FakeVaultAdapter } from '../../../../core/ports/__tests__/fakeVaultAdapter';

function makeService(fixedToday = '2026-08-19') {
  const settingsStore = new DataPointSettingsStore(new FakeSettingsAdapter());
  const logFile = new DataPointLogFile(new FakeVaultAdapter());
  let idCounter = 0;
  const service = new DataPointService({
    settingsStore,
    logFile,
    idGenerator: () => `id${++idCounter}`,
    clock: () => new Date(`${fixedToday}T12:00:00`),
  });
  return { service, settingsStore, logFile };
}

describe('DataPointService.createDataPoint', () => {
  test('generates an id, sets createdAt to today, sensible defaults', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Weight', type: 'number', unit: 'kg' });
    assert.equal(dp.id, 'id1');
    assert.equal(dp.createdAt, '2026-08-19');
    assert.equal(dp.archived, false);
  });
});

describe('DataPointService entry logging', () => {
  test('logs multiple entries for the same data point on the same day, each its own timestamped entry (REQ-D005)', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Water', type: 'number', unit: 'ml' });

    await service.logEntry(dp.id, '2026-08-19', '08:00', '250');
    await service.logEntry(dp.id, '2026-08-19', '14:00', '300');

    const today = await service.getEntriesForToday();
    const entries = today.get(dp.id) ?? [];
    assert.equal(entries.length, 2);
    assert.deepEqual(
      entries.map((e) => e.value),
      [250, 300]
    );
  });

  test('rejects a non-numeric value for a number data point (REQ-D009)', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Weight', type: 'number' });
    await assert.rejects(() => service.logEntry(dp.id, '2026-08-19', '08:00', 'abc'), InvalidEntryValueError);
  });

  test('rejects a malformed time value for a time-of-day data point', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Wake up', type: 'time' });
    await assert.rejects(
      () => service.logEntry(dp.id, '2026-08-19', '08:00', 'early'),
      InvalidEntryValueError
    );
  });

  test('accepts any non-empty text for a text data point', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Mood note', type: 'text' });
    const entry = await service.logEntry(dp.id, '2026-08-19', '08:00', 'Felt great');
    assert.equal(entry.value, 'Felt great');
  });

  test('editEntry updates only that entry, leaving siblings untouched (REQ-D008)', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Water', type: 'number', unit: 'ml' });

    const e1 = await service.logEntry(dp.id, '2026-08-19', '08:00', '250');
    const e2 = await service.logEntry(dp.id, '2026-08-19', '14:00', '300');
    await service.editEntry(e2.id, dp.id, '2026-08-19', '14:00', '350');

    const today = await service.getEntriesForToday();
    const entries = today.get(dp.id) ?? [];
    const editedE2 = entries.find((e) => e.id === e2.id);
    const untouchedE1 = entries.find((e) => e.id === e1.id);
    assert.equal(editedE2?.value, 350);
    assert.equal(untouchedE1?.value, 250);
  });

  test('deleteEntry removes only that entry (REQ-D012)', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Water', type: 'number' });
    const e1 = await service.logEntry(dp.id, '2026-08-19', '08:00', '250');
    const e2 = await service.logEntry(dp.id, '2026-08-19', '14:00', '300');

    await service.deleteEntry('2026-08-19', e1.id);

    const today = await service.getEntriesForToday();
    const entries = today.get(dp.id) ?? [];
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, e2.id);
  });

  test('an archived data point never appears in getEntriesForToday', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Old metric', type: 'number' });
    await service.logEntry(dp.id, '2026-08-19', '08:00', '5');
    await service.archiveDataPoint(dp.id);

    const today = await service.getEntriesForToday();
    assert.equal(today.has(dp.id), false);
  });
});

describe('DataPointService.deleteDataPoint', () => {
  test('deletes immediately when there is no history', async () => {
    const { service, settingsStore } = makeService();
    const dp = await service.createDataPoint({ name: 'Fresh metric', type: 'number' });
    await service.deleteDataPoint(dp.id);
    assert.equal(await settingsStore.get(dp.id), undefined);
  });

  test('throws DeleteRequiresConfirmationError when history exists and not confirmed', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Weight', type: 'number' });
    await service.logEntry(dp.id, '2026-08-19', '08:00', '70');

    await assert.rejects(() => service.deleteDataPoint(dp.id), DeleteRequiresConfirmationError);
  });

  test('deletes when confirmed: true, even with history', async () => {
    const { service, settingsStore } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Weight', type: 'number' });
    await service.logEntry(dp.id, '2026-08-19', '08:00', '70');

    await service.deleteDataPoint(dp.id, true);
    assert.equal(await settingsStore.get(dp.id), undefined);
  });
});

describe('DataPointService.getTrend', () => {
  test('returns one point per entry, applying the data point unit to labels', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Weight', type: 'number', unit: 'kg' });
    await service.logEntry(dp.id, '2026-08-17', '08:00', '70');
    await service.logEntry(dp.id, '2026-08-18', '08:00', '71');
    await service.logEntry(dp.id, '2026-08-19', '08:00', '69.5');

    const trend = await service.getTrend(dp.id, '2026-08-01', '2026-08-19');
    assert.equal(trend.length, 3);
    assert.equal(trend[0].label, '70 kg');
  });

  test('only includes entries for the requested data point, not others', async () => {
    const { service } = makeService('2026-08-19');
    const weight = await service.createDataPoint({ name: 'Weight', type: 'number' });
    const sleep = await service.createDataPoint({ name: 'Sleep', type: 'number' });
    await service.logEntry(weight.id, '2026-08-19', '08:00', '70');
    await service.logEntry(sleep.id, '2026-08-19', '23:00', '7.5');

    const trend = await service.getTrend(weight.id, '2026-08-01', '2026-08-19');
    assert.equal(trend.length, 1);
    assert.equal(trend[0].label, '70');
  });
});
