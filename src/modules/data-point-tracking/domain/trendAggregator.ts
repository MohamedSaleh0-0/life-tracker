// Pure domain logic: turn a flat list of logged entries into
// TrendPoints for the chart (REQ-D010). No I/O. Each entry becomes its
// own point — see design-data-point-tracking.md's resolved Open
// Question on aggregation (no daily-average mode yet).

import { DataPointEntry, TrendPoint } from './types';

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const TIME_VALUE_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function buildTrendPoints(entries: DataPointEntry[], unit?: string): TrendPoint[] {
  const points: TrendPoint[] = [];

  for (const entry of entries) {
    if (typeof entry.value === 'number') {
      points.push({
        date: entry.date,
        time: entry.time,
        value: entry.value,
        label: unit ? `${entry.value} ${unit}` : String(entry.value),
        entryId: entry.id,
      });
    } else if (TIME_VALUE_RE.test(entry.value)) {
      points.push({
        date: entry.date,
        time: entry.time,
        value: timeToMinutes(entry.value),
        label: entry.value,
        entryId: entry.id,
      });
    }
    // text-type entries produce no trend point — REQ-D011 shows them
    // as a list instead, built directly from raw entries in the UI.
  }

  return points.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
