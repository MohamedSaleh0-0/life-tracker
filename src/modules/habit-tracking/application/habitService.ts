// Orchestrates the domain layer and infrastructure layer into the
// operations the UI layer calls. No direct file I/O of its own.

import { HabitDefinition, HabitSchedule, HabitTarget, WeekStartsOn, HabitHistoryResult, HabitLogValue, DayClassification } from '../domain/types';
import { isScheduledOn, classifyDay } from '../domain/scheduleEvaluator';
import { calculateHabitStats, LoggedDaysLookup } from '../domain/streakCalculator';
import { meetsCompletion } from '../domain/completion';
import { HabitSettingsStore } from '../infrastructure/habitSettingsStore';
import { HabitLogFile } from '../infrastructure/habitLogFile';
import { getTodayLocal, addDaysLocal } from '../../../core/date';

export interface NewHabitInput {
  type: HabitDefinition['type'];
  name: string;
  icon: string;
  color: string;
  schedule: HabitSchedule;
  target?: HabitTarget;
}

export interface CompletedHabitEntry {
  habit: HabitDefinition;
  value: HabitLogValue;
}

export class DeleteRequiresConfirmationError extends Error {
  constructor(public readonly habitId: string) {
    super(`Habit ${habitId} has existing history; deletion requires confirmation.`);
    this.name = 'DeleteRequiresConfirmationError';
  }
}

export interface HabitServiceDeps {
  settingsStore: HabitSettingsStore;
  logFile: HabitLogFile;
  idGenerator: () => string;
  clock?: () => Date;
}

export class HabitService {
  private settingsStore: HabitSettingsStore;
  private logFile: HabitLogFile;
  private idGenerator: () => string;
  private clock: () => Date;

  constructor(deps: HabitServiceDeps) {
    this.settingsStore = deps.settingsStore;
    this.logFile = deps.logFile;
    this.idGenerator = deps.idGenerator;
    this.clock = deps.clock ?? (() => new Date());
  }

  private today(): string {
    return getTodayLocal(this.clock);
  }

  async createHabit(input: NewHabitInput): Promise<HabitDefinition> {
    const existing = await this.settingsStore.getAll();
    const habit: HabitDefinition = {
      id: this.idGenerator(),
      type: input.type,
      name: input.name,
      icon: input.icon,
      color: input.color,
      schedule: input.schedule,
      target: input.target,
      trendVisible: true,
      archived: false,
      createdAt: this.today(),
      order: existing.length,
    };
    return this.settingsStore.create(habit);
  }

  async updateHabit(id: string, patch: Partial<HabitDefinition>): Promise<HabitDefinition> {
    return this.settingsStore.update(id, patch);
  }

  async archiveHabit(id: string): Promise<void> {
    await this.settingsStore.update(id, { archived: true });
  }

  async deleteHabit(id: string, confirmed = false): Promise<void> {
    const hasHistory = await this.logFile.hasAnyLogEntry(id);
    if (hasHistory && !confirmed) {
      throw new DeleteRequiresConfirmationError(id);
    }
    await this.settingsStore.delete(id);
  }

  async logHabit(id: string, date: string, value: HabitLogValue): Promise<void> {
    await this.logFile.writeField(date, id, value);
  }

  async editTodayLog(id: string, value: HabitLogValue): Promise<void> {
    await this.logHabit(id, this.today(), value);
  }

  /** Today's raw logged values, keyed by habit id — lets the dashboard show in-progress numeric values (e.g. "3/8 cups") for a habit that's logged but not yet at target, since REQ now gates "completed" on reaching target rather than on any log existing. */
  async getTodayLog(): Promise<Map<string, HabitLogValue>> {
    return this.logFile.readDay(this.today());
  }

  async getPendingForToday(): Promise<HabitDefinition[]> {
    const today = this.today();
    const habits = await this.settingsStore.getAll();
    const todaysLog = await this.logFile.readDay(today);

    // Pending now means "not yet meeting completion" rather than
    // "nothing logged" — a numeric habit with a target stays pending
    // (with its partial progress visible) until the value reaches
    // target, per the resolved completion rule (see domain/completion.ts).
    return habits.filter(
      (h) => !h.archived && isScheduledOn(h, today) && !meetsCompletion(h, todaysLog.get(h.id))
    );
  }

  async getCompletedForToday(): Promise<CompletedHabitEntry[]> {
    const today = this.today();
    const habits = await this.settingsStore.getAll();
    const todaysLog = await this.logFile.readDay(today);

    const completed: CompletedHabitEntry[] = [];
    for (const habit of habits) {
      if (habit.archived) continue;
      if (!isScheduledOn(habit, today)) continue;
      const value = todaysLog.get(habit.id);
      if (meetsCompletion(habit, value)) completed.push({ habit, value: value as HabitLogValue });
    }
    return completed;
  }

  async getHabitHistory(
    id: string,
    rangeStart: string,
    weekStartsOn: WeekStartsOn
  ): Promise<HabitHistoryResult> {
    const habit = await this.settingsStore.get(id);
    if (!habit) throw new Error(`Habit not found: ${id}`);

    const today = this.today();
    const logged = await this.logFile.readRange(habit.createdAt, today);

    const lookup: LoggedDaysLookup = {
      getValue: (date: string) => logged.get(date)?.get(id),
    };

    const stats = calculateHabitStats(habit, lookup, today, rangeStart, weekStartsOn);

    const days: DayClassification[] = [];
    let cursor = rangeStart;
    while (cursor <= today) {
      const value = lookup.getValue(cursor);
      const done = meetsCompletion(habit, value);
      // Carry the raw logged value alongside the done/missed/not-scheduled
      // classification — a numeric habit's magnitude (for the heatmap
      // spectrum and trend chart) is independent of whether it happened
      // to meet the completion target that day.
      days.push({ date: cursor, status: classifyDay(habit, cursor, done), value });
      cursor = addDaysLocal(cursor, 1);
    }

    return { ...stats, days };
  }
}
