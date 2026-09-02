// Cross-cutting plugin settings (REQ-C017's "week starts on", and any
// future cross-cutting toggle) live under their own top-level key in
// the same settings blob HabitSettingsStore uses for `habits` — same
// data.json, different key.

import { SettingsAdapter } from '../modules/habit-tracking/infrastructure/settingsAdapter';
import { WeekStartsOn } from '../modules/habit-tracking/domain/types';
import { PrayerLocation } from './infrastructure/prayerTimeService';

const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = 'monday';
const DEFAULT_HEATMAP_DIM_THRESHOLD_PERCENT = 50;
const DEFAULT_CALCULATION_METHOD = 2; // ISNA
const DEFAULT_AMOUNT_STEPPER_INCREMENT = 5;
const DEFAULT_HABIT_STEPPER_INCREMENT = 1;
const DEFAULT_RECENT_NAMES_LIMIT = 20;
const DEFAULT_RECENT_TRANSACTIONS_WINDOW_DAYS = 30;
const DEFAULT_TREND_WINDOW_DAYS = 90;
const DEFAULT_CLOCK_SNAP_MINUTES = 5;

interface LifeTrackerData {
  weekStartsOn?: WeekStartsOn;
  habitHeatmapDimThresholdPercent?: number;
  prayerLocation?: PrayerLocation;
  amountStepperIncrement?: number;
  habitStepperIncrement?: number;
  recentNamesLimit?: number;
  recentTransactionsWindowDays?: number;
  trendWindowDays?: number;
  clockSnapMinutes?: number;
  logFolderOverrides?: { habits?: string; dataPoints?: string; money?: string };
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

  async getAmountStepperIncrement(): Promise<number> {
    const d = (await this.adapter.load()) as LifeTrackerData | null;
    return d?.amountStepperIncrement ?? DEFAULT_AMOUNT_STEPPER_INCREMENT;
  }

  async setAmountStepperIncrement(v: number): Promise<void> {
    const d = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    d.amountStepperIncrement = v;
    await this.adapter.save(d);
  }

  async getHabitStepperIncrement(): Promise<number> {
    const d = (await this.adapter.load()) as LifeTrackerData | null;
    return d?.habitStepperIncrement ?? DEFAULT_HABIT_STEPPER_INCREMENT;
  }

  async setHabitStepperIncrement(v: number): Promise<void> {
    const d = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    d.habitStepperIncrement = v;
    await this.adapter.save(d);
  }

  async getRecentNamesLimit(): Promise<number> {
    const d = (await this.adapter.load()) as LifeTrackerData | null;
    return d?.recentNamesLimit ?? DEFAULT_RECENT_NAMES_LIMIT;
  }

  async setRecentNamesLimit(v: number): Promise<void> {
    const d = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    d.recentNamesLimit = v;
    await this.adapter.save(d);
  }

  async getRecentTransactionsWindowDays(): Promise<number> {
    const d = (await this.adapter.load()) as LifeTrackerData | null;
    return d?.recentTransactionsWindowDays ?? DEFAULT_RECENT_TRANSACTIONS_WINDOW_DAYS;
  }

  async setRecentTransactionsWindowDays(v: number): Promise<void> {
    const d = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    d.recentTransactionsWindowDays = v;
    await this.adapter.save(d);
  }

  async getTrendWindowDays(): Promise<number> {
    const d = (await this.adapter.load()) as LifeTrackerData | null;
    return d?.trendWindowDays ?? DEFAULT_TREND_WINDOW_DAYS;
  }

  async setTrendWindowDays(v: number): Promise<void> {
    const d = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    d.trendWindowDays = v;
    await this.adapter.save(d);
  }

  async getClockSnapMinutes(): Promise<number> {
    const d = (await this.adapter.load()) as LifeTrackerData | null;
    return d?.clockSnapMinutes ?? DEFAULT_CLOCK_SNAP_MINUTES;
  }

  async setClockSnapMinutes(v: number): Promise<void> {
    const d = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    d.clockSnapMinutes = v;
    await this.adapter.save(d);
  }

  async getLogFolderOverrides(): Promise<{ habits?: string; dataPoints?: string; money?: string }> {
    const d = (await this.adapter.load()) as LifeTrackerData | null;
    return d?.logFolderOverrides ?? {};
  }

  async setLogFolderOverride(module: 'habits' | 'dataPoints' | 'money', path: string): Promise<void> {
    const d = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    d.logFolderOverrides = { ...(d.logFolderOverrides ?? {}), [module]: path };
    await this.adapter.save(d);
  }
}