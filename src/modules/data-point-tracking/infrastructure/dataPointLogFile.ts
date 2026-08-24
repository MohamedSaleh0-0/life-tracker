// Reads/writes the yearly markdown log files for Data Point Tracking
// (REQ-C009/C010, extended for multi-entry days — REQ-D005). See
// design-data-point-tracking.md for the resolved storage-format Open
// Question.
//
// Line format, one bracketed field PER ENTRY (not per data point,
// since a data point can have several entries a day):
//   - 2026-08-19 [dp-<entryId>:: <definitionId>|<HH:MM>|<rawValue>]
//
// The key is just the entry's own id (mirrors habitLogFile's
// `habit-<id>` pattern — entries, not definitions, are the addressable
// unit here). The value packs definitionId and time ahead of the raw
// value, split on the first two `|` only, so a text entry's own value
// may itself contain `|` without breaking parsing. This module stores
// rawValue as a plain string always — type-aware interpretation
// (number vs. time vs. text) happens in the application layer, which
// has access to the definition's type; this layer doesn't need to
// know it.

import { VaultAdapter } from '../../../core/ports/vaultAdapter';

const DEFAULT_LOG_FOLDER = 'Life Tracker/Logs/DataPoints';

export interface DataPointLogFileConfig {
  logFolder?: string;
}

export interface RawDataPointEntry {
  id: string;
  definitionId: string;
  date: string;
  time: string;
  rawValue: string;
}

const LINE_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s+(.*)$/;
const FIELD_RE = /\[dp-([a-zA-Z0-9_-]+)::\s*([^\]]+)\]/g;

function parseFieldValue(raw: string): { definitionId: string; time: string; rawValue: string } {
  const firstPipe = raw.indexOf('|');
  const secondPipe = firstPipe === -1 ? -1 : raw.indexOf('|', firstPipe + 1);
  if (firstPipe === -1 || secondPipe === -1) {
    throw new Error(`Malformed data point log entry: "${raw}"`);
  }
  return {
    definitionId: raw.slice(0, firstPipe),
    time: raw.slice(firstPipe + 1, secondPipe),
    rawValue: raw.slice(secondPipe + 1),
  };
}

function serializeFieldValue(definitionId: string, time: string, rawValue: string): string {
  return `${definitionId}|${time}|${rawValue}`;
}

function yearOf(date: string): string {
  return date.slice(0, 4);
}

/** Mirrors HabitLogFileReadError — a corrupted/unreadable year file surfaces a typed error rather than silently returning empty data. */
export class DataPointLogFileReadError extends Error {
  constructor(
    public readonly path: string,
    public readonly cause: unknown
  ) {
    super(`Failed to read data point log file: ${path}`);
    this.name = 'DataPointLogFileReadError';
  }
}

export class DataPointLogFile {
  constructor(
    private adapter: VaultAdapter,
    private config: DataPointLogFileConfig = {}
  ) {}

  private get logFolder(): string {
    return this.config.logFolder ?? DEFAULT_LOG_FOLDER;
  }

  private pathForYear(year: string): string {
    return `${this.logFolder}/data-points-${year}.md`;
  }

  private async readYearFile(year: string): Promise<Map<string, RawDataPointEntry[]>> {
    const path = this.pathForYear(year);
    const result = new Map<string, RawDataPointEntry[]>();

    if (!(await this.adapter.fileExists(path))) return result;

    let content: string;
    try {
      content = await this.adapter.readFile(path);
    } catch (err) {
      throw new DataPointLogFileReadError(path, err);
    }

    for (const line of content.split('\n')) {
      const match = LINE_RE.exec(line);
      if (!match) continue;
      const [, date, fieldsRaw] = match;
      const entries: RawDataPointEntry[] = [];
      FIELD_RE.lastIndex = 0;
      let fieldMatch: RegExpExecArray | null;
      while ((fieldMatch = FIELD_RE.exec(fieldsRaw)) !== null) {
        const [, entryId, rawGroup] = fieldMatch;
        const { definitionId, time, rawValue } = parseFieldValue(rawGroup);
        entries.push({ id: entryId, definitionId, date, time, rawValue });
      }
      result.set(date, entries);
    }

    return result;
  }

  private serializeYearFile(days: Map<string, RawDataPointEntry[]>): string {
    const sortedDates = Array.from(days.keys()).sort();
    const lines: string[] = [];
    for (const date of sortedDates) {
      const entries = days.get(date)!;
      if (entries.length === 0) continue; // no line for an empty day — keeps the file clean
      const sorted = [...entries].sort((a, b) => (a.time + a.id).localeCompare(b.time + b.id));
      const fieldStrs = sorted
        .map((e) => `[dp-${e.id}:: ${serializeFieldValue(e.definitionId, e.time, e.rawValue)}]`)
        .join(' ');
      lines.push(`- ${date} ${fieldStrs}`);
    }
    return lines.length > 0 ? lines.join('\n') + '\n' : '';
  }

  private async writeYearFile(year: string, days: Map<string, RawDataPointEntry[]>): Promise<void> {
    if (!(await this.adapter.folderExists(this.logFolder))) {
      await this.adapter.createFolder(this.logFolder);
    }
    await this.adapter.writeFile(this.pathForYear(year), this.serializeYearFile(days));
  }

  /** All entries (across all data points) logged on a single day. */
  async readDay(date: string): Promise<RawDataPointEntry[]> {
    const days = await this.readYearFile(yearOf(date));
    return days.get(date) ?? [];
  }

  /** Flat list of entries in [startDate, endDate] inclusive, across however many year files that spans. */
  async readRange(startDate: string, endDate: string): Promise<RawDataPointEntry[]> {
    const startYear = Number(yearOf(startDate));
    const endYear = Number(yearOf(endDate));
    const result: RawDataPointEntry[] = [];

    for (let y = startYear; y <= endYear; y++) {
      const days = await this.readYearFile(String(y));
      for (const [date, entries] of days) {
        if (date >= startDate && date <= endDate) {
          result.push(...entries);
        }
      }
    }
    return result;
  }

  /** Adds a new entry, or overwrites an existing one with the same id (upsert) — used for both logging and editing (REQ-D005, REQ-D008). */
  async upsertEntry(entry: RawDataPointEntry): Promise<void> {
    const year = yearOf(entry.date);
    const days = await this.readYearFile(year);
    const existing = days.get(entry.date) ?? [];
    days.set(entry.date, [...existing.filter((e) => e.id !== entry.id), entry]);
    await this.writeYearFile(year, days);
  }

  /** Removes one entry by id from its date's line, without disturbing other entries that day (REQ-D008, REQ-D012). */
  async deleteEntry(date: string, entryId: string): Promise<void> {
    const year = yearOf(date);
    const days = await this.readYearFile(year);
    const existing = days.get(date) ?? [];
    days.set(date, existing.filter((e) => e.id !== entryId));
    await this.writeYearFile(year, days);
  }

  /** Whether any log entry exists anywhere for a given data point definition (delete-confirmation gate, same pattern as Habit Tracking's REQ-H015 check). */
  async hasAnyLogEntry(definitionId: string): Promise<boolean> {
    const files = await this.adapter.listFilesUnder(this.logFolder);
    for (const file of files) {
      const content = await this.adapter.readFile(file.path);
      FIELD_RE.lastIndex = 0;
      let fieldMatch: RegExpExecArray | null;
      while ((fieldMatch = FIELD_RE.exec(content)) !== null) {
        const { definitionId: fieldDefId } = parseFieldValue(fieldMatch[2]);
        if (fieldDefId === definitionId) return true;
      }
    }
    return false;
  }
}
