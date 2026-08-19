# Tasks — Habit Tracking Module

Each task references the REQ ID(s) and design section it fulfills. Ordered bottom-up through the layered architecture (domain → infrastructure → application → ui), so each layer is testable before the next is built on top of it. Check off as completed.

## Scaffolding
- [ ] TASK-001: Create `src/modules/habit-tracking/` with `domain/`, `application/`, `infrastructure/`, `ui/` subfolders, matching PROJECT_PRINCIPLES.md's layered convention. (design §Architecture Overview)

## Domain (pure logic, no I/O)
- [ ] TASK-002: Define core types — `HabitDefinition`, `HabitSchedule`, `DayStatus`. (REQ-H001–H003, design §Data Model)
- [ ] TASK-003: Implement `scheduleEvaluator.isScheduledOn(habit, date, weekStartsOn)` across all three schedule modes (daily / weekdays / weeklyQuota), excluding any date before `habit.createdAt`. (REQ-H003, REQ-C017, design §Architecture, §Error Handling)
- [ ] TASK-004: Unit tests for `scheduleEvaluator` — all 3 modes × both `weekStartsOn` values, plus the pre-creation-date exclusion case. (design §Test Strategy)
- [ ] TASK-005: Implement `streakCalculator` — `currentStreak`, `longestStreak`, `completionRate`, operating on a day-classification sequence from `scheduleEvaluator`. (REQ-H009–H011, design §Architecture)
- [ ] TASK-006: Unit tests for `streakCalculator` — missed-day reset, a not-scheduled day *not* breaking a streak, completion rate across multiple selectable ranges. (design §Test Strategy)

## Infrastructure (Obsidian file I/O)
- [ ] TASK-007: Implement `habitSettingsStore` — CRUD for `HabitDefinition[]` against `data.json`, including archive and delete. (REQ-H014–H016, design §Data Model)
- [ ] TASK-008: Implement `habitLogFile` — read/write yearly markdown log files (`habits-YYYY.md`) in the configurable log folder; parse and emit the `[habit-<id>:: value]` inline-field format; all date handling via the shared local-date function, never UTC parsing. (REQ-C009–C012, design §Data Model, §Interfaces & APIs)
- [ ] TASK-009: Integration tests for `habitLogFile` round-trip (write a day, read it back, edit one habit's field without disturbing others on the same line) and `habitSettingsStore` CRUD. (design §Test Strategy)
- [ ] TASK-010: Error handling for a corrupted/unreadable year file — try/catch on parse, non-blocking error banner, no write to a file that failed to parse until the user takes explicit action. (design §Error Handling Strategy)

## Application (orchestration)
- [ ] TASK-011: Implement `habitService.createHabit` / `updateHabit` — id generation via nanoid, `createdAt` via the shared local-date function. (REQ-H001–H002, H014, design §Interfaces & APIs)
- [ ] TASK-012: Implement `habitService.archiveHabit` / `deleteHabit` — delete requires a `confirmed` flag when log entries exist for that habit id; historical log lines are left untouched (orphaned field), not rewritten. (REQ-H015–H016, design §Key Flows, §Alternatives Considered)
- [ ] TASK-013: Implement `habitService.logHabit` / `editTodayLog` — no target-comparison gate; any validated value marks the habit done. (REQ-H006–H008, resolved below-target Edge Case, design §Key Flows)
- [ ] TASK-014: Implement `habitService.getPendingForToday` / `getCompletedForToday`. (REQ-H006, design §Key Flows)
- [ ] TASK-015: Implement `habitService.getHabitHistory` — streak, completion rate, and day-classification array for a given range. (REQ-H009–H012, design §Key Flows)

## Shared UI Kit
- [ ] TASK-016: Build `StepWizard` shell component (`shared/ui-kit/`) — generic step-indicator + validation-per-step + review pattern, reusable by the Data Point wizard later (REQ-D003). (design §Architecture)
- [ ] TASK-017: Build `CalendarHeatmap` shared component — day-grid, three-state coloring (done / missed / not-scheduled). (design §Technology Choices)

## UI
- [ ] TASK-018: Build `HabitWizardModal` — 4 steps (name/look → type → schedule → review) on top of `StepWizard`, wired to `createHabit`/`updateHabit`. (REQ-H001–H005, H014, design §Key Flows)
- [ ] TASK-019: Build `HabitDashboardList` — pending/completed split, one-tap boolean complete, numeric input with target/unit hint, edit affordance on completed items. (REQ-H006–H008, design §Key Flows)
- [ ] TASK-020: Build `HabitDetailView` — streak numbers, `CalendarHeatmap`, optional Recharts completion-rate trend (only when `trendVisible`), trend-visibility toggle. (REQ-H009–H013, design §Key Flows)
- [ ] TASK-021: Build delete confirmation dialog (only when history exists) and archive action. (REQ-H015–H016)
- [ ] TASK-022: Build `HabitSettingsTab` entry point — second entry point into the creation wizard alongside the dashboard action. (REQ-H005)

## Verification
- [ ] TASK-023: Manual UI test checklist pass, on both Obsidian desktop and mobile. (design §Test Strategy)
- [ ] TASK-024: `tsc -noEmit -skipLibCheck` and the esbuild config both run clean. (PROJECT_PRINCIPLES.md Testing Standards)

## Notes

- **External dependency:** REQ-C017 ("week starts on") is a cross-cutting product-level setting, not owned by this module — its storage and settings-UI belong to a not-yet-designed "cross-cutting shell" (Today view, navigation, global settings). TASK-003 and TASK-018/020's weekday pickers take `weekStartsOn` as a parameter per the design, but until the shell exists, wire it to a local constant defaulting to Monday rather than blocking on that module. Revisit this wiring once the cross-cutting shell is designed, so the value comes from the real global setting instead of the placeholder constant.
- The log-folder-path setting flagged in design.md (no REQ ID) is included in TASK-008 as part of `habitLogFile`'s configuration surface.
