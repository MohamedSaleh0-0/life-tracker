// Pure validation: does a raw string input match a data point's type
// (REQ-D009 — reject non-numeric text for a number data point, etc.).
// No I/O.

import { DataPointType, DataPointLogValue } from './types';

export type ValidationResult =
  | { valid: true; value: DataPointLogValue }
  | { valid: false; error: string };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function validateEntryValue(type: DataPointType, raw: string): ValidationResult {
  const trimmed = raw.trim();

  if (type === 'number') {
    if (trimmed === '') return { valid: false, error: 'Enter a number.' };
    const num = Number(trimmed);
    if (Number.isNaN(num)) return { valid: false, error: "That doesn't look like a number." };
    return { valid: true, value: num };
  }

  if (type === 'time') {
    if (!TIME_RE.test(trimmed)) return { valid: false, error: 'Enter a time as HH:MM (24-hour).' };
    return { valid: true, value: trimmed };
  }

  if (type === 'duration') {
    // The validated value is the activity's end time; its start time
    // lives in the entry's separate `time` field, validated by the UI
    // the same way any HH:MM input is.
    if (!TIME_RE.test(trimmed)) return { valid: false, error: 'Enter an end time as HH:MM (24-hour).' };
    return { valid: true, value: trimmed };
  }

  if (trimmed === '') return { valid: false, error: 'Enter a value.' };
  return { valid: true, value: raw };
}
