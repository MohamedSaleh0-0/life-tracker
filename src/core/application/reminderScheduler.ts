// Schedules habit reminders via setTimeout.
// Re-run daily to pick up new reminders or changes.
// See design-habit-tracking.md §Habit Reminders.

import { HabitDefinition, PrayerName } from '../../modules/habit-tracking/domain/types';
import { PrayerTimeService, PrayerLocation } from '../infrastructure/prayerTimeService';
import { getTodayLocal } from '../date';

export interface ReminderSchedulerDeps {
  prayerService: PrayerTimeService;
  notify: (habit: HabitDefinition) => void;
  clock?: () => Date;
  setTimeoutFn?: (cb: () => void, ms: number) => number;
  clearTimeoutFn?: (id: number) => void;
}

function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export class ReminderScheduler {
  private timerIds: number[] = [];
  public lastScheduled: { habitId: string; fireTime: string; delayMs: number }[] = [];
  private prayerService: PrayerTimeService;
  private notify: (habit: HabitDefinition) => void;
  private clock: () => Date;
  private setTimeoutFn: (cb: () => void, ms: number) => number;
  private clearTimeoutFn: (id: number) => void;

  constructor(deps: ReminderSchedulerDeps) {
    this.prayerService = deps.prayerService;
    this.notify = deps.notify;
    this.clock = deps.clock ?? (() => new Date());
    this.setTimeoutFn =
      deps.setTimeoutFn ?? ((cb, ms) => window.setTimeout(cb, ms) as unknown as number);
    this.clearTimeoutFn = deps.clearTimeoutFn ?? ((id) => window.clearTimeout(id));
  }

  clear(): void {
    for (const id of this.timerIds) this.clearTimeoutFn(id);
    this.timerIds = [];
  }

  private today(): string {
    return getTodayLocal(this.clock);
  }

  private msUntil(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    const target = new Date(this.clock());
    target.setHours(h, m, 0, 0);
    return target.getTime() - this.clock().getTime();
  }

  async scheduleAll(habits: HabitDefinition[], prayerLocation: PrayerLocation | null): Promise<void> {
    this.clear();
    this.lastScheduled = [];
    const today = this.today();

    for (const habit of habits) {
      if (habit.archived || !habit.reminder?.enabled) continue;

      let fireTime: string | null = null;
      if (habit.reminder.mode === 'fixed') {
        fireTime = habit.reminder.time;
      } else if (prayerLocation) {
        try {
          const times = await this.prayerService.getTimesForDate(today, prayerLocation);
          fireTime = addMinutesToHHMM(times[habit.reminder.prayer as PrayerName], habit.reminder.offsetMinutes);
        } catch {
          continue;
        }
      } else {
        continue;
      }

      const delayMs = this.msUntil(fireTime);
      if (delayMs <= 0) continue;

      this.lastScheduled.push({ habitId: habit.id, fireTime, delayMs });
      this.timerIds.push(this.setTimeoutFn(() => this.notify(habit), delayMs));
    }
  }
}
