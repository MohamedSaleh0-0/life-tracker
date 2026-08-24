import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateNextDueDate, isRecurringEntryDue } from '../recurringDueCalculator';
import { RecurringEntry } from '../types';

function makeEntry(overrides: Partial<RecurringEntry> = {}): Pick<RecurringEntry, 'frequency' | 'dayOfMonth' | 'lastHandledDate' | 'createdAt'> {
  return {
    frequency: 'monthly',
    createdAt: '2026-01-01',
    ...overrides,
  };
}

describe('calculateNextDueDate', () => {
  test('never-handled weekly entry is due 7 days after creation', () => {
    const entry = makeEntry({ frequency: 'weekly', createdAt: '2026-08-01' });
    assert.equal(calculateNextDueDate(entry), '2026-08-08');
  });

  test('biweekly is 14 days after last handled', () => {
    const entry = makeEntry({ frequency: 'biweekly', createdAt: '2026-08-01', lastHandledDate: '2026-08-10' });
    assert.equal(calculateNextDueDate(entry), '2026-08-24');
  });

  test('monthly respects dayOfMonth', () => {
    const entry = makeEntry({ frequency: 'monthly', createdAt: '2026-01-05', dayOfMonth: 15 });
    assert.equal(calculateNextDueDate(entry), '2026-02-15');
  });

  test('yearly rolls the year forward, respecting dayOfMonth', () => {
    const entry = makeEntry({ frequency: 'yearly', createdAt: '2026-03-10', dayOfMonth: 10 });
    assert.equal(calculateNextDueDate(entry), '2027-03-10');
  });

  test('a handled entry bases the next due date off lastHandledDate, not createdAt', () => {
    const entry = makeEntry({ frequency: 'monthly', createdAt: '2026-01-05', lastHandledDate: '2026-06-05', dayOfMonth: 5 });
    assert.equal(calculateNextDueDate(entry), '2026-07-05');
  });
});

describe('isRecurringEntryDue', () => {
  test('is due once today reaches or passes the next due date', () => {
    const entry = makeEntry({ frequency: 'weekly', createdAt: '2026-08-01' }); // due 2026-08-08
    assert.equal(isRecurringEntryDue(entry, '2026-08-07'), false);
    assert.equal(isRecurringEntryDue(entry, '2026-08-08'), true);
    assert.equal(isRecurringEntryDue(entry, '2026-08-09'), true);
  });
});
