# Tasks — Data Point Tracking Module

Mirrors tasks-habit-tracking.md's structure and layering order.

## Scaffolding
- [x] Promoted VaultAdapter/SettingsAdapter (+ Obsidian implementations) from habit-tracking/infrastructure/ to src/core/ — cross-cutting ports, needed by this module and will be needed by Money Management too. Habit Tracking's own import paths re-export from the new location, zero churn there.
- [x] Resolved requirements-data-point-tracking.md's two Open Questions in design-data-point-tracking.md (storage format for multi-entry days; trend aggregation).

## Domain (pure logic, no I/O)
- [x] `types.ts` — DataPointDefinition, DataPointEntry, TrendPoint, etc.
- [x] `validation.ts` — validateEntryValue per type (REQ-D009). Tested.
- [x] `trendAggregator.ts` — buildTrendPoints, one point per entry (REQ-D010). Tested.

## Infrastructure
- [x] `dataPointSettingsStore.ts` — CRUD for DataPointDefinition[], own `dataPoints` key. Tested.
- [x] `dataPointLogFile.ts` — multi-entry-per-day yearly markdown log, `[dp-<entryId>:: <definitionId>|<time>|<value>]` format (REQ-D005/D006/D008/D012). Tested, including the corrupted-file error path and a text value containing a literal `|`.

## Application
- [x] `dataPointService.ts` — createDataPoint/updateDataPoint/archiveDataPoint/deleteDataPoint (with the same confirm-if-history gate as Habit Tracking), logEntry/editEntry (type-validated), deleteEntry, getActiveDataPoints, getEntriesForToday, getEntriesInRange, getTrend. Tested end-to-end.

## Shared UI Kit
- [x] `ConfirmModal.tsx` — generalized from HabitDeleteConfirmModal so this module (and later Money Management) doesn't need its own bespoke confirm dialog.

## UI
- [x] `DataPointWizardModal.tsx` — 3-step wizard (name → type/unit → review) reusing StepWizard, with 3 built-in templates (REQ-D002/D003).
- [x] `DataPointEntryModal.tsx` — single-entry log/edit form, type-matched input (REQ-D006/D008).
- [x] `DataPointDashboardList.tsx` — all active data points with today's entries, Add/Edit/Delete (REQ-D007).
- [x] `DataPointDetailView.tsx` — Recharts trend line for number/time types; recent-entries list for text type (REQ-D010/D011).
- [x] `DataPointSettingsTab.tsx` — second entry point into the wizard (REQ-D004).
- [x] `DataPointTrackerView.tsx` — ItemView, ribbon icon, commands — same pattern as HabitTrackerView.

## Verification
- [ ] `npm install && npm test` locally (this environment has no network access to actually run it).
- [ ] `npm run build` clean.
- [ ] Manual checklist: create a number/time/text data point (incl. via template); log 2+ entries same day same data point; edit one without disturbing the other; delete one entry; view trend chart (number + time) and text recent-entries list; delete a data point with history (confirm dialog) and without (immediate).

## Notes
- Same environment constraint as Habit Tracking: written and reasoned through carefully, but not compiled here (no `obsidian`/`react`/`recharts`/`nanoid` packages available in this sandbox).
- Cross-cutting settings shell (REQ-C004/C006) still doesn't exist — this module's settings tab is a second, separate PluginSettingTab (Obsidian supports multiple), not merged into one "Life Tracker" settings screen yet.
- Money Management has not been started.
