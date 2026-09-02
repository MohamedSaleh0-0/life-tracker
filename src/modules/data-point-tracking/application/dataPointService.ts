import {
  DataPointDefinition,
  DataPointEntry,
  DataPointLogValue,
  NewDataPointInput,
  TrendPoint,
} from '../domain/types';
import { validateEntryValue } from '../domain/validation';
import { buildTrendPoints } from '../domain/trendAggregator';
import { DataPointSettingsStore } from '../infrastructure/dataPointSettingsStore';
import { DataPointLogFile, RawDataPointEntry } from '../infrastructure/dataPointLogFile';
import { getTodayLocal } from '../../../core/date';

export class DeleteRequiresConfirmationError extends Error {
  constructor(public readonly definitionId: string) {
    super(`Data point ${definitionId} has existing history; deletion requires confirmation.`);
    this.name = 'DeleteRequiresConfirmationError';
  }
}

export class InvalidEntryValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEntryValueError';
  }
}

export interface DataPointServiceDeps {
  settingsStore: DataPointSettingsStore;
  logFile: DataPointLogFile;
  idGenerator: () => string;
  clock?: () => Date;
}

export class DataPointService {
  private settingsStore: DataPointSettingsStore;
  private logFile: DataPointLogFile;
  private idGenerator: () => string;
  private clock: () => Date;

  constructor(deps: DataPointServiceDeps) {
    this.settingsStore = deps.settingsStore;
    this.logFile = deps.logFile;
    this.idGenerator = deps.idGenerator;
    this.clock = deps.clock ?? (() => new Date());
  }

  private today(): string {
    return getTodayLocal(this.clock);
  }

  async createDataPoint(input: NewDataPointInput): Promise<DataPointDefinition> {
    const existing = await this.settingsStore.getAll();
    const dataPoint: DataPointDefinition = {
      id: this.idGenerator(),
      name: input.name,
      type: input.type,
      unit: input.unit,
      archived: false,
      createdAt: this.today(),
      order: existing.length,
    };
    return this.settingsStore.create(dataPoint);
  }

  async updateDataPoint(id: string, patch: Partial<DataPointDefinition>): Promise<DataPointDefinition> {
    return this.settingsStore.update(id, patch);
  }

  async archiveDataPoint(id: string): Promise<void> {
    await this.settingsStore.update(id, { archived: true });
  }

  async deleteDataPoint(id: string, confirmed = false): Promise<void> {
    const hasHistory = await this.logFile.hasAnyLogEntry(id);
    if (hasHistory && !confirmed) {
      throw new DeleteRequiresConfirmationError(id);
    }
    await this.settingsStore.delete(id);
  }

  async getActiveDataPoints(): Promise<DataPointDefinition[]> {
    const all = await this.settingsStore.getAll();
    return all.filter((d) => !d.archived).sort((a, b) => a.order - b.order);
  }

  async logEntry(definitionId: string, date: string, time: string, rawInput: string): Promise<DataPointEntry> {
    const definition = await this.requireDefinition(definitionId);
    const validated = this.validateOrThrow(definition, rawInput);
    const raw: RawDataPointEntry = {
      id: this.idGenerator(),
      definitionId,
      date,
      time,
      rawValue: String(validated),
    };
    await this.logFile.upsertEntry(raw);
    return this.toDomainEntry(raw, definition);
  }

  /** One-tap occurrence log for a binary data point — no value input needed. */
  async logOccurrence(definitionId: string, date: string, time: string): Promise<DataPointEntry> {
    return this.logEntry(definitionId, date, time, '1');
  }

  async editEntry(
    entryId: string,
    definitionId: string,
    date: string,
    time: string,
    rawInput: string
  ): Promise<DataPointEntry> {
    const definition = await this.requireDefinition(definitionId);
    const validated = this.validateOrThrow(definition, rawInput);
    const raw: RawDataPointEntry = { id: entryId, definitionId, date, time, rawValue: String(validated) };
    await this.logFile.upsertEntry(raw);
    return this.toDomainEntry(raw, definition);
  }

  async deleteEntry(date: string, entryId: string): Promise<void> {
    await this.logFile.deleteEntry(date, entryId);
  }

  async getEntriesForToday(): Promise<Map<string, DataPointEntry[]>> {
    const today = this.today();
    const raw = await this.logFile.readDay(today);
    const definitions = await this.settingsStore.getAll();
    const defsById = new Map(definitions.map((d) => [d.id, d]));

    const grouped = new Map<string, DataPointEntry[]>();
    for (const r of raw) {
      const def = defsById.get(r.definitionId);
      if (!def || def.archived) continue;
      const list = grouped.get(r.definitionId) ?? [];
      list.push(this.toDomainEntry(r, def));
      grouped.set(r.definitionId, list);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => a.time.localeCompare(b.time));
    }
    return grouped;
  }

  async getEntriesInRange(definitionId: string, rangeStart: string, rangeEnd: string): Promise<DataPointEntry[]> {
    const definition = await this.requireDefinition(definitionId);
    const raw = await this.logFile.readRange(rangeStart, rangeEnd);
    return raw
      .filter((r) => r.definitionId === definitionId)
      .map((r) => this.toDomainEntry(r, definition))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }

  async getTrend(definitionId: string, rangeStart: string, rangeEnd: string): Promise<TrendPoint[]> {
    const definition = await this.requireDefinition(definitionId);
    const entries = await this.getEntriesInRange(definitionId, rangeStart, rangeEnd);
    return buildTrendPoints(entries, definition.unit, definition.type);
  }

  private async requireDefinition(id: string): Promise<DataPointDefinition> {
    const definition = await this.settingsStore.get(id);
    if (!definition) throw new Error(`Data point not found: ${id}`);
    return definition;
  }

  private validateOrThrow(definition: DataPointDefinition, rawInput: string): DataPointLogValue {
    const result = validateEntryValue(definition.type, rawInput);
    if (!result.valid) throw new InvalidEntryValueError(result.error);
    return result.value;
  }

  private toDomainEntry(raw: RawDataPointEntry, definition: DataPointDefinition): DataPointEntry {
    const value: DataPointLogValue =
      definition.type === 'number' || definition.type === 'binary' ? Number(raw.rawValue) : raw.rawValue;
    return { id: raw.id, definitionId: raw.definitionId, date: raw.date, time: raw.time, value };
  }
}