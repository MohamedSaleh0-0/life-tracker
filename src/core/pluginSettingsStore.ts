// Cross-cutting plugin settings (REQ-C017's "week starts on", and any
// future cross-cutting toggle) live under their own top-level key in
// the same settings blob HabitSettingsStore uses for `habits` — same
// data.json, different key.
//
// Update: added the overall-commitment heatmap's dim threshold
// (habitHeatmapDimThresholdPercent) — the % of a day's scheduled
// habits below which that day renders at the heatmap's dimmest still-
// colored shade (0 done habits stays uncolored/grey regardless).
// Defaults to 50, per the user's ask, and is user-configurable in
// Settings → Habit Tracking.
//
// Update: added prayerLocation for habit reminders (lat/lon +
// calculation method from Aladhan API).

import { SettingsAdapter } from '../modules/habit-tracking/infrastructure/settingsAdapter';
import { WeekStartsOn } from '../modules/habit-tracking/domain/types';
import { PrayerLocation } from './infrastructure/prayerTimeService';

const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = 'monday';
const DEFAULT_HEATMAP_DIM_THRESHOLD_PERCENT = 50;
const DEFAULT_CALCULATION_METHOD = 2; // ISNA

interface LifeTrackerData {
  weekStartsOn?: WeekStartsOn;
  habitHeatmapDimThresholdPercent?: number;
  prayerLocation?: PrayerLocation;
  [key: string]: unknown;
}

export class PluginSettingsStore {
  static readonly DEFAULT_CALCULATION_METHOD = DEFAULT_CALCULATION_METHOD;

  constructor(private adapter: SettingsAdapter) {}

  async getWeekStartsOn(): Promise<WeekStartsOn> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.weekStartsOn ?? DEFAULT_WEEK_STARTS_ON;
  }

  async setWeekStartsOn(value: WeekStartsOn): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.weekStartsOn = value;
    await this.adapter.save(data);
  }

  async getHeatmapDimThresholdPercent(): Promise<number> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.habitHeatmapDimThresholdPercent ?? DEFAULT_HEATMAP_DIM_THRESHOLD_PERCENT;
  }

  async setHeatmapDimThresholdPercent(value: number): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.habitHeatmapDimThresholdPercent = value;
    await this.adapter.save(data);
  }

  async getPrayerLocation(): Promise<PrayerLocation | null> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.prayerLocation ?? null;
  }

  async setPrayerLocation(location: PrayerLocation): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.prayerLocation = location;
    await this.adapter.save(data);
  }
}
