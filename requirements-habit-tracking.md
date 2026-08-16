# Requirements — Habit Tracking Module

## Overview
Lets the user define habits — boolean (yes/no) or numeric (with an optional target) — on a flexible schedule, check them off daily, and see streaks, completion rates, and consistency trends. Distinct from Data Point Tracking (see that module's requirements): habits are actions with a schedule and a done/not-done state; data points are freeform measurements with no schedule or pass/fail concept.

## User Stories / Primary Flows
- As a user, I want to create a habit with a name, type, and schedule via a guided wizard, so setup is quick and validated.
- As a user, I want to mark a habit done for today with one tap (boolean) or by entering a number (numeric), so daily logging is fast.
- As a user, I want to see my current and longest streak, and a visual history of completions, so I can track consistency over time.
- As a user, I want trend visibility to be optional per habit, so my dashboard isn't cluttered by habits I don't care to chart.

## Functional Requirements (EARS)

### Creation & Definition
- REQ-H001: The system shall allow the user to create a habit with: name, emoji/icon, color, type (boolean or numeric), and schedule.
- REQ-H002: For numeric habits, the system shall allow an optional target value and unit (e.g. "8 glasses", "8000 steps").
- REQ-H003: The system shall support three schedule modes: every day, specific weekdays (multi-select), and "X times per week" (a numeric weekly quota).
- REQ-H004: The plugin shall provide a guided, multi-step creation wizard (name/look → type → schedule → review) with per-step validation and a final review step before committing.
- REQ-H005: The plugin shall provide at least two entry points to the habit creation wizard: a dashboard action and a settings-tab action.

### Daily Check-In
- REQ-H006: When the user marks a boolean habit complete for today, the system shall record the completion with a single action requiring no additional input.
- REQ-H007: When the user logs a value for a numeric habit for today, the system shall accept a number input, showing the habit's target/unit as a placeholder or hint, and record it.
- REQ-H008: Once a habit is logged for today, the system shall visually distinguish it as done (e.g. moved out of a pending list) and shall provide a way to edit today's value.

### Streaks & History
- REQ-H009: The system shall calculate current streak and longest streak per habit based on that habit's own schedule rule — a day the habit was not scheduled shall not break its streak.
- REQ-H010: If the user misses a habit's required frequency for a scheduling period, then the system shall reset the current streak to zero while preserving the historical completion record.
- REQ-H011: The system shall calculate a completion rate (percentage of scheduled occurrences completed) over a selectable time range.
- REQ-H012: The system shall provide a visual history of completions (calendar/heatmap style) for a given habit over a selectable time range, visually distinguishing scheduled-and-done, scheduled-and-missed, and not-scheduled days.
- REQ-H013: The system shall allow the user to independently show or hide the trend visualization for each habit.

### Editing & Lifecycle
- REQ-H014: The system shall allow the user to edit an existing habit's name, icon, color, type, target/unit, and schedule.
- REQ-H015: If the user attempts to delete a habit that has existing completion history, then the system shall require explicit confirmation before deleting.
- REQ-H016: The system shall allow the user to archive a habit (removed from active daily tracking, hidden from the pending list) without deleting its historical data, as an alternative to deletion.

## Non-Functional Requirements
- Performance, security, and platform requirements follow PROJECT_PRINCIPLES.md; no habit-specific additions identified.

## Non-Goals
- This module will NOT include due dates, reminders, or notifications for habits — that is task/time management, out of scope for the whole project.
- This module will NOT support habit dependencies or habit "chains" in this phase (not requested).

## Edge Cases & Error Handling
- A weekday-schedule habit's picker, and all streak/completion-rate math, shall respect the shared "week starts on" setting (see Money Management / cross-cutting settings) rather than hardcoding Sunday as the first day.
- A habit created mid-week or mid-month: days before its creation date are not counted as missed.
- **Flagged — needs your confirmation:** for a numeric habit with a target, does logging a value *below* target still count as "done" for streak purposes (target is informational only), or does the streak require meeting the target? The prior implementation's behavior on this wasn't fully clear from the inventory doc.

## Acceptance Criteria
- [ ] User can complete the 4-step wizard and create both a boolean and a numeric habit.
- [ ] Marking a habit done updates its streak and moves it out of the pending list, verified for both habit types.
- [ ] Missing a scheduled day resets current streak to 0 while longest streak and history remain intact.
- [ ] The per-habit trend-visibility toggle shows/hides only that habit's chart, without affecting others.
- [ ] Deleting a habit with history requires confirmation; deleting one with no history does not.

## Approval
- [ ] Approved by user on <date>
