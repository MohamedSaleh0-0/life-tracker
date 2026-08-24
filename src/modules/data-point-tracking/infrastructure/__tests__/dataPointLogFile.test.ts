import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DataPointLogFile, DataPointLogFileReadError } from '../dataPointLogFile';
import { FakeVaultAdapter } from '../../../../core/ports/__tests__/fakeVaultAdapter';

describe('DataPointLogFile round-trip', () => {
  test('writes an entry, reads it back', async () => {
    const log = new DataPointLogFile(new FakeVaultAdapter());
    await log.upsertEntry({ id: 'e1', definitionId: 'd1', date: '2026-08-19', time: '08:00', rawValue: '250' });

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 1);
    assert.equal(day[0].definitionId, 'd1');
    assert.equal(day[0].time, '08:00');
    assert.equal(day[0].rawValue, '250');
  });

  test('multiple entries for the same data point on the same day are all kept, each its own field (REQ-D005)', async () => {
    const log = new DataPointLogFile(new FakeVaultAdapter());
    await log.upsertEntry({ id: 'e1', definitionId: 'd1', date: '2026-08-19', time: '08:00', rawValue: '250' });
    await log.upsertEntry({ id: 'e2', definitionId: 'd1', date: '2026-08-19', time: '14:00', rawValue: '300' });

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 2);
    assert.deepEqual(day.map((e) => e.rawValue).sort(), ['250', '300']);
  });

  test('editing one entry (upsert with same id) does not disturb other entries that day (REQ-D008)', async () => {
    const log = new DataPointLogFile(new FakeVaultAdapter());
    await log.upsertEntry({ id: 'e1', definitionId: 'd1', date: '2026-08-19', time: '08:00', rawValue: '250' });
    await log.upsertEntry({ id: 'e2', definitionId: 'd1', date: '2026-08-19', time: '14:00', rawValue: '300' });
    await log.upsertEntry({ id: 'e2', definitionId: 'd1', date: '2026-08-19', time: '14:00', rawValue: '350' }); // edit

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 2);
    const e2 = day.find((e) => e.id === 'e2');
    assert.equal(e2?.rawValue, '350');
    const e1 = day.find((e) => e.id === 'e1');
    assert.equal(e1?.rawValue, '250'); // untouched
  });

  test('deleting one entry leaves the others intact (REQ-D012)', async () => {
    const log = new DataPointLogFile(new FakeVaultAdapter());
    await log.upsertEntry({ id: 'e1', definitionId: 'd1', date: '2026-08-19', time: '08:00', rawValue: '250' });
    await log.upsertEntry({ id: 'e2', definitionId: 'd1', date: '2026-08-19', time: '14:00', rawValue: '300' });

    await log.deleteEntry('2026-08-19', 'e1');

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 1);
    assert.equal(day[0].id, 'e2');
  });

  test('a text value containing a literal "|" round-trips correctly (only the first two pipes are delimiters)', async () => {
    const log = new DataPointLogFile(new FakeVaultAdapter());
    await log.upsertEntry({
      id: 'e1',
      definitionId: 'd1',
      date: '2026-08-19',
      time: '08:00',
      rawValue: 'Felt tired | but ok',
    });

    const day = await log.readDay('2026-08-19');
    assert.equal(day[0].rawValue, 'Felt tired | but ok');
  });

  test('a day with no entries produces no line in the file (clean for hand-editing)', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new DataPointLogFile(adapter);
    await log.upsertEntry({ id: 'e1', definitionId: 'd1', date: '2026-08-19', time: '08:00', rawValue: '250' });

    const raw = await adapter.readFile('Life Tracker/Logs/DataPoints/data-points-2026.md');
    assert.equal(raw, '- 2026-08-19 [dp-e1:: d1|08:00|250]\n');
  });

  test('readRange spans multiple year files', async () => {
    const log = new DataPointLogFile(new FakeVaultAdapter());
    await log.upsertEntry({ id: 'e1', definitionId: 'd1', date: '2025-12-30', time: '08:00', rawValue: '1' });
    await log.upsertEntry({ id: 'e2', definitionId: 'd1', date: '2026-01-02', time: '08:00', rawValue: '2' });

    const range = await log.readRange('2025-12-25', '2026-01-05');
    assert.equal(range.length, 2);
  });

  test('hasAnyLogEntry finds an entry across year files by definitionId, and correctly reports absence', async () => {
    const log = new DataPointLogFile(new FakeVaultAdapter());
    await log.upsertEntry({ id: 'e1', definitionId: 'zzz999', date: '2025-06-01', time: '08:00', rawValue: '1' });

    assert.equal(await log.hasAnyLogEntry('zzz999'), true);
    assert.equal(await log.hasAnyLogEntry('nonexistent'), false);
  });

  test('a corrupted/unreadable file surfaces a typed error rather than silently returning empty data', async () => {
    const brokenAdapter = new FakeVaultAdapter();
    brokenAdapter.fileExists = async () => true;
    brokenAdapter.readFile = async () => {
      throw new Error('simulated disk error');
    };
    const log = new DataPointLogFile(brokenAdapter);
    await assert.rejects(() => log.readDay('2026-08-19'), DataPointLogFileReadError);
  });
});
