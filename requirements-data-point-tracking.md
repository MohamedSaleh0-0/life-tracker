# Requirements — Data Point Tracking Module

*Display label: "Data Point" (renamed from "Metric"/"stuff tracking"). Internal type/storage-key names are not required to match — see PROJECT_PRINCIPLES.md naming convention.*

## Overview
Lets the user log freeform daily measurements about themselves that are neither pass/fail actions (that's Habit Tracking) nor long-form text (journaling is explicitly deferred, out of scope). Examples: weight, sleep duration, wake-up time, a numeric mood/energy rating.

## User Stories / Primary Flows
- As a user, I want to define a custom data point with a name and value type, so I can track anything measurable about myself.
- As a user, I want to log a value for a data point today, or edit it if I already logged one, so my daily record stays accurate.
- As a user, I want to see a trend chart for numeric/time data points over a selectable range, so I can spot patterns.
- As a user, I want text-type data points shown as a recent-entries list, since there's nothing numeric to chart.

## Functional Requirements (EARS)

### Creation & Definition
- REQ-D001: The system shall allow the user to define a custom data point with a name, data type (number, time-of-day, or text), and unit (number type only).
- REQ-D002: The plugin shall provide, out of the box, at least three data point templates: weight (number), sleep duration (number), and wake-up time (time-of-day).
- REQ-D003: The plugin shall provide a guided creation wizard (name → data type/unit → review), using the same step-indicator pattern as the habit creation wizard.
- REQ-D004: The plugin shall provide at least two entry points to the data point creation wizard: a dashboard action and a settings-tab action.

### Logging
- REQ-D005: The system shall allow one value to be logged per data point per day; logging again on the same day shall edit that day's existing entry rather than create an additional one.
- REQ-D006: When the user logs a value, the system shall present an input matched to the data point's type (number, time, or text) plus a confirm action.
- REQ-D007: Once a data point is logged for today, the system shall switch its row to a locked-in display (formatted value, unit if applicable, distinct visual treatment) with an "Edit" action to reopen and change it.
- REQ-D008: When the user edits an already-logged value, the system shall update only that entry's display, not the full view.
- REQ-D009: If the user enters a value that doesn't match the data point's type (e.g. non-numeric text for a number data point), then the system shall reject it with a validation message before saving.

### Trends
- REQ-D010: For number and time-of-day data points, the system shall display a trend chart over a selectable time range; time-of-day values shall be plotted and labeled in `HH:MM` format.
- REQ-D011: For text data points, the system shall display a scrollable list of recent entries (date + value) instead of a chart.

### Editing & Lifecycle
- REQ-D012: The system shall allow the user to edit or delete individual data point entries after logging.
- REQ-D013: The system shall allow the user to archive a data point without deleting its historical entries, as an alternative to deletion.

## Non-Functional Requirements
- Performance, security, and platform requirements follow PROJECT_PRINCIPLES.md; no data-point-specific additions identified.

## Non-Goals
- This module will NOT support multiple entries per data point per day in this phase — one value per day, editable, by design (see Open Questions — this reverses the original product-vision draft, which assumed multiple entries/day).
- This module will NOT include freeform journaling or long-form text entries — deferred, tracked separately as a possible future module.

## Edge Cases & Error Handling
- The user attempts to log a data point a second time in one day: treated as an edit to today's entry (REQ-D005), not a new entry.
- A data point is archived with existing history, then later un-archived: historical entries remain intact and visible.

## Acceptance Criteria
- [ ] User can create a number, a time-of-day, and a text data point via the wizard.
- [ ] Logging a value locks that row visually and offers an edit action.
- [ ] Number and time data points show a trend chart across at least 3 selectable ranges; text data points show a recent-entries list instead.
- [ ] Editing a logged entry updates only that row, not the whole view.
- [ ] A second log attempt on the same day edits the existing entry rather than creating a duplicate.

## Open Questions
- **Needs your confirmation:** the original product-vision draft assumed *multiple* entries per data point per day (e.g. logging water intake several times through the day). The prior implementation instead does *one* value per day with edit-in-place. This doc adopts the one-per-day model since it matches what was actually built — flag if you actually want multiple same-day entries for some or all data points (e.g. a running tally vs. a single daily snapshot).

## Approval
- [ ] Approved by user on <date>
