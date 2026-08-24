import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TransactionLogFile, TransactionLogFileReadError, RawTransaction } from '../transactionLogFile';
import { FakeVaultAdapter } from '../../../../core/ports/__tests__/fakeVaultAdapter';

function makeRaw(overrides: Partial<RawTransaction> = {}): RawTransaction {
  return {
    id: 't1',
    date: '2026-08-19',
    time: '08:15',
    accountId: 'a1',
    type: 'expense',
    categoryId: 'food',
    amount: '-20',
    quantity: '',
    transferPairId: '',
    recurringEntryId: '',
    shoppingItemId: '',
    ...overrides,
  };
}

describe('TransactionLogFile round-trip', () => {
  test('writes a transaction, reads it back with all structured fields intact, including time', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw());

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 1);
    assert.equal(day[0].accountId, 'a1');
    assert.equal(day[0].type, 'expense');
    assert.equal(day[0].categoryId, 'food');
    assert.equal(day[0].amount, '-20');
    assert.equal(day[0].time, '08:15');
  });

  test('recurringEntryId and shoppingItemId round-trip (REQ-M035/M023 traceability)', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw({ id: 't1', recurringEntryId: 'rec1' }));
    await log.upsertTransaction(makeRaw({ id: 't2', shoppingItemId: 'item1' }));

    const day = await log.readDay('2026-08-19');
    assert.equal(day.find((t) => t.id === 't1')?.recurringEntryId, 'rec1');
    assert.equal(day.find((t) => t.id === 't2')?.shoppingItemId, 'item1');
  });

  test('optional name/note round-trip as separate fields, and are absent when not provided', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw({ id: 't1', name: 'Coffee', note: 'with a friend' }));
    await log.upsertTransaction(makeRaw({ id: 't2' })); // no name/note

    const day = await log.readDay('2026-08-19');
    const withNote = day.find((t) => t.id === 't1');
    const withoutNote = day.find((t) => t.id === 't2');
    assert.equal(withNote?.name, 'Coffee');
    assert.equal(withNote?.note, 'with a friend');
    assert.equal(withoutNote?.name, undefined);
    assert.equal(withoutNote?.note, undefined);
  });

  test('multiple transactions the same day are all kept independently', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw({ id: 't1', amount: '-20' }));
    await log.upsertTransaction(makeRaw({ id: 't2', amount: '-15' }));

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 2);
  });

  test('editing one transaction (upsert with same id) does not disturb others that day', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw({ id: 't1', amount: '-20' }));
    await log.upsertTransaction(makeRaw({ id: 't2', amount: '-15' }));
    await log.upsertTransaction(makeRaw({ id: 't1', amount: '-25' })); // edit t1

    const day = await log.readDay('2026-08-19');
    assert.equal(day.find((t) => t.id === 't1')?.amount, '-25');
    assert.equal(day.find((t) => t.id === 't2')?.amount, '-15');
  });

  test('deleteTransaction removes only that one (REQ-M008)', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw({ id: 't1' }));
    await log.upsertTransaction(makeRaw({ id: 't2' }));

    await log.deleteTransaction('2026-08-19', 't1');

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 1);
    assert.equal(day[0].id, 't2');
  });

  test('a transfer pair (two legs sharing transferPairId) both round-trip', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(
      makeRaw({ id: 't1', accountId: 'checking', type: 'transfer', amount: '-100', transferPairId: 'p1' })
    );
    await log.upsertTransaction(
      makeRaw({ id: 't2', accountId: 'savings', type: 'transfer', amount: '100', transferPairId: 'p1' })
    );

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 2);
    assert.ok(day.every((t) => t.transferPairId === 'p1'));
  });

  test('readAll aggregates every transaction across every year file, for balance calculation', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw({ id: 't1', date: '2025-06-01' }));
    await log.upsertTransaction(makeRaw({ id: 't2', date: '2026-08-19' }));

    const all = await log.readAll();
    assert.equal(all.length, 2);
  });

  test('readRange spans multiple year files', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw({ id: 't1', date: '2025-12-30' }));
    await log.upsertTransaction(makeRaw({ id: 't2', date: '2026-01-02' }));

    const range = await log.readRange('2025-12-25', '2026-01-05');
    assert.equal(range.length, 2);
  });

  test('a day with no entries produces no line in the file', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new TransactionLogFile(adapter);
    await log.upsertTransaction(makeRaw());
    const raw = await adapter.readFile('Life Tracker/Logs/Money/transactions-2026.md');
    assert.equal(raw, '- 2026-08-19 [tx-t1:: a1|expense|food|-20|||||08:15]\n');
  });

  test('a corrupted/unreadable file surfaces a typed error rather than silently returning empty data', async () => {
    const brokenAdapter = new FakeVaultAdapter();
    brokenAdapter.fileExists = async () => true;
    brokenAdapter.readFile = async () => {
      throw new Error('simulated disk error');
    };
    const log = new TransactionLogFile(brokenAdapter);
    await assert.rejects(() => log.readDay('2026-08-19'), TransactionLogFileReadError);
  });
});
