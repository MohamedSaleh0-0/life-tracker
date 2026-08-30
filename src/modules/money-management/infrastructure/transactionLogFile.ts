// Reads/writes the yearly markdown log files for Money Management
// (REQ-C009/C010, per-entry since multiple transactions per day are
// the norm). See design-money-management.md's Data Model section for
// the original field layout and why `tx-`/`txn-`/`txnote-` prefixes
// are unambiguous.
//
// Main field grew again this pass: 11 -> 13 pipe-delimited parts, to
// add `essential` ('true'/'false'/'' for not-set) and `judgment`
// ('wise'/'fair'/'childish'/'wasted'/'' for not-set). Same backward-
// compatibility approach as every prior growth of this format:
// parseMain backfills any missing trailing fields with '', so entries
// logged before these fields existed read back as "not set" rather
// than erroring.

import { VaultAdapter } from '../../../core/ports/vaultAdapter';

const DEFAULT_LOG_FOLDER = 'Life Tracker/Logs/Money';

export interface TransactionLogFileConfig {
  logFolder?: string;
}

export interface RawTransaction {
  id: string;
  date: string;
  time: string; // HH:MM
  accountId: string;
  type: string;
  categoryId: string; // '' = none
  amount: string; // raw numeric string
  quantity: string; // '' = none
  transferPairId: string; // '' = none
  recurringEntryId: string; // '' = none
  shoppingItemId: string; // '' = none
  archived: string; // 'true' or '' (false)
  refundOf: string; // '' = not a refund, else the original transaction's id
  essential: string; // 'true' / 'false' / '' (not set)
  judgment: string; // 'wise' / 'fair' / 'childish' / 'wasted' / '' (not set)
  name?: string;
  note?: string;
}

const LINE_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s+(.*)$/;
const MAIN_RE = /\[tx-([a-zA-Z0-9_-]+)::\s*([^\]]+)\]/g;
const NAME_RE = /\[txn-([a-zA-Z0-9_-]+)::\s*([^\]]+)\]/g;
const NOTE_RE = /\[txnote-([a-zA-Z0-9_-]+)::\s*([^\]]+)\]/g;

const MAIN_FIELD_COUNT = 13;

function serializeMain(t: RawTransaction): string {
  return [
    t.accountId,
    t.type,
    t.categoryId,
    t.amount,
    t.quantity,
    t.transferPairId,
    t.recurringEntryId,
    t.shoppingItemId,
    t.time,
    t.archived,
    t.refundOf,
    t.essential,
    t.judgment,
  ].join('|');
}

function parseMain(raw: string): Omit<RawTransaction, 'id' | 'date' | 'name' | 'note'> {
  let parts = raw.split('|');

  if (parts.length > MAIN_FIELD_COUNT) {
    throw new Error(`Malformed transaction log entry: "${raw}"`);
  }
  if (parts.length < MAIN_FIELD_COUNT) {
    parts = [...parts, ...new Array(MAIN_FIELD_COUNT - parts.length).fill('')];
  }

  const [
    accountId,
    type,
    categoryId,
    amount,
    quantity,
    transferPairId,
    recurringEntryId,
    shoppingItemId,
    time,
    archived,
    refundOf,
    essential,
    judgment,
  ] = parts;
  return {
    accountId,
    type,
    categoryId,
    amount,
    quantity,
    transferPairId,
    recurringEntryId,
    shoppingItemId,
    time: time || '00:00',
    archived: archived || '',
    refundOf: refundOf || '',
    essential: essential || '',
    judgment: judgment || '',
  };
}

function yearOf(date: string): string {
  return date.slice(0, 4);
}

export class TransactionLogFileReadError extends Error {
  constructor(
    public readonly path: string,
    public readonly cause: unknown
  ) {
    super(`Failed to read transaction log file: ${path}`);
    this.name = 'TransactionLogFileReadError';
  }
}

export class TransactionLogFile {
  constructor(
    private adapter: VaultAdapter,
    private config: TransactionLogFileConfig = {}
  ) {}

  private get logFolder(): string {
    return this.config.logFolder ?? DEFAULT_LOG_FOLDER;
  }

  private pathForYear(year: string): string {
    return `${this.logFolder}/transactions-${year}.md`;
  }

  private async readYearFile(year: string): Promise<Map<string, RawTransaction[]>> {
    const path = this.pathForYear(year);
    const result = new Map<string, RawTransaction[]>();

    if (!(await this.adapter.fileExists(path))) return result;

    let content: string;
    try {
      content = await this.adapter.readFile(path);
    } catch (err) {
      throw new TransactionLogFileReadError(path, err);
    }

    for (const line of content.split('\n')) {
      const match = LINE_RE.exec(line);
      if (!match) continue;
      const [, date, fieldsRaw] = match;

      const names = new Map<string, string>();
      NAME_RE.lastIndex = 0;
      let nameMatch: RegExpExecArray | null;
      while ((nameMatch = NAME_RE.exec(fieldsRaw)) !== null) names.set(nameMatch[1], nameMatch[2]);

      const notes = new Map<string, string>();
      NOTE_RE.lastIndex = 0;
      let noteMatch: RegExpExecArray | null;
      while ((noteMatch = NOTE_RE.exec(fieldsRaw)) !== null) notes.set(noteMatch[1], noteMatch[2]);

      const entries: RawTransaction[] = [];
      MAIN_RE.lastIndex = 0;
      let mainMatch: RegExpExecArray | null;
      while ((mainMatch = MAIN_RE.exec(fieldsRaw)) !== null) {
        const [, id, rawGroup] = mainMatch;
        try {
          entries.push({
            id,
            date,
            ...parseMain(rawGroup),
            name: names.get(id),
            note: notes.get(id),
          });
        } catch {
          continue;
        }
      }
      result.set(date, entries);
    }

    return result;
  }

  private serializeYearFile(days: Map<string, RawTransaction[]>): string {
    const sortedDates = Array.from(days.keys()).sort();
    const lines: string[] = [];
    for (const date of sortedDates) {
      const entries = days.get(date)!;
      if (entries.length === 0) continue;
      const sorted = [...entries].sort((a, b) => (a.time + a.id).localeCompare(b.time + b.id));
      const fieldStrs: string[] = [];
      for (const t of sorted) {
        fieldStrs.push(`[tx-${t.id}:: ${serializeMain(t)}]`);
        if (t.name) fieldStrs.push(`[txn-${t.id}:: ${t.name}]`);
        if (t.note) fieldStrs.push(`[txnote-${t.id}:: ${t.note}]`);
      }
      lines.push(`- ${date} ${fieldStrs.join(' ')}`);
    }
    return lines.length > 0 ? lines.join('\n') + '\n' : '';
  }

  private async writeYearFile(year: string, days: Map<string, RawTransaction[]>): Promise<void> {
    if (!(await this.adapter.folderExists(this.logFolder))) {
      await this.adapter.createFolder(this.logFolder);
    }
    await this.adapter.writeFile(this.pathForYear(year), this.serializeYearFile(days));
  }

  async readDay(date: string): Promise<RawTransaction[]> {
    const days = await this.readYearFile(yearOf(date));
    return days.get(date) ?? [];
  }

  async readRange(startDate: string, endDate: string): Promise<RawTransaction[]> {
    const startYear = Number(yearOf(startDate));
    const endYear = Number(yearOf(endDate));
    const result: RawTransaction[] = [];

    for (let y = startYear; y <= endYear; y++) {
      const days = await this.readYearFile(String(y));
      for (const [date, entries] of days) {
        if (date >= startDate && date <= endDate) result.push(...entries);
      }
    }
    return result;
  }

  /** All transactions ever logged — used for balance calculation (REQ-M004/M007), which is always over full history (including archived), not a range. */
  async readAll(): Promise<RawTransaction[]> {
    const files = await this.adapter.listFilesUnder(this.logFolder);
    const result: RawTransaction[] = [];
    for (const file of files) {
      const match = /transactions-(\d{4})\.md$/.exec(file.path);
      if (!match) continue;
      const days = await this.readYearFile(match[1]);
      for (const entries of days.values()) result.push(...entries);
    }
    return result;
  }

  async upsertTransaction(t: RawTransaction): Promise<void> {
    const year = yearOf(t.date);
    const days = await this.readYearFile(year);
    const existing = days.get(t.date) ?? [];
    days.set(t.date, [...existing.filter((e) => e.id !== t.id), t]);
    await this.writeYearFile(year, days);
  }

  /** REQ-M008: deleting a transaction — the caller re-derives the balance afterward from readAll(), nothing to "recalculate" here. */
  async deleteTransaction(date: string, id: string): Promise<void> {
    const year = yearOf(date);
    const days = await this.readYearFile(year);
    const existing = days.get(date) ?? [];
    days.set(date, existing.filter((e) => e.id !== id));
    await this.writeYearFile(year, days);
  }

  /** Flips the archived flag on one transaction in place — organizational only, balances are unaffected. */
  async setArchived(date: string, id: string, archived: boolean): Promise<void> {
    await this.updateFields(date, id, { archived: archived ? 'true' : '' });
  }

  /** Generic in-place field patch for one transaction (e.g. Essential/Judgment edits after the fact) — merges `patch` into the existing raw entry and rewrites just that day's line. */
  async updateFields(date: string, id: string, patch: Partial<RawTransaction>): Promise<void> {
    const year = yearOf(date);
    const days = await this.readYearFile(year);
    const existing = days.get(date) ?? [];
    const idx = existing.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Transaction not found: ${id} on ${date}`);
    existing[idx] = { ...existing[idx], ...patch };
    days.set(date, existing);
    await this.writeYearFile(year, days);
  }

  /** Looks up a single transaction by date+id, for building a refund off it. */
  async findTransaction(date: string, id: string): Promise<RawTransaction | undefined> {
    const day = await this.readDay(date);
    return day.find((t) => t.id === id);
  }
}
