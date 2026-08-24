// Domain types for the Data Point Tracking module.
// Pure data shapes only — no I/O, no Obsidian API, no React.
// See design-data-point-tracking.md.

export type DataPointType = 'number' | 'time' | 'text';

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
// time-of-day and text types store a string ("HH:MM" / freeform).
export type DataPointLogValue = number | string;

// A single logged entry for a data point on a given day (REQ-D005: one
// or more entries per data point per day, each its own timestamped
// entry rather than overwriting).
export interface DataPointEntry {
  id: string; // stable id, generated once, used for edit/delete addressing
  definitionId: string;
  date: string; // YYYY-MM-DD the entry was logged under
  time: string; // HH:MM local time logged (REQ-D006)
  value: DataPointLogValue;
}

export type NewEntryInput = Pick<DataPointEntry, 'definitionId' | 'date' | 'time' | 'value'>;

// One point on a trend chart — every individual entry becomes its own
// point (see design-data-point-tracking.md's resolved Open Question),
// not a daily aggregate.
export interface TrendPoint {
  date: string;
  time: string;
  /** Numeric x-axis value: the raw number for 'number' type, minutes-since-midnight for 'time' type. */
  value: number;
  /** Human-readable label for the point (e.g. "72 kg" or "07:15"). */
  label: string;
  entryId: string;
}
