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

export type DataPointType = 'number' | 'time' | 'text' | 'duration' | 'binary';

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

export type DataPointLogValue = number | string;

export interface DataPointEntry {
  id: string; // stable id, generated once, used for edit/delete addressing
  definitionId: string;
  date: string; // YYYY-MM-DD the entry was logged under
  time: string; // HH:MM local time logged (REQ-D006)
  value: DataPointLogValue;
}

export type NewEntryInput = Pick<DataPointEntry, 'definitionId' | 'date' | 'time' | 'value'>;

export interface TrendPoint {
  date: string;
  time: string;
  value: number;
  label: string;
  entryId: string;
}