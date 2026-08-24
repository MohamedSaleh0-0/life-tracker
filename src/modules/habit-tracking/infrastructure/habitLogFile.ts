// Reads/writes the yearly markdown log files (REQ-C009/C010).

import { VaultAdapter } from './vaultAdapter';
import { HabitLogValue } from '../domain/types';

const DEFAULT_LOG_FOLDER = 'Life Tracker/Logs/Habits';

export interface HabitLogFileConfig {
  logFolder?: string;
}

export type { HabitLogValue };

const LINE_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s+(.*)$/;
const FIELD_RE = /\[habit-([a-zA-Z0-9_-]+)::\s*([^\]]+)\]/g;

function parseFieldValue(raw: string): HabitLogValue {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== '') return num;
  throw new Error(`Unrecognized habit log value: "${raw}"`);
}

function serializeFieldValue(value: HabitLogValue): string {
  return String(value);
}

function yearOf(date: string): string {
  return date.slice(0, 4);
}

export class HabitLogFileReadError extends Error {
  constructor(
    public readonly path: string,
    public readonly cause: unknown
  ) {
    super(`Failed to read habit log file: ${path}`);
    this.name = 'HabitLogFileReadError';
  }
}

export class HabitLogFile {
  constructor(
    private adapter: VaultAdapter,
    private config: HabitLogFileConfig = {}
  ) {}

  private get logFolder(): string {
    return this.config.logFolder ?? DEFAULT_LOG_FOLDER;
  }

  private pathForYear(year: string): string {
    return `${this.logFolder}/habits-${year}.md`;
  }

  private async readYearFile(
    year: string
  ): Promise<Map<string, Map<string, HabitLogValue>>> {
    const path = this.pathForYear(year);
    const result = new Map<string, Map<string, HabitLogValue>>();

    if (!(await this.adapter.fileExists(path))) return result;

    let content: string;
    try {
      content = await this.adapter.readFile(path);
    } catch (err) {
      throw new HabitLogFileReadError(path, err);
    }

    for (const line of content.split('\n')) {
      const match = LINE_RE.exec(line);
      if (!match) continue;
      const [, date, fieldsRaw] = match;
      const fields = new Map<string, HabitLogValue>();
      FIELD_RE.lastIndex = 0;
      let fieldMatch: RegExpExecArray | null;
      while ((fieldMatch = FIELD_RE.exec(fieldsRaw)) !== null) {
        const [, habitId, rawValue] = fieldMatch;
        fields.set(habitId, parseFieldValue(rawValue));
      }
      result.set(date, fields);
    }

    return result;
  }

  private serializeYearFile(days: Map<string, Map<string, HabitLogValue>>): string {
    const sortedDates = Array.from(days.keys()).sort();
    const lines: string[] = [];
    for (const date of sortedDates) {
      const fields = days.get(date)!;
      if (fields.size === 0) continue;
      const fieldStrs = Array.from(fields.entries())
        .map(([id, value]) => `[habit-${id}:: ${serializeFieldValue(value)}]`)
        .join(' ');
      lines.push(`- ${date} ${fieldStrs}`);
    }
    return lines.length > 0 ? lines.join('\n') + '\n' : '';
  }

  private async writeYearFile(
    year: string,
    days: Map<string, Map<string, HabitLogValue>>
  ): Promise<void> {
    if (!(await this.adapter.folderExists(this.logFolder))) {
      await this.adapter.createFolder(this.logFolder);
    }
    await this.adapter.writeFile(this.pathForYear(year), this.serializeYearFile(days));
  }

  async readDay(date: string): Promise<Map<string, HabitLogValue>> {
    const days = await this.readYearFile(yearOf(date));
    return days.get(date) ?? new Map();
  }

  async readRange(
    startDate: string,
    endDate: string
  ): Promise<Map<string, Map<string, HabitLogValue>>> {
    const startYear = Number(yearOf(startDate));
    const endYear = Number(yearOf(endDate));
    const result = new Map<string, Map<string, HabitLogValue>>();

    for (let y = startYear; y <= endYear; y++) {
      const days = await this.readYearFile(String(y));
      for (const [date, fields] of days) {
        if (date >= startDate && date <= endDate) {
          result.set(date, fields);
        }
      }
    }
    return result;
  }

  async writeField(date: string, habitId: string, value: HabitLogValue): Promise<void> {
    const year = yearOf(date);
    const days = await this.readYearFile(year);
    const fields = days.get(date) ?? new Map<string, HabitLogValue>();
    fields.set(habitId, value);
    days.set(date, fields);
    await this.writeYearFile(year, days);
  }

  async hasAnyLogEntry(habitId: string): Promise<boolean> {
    const files = await this.adapter.listFilesUnder(this.logFolder);
    for (const file of files) {
      const content = await this.adapter.readFile(file.path);
      if (content.includes(`[habit-${habitId}::`)) return true;
    }
    return false;
  }
}
