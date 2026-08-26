import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrendPoints } from '../trendAggregator';
import { DataPointEntry } from '../types';

function makeEntry(overrides: Partial<DataPointEntry> = {}): DataPointEntry {
  return {
    id: 'e1',
    definitionId: 'd1',
    date: '2026-08-19',
    time: '08:00',
    value: 70,
    ...overrides,
  };
}

describe('buildTrendPoints', () => {
  test('every entry becomes its own point, not aggregated per day', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2026-08-19', time: '08:00', value: 250 }),
      makeEntry({ id: 'e2', date: '2026-08-19', time: '14:00', value: 300 }),
    ];
    const points = buildTrendPoints(entries);
    assert.equal(points.length, 2);
  });

  test('applies the unit to the label when provided', () => {
    const points = buildTrendPoints([makeEntry({ value: 72 })], 'kg');
    assert.equal(points[0].label, '72 kg');
  });

  test('time-of-day values convert to minutes-since-midnight for the numeric axis', () => {
    const points = buildTrendPoints([makeEntry({ value: '07:30' })]);
    assert.equal(points[0].value, 450); // 7*60 + 30
    assert.equal(points[0].label, '07:30');
  });

  test('points are sorted chronologically by date then time', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2026-08-20', time: '08:00', value: 1 }),
      makeEntry({ id: 'e2', date: '2026-08-19', time: '14:00', value: 2 }),
      makeEntry({ id: 'e3', date: '2026-08-19', time: '08:00', value: 3 }),
    ];
    const points = buildTrendPoints(entries);
    assert.deepEqual(
      points.map((p) => p.entryId),
      ['e3', 'e2', 'e1']
    );
  });

  test('text-type entries (neither number nor HH:MM) produce no trend point', () => {
    const points = buildTrendPoints([makeEntry({ value: 'Felt great' })]);
    assert.equal(points.length, 0);
  });
});

describe('buildTrendPoints — duration type', () => {
  test('plots elapsed minutes (start->end), not the raw end-time clock value', () => {
    const entry = makeEntry({ time: '23:30', value: '07:00' }); // sleep, crosses midnight
    const points = buildTrendPoints([entry], undefined, 'duration');
    assert.equal(points[0].value, 450); // 7h30m, not 7*60+0=420 (which is what plain time-of-day parsing would give)
    assert.equal(points[0].label, '7h 30m');
  });

  test('same-day duration entry', () => {
    const entry = makeEntry({ time: '14:00', value: '15:30' });
    const points = buildTrendPoints([entry], undefined, 'duration');
    assert.equal(points[0].value, 90);
    assert.equal(points[0].label, '1h 30m');
  });

  test('without definitionType, a duration entry falls back to being read as a plain time-of-day value (backward-compatible default)', () => {
    const entry = makeEntry({ time: '23:30', value: '07:00' });
    const points = buildTrendPoints([entry]); // no third arg
    assert.equal(points[0].value, 420); // 07:00 read as a clock position, not a duration
  });
});
