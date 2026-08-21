import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HabitLogFile, HabitLogFileReadError } from '../habitLogFile';
import { FakeVaultAdapter } from './fakeVaultAdapter';

describe('HabitLogFile round-trip', () => {
  test('writes a day, reads it back', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter);

    await log.writeField('2026-08-19', 'a1b2c3', true);
    await log.writeField('2026-08-19', 'd4e5f6', 8000);

    const day = await log.readDay('2026-08-19');
    assert.equal(day.get('a1b2c3'), true);
    assert.equal(day.get('d4e5f6'), 8000);
  });

  test('editing one field does not disturb another field on the same day (REQ-H008)', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter);

    await log.writeField('2026-08-19', 'a1b2c3', true);
    await log.writeField('2026-08-19', 'd4e5f6', 8000);
    await log.writeField('2026-08-19', 'd4e5f6', 9500); // edit

    const day = await log.readDay('2026-08-19');
    assert.equal(day.get('a1b2c3'), true); // untouched
    assert.equal(day.get('d4e5f6'), 9500); // updated
  });

  test('a day with no entries produces no line in the file (clean for hand-editing)', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter);

    await log.writeField('2026-08-19', 'a1b2c3', true);
    const raw = await adapter.readFile('Life Tracker/Logs/Habits/habits-2026.md');
    assert.equal(raw, '- 2026-08-19 [habit-a1b2c3:: true]\n');
  });

  test('multiple days sort chronologically in the year file', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter);

    await log.writeField('2026-08-20', 'a1b2c3', true);
    await log.writeField('2026-08-19', 'a1b2c3', true);

    const raw = await adapter.readFile('Life Tracker/Logs/Habits/habits-2026.md');
    const lines = raw.trim().split('\n');
    assert.equal(lines[0].startsWith('- 2026-08-19'), true);
    assert.equal(lines[1].startsWith('- 2026-08-20'), true);
  });

  test('readRange spans multiple year files', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter);

    await log.writeField('2025-12-30', 'a1b2c3', true);
    await log.writeField('2026-01-02', 'a1b2c3', true);

    const range = await log.readRange('2025-12-25', '2026-01-05');
    assert.equal(range.size, 2);
    assert.ok(range.has('2025-12-30'));
    assert.ok(range.has('2026-01-02'));
  });

  test('hasAnyLogEntry finds an entry across year files, and correctly reports absence', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter);
    await log.writeField('2025-06-01', 'zzz999', true);

    assert.equal(await log.hasAnyLogEntry('zzz999'), true);
    assert.equal(await log.hasAnyLogEntry('nonexistent'), false);
  });

  test('respects a configurable log folder', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter, { logFolder: 'Custom/Path' });
    await log.writeField('2026-08-19', 'a1b2c3', true);
    assert.ok(await adapter.fileExists('Custom/Path/habits-2026.md'));
  });

  test('a corrupted/unreadable file surfaces a typed error rather than silently returning empty data', async () => {
    const brokenAdapter = new FakeVaultAdapter();
    brokenAdapter.fileExists = async () => true;
    brokenAdapter.readFile = async () => {
      throw new Error('simulated disk error');
    };
    const log = new HabitLogFile(brokenAdapter);
    await assert.rejects(() => log.readDay('2026-08-19'), HabitLogFileReadError);
  });

  test('numeric values round-trip as numbers, not strings', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter);
    await log.writeField('2026-08-19', 'water', 2500);
    const day = await log.readDay('2026-08-19');
    assert.equal(typeof day.get('water'), 'number');
    assert.equal(day.get('water'), 2500);
  });
});
