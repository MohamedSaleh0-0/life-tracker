// Domain types for the Habit Tracking module.
// Pure data shapes only — no I/O, no Obsidian API, no React.
// See design-habit-tracking.md §Data Model.
//
// Update: a third habit type, 'levels', added alongside boolean and
// numeric. This is a single-dimension, user-defined-discrete-value
// habit — e.g. "Exercise" with levels "Routine A" / "Routine B" /
// "Routine C", or "Morning adhkar" with levels "5-item list" /
// "8-item list" / "10-item list". Neither a plain yes/no nor a
// continuous number fits these: what matters is *which* named option
// was done, not a count. Deliberately simpler than the deferred
// "Elastic Mode" concept from the original habit-tracking spec (which
// was a full 2D Version×Value grid) — this is just its single-axis
// case, since that's the actual complexity level requested. Logging
// ANY level counts as done for streak purposes, same rule as Elastic
// Mode's "any single cell logged" — the point is capturing *which*
// level, not gating completion on reaching a specific one.

export type HabitType = 'boolean' | 'numeric' | 'levels';

export interface HabitTarget {
  value: number;
  unit: string;
}

/** One user-defined discrete level for a 'levels'-type habit, e.g. { id: 'lvl_a', label: 'Routine A', order: 0 }. */
export interface HabitLevel {
  id: string;
  label: string;
  order: number;
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
  target?: HabitTarget; // numeric only
  levels?: HabitLevel[]; // levels only — ordered, at least 2
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
   * For 'levels' habits this is the logged HabitLevel's id (a string).
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

/** boolean for 'boolean' habits, number for 'numeric', a HabitLevel id (string) for 'levels'. */
export type HabitLogValue = boolean | number | string;
