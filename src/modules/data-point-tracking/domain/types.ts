// Domain types for the Data Point Tracking module.
// Pure data shapes only — no I/O, no Obsidian API, no React.
// See design-data-point-tracking.md.

// 'duration' added: an activity tracked by its start and end time
// (sleep, play time, shopping time, ...) rather than a number the user
// computes by hand. The entry's existing `time` field holds the start
// time; `value` holds the end time ("HH:MM"); duration itself is
// computed on read (src/modules/data-point-tracking/domain/duration.ts),
// never stored, so no schema change was needed to add this — it reuses
// the existing per-entry {time, value} shape. Like every other type,
// multiple entries per data point per day are already supported (REQ-D005),
// which is exactly what "more than one sleep/play/shopping entry a day"
// needs.
export type DataPointType = 'number' | 'time' | 'text' | 'duration';

export interface DataPointDefinition {
  id: string; // nanoid, generated once at creation, never reused
  name: string;
  type: DataPointType;
  unit?: string; // number type only, optional (REQ-D001)
  archived: boolean; // REQ-D013, defaults false
  createdAt: string; // local date YYYY-MM-DD, via the shared date fn (REQ-C012)
  order: number;
}

export interface NewDataPointInput {
  name: string;
  type: DataPointType;
  unit?: string;
}

// The value a single logged entry holds. Number type stores a number;
// time-of-day, duration (end time), and text types store a string
// ("HH:MM" / freeform).
export type DataPointLogValue = number | string;

// A single logged entry for a data point on a given day (REQ-D005: one
// or more entries per data point per day, each its own timestamped
// entry rather than overwriting). For duration-type entries, `time` is
// the activity's start time and `value` is its end time.
export interface DataPointEntry {
  id: string; // stable id, generated once, used for edit/delete addressing
  definitionId: string;
  date: string; // YYYY-MM-DD the entry was logged under
  time: string; // HH:MM local time logged (REQ-D006) — start time, for duration type
  value: DataPointLogValue;
}

export type NewEntryInput = Pick<DataPointEntry, 'definitionId' | 'date' | 'time' | 'value'>;

// One point on a trend chart — every individual entry becomes its own
// point (see design-data-point-tracking.md's resolved Open Question),
// not a daily aggregate.
export interface TrendPoint {
  date: string;
  time: string;
  /** Numeric x-axis value: the raw number for 'number' type, minutes-since-midnight for 'time' type, elapsed minutes for 'duration' type. */
  value: number;
  /** Human-readable label for the point (e.g. "72 kg", "07:15", or "7h 30m"). */
  label: string;
  entryId: string;
}
