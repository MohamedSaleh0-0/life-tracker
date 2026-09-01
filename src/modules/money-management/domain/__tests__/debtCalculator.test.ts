import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { debtRemaining, debtIsSettled, totalsByDirection } from '../debtCalculator';
import { Debt, DebtPayment } from '../types';

function makeDebt(o: Partial<Debt> = {}): Debt {
  return {
    id: 'd1',
    direction: 'owed_to_me',
    counterparty: 'Sam',
    principal: 100,
    createdAt: '2026-01-01',
    archived: false,
    order: 0,
    ...o,
  };
}

function makePayment(o: Partial<DebtPayment> = {}): DebtPayment {
  return { id: 'p1', debtId: 'd1', amount: 30, date: '2026-08-19', ...o };
}

describe('debtRemaining', () => {
  test('full principal owed with no payments', () => {
    assert.equal(debtRemaining(makeDebt(), []), 100);
  });

  test('subtracts partial payments', () => {
    assert.equal(
      debtRemaining(
        makeDebt(),
        [makePayment({ amount: 30 }), makePayment({ id: 'p2', amount: 20 })]
      ),
      50
    );
  });

  test('never goes negative on overpayment', () => {
    assert.equal(debtRemaining(makeDebt({ principal: 50 }), [makePayment({ amount: 80 })]), 0);
  });

  test('only counts payments against that specific debt', () => {
    const other = makePayment({ debtId: 'other-debt', amount: 999 });
    assert.equal(debtRemaining(makeDebt(), [other]), 100);
  });
});

describe('debtIsSettled', () => {
  test('false while balance remains', () =>
    assert.equal(debtIsSettled(makeDebt(), []), false));

  test('true once fully paid', () =>
    assert.equal(debtIsSettled(makeDebt(), [makePayment({ amount: 100 })]), true));
});

describe('totalsByDirection', () => {
  test('splits and sums remaining balances by direction, excluding archived', () => {
    const debts = [
      makeDebt({ id: 'd1', direction: 'owed_to_me', principal: 100 }),
      makeDebt({ id: 'd2', direction: 'i_owe', principal: 50 }),
      makeDebt({ id: 'd3', direction: 'owed_to_me', principal: 999, archived: true }),
    ];
    const totals = totalsByDirection(debts, []);
    assert.equal(totals.owedToMe, 100);
    assert.equal(totals.iOwe, 50);
  });
});
