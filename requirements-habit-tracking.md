# Requirements — Habit Tracking Module

## Overview
Lets the user define habits — boolean (yes/no) or numeric (with an optional target) — on a flexible schedule, check them off daily, and see streaks, completion rates, and consistency trends. Either type may optionally enable **Elastic Mode**, which replaces the single done/not-done or single-target model with a small two-axis grid of graduated levels (see "Elastic Mode" below), so a habit like "Exercise" can capture *which version* and *how much* was done, not just whether it happened. Distinct from Data Point Tracking (see that module's requirements): habits are actions with a schedule and a done/not-done state; data points are freeform measurements with no schedule or pass/fail concept.

## User Stories / Primary Flows
- As a user, I want to create a habit with a name, type, and schedule via a guided wizard, so setup is quick and validated.
- As a user, I want to mark a habit done for today with one tap (boolean) or by entering a number (numeric), so daily logging is fast.
- As a user, I want to optionally define a habit as "elastic" — with a Version axis and a Value axis, each with its own graduated levels — so effort variations (e.g. home vs. gym, 15/30/45 min) are captured instead of flattened into a single done/not-done.
- As a user, I want to see my current and longest streak, and a visual history of completions, so I can track consistency over time.
- As a user, I want trend visibility to be optional per habit, so my dashboard isn't cluttered by habits I don't care to chart.

## Functional Requirements (EARS)

### Creation & Definition
- REQ-H001: The system shall allow the user to create a habit with: name, emoji/icon, color, type (boolean or numeric), and schedule.
- REQ-H002: For numeric habits not using Elastic Mode, the system shall allow an optional target value and unit (e.g. "8 glasses", "8000 steps").
- REQ-H003: The system shall support three schedule modes: every day, specific weekdays (multi-select), and "X times per week" (a numeric weekly quota).
- REQ-H004: The plugin shall provide a guided, multi-step creation wizard (name/look → type → schedule → review), with an additional grid-definition step inserted when Elastic Mode is enabled, with per-step validation and a final review step before committing.
- REQ-H005: The plugin shall provide at least two entry points to the habit creation wizard: a dashboard action and a settings-tab action.

### Elastic Mode (Optional, per habit)
- REQ-H017: The system shall allow the user to optionally enable "Elastic Mode" on a boolean or numeric habit, at creation or via editing.
- REQ-H018: When Elastic Mode is enabled, the system shall let the user define exactly two independent dimensions — **Version** (e.g. "Home", "Gym") and **Value** (e.g. "15 min", "30 min", "45 min") — forming a grid of up to 9 × 9 levels.
- REQ-H019: Each dimension shall have 1–9 user-defined levels, each with a label. For a Numeric-type elastic habit, Value-dimension levels shall additionally hold a numeric threshold and a shared unit. For a Boolean-type elastic habit, Value-dimension levels shall hold a free-text label only (no numeric threshold).
- REQ-H020: When the user logs an elastic habit for a day, the system shall require selecting exactly one Version level and one Value level together as a single action (one grid cell); a partial selection (only one dimension chosen) shall not be accepted as a complete log.
- REQ-H021: Logging any valid grid cell for a day shall count that habit as "done" for streak purposes for that day, regardless of which cell was chosen — the grid captures richer detail but does not gate streak continuation.
- REQ-H022: The system shall record which cell (Version level + Value level) was logged each day and shall surface it in the habit's history/heatmap (e.g. as a label or varying intensity), so the user can see not just whether they did the habit but at what level.
- REQ-H023: The system shall allow editing today's logged cell for an elastic habit, following the same edit affordance as REQ-H008.
- REQ-H024: The system shall allow editing an elastic habit's grid definition (dimension labels, level labels/values, grid size) via the same edit flow as REQ-H014; edits to level labels/values shall not alter the meaning of already-logged historical cells (see Edge Cases).

### Daily Check-In
- REQ-H006: When the user marks a boolean habit complete for today, the system shall record the completion with a single action requiring no additional input.
- REQ-H007: When the user logs a value for a (non-elastic) numeric habit for today, the system shall accept a number input, showing the habit's target/unit as a placeholder or hint, and record it.
- REQ-H008: Once a habit is logged for today, the system shall visually distinguish it as done (e.g. moved out of a pending list) and shall provide a way to edit today's value.

### Streaks & History
- REQ-H009: The system shall calculate current streak and longest streak per habit based on that habit's own schedule rule — a day the habit was not scheduled shall not break its streak.
- REQ-H010: If the user misses a habit's required frequency for a scheduling period, then the system shall reset the current streak to zero while preserving the historical completion record.
- REQ-H011: The system shall calculate a completion rate (percentage of scheduled occurrences completed) over a selectable time range.
- REQ-H012: The system shall provide a visual history of completions (calendar/heatmap style) for a given habit over a selectable time range, visually distinguishing scheduled-and-done, scheduled-and-missed, and not-scheduled days.
- REQ-H013: The system shall allow the user to independently show or hide the trend visualization for each habit.

### Editing & Lifecycle
- REQ-H014: The system shall allow the user to edit an existing habit's name, icon, color, type, target/unit (or Elastic grid definition), and schedule.
- REQ-H015: If the user attempts to delete a habit that has existing completion history, then the system shall require explicit confirmation before deleting.
- REQ-H016: The system shall allow the user to archive a habit (removed from active daily tracking, hidden from the pending list) without deleting its historical data, as an alternative to deletion.

## Non-Functional Requirements
- Performance, security, and platform requirements follow PROJECT_PRINCIPLES.md; no habit-specific additions identified.

## Non-Goals
- This module will NOT include due dates, reminders, or notifications for habits — that is task/time management, out of scope for the whole project.
- This module will NOT support habit dependencies or habit "chains" in this phase (not requested).
- Elastic Mode will NOT support more than two dimensions or a non-rectangular grid in this phase (not requested).

## Edge Cases & Error Handling
- A weekday-schedule habit's picker, and all streak/completion-rate math, shall respect the shared "week starts on" setting (see Money Management / cross-cutting settings) rather than hardcoding Sunday as the first day.
- A habit created mid-week or mid-month: days before its creation date are not counted as missed.
- **Resolved:** for a (non-elastic) numeric habit with a target, logging any value — including below target — counts as "done" for streak purposes; the target is informational/for progress display only, consistent with Elastic Mode's rule that any logged cell counts as done (REQ-H021). Flag if you'd rather have a stricter "must meet target" mode instead.
- **Needs a decision (deferred to design.md):** if the user shrinks an elastic habit's grid (removes levels/dimensions) after logging history against the old grid, how should already-logged cells that no longer exist in the new grid be displayed? Proposed default: historical logs store a snapshot of the label/value at logging time, independent of the current grid definition, so shrinking the grid never corrupts history — but the exact display treatment for "orphaned" historical cells still needs confirming.

## Acceptance Criteria
- [ ] User can complete the wizard and create a boolean habit, a numeric habit, and an elastic habit (both a boolean-based and a numeric-based elastic habit).
- [ ] Marking a habit done updates its streak and moves it out of the pending list, verified for boolean, numeric, and elastic habits.
- [ ] Logging any grid cell on an elastic habit counts as done regardless of which cell, and the specific cell logged is visible in that habit's history.
- [ ] Missing a scheduled day resets current streak to 0 while longest streak and history remain intact.
- [ ] The per-habit trend-visibility toggle shows/hides only that habit's chart, without affecting others.
- [ ] Deleting a habit with history requires confirmation; deleting one with no history does not.

## Approval
- [ ] Approved by user on <date>
