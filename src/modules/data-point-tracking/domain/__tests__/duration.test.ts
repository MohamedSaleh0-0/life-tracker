import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeDurationMinutes, formatDurationMinutes } from '../duration';

describe('computeDurationMinutes', () => {
  test('same-day span', () => {
    assert.equal(computeDurationMinutes('09:00', '17:30'), 510); // 8h30m
  });

  test('crossing midnight (sleep, the motivating case)', () => {
    assert.equal(computeDurationMinutes('23:30', '07:00'), 450); // 7h30m
  });

  test('exact 24h wrap (start === end) is treated as a full day, not zero', () => {
    assert.equal(computeDurationMinutes('08:00', '08:00'), 0);
  });

  test('a short same-day activity', () => {
    assert.equal(computeDurationMinutes('14:00', '14:45'), 45);
  });
});

describe('formatDurationMinutes', () => {
  test('hours and minutes', () => {
    assert.equal(formatDurationMinutes(450), '7h 30m');
  });

  test('whole hours only', () => {
    assert.equal(formatDurationMinutes(180), '3h');
  });

  test('minutes only, under an hour', () => {
    assert.equal(formatDurationMinutes(45), '45m');
  });

  test('zero', () => {
    assert.equal(formatDurationMinutes(0), '0m');
  });
});
