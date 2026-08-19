# Design — Habit Tracking Module

*Technical design only. Visual/component language (colors, exact wizard styling, whether to draw on the Lovable prototype's shadcn-style patterns) is out of scope here — deferred to the separate UI/UX design study called out in PROJECT_PRINCIPLES.md. This document covers architecture, data, and behavior: what the module does under the hood, not what it looks like.*

## Architecture Overview

Follows PROJECT_PRINCIPLES.md's layered convention, scoped to `src/modules/habit-tracking/`:

```
ui/                    React views, modals, settings tab
  ├─ HabitWizardModal.tsx       (create/edit, REQ-H004/H005/H014)
  ├─ HabitDashboardList.tsx     (pending/completed split, REQ-H006-H008)
  ├─ HabitDetailView.tsx        (streaks, heatmap, trend, REQ-H009-H013)
  └─ HabitSettingsTab.tsx       (wizard entry point, REQ-H005)
        │
application/           orchestration, no direct file I/O
  └─ habitService.ts   createHabit, updateHabit, archiveHabit, deleteHabit,
                        logHabit, editTodayLog, getPendingForToday,
                        getHabitHistory
        │
domain/                pure functions, no I/O, fully unit-testable
  ├─ scheduleEvaluator.ts   isScheduledOn(habit, date, weekStartsOn)
  └─ streakCalculator.ts    currentStreak, longestStreak, completionRate
        │
infrastructure/        Obsidian file I/O
  ├─ habitSettingsStore.ts  HabitDefinition[] CRUD via plugin data.json
  └─ habitLogFile.ts        parse/write yearly markdown log files
        │
shared/ui-kit/         reused across modules
  ├─ StepWizard.tsx         shared step-indicator shell (also used by Data Point wizard, per REQ-D003)
  └─ CalendarHeatmap.tsx    generic day-grid heatmap component
```

Data flows one direction on read (infra → domain → application → ui) and the reverse on write (ui action → application → infra), matching the project's layering. `scheduleEvaluator` and `streakCalculator` never import from `infrastructure` or `ui` — they take plain data in and return plain data out, which is what makes them unit-testable without an Obsidian runtime.

## Data Model

### Settings store (`data.json`, per REQ-C008)

```typescript
interface HabitDefinition {
  id: string;              // stable id, generated once at creation (nanoid, 6 chars)
                            // never reused, even after delete — avoids collisions
                            // with orphaned historical log entries (see Error Handling)
  type: 'boolean' | 'numeric';
  name: string;
  icon: string;             // emoji
  color: string;            // hex or theme token
  schedule: HabitSchedule;
  target?: { value: number; unit: string };  // numeric only, optional (REQ-H002)
  trendVisible: boolean;    // REQ-H013, defaults to true
  archived: boolean;        // REQ-H016, defaults to false
  createdAt: string;        // local date (YYYY-MM-DD) via the shared date fn, REQ-C012
  order: number;            // display order
}

type HabitSchedule =
  | { mode: 'daily' }
  | { mode: 'weekdays'; days: number[] }       // 0-6, Monday-based internally (see note)
  | { mode: 'weeklyQuota'; timesPerWeek: number };
```

**Note on weekday storage vs. REQ-C017 ("week starts on"):** weekday indices are stored in one fixed internal convention (Monday = 0) regardless of the user's "week starts on" setting. That setting only affects *display order* (picker UI) and *week-boundary math* (streak/completion-rate calculations use it to decide where one "week" ends and the next begins) — it's applied at the domain/UI boundary, never baked into stored data. This keeps a later change to the global setting retroactive across all history without a migration.

### Markdown log file (per REQ-C009/C010)

One file per calendar year, in a configurable vault folder (default `Life Tracker/Logs/Habits/`, e.g. `habits-2026.md`) — living in the visible vault, not `.obsidian/`, so Dataview can query it and the user can hand-edit it, per the storage rationale in PROJECT_PRINCIPLES.md.

> **Flagging:** the configurable log-folder-path setting has no REQ ID of its own. I'm including it because PROJECT_PRINCIPLES.md already establishes "don't hardcode a value a reasonable user would want as a preference" as a standing principle, so it falls under that rather than needing new product scope — but flagging per the design-phase rule that anything without a direct REQ ID should be surfaced rather than silently added.

One line per day, one bracketed inline field per logged habit that day, keyed by habit id:

```
- 2026-08-19 [habit-a1b2c3:: true] [habit-d4e5f6:: 8000]
```

- Boolean habits log `true`.
- Numeric habits log the raw number.
- A day with no habits logged simply has no line for that date (not an empty line) — keeps files clean for hand-editing and Dataview queries.
- Editing today's value (REQ-H008) rewrites only that habit's bracketed field on that day's line, leaving every other habit's entry on the same line untouched.

**Why separate log files per module** (habits vs. data points vs. transactions), rather than one shared daily log: different value shapes (data points may hold multiple timestamped entries per day, once that module's open storage question is resolved — habits never do), simpler Dataview queries scoped to one concern, and clean module disable/enable (REQ-C004/C005) without touching other modules' files.

## Interfaces & APIs

No network API (local plugin) — the module boundary is the `habitService` surface:

```typescript
createHabit(input: NewHabitInput): Promise<HabitDefinition>
updateHabit(id: string, patch: Partial<HabitDefinition>): Promise<HabitDefinition>
archiveHabit(id: string): Promise<void>
deleteHabit(id: string): Promise<void>   // throws if history exists and !confirmed

logHabit(id: string, date: LocalDate, value: boolean | number): Promise<void>
editTodayLog(id: string, value: boolean | number): Promise<void>

getPendingForToday(): Promise<HabitDefinition[]>       // scheduled-today, not-yet-logged
getCompletedForToday(): Promise<HabitWithTodayValue[]>
getHabitHistory(id: string, range: DateRange): Promise<{
  currentStreak: number;
  longestStreak: number;
  completionRate: number;          // 0-1, over `range`
  days: DayStatus[];                // for the heatmap: done | missed | not-scheduled
}>
```

## Key Flows

**Create Habit** (REQ-H001, H003, H004, H005): dashboard or settings-tab action opens `HabitWizardModal` → step 1 (name/icon/color, validated non-empty) → step 2 (type; numeric branches to optional target+unit) → step 3 (schedule) → step 4 (review, with edit-back links) → confirm → `habitService.createHabit` generates the id, sets `createdAt` via the shared local-date function, appends to settings → dashboard re-renders the pending list if the habit is scheduled today.

**Daily Check-In** (REQ-H006-H008): dashboard pending list is `getPendingForToday()`, which internally filters all non-archived habits through `scheduleEvaluator.isScheduledOn`. Boolean tap or numeric confirm calls `logHabit`, which writes today's line via `habitLogFile` and moves the habit to the completed section; streak numbers refresh via `getHabitHistory`. Edit reopens the same input pre-filled, and calls `editTodayLog`, which rewrites only that habit's field.

**Streaks & Heatmap** (REQ-H009-H013): `HabitDetailView` calls `getHabitHistory` for the selected range. Internally: `habitLogFile` reads the relevant year file(s) → `scheduleEvaluator` classifies each day as done / missed / not-scheduled → `streakCalculator` walks that classified sequence to compute current streak, longest streak, and completion rate. The heatmap renders the day-by-day classification via `CalendarHeatmap`; the optional trend chart (completion rate over time, only when `trendVisible` is true) renders via Recharts.

**Edit / Archive / Delete** (REQ-H014-H016): edit reopens the wizard shell pre-filled. Archive flips `archived: true` — hidden from the pending list, still readable in an "Archived" view. Delete checks whether any log entries exist for the id; if so, shows a confirmation modal (REQ-H015) before removing the `HabitDefinition`. **Deletion does not rewrite historical markdown log lines** — the habit's bracketed field simply becomes orphaned data the plugin ignores from then on (see Alternatives Considered).

## Technology Choices

- **Recharts** for the optional completion-rate trend chart — React-native and declarative, themes cleanly via CSS variables for Obsidian light/dark parity, no canvas layer to fight with.
- **Custom SVG/React component** for the calendar heatmap, not a charting library — a calendar-day grid with three-state coloring isn't a standard chart type either library models well; a small custom component gives direct control tied to `scheduleEvaluator`'s output.
- **nanoid** for habit ids — short, filename/Dataview-key-safe, works in Obsidian's mobile JS runtime without a Node `crypto` dependency.
- **Yearly log file split** — bounds individual file size and git-diff size as history accumulates over years of daily logging.

## Alternatives Considered

- **Chart.js instead of Recharts** — rejected: canvas-based, less idiomatic in a React codebase, harder to theme dynamically against Obsidian's CSS variables.
- **Single ever-growing log file** instead of yearly split — rejected: parse time and diff size both degrade unboundedly over years of use.
- **Rewriting historical log lines on habit delete** (to strip the deleted habit's field from every past day) — rejected: contradicts the hand-editable, non-destructive storage philosophy in PROJECT_PRINCIPLES.md, and would force a potentially large rewrite/diff on every delete for a purely cosmetic cleanup. An orphaned field is harmless and ignorable.
- **Per-habit "week starts on" override** — rejected: REQ-C017 defines this as one global cross-cutting setting; a per-habit override would contradict "applied consistently."

## Error Handling Strategy

- **Corrupted/unreadable year file** (product-vision Edge Case): `habitLogFile` read wraps parsing in try/catch; a parse failure surfaces a non-blocking error banner rather than throwing during dashboard load, and the module never writes to a file that failed to parse until the user takes explicit action — consistent with "fail safely, don't overwrite."
- **Mid-week/mid-month creation** (habit doc Edge Case): `scheduleEvaluator.isScheduledOn` returns `false` for any date before `habit.createdAt`, so pre-creation days are excluded from streak/completion-rate math without special-casing elsewhere.
- **Week-starts-on affecting weekday math** (REQ-C017): `scheduleEvaluator` and every weekday-based UI picker take `weekStartsOn` as an explicit parameter sourced from the one global setting — never hardcoded.
- **Below-target numeric logging** (resolved Edge Case): `logHabit` has no target-comparison gate; any successfully validated number is accepted and marked done. The target is read separately, purely for progress display.

## Test Strategy

- **Unit tests** (domain layer — non-negotiable per PROJECT_PRINCIPLES.md): `streakCalculator` across all three schedule modes, including a missed-day reset and a not-scheduled day *not* breaking a streak; `scheduleEvaluator.isScheduledOn` across all schedule modes and both `weekStartsOn` values; completion-rate math across multiple selectable ranges.
- **Integration tests**: yearly markdown log file round-trip (write a day, read it back, edit one habit's field without disturbing others on the same line); settings-store CRUD including archive and delete.
- **Manual UI test checklist** (no full e2e, per PROJECT_PRINCIPLES.md):
  - [ ] Complete the wizard end-to-end for a boolean and a numeric habit, on desktop and mobile
  - [ ] Tap-complete a boolean habit; verify it moves out of the pending list and the streak increments
  - [ ] Log, then edit, a numeric habit's value for today; verify only that field updates
  - [ ] View the heatmap for a habit with a mix of done/missed/not-scheduled days; verify visual distinction
  - [ ] Toggle trend visibility off/on for one habit; verify only that habit's chart is affected
  - [ ] Attempt to delete a habit with history; verify the confirmation modal on both cancel and confirm paths
  - [ ] Archive a habit; verify it disappears from the pending list but its history remains viewable
  - [ ] Change "week starts on"; verify weekday picker order and streak/completion-rate boundaries shift consistently

## Traceability

| REQ ID | Design section |
|---|---|
| REQ-H001, H003 | Data Model → `HabitDefinition` / `HabitSchedule` |
| REQ-H002 | Data Model → `target` field |
| REQ-H004, H005 | Key Flows → Create Habit |
| REQ-H006–H008 | Key Flows → Daily Check-In |
| REQ-H009–H012 | Architecture → `domain/`; Key Flows → Streaks & Heatmap |
| REQ-H013 | Data Model → `trendVisible`; Key Flows → Streaks & Heatmap |
| REQ-H014–H016 | Key Flows → Edit / Archive / Delete |
| REQ-C008–C010 | Data Model (settings store + markdown log format) |
| REQ-C012 | Data Model → `createdAt`; used throughout for all date math |
| REQ-C017 | Data Model note on weekday storage; Error Handling |

No design elements here fall outside an existing REQ ID except the log-folder-path setting, flagged above.

## Approval
- [ ] Approved by user on <date>
