import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addMonthsLocal, addDaysLocal, toLocalDateString, parseLocalDate } from '../date';

describe('addMonthsLocal', () => {
  test('adds months within the same year', () => {
    assert.equal(addMonthsLocal('2026-01-15', 1), '2026-02-15');
  });

  test('rolls over into the next year', () => {
    assert.equal(addMonthsLocal('2026-12-01', 1), '2027-01-01');
  });

  test('pins to a specific day-of-month when provided', () => {
    assert.equal(addMonthsLocal('2026-01-05', 1, 20), '2026-02-20');
  });

  test('12 months implements "yearly", including across a day-of-month pin', () => {
    assert.equal(addMonthsLocal('2026-03-10', 12, 10), '2027-03-10');
  });
});

describe('addDaysLocal / round-trip sanity (regression guard while touching this file)', () => {
  test('addDaysLocal still works', () => {
    assert.equal(addDaysLocal('2026-08-19', 5), '2026-08-24');
  });
  test('round-trip still works', () => {
    assert.equal(toLocalDateString(parseLocalDate('2026-08-19')), '2026-08-19');
  });
});
