// Orchestrates the domain layer (scheduleEvaluator, streakCalculator)
// and infrastructure layer (habitSettingsStore, habitLogFile) into the
// operations the UI layer calls. No direct file I/O of its own.
// See design-habit-tracking.md §Interfaces & APIs, §Key Flows.

import { HabitDefinition, HabitSchedule, HabitTarget, WeekStartsOn, HabitHistoryResult, HabitLogValue, DayClassification } from '../domain/types';
import { isScheduledOn, classifyDay } from '../domain/scheduleEvaluator';
import { calculateHabitStats, LoggedDaysLookup } from '../domain/streakCalculator';
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

/**
 * Thrown by deleteHabit when the habit has existing logged history and
 * the caller didn't pass confirmed: true (REQ-H015). The UI layer
 * catches this to show the confirmation dialog, then re-calls with
 * confirmed: true once the user agrees.
 */
export class DeleteRequiresConfirmationError extends Error {
  constructor(public readonly habitId: string) {
    super(`Habit ${habitId} has existing history; deletion requires confirmation.`);
    this.name = 'DeleteRequiresConfirmationError';
  }
}

export interface HabitServiceDeps {
  settingsStore: HabitSettingsStore;
  logFile: HabitLogFile;
  /**
   * Required, not defaulted here on purpose: production wiring (the
   * composition root, main.ts) supplies `() => nanoid(6)` per
   * design.md §Technology Choices. Not defaulting it inside this class
   * means there's no risk of a weak fallback ID scheme accidentally
   * shipping if the composition root forgets to wire one in.
   */
  idGenerator: () => string;
  /** Injectable clock so tests don't depend on wall-clock time; defaults to the real Date. */
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

  /**
   * Deletes a habit. Never rewrites historical log lines — the habit's
   * bracketed field simply becomes orphaned data the plugin ignores
   * from then on (design.md §Alternatives Considered).
   */
  async deleteHabit(id: string, confirmed = false): Promise<void> {
    const hasHistory = await this.logFile.hasAnyLogEntry(id);
    if (hasHistory && !confirmed) {
      throw new DeleteRequiresConfirmationError(id);
    }
    await this.settingsStore.delete(id);
  }

  /**
   * Logs a value for a specific date. No target-comparison gate — any
   * successfully validated value marks the habit done for that day
   * (resolved Edge Case: target is informational/progress-display only).
   */
  async logHabit(id: string, date: string, value: HabitLogValue): Promise<void> {
    await this.logFile.writeField(date, id, value);
  }

  /** Logs (or overwrites) today's value — REQ-H006/H007 and the edit path in REQ-H008. */
  async editTodayLog(id: string, value: HabitLogValue): Promise<void> {
    await this.logHabit(id, this.today(), value);
  }

  /** Non-archived habits scheduled today that haven't been logged yet. */
  async getPendingForToday(): Promise<HabitDefinition[]> {
    const today = this.today();
    const habits = await this.settingsStore.getAll();
    const todaysLog = await this.logFile.readDay(today);

    return habits.filter((h) => !h.archived && isScheduledOn(h, today) && !todaysLog.has(h.id));
  }

  /** Non-archived habits scheduled today that have already been logged, with today's value. */
  async getCompletedForToday(): Promise<CompletedHabitEntry[]> {
    const today = this.today();
    const habits = await this.settingsStore.getAll();
    const todaysLog = await this.logFile.readDay(today);

    const completed: CompletedHabitEntry[] = [];
    for (const habit of habits) {
      if (habit.archived) continue;
      if (!isScheduledOn(habit, today)) continue;
      const value = todaysLog.get(habit.id);
      if (value !== undefined) completed.push({ habit, value });
    }
    return completed;
  }

  /**
   * Streak, longest streak, completion rate (over rangeStart..today), and
   * a day-by-day classification of that same range for the heatmap
   * (REQ-H009-H012).
   */
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
      isLoggedOn: (date: string) => logged.get(date)?.has(id) ?? false,
    };

    const stats = calculateHabitStats(habit, lookup, today, rangeStart, weekStartsOn);

    const days: DayClassification[] = [];
    let cursor = rangeStart;
    while (cursor <= today) {
      days.push({ date: cursor, status: classifyDay(habit, cursor, lookup.isLoggedOn(cursor)) });
      cursor = addDaysLocal(cursor, 1);
    }

    return { ...stats, days };
  }
}
