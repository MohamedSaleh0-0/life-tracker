# Tasks — Habit Tracking Module

Each task references the REQ ID(s) and design section it fulfills. Ordered bottom-up through the layered architecture (domain → infrastructure → application → ui), so each layer is testable before the next is built on top of it. Check off as completed.

## Scaffolding
- [x] TASK-001: Create `src/modules/habit-tracking/` with `domain/`, `application/`, `infrastructure/`, `ui/` subfolders, matching PROJECT_PRINCIPLES.md's layered convention. (design §Architecture Overview)

## Domain (pure logic, no I/O)
- [x] TASK-002: Define core types — `HabitDefinition`, `HabitSchedule`, `DayStatus`. (REQ-H001–H003, design §Data Model)
- [x] TASK-003: Implement `scheduleEvaluator.isScheduledOn(habit, date, weekStartsOn)` across all three schedule modes (daily / weekdays / weeklyQuota), excluding any date before `habit.createdAt`. (REQ-H003, REQ-C017, design §Architecture, §Error Handling)
- [x] TASK-004: Unit tests for `scheduleEvaluator` — all 3 modes × both `weekStartsOn` values, plus the pre-creation-date exclusion case. (design §Test Strategy) — 13 tests, all passing.
- [x] TASK-005: Implement `streakCalculator` — `currentStreak`, `longestStreak`, `completionRate`, operating on a day-classification sequence from `scheduleEvaluator`. (REQ-H009–H011, design §Architecture)
- [x] TASK-006: Unit tests for `streakCalculator` — missed-day reset, a not-scheduled day *not* breaking a streak, completion rate across multiple selectable ranges. (design §Test Strategy) — 8 tests, all passing.

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
- [ ] TASK-024: `tsc -noEmit -skipLibCheck` and the esbuild config both run clean. (PROJECT_PRINCIPLES.md Testing Standards) — domain layer alone verified clean under `tsc --strict`; full-project check pending TASK-007+ since `obsidian`/`react`/`recharts` aren't installed in the environment these tasks were implemented in (see Notes).

## Notes

- **Environment constraint:** TASK-001–006 were implemented and verified in a sandbox with no package-registry access, so only the domain layer (zero external dependencies by design) could be fully installed, compiled, and tested here. Project scaffolding (`package.json`, `tsconfig.json`, `esbuild.config.mjs`, `manifest.json`, `eslint.config.mjs`, a minimal `main.ts` stub) was written to spec but not build-verified end-to-end. Run `npm install` in a real environment and re-run `npm run build` / `npm test` before trusting TASK-024 fully.
- Tests use Node's built-in test runner (`node:test` + `node:assert/strict`, run via `tsx`) rather than Jest/Vitest — zero added dependency, and sufficient for this project's scale. Not explicitly decided in design.md; flagging the choice here since it's a real (if small) technical decision.
- **External dependency:** REQ-C017 ("week starts on") is a cross-cutting product-level setting, not owned by this module — its storage and settings-UI belong to a not-yet-designed "cross-cutting shell" (Today view, navigation, global settings). TASK-003's `isScheduledOn` and `weekBoundsFor` take `weekStartsOn`/rely on fixed weekday indices as designed, but nothing yet supplies the *real* global setting value — TASK-018/020's weekday pickers will need to source it from that shell once built, rather than a hardcoded default. Revisit this wiring once the cross-cutting shell is designed.
- The log-folder-path setting flagged in design.md (no REQ ID) is included in TASK-008 as part of `habitLogFile`'s configuration surface.
- **Implementation-level decision not spelled out in design.md:** `weeklyQuota` habits have no single "required" day, so `classifyDay` returns only `done`/`not-scheduled` at the day level (never `missed`) for that mode — whether a *week* met its quota is evaluated separately, at week granularity, inside `streakCalculator`. An in-progress (not yet fully elapsed) week is never counted as missed, so checking mid-week doesn't prematurely reset the streak. Flagging since this is more granular than design.md specified — worth a sanity check.
