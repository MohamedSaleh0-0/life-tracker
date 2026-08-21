// Domain types for the Habit Tracking module.
// Pure data shapes only — no I/O, no Obsidian API, no React.
// See design-habit-tracking.md §Data Model.

export type HabitType = 'boolean' | 'numeric';

export interface HabitTarget {
  value: number;
  unit: string;
}

// Weekday indices use a fixed internal convention (Monday = 0 .. Sunday = 6)
// regardless of the user's "week starts on" setting (REQ-C017). That setting
// only affects display order and week-boundary math — never storage —
// so a later change to it never requires a data migration.
export type HabitSchedule =
  | { mode: 'daily' }
  | { mode: 'weekdays'; days: number[] } // subset of 0-6, Monday=0..Sunday=6
  | { mode: 'weeklyQuota'; timesPerWeek: number };

export interface HabitDefinition {
  id: string; // nanoid, generated once at creation, never reused
  type: HabitType;
  name: string;
  icon: string;
  color: string;
  schedule: HabitSchedule;
  target?: HabitTarget; // numeric only, optional (REQ-H002)
  trendVisible: boolean; // REQ-H013, defaults true
  archived: boolean; // REQ-H016, defaults false
  createdAt: string; // local date YYYY-MM-DD, via the shared date fn (REQ-C012)
  order: number;
}

export type WeekStartsOn = 'monday' | 'sunday';

export type DayStatus = 'done' | 'missed' | 'not-scheduled';

export interface DayClassification {
  date: string; // YYYY-MM-DD
  status: DayStatus;
}

export interface HabitStats {
  currentStreak: number;
  longestStreak: number;
  completionRate: number; // 0-1, over the requested range
}

// Full result of a habit-history query: the streak/rate numbers plus a
// day-by-day classification of the requested range, for the heatmap
// (design-habit-tracking.md §Interfaces & APIs).
export interface HabitHistoryResult extends HabitStats {
  days: DayClassification[];
}

// The value a single day's check-in can hold. Boolean habits log `true`;
// numeric habits log the raw number. Lives in domain/ rather than
// infrastructure/ since it's a value-shape concept, not a file-I/O one —
// the application layer shouldn't have to reach into infrastructure
// just to reference this type.
export type HabitLogValue = boolean | number;
