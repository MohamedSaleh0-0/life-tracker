// Domain types for the Habit Tracking module.
// Pure data shapes only — no I/O, no Obsidian API, no React.
// See design-habit-tracking.md §Data Model.

export type HabitType = 'boolean' | 'numeric';

export interface HabitTarget {
  value: number;
  unit: string;
}

export type HabitSchedule =
  | { mode: 'daily' }
  | { mode: 'weekdays'; days: number[] }
  | { mode: 'weeklyQuota'; timesPerWeek: number };

export interface HabitDefinition {
  id: string;
  type: HabitType;
  name: string;
  icon: string;
  color: string;
  schedule: HabitSchedule;
  target?: HabitTarget;
  trendVisible: boolean;
  archived: boolean;
  createdAt: string;
  order: number;
}

export type WeekStartsOn = 'monday' | 'saturday' | 'sunday';

export type DayStatus = 'done' | 'missed' | 'not-scheduled';

export interface DayClassification {
  date: string;
  status: DayStatus;
  /**
   * The raw logged value for that day, when one exists (status === 'done').
   * Added so numeric habits can render heatmap intensity / trend charts
   * instead of a flat done/not-done color — a numeric log isn't just 1 or 0.
   */
  value?: HabitLogValue;
}

export interface HabitStats {
  currentStreak: number;
  longestStreak: number;
  completionRate: number;
}

export interface HabitHistoryResult extends HabitStats {
  days: DayClassification[];
}

export type HabitLogValue = boolean | number;
