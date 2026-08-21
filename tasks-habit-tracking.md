# Tasks — Habit Tracking Module

Each task references the REQ ID(s) and design section it fulfills. Ordered bottom-up through the layered architecture (domain → infrastructure → application → ui), so each layer is testable before the next is built on top of it. Check off as completed.

## Scaffolding
- [x] TASK-001: Create `src/modules/habit-tracking/` with `domain/`, `application/`, `infrastructure/`, `ui/` subfolders, matching PROJECT_PRINCIPLES.md's layered convention. (design §Architecture Overview)

## Domain (pure logic, no I/O)
- [x] TASK-002: Define core types — `HabitDefinition`, `HabitSchedule`, `DayStatus`. (REQ-H001–H003, design §Data Model) — Verified: compiles clean under `tsc --strict`.
- [x] TASK-003: Implement `scheduleEvaluator.isScheduledOn` across all three schedule modes (daily / weekdays / weeklyQuota), excluding any date before `habit.createdAt`. (REQ-H003, REQ-C017, design §Architecture, §Error Handling) — Verified.
- [x] TASK-004: Unit tests for `scheduleEvaluator` — all 3 modes × both `weekStartsOn` values, plus the pre-creation-date exclusion case. (design §Test Strategy) — **Verified: 13 tests, all passing.**
- [x] TASK-005: Implement `streakCalculator` — `currentStreak`, `longestStreak`, `completionRate`, operating on a day-classification sequence from `scheduleEvaluator`. (REQ-H009–H011, design §Architecture) — Verified.
- [x] TASK-006: Unit tests for `streakCalculator` — missed-day reset, a not-scheduled day *not* breaking a streak, completion rate across multiple selectable ranges. (design §Test Strategy) — **Verified: 8 tests, all passing.**

## Infrastructure (Obsidian file I/O)
- [x] TASK-007: Implement `habitSettingsStore` — CRUD for `HabitDefinition[]`, including archive and delete. (REQ-H014–H016, design §Data Model) — Verified. Split into a `SettingsAdapter` port + `ObsidianSettingsAdapter` implementation (not spelled out in design.md's Interfaces & APIs — flagged, driven by wanting this layer testable without the `obsidian` package).
- [x] TASK-008: Implement `habitLogFile` — read/write yearly markdown log files (`habits-YYYY.md`) in the configurable log folder; parses/emits the `[habit-<id>:: value]` inline-field format; all date handling via `src/core/date.ts`, never UTC parsing. (REQ-C009–C012, design §Data Model, §Interfaces & APIs) — Verified. Same port/adapter split as TASK-007 (`VaultAdapter` + `ObsidianVaultAdapter`).
- [x] TASK-009: Integration tests for `habitLogFile` round-trip and `habitSettingsStore` CRUD, against pure in-memory fake adapters (no `obsidian` dependency). (design §Test Strategy) — **Verified: 9 + 6 = 15 tests, all passing.**
- [x] TASK-010: Error handling for a corrupted/unreadable year file — `HabitLogFileReadError` thrown on read failure, never writes to a file that failed to parse. (design §Error Handling Strategy) — Verified via a dedicated test.

## Application (orchestration)
- [x] TASK-011: Implement `habitService.createHabit` / `updateHabit` — id generation via an **injected** `idGenerator` (production wires `nanoid`), `createdAt` via an injected clock. (REQ-H001–H002, H014, design §Interfaces & APIs) — Verified.
- [x] TASK-012: Implement `habitService.archiveHabit` / `deleteHabit` — delete requires `confirmed: true` when log entries exist; historical log lines left untouched (orphaned field). (REQ-H015–H016, design §Key Flows, §Alternatives Considered) — Verified.
- [x] TASK-013: Implement `habitService.logHabit` / `editTodayLog` — no target-comparison gate. (REQ-H006–H008, resolved below-target Edge Case, design §Key Flows) — Verified.
- [x] TASK-014: Implement `habitService.getPendingForToday` / `getCompletedForToday`. (REQ-H006, design §Key Flows) — Verified.
- [x] TASK-015: Implement `habitService.getHabitHistory` — streak, completion rate, **and day-by-day classification array** for the heatmap. (REQ-H009–H012, design §Key Flows) — Verified. **Correction made:** the first pass of this task only returned streak/rate numbers, missing the `days: DayStatus[]` array design.md's Interfaces & APIs section specified — caught and fixed before building the UI layer on top of it; see `HabitHistoryResult` in domain/types.ts.
- **Verified: 11 + 1 (added during the TASK-015 fix) = 12 tests, all passing. Full suite across TASK-002–015: 48 tests, 0 failures.**

## Shared UI Kit
- [x] TASK-016: Build `StepWizard` shell component (`shared/ui-kit/`) — generic step-indicator + validation-per-step + review pattern, reusable by the Data Point wizard later (REQ-D003). (design §Architecture) — **Written, NOT build-verified** (no `react` package in the implementation environment — see Notes).
- [x] TASK-017: Build `CalendarHeatmap` shared component — day-grid, three-state coloring. Deliberately takes a caller-defined status→color map rather than importing habit-tracking's `DayStatus` type, so it stays usable by other modules without a dependency from `shared/ui-kit` back into a specific module. (design §Technology Choices) — **Written, NOT build-verified.**

## UI
- [x] TASK-018: Build `HabitWizardModal` — 4 steps on top of `StepWizard`, wired to `createHabit`/`updateHabit`. Weekday picker's *display order* rotates per `weekStartsOn` while internal indices stay fixed (REQ-C017's acceptance criterion). (REQ-H001–H005, H014, design §Key Flows) — **Written, NOT build-verified.**
- [x] TASK-019: Build `HabitDashboardList` — pending/completed split, one-tap boolean, numeric quick entry, edit affordance. (REQ-H006–H008, design §Key Flows) — **Written, NOT build-verified.**
- [x] TASK-020: Build `HabitDetailView` — streak numbers, `CalendarHeatmap` (now correctly wired to `getHabitHistory().days`), trend-visibility toggle, plus archive/delete actions (folded TASK-021 in here rather than a separate placement, since design.md didn't specify UI location). (REQ-H009–H013, H015–H016, design §Key Flows) — **Written, NOT build-verified.**
- [x] TASK-021: Delete confirmation dialog (`HabitDeleteConfirmModal`, shown only when `DeleteRequiresConfirmationError` is thrown, i.e. only when history exists) and archive action. (REQ-H015–H016) — **Written, NOT build-verified.**
- [x] TASK-022: Build `HabitSettingsTab` — settings-tab entry point into the wizard. `main.ts` also wires a command-palette entry as the second REQ-H005 entry point, as a stand-in for the eventual dashboard action until the Today view exists. (REQ-H005) — **Written, NOT build-verified.**

## Verification
- [ ] TASK-023: Manual UI test checklist pass, on both Obsidian desktop and mobile. **Not yet run** — requires a real Obsidian install; nothing in this environment can exercise it.
- [ ] TASK-024: `tsc -noEmit -skipLibCheck` and the esbuild config both run clean. **Partially done:** everything not depending on `obsidian`/`react`/`nanoid` (domain + infrastructure ports + application layer) compiles clean under `tsc --strict` in this environment. The UI layer and `main.ts` are untested by the compiler here — run `npm install && npm run build` locally to close this out.

## Notes

- **Environment constraint (applies to this entire task list):** implemented in a sandbox with no package-registry access. Domain, infrastructure, and application layers avoid `obsidian`/`react`/`nanoid` entirely via a **ports-and-adapters split** (`VaultAdapter`/`SettingsAdapter` interfaces + thin `Obsidian*Adapter` implementations, an injectable `idGenerator` and `clock` in `HabitService`) specifically so they could be genuinely compiled and unit tested here rather than just written on faith. This port/adapter split isn't spelled out in design-habit-tracking.md's Interfaces & APIs section — flagging it as an implementation-level architecture decision worth a sanity check, though it's a fairly standard pattern and low-risk. The UI layer has no such option (Obsidian's `Modal`/`Setting`/`PluginSettingTab` and React itself aren't abstractable away without losing the point of using them) — it's written carefully against the verified layers below it, but **run `npm install` and `npm run build`/`npm test` locally before trusting it fully.**
- Tests use Node's built-in test runner (`node:test` + `node:assert/strict`, run via `tsx`) rather than Jest/Vitest — zero added dependency, sufficient for this project's scale. Not explicitly decided in design.md; flagging the choice here.
- **External dependency, still open:** REQ-C017 ("week starts on") belongs to the not-yet-designed cross-cutting shell. `main.ts` currently hardcodes `WEEK_STARTS_ON_PLACEHOLDER = 'monday'` and threads it through the settings tab and wizard command — clearly marked in `main.ts` with a comment. Replace every reference once the shell's real setting exists.
- **No Today view / dashboard yet:** `HabitDashboardList` and `HabitDetailView` are built but not registered anywhere in `main.ts` — there's no Obsidian `ItemView` hosting them yet, since that's part of the cross-cutting shell too. Only the settings tab and a command palette entry are wired up for now.
- The log-folder-path setting flagged in design.md (no REQ ID) is included in TASK-008 as part of `habitLogFile`'s configuration surface.
- **Implementation-level decision not spelled out in design.md:** `weeklyQuota` habits have no single "required" day, so `classifyDay` returns only `done`/`not-scheduled` at the day level (never `missed`) for that mode — whether a *week* met its quota is evaluated separately, at week granularity, inside `streakCalculator`. An in-progress (not yet fully elapsed) week is never counted as missed. Flagging since this is more granular than design.md specified — worth a sanity check.
