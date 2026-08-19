import { Plugin } from 'obsidian';

// Composition root (see PROJECT_PRINCIPLES.md §Conventions).
//
// Status: the Habit Tracking domain layer (scheduleEvaluator,
// streakCalculator — TASK-002 through TASK-006) is implemented and unit
// tested. The infrastructure, application, and ui layers are not yet
// built (tasks-habit-tracking.md TASK-007 onward), so there is nothing
// to wire into the plugin lifecycle yet. This stub is intentionally
// minimal rather than pretending otherwise.

export default class LifeTrackerPlugin extends Plugin {
  async onload(): Promise<void> {
    // TODO(TASK-007+): load HabitDefinition[] via habitSettingsStore,
    // register the Today view and per-module views, register the
    // settings tab.
  }

  onunload(): void {
    // TODO(TASK-007+): tear down any registered views/listeners once
    // they exist.
  }
}
