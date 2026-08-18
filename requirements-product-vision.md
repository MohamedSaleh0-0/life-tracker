# Requirements — Obsidian Life Tracker (Product Vision)

*Supersedes the first draft of this document. Rewritten after reviewing a detailed prior implementation (vibe-coded, undocumented) and a Lovable-generated UI/IA prototype. REQ IDs restart clean since the prior draft was never approved.*

## Overview
An Obsidian plugin that extends Obsidian beyond personal knowledge management into general life management: habit tracking, personal data-point tracking, and money management (including shopping lists), explicitly excluding task/time management, which Obsidian's existing plugin ecosystem already covers well. Built as a professional, dashboard-grade experience — not constrained to default Obsidian UI conventions — with full functional parity across desktop and mobile.

Target user: an Obsidian power user who wants to consolidate life tracking into their vault instead of juggling separate apps, wants maximal control over which features/charts are visible, and wants data stored as plain, hand-editable, Dataview-queryable, git-diffable markdown rather than a hidden database.

This document covers cross-cutting product-level requirements. Each module (Habit Tracking, Data Point Tracking, Money Management) has its own `requirements.md` under `specs/<module>/`.

## User Stories / Primary Flows
- As a user, I want a single "Today" view summarizing habits, data points, and money at a glance, so I get one daily cockpit.
- As a user, I want dedicated deeper views per module (Habits, Data Points, Finance, Transactions, Shopping Lists, Settings), so I can dig into history and trends without cluttering the daily view.
- As a user, I want to enable/disable whole modules, and individual features/charts within a module, independently, so the plugin matches exactly how I want to use it.
- As a user, I want statistical insights (goal/target progress, streaks and consistency) rather than just raw numbers, so I understand how I'm doing at a glance.
- As a user, I want a consistent "week starts on" setting applied everywhere weekdays matter, so schedules and periods line up with how I actually think about my week.
- As a user on mobile, I want full parity with desktop.

## Functional Requirements (EARS)

### Dashboard & Navigation
- REQ-C001: The plugin shall provide a "Today" view summarizing, for the current day: pending/completed habits, data points logged today (showing entry count where a data point has multiple entries) vs. not yet logged, today's spending, and any recurring finance entries due for review.
- REQ-C002: The plugin shall provide dedicated per-module views (Habits, Data Points, Finance/Transactions, Shopping Lists, Settings), reachable via navigation, separate from the Today view.
- REQ-C003: While viewing Today or a per-module view, the system shall apply a shared period selector (Day/Week/Month/Year/Custom range) to any content in that view that is period-scoped.

### Modularity & Customization
- REQ-C004: The plugin shall allow each module (Habit Tracking, Data Point Tracking, Money Management) to be independently enabled or disabled in settings.
- REQ-C005: When a module is disabled, the system shall hide its views, dashboard widgets, and navigation entry without deleting previously recorded data for that module.
- REQ-C006: The plugin shall allow individual optional features within an enabled module (e.g. satisfaction tracking, a specific chart type, a specific dashboard card) to be independently toggled in settings.
- REQ-C007: The system shall apply sensible defaults for every toggleable feature, so the plugin is usable immediately without requiring settings configuration first.

### Cross-Cutting Settings
- REQ-C017: The system shall provide a single "week starts on" setting (Sunday or Monday), defaulting to Monday, applied consistently across all weekday-based scheduling, streak/completion-rate calculations, and period calculations in every module — no module shall hardcode its own first-day-of-week assumption.

### Data Storage (see PROJECT_PRINCIPLES.md for full rationale)
- REQ-C008: The system shall store all module definitions/configuration in the plugin's settings store.
- REQ-C009: The system shall store all logged/time-series data as plain markdown files using Dataview-style inline fields, one entry per line.
- REQ-C010: For habit check-ins and data point entries, the system shall write one markdown line per day containing all items logged that day, keyed by each item's own id.
- REQ-C011: The system shall not depend on native or Node-only database engines unavailable on Obsidian mobile.
- REQ-C012: All "current day" logic shall use one shared local-date function; the system shall not use UTC-based date parsing for this purpose.
- REQ-C013: The system shall not transmit any tracked data to an external service.

### Statistical Insights (cross-cutting framework)
- REQ-C014: For habits and numeric data points with a defined target, the system shall display progress toward that target (e.g. "6/8 glasses", "75% of weekly quota").
- REQ-C015: For habits, the system shall calculate and display streak and consistency insights: current streak, longest streak, and completion rate over a selected period.
- REQ-C016: Where enough historical data exists, the system shall surface best/worst-performing period insights for a habit (e.g. best week, most commonly missed day).

## Non-Functional Requirements
- Platform: Obsidian Desktop and Mobile, full functional parity.
- Data privacy: local-first, no data leaves the device without explicit user-initiated export.
- Extensibility: storage and dashboard shell should accommodate future modules without redesign.
- Performance: no numeric floor specified — see Open Questions.

## Non-Goals
- This product will NOT include task or time management, because Obsidian's existing plugin ecosystem already covers it well.
- This product will NOT include text-based journaling in this phase (explicitly deferred by the user).
- This product will NOT include a possessions/inventory catalog — "tracking" means life metrics/data points, not belongings.
- This product will NOT provide built-in cloud sync.
- This product will NOT send tracked data to external servers or third-party analytics.
- This product will NOT include period-over-period comparison insights (e.g. "this month vs last") or forecasting/projection insights in this phase — explicitly deselected during requirements gathering in favor of goal/target progress and streak/consistency insights. Revisit later if wanted.

## Edge Cases & Error Handling
- A module is disabled with existing data, then later re-enabled: the system shall restore access to all previously recorded data unchanged.
- The internal markdown log file for a module is corrupted or unreadable on load: the system shall fail safely, surface an error to the user, and shall not overwrite the existing file until the user takes explicit action.
- Two logged entries share the exact same timestamp: the system shall store both rather than silently overwriting one.

## Acceptance Criteria
- [ ] The Today view displays accurate summary data for all 3 enabled modules simultaneously.
- [ ] Disabling a module hides its UI; re-enabling it restores all previously recorded data unchanged.
- [ ] At least one feature-level toggle (e.g. satisfaction tracking) demonstrably changes the UI when switched off.
- [ ] Changing "week starts on" demonstrably shifts weekday pickers, streak/completion-rate math, and period boundaries consistently across all modules.
- [ ] All criteria above hold identically on Obsidian desktop and Obsidian mobile.
- [ ] No network requests are made by the plugin at runtime, verified via network monitoring during manual testing.

## Open Questions / Future Work
- Performance targets (dashboard load time, chart render time at realistic data volumes) — not yet defined.
- Exact visual language and component approach — pending a dedicated UI/UX design study in design.md, informed by the Lovable reference prototype.
- Charting library choice (Chart.js vs. Recharts vs. other) — deferred to each module's design.md.
- Whether period-over-period comparison or forecasting insights get added in a later phase.
- Deferred module candidates from earlier discussion (journaling, subscriptions, goals, reading log, relationships) — none in scope now.
- **Multi-currency aggregation (deferred to design.md):** Money Management allows each account its own currency (REQ-M001) but explicitly excludes cross-currency conversion (see that module's Non-Goals). As written, several finance requirements (total balance, net-worth chart, account-balance-share chart) implicitly assume aggregation across accounts, which only cleanly works if those accounts share a currency. This needs a concrete resolution in Money Management's design.md — e.g. restricting aggregate views to a single "primary" currency with other-currency accounts shown separately, or grouping aggregates per-currency instead of blending them — before that part of the dashboard is built.

## Approval
- [ ] Approved by user on <date>
