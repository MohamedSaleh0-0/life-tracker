// Pure domain logic: turn a flat list of logged entries into
// TrendPoints for the chart (REQ-D010). No I/O. Each entry becomes its
// own point — see design-data-point-tracking.md's resolved Open
// Question on aggregation (no daily-average mode yet).
//
// Duration-type entries need the definition's type passed explicitly:
// their raw `value` is an end-time string ("HH:MM"), which — without
// knowing the definition is duration-typed — would otherwise be
// mistaken for a plain time-of-day value and plotted as a clock
// position instead of an elapsed duration. `entry.time` (start) and
// `entry.value` (end) together give the actual duration.

import { DataPointEntry, DataPointType, TrendPoint } from './types';
import { computeDurationMinutes, formatDurationMinutes } from './duration';

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const TIME_VALUE_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function buildTrendPoints(entries: DataPointEntry[], unit?: string, definitionType?: DataPointType): TrendPoint[] {
  const points: TrendPoint[] = [];

  for (const entry of entries) {
    if (definitionType === 'duration' && typeof entry.value === 'string') {
      const minutes = computeDurationMinutes(entry.time, entry.value);
      points.push({
        date: entry.date,
        time: entry.time,
        value: minutes,
        label: formatDurationMinutes(minutes),
        entryId: entry.id,
      });
      continue;
    }

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
