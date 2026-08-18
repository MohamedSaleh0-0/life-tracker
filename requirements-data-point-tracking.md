# Requirements — Data Point Tracking Module

*Display label: "Data Point" (renamed from "Metric"/"stuff tracking"). Internal type/storage-key names are not required to match — see PROJECT_PRINCIPLES.md naming convention.*

## Overview
Lets the user log freeform measurements about themselves, one or more times a day, that are neither pass/fail actions (that's Habit Tracking) nor long-form text (journaling is explicitly deferred, out of scope). Examples: weight, sleep duration, wake-up time, a numeric mood/energy rating, or something logged repeatedly through the day like water intake.

## User Stories / Primary Flows
- As a user, I want to define a custom data point with a name and value type, so I can track anything measurable about myself.
- As a user, I want to log one or more values for a data point on a given day, and edit or delete any individual entry, so my daily record stays accurate whether it's a single snapshot or a running tally.
- As a user, I want to see a trend chart for numeric/time data points over a selectable range, so I can spot patterns.
- As a user, I want text-type data points shown as a recent-entries list, since there's nothing numeric to chart.

## Functional Requirements (EARS)

### Creation & Definition
- REQ-D001: The system shall allow the user to define a custom data point with a name, data type (number, time-of-day, or text), and unit (number type only).
- REQ-D002: The plugin shall provide, out of the box, at least three data point templates: weight (number), sleep duration (number), and wake-up time (time-of-day).
- REQ-D003: The plugin shall provide a guided creation wizard (name → data type/unit → review), using the same step-indicator pattern as the habit creation wizard.
- REQ-D004: The plugin shall provide at least two entry points to the data point creation wizard: a dashboard action and a settings-tab action.

### Logging
- REQ-D005: The system shall allow the user to log multiple entries per data point per day; each log action shall create a new timestamped entry rather than overwrite an existing one.
- REQ-D006: When the user logs a value, the system shall present an input matched to the data point's type (number, time, or text) plus a confirm action, and shall record the entry with a timestamp (date and time logged).
- REQ-D007: The system shall display, for each data point, today's logged entries as a list (each showing its value and time logged), with an "Add" action to log another entry and per-entry "Edit"/"Delete" actions.
- REQ-D008: When the user edits or deletes an already-logged entry, the system shall update only that entry's display, not the full view.
- REQ-D009: If the user enters a value that doesn't match the data point's type (e.g. non-numeric text for a number data point), then the system shall reject it with a validation message before saving.

### Trends
- REQ-D010: For number and time-of-day data points, the system shall display a trend chart over a selectable time range; time-of-day values shall be plotted and labeled in `HH:MM` format. On a day with multiple entries, the chart's aggregation behavior is not yet decided — see Open Questions.
- REQ-D011: For text data points, the system shall display a scrollable list of recent entries (date + time + value) instead of a chart.

### Editing & Lifecycle
- REQ-D012: The system shall allow the user to edit or delete individual data point entries after logging.
- REQ-D013: The system shall allow the user to archive a data point without deleting its historical entries, as an alternative to deletion.

## Non-Functional Requirements
- Performance, security, and platform requirements follow PROJECT_PRINCIPLES.md; no data-point-specific additions identified.

## Non-Goals
- This module will NOT include freeform journaling or long-form text entries — deferred, tracked separately as a possible future module.

## Edge Cases & Error Handling
- The user logs a data point multiple times in one day: each logged as a distinct, timestamped entry (REQ-D005), ordered by time.
- A data point is archived with existing history, then later un-archived: historical entries remain intact and visible.
- **Needs a decision (architectural — affects PROJECT_PRINCIPLES.md storage model):** the current storage model specifies one markdown line per day per module, with a single inline-field per item id. That assumed one value per item per day. Multiple entries per day now requires either (a) an array-style value under one inline field, (b) multiple suffixed inline-field keys per entry (e.g. `id-1`, `id-2`, each with its own time), or (c) another schema change. This should be resolved as part of the storage-format design before implementation, and PROJECT_PRINCIPLES.md's Storage Model section should be updated to match once decided.

## Acceptance Criteria
- [ ] User can create a number, a time-of-day, and a text data point via the wizard.
- [ ] User can log multiple entries for the same data point on the same day, each appearing as its own timestamped entry.
- [ ] Number and time data points show a trend chart across at least 3 selectable ranges; text data points show a recent-entries list instead.
- [ ] Editing or deleting a logged entry updates only that entry, not the whole view.

## Open Questions
- **Storage format for multi-entry days:** see Edge Cases above — needs a decision before this module's design.md, and a corresponding update to PROJECT_PRINCIPLES.md.
- **Trend chart aggregation for multi-entry days:** on a day with multiple entries for one data point, should the trend chart plot (a) every individual entry as its own point, (b) a daily aggregate (mean/sum/min/max, possibly configurable per data point), or (c) both, toggle-able? This affects REQ-D010 and needs your steer.

## Approval
- [ ] Approved by user on <date>
