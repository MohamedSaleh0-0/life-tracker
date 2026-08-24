// Cross-cutting plugin settings (REQ-C017's "week starts on", and any
// future cross-cutting toggle) live under their own top-level key in
// the same settings blob HabitSettingsStore uses for `habits` — same
// data.json, different key, consistent with PROJECT_PRINCIPLES.md's
// "definitions/config -> plugin settings" rule.
//
// This is NOT the full cross-cutting settings shell (REQ-C004 module
// enable/disable, REQ-C006 per-feature toggles) — that's still
// undesigned. It's just the one setting that was blocking
// WEEK_STARTS_ON_PLACEHOLDER everywhere. Expand this store (or promote
// it into that shell) when the rest of the cross-cutting settings get
// designed, rather than letting each module invent its own.

import { SettingsAdapter } from '../modules/habit-tracking/infrastructure/settingsAdapter';
import { WeekStartsOn } from '../modules/habit-tracking/domain/types';

const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = 'monday';

interface LifeTrackerData {
  weekStartsOn?: WeekStartsOn;
  [key: string]: unknown;
}

export class PluginSettingsStore {
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
}
