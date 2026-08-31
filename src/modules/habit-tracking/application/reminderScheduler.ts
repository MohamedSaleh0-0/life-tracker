// Computes each enabled reminder's fire time for "today" and schedules
// a Notice (+ best-effort desktop Notification) via setTimeout. Re-run
// once per day (e.g. on plugin load and at midnight) — nothing here
// persists across an Obsidian restart, by design (see design-habit-tracking.md
// §Habit Reminders for limitations).

import { Notice } from 'obsidian';
import { HabitDefinition } from '../domain/types';
import { PrayerTimeService } from '../../../core/infrastructure/prayerTimeService';
import { getTodayLocal } from '../../../core/date';

export class ReminderScheduler {
  private timers: number[] = [];

  constructor(private prayerService: PrayerTimeService) {}

  clear(): void {
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers = [];
  }

  async scheduleAll(
    habits: HabitDefinition[],
    prayerLocation: { lat: number; lon: number; calculationMethod: number } | null
  ): Promise<void> {
    this.clear();
    const today = getTodayLocal();

    for (const habit of habits) {
      if (!habit.reminder?.enabled) continue;

      let fireTime: string | null = null;
      if (habit.reminder.mode === 'fixed') {
        fireTime = habit.reminder.time;
      } else if (prayerLocation) {
        try {
          const times = await this.prayerService.getTimesForToday(
            prayerLocation.lat,
            prayerLocation.lon,
            prayerLocation.calculationMethod,
            today
          );
          fireTime = addMinutesToHHMM(times[habit.reminder.prayer], habit.reminder.offsetMinutes);
        } catch (err) {
          console.error(`Failed to fetch prayer times for habit ${habit.id}:`, err);
          continue;
        }
      }
      if (!fireTime) continue;

      const delay = msUntil(today, fireTime);
      if (delay <= 0) continue; // already passed today

      const id = window.setTimeout(() => {
        new Notice(`⏰ ${habit.icon} ${habit.name}`, 8000);
        // Best-effort desktop notification; silently no-ops elsewhere.
        try {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          new Notification(habit.name, { body: 'Time to log this habit.' });
        } catch {
          /* mobile / unsupported */
        }
      }, delay);
      this.timers.push(id);
    }
  }
}

function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = ((h * 60 + m + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function msUntil(dateStr: string, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const target = new Date(dateStr + 'T00:00:00');
  target.setHours(h, m, 0, 0);
  return target.getTime() - Date.now();
}
