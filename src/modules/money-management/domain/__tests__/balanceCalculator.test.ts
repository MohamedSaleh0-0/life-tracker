import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAccountBalance, calculateIncomeExpenseTotals } from '../balanceCalculator';
import { Account, Transaction } from '../types';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Wallet',
    currency: 'USD',
    openingBalance: 100,
    archived: false,
    createdAt: '2026-01-01',
    order: 0,
    ...overrides,
  };
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    date: '2026-08-19',
    accountId: 'a1',
    type: 'expense',
    amount: -20,
    ...overrides,
  };
}

describe('calculateAccountBalance', () => {
  test('opening balance plus its own transactions, ignoring other accounts', () => {
    const account = makeAccount({ openingBalance: 100 });
    const txs = [
      makeTx({ id: 't1', accountId: 'a1', amount: -20 }),
      makeTx({ id: 't2', accountId: 'a1', amount: 50 }),
      makeTx({ id: 't3', accountId: 'a2', amount: -1000 }), // different account, must not affect a1
    ];
    assert.equal(calculateAccountBalance(account, txs), 130);
  });

  test('no transactions leaves the balance at opening balance', () => {
    const account = makeAccount({ openingBalance: 250 });
    assert.equal(calculateAccountBalance(account, []), 250);
  });

  test('an adjustment transaction shifts the balance like any other signed amount (REQ-M002)', () => {
    const account = makeAccount({ openingBalance: 0 });
    const txs = [makeTx({ type: 'adjustment', amount: 42 })];
    assert.equal(calculateAccountBalance(account, txs), 42);
  });
});

describe('calculateIncomeExpenseTotals', () => {
  test('sums income and expense separately, expense as a positive magnitude', () => {
    const txs = [
      makeTx({ type: 'income', amount: 500 }),
      makeTx({ type: 'expense', amount: -30 }),
      makeTx({ type: 'expense', amount: -15 }),
    ];
    const totals = calculateIncomeExpenseTotals(txs);
    assert.equal(totals.income, 500);
    assert.equal(totals.expense, 45);
  });

  test('excludes transfers from both totals (REQ-M003)', () => {
    const txs = [
      makeTx({ type: 'transfer', amount: -100, transferPairId: 'p1' }),
      makeTx({ type: 'transfer', amount: 100, transferPairId: 'p1' }),
    ];
    const totals = calculateIncomeExpenseTotals(txs);
    assert.equal(totals.income, 0);
    assert.equal(totals.expense, 0);
  });

  test('excludes adjustments from income/expense totals', () => {
    const txs = [makeTx({ type: 'adjustment', amount: 1000 })];
    const totals = calculateIncomeExpenseTotals(txs);
    assert.equal(totals.income, 0);
    assert.equal(totals.expense, 0);
  });
});
