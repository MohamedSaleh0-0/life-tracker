import { Plugin } from 'obsidian';
import { nanoid } from 'nanoid';
import { ObsidianSettingsAdapter } from './src/modules/habit-tracking/infrastructure/obsidianSettingsAdapter';
import { ObsidianVaultAdapter } from './src/modules/habit-tracking/infrastructure/obsidianVaultAdapter';
import { HabitSettingsStore } from './src/modules/habit-tracking/infrastructure/habitSettingsStore';
import { HabitLogFile } from './src/modules/habit-tracking/infrastructure/habitLogFile';
import { HabitService } from './src/modules/habit-tracking/application/habitService';
import { HabitSettingsTab } from './src/modules/habit-tracking/ui/HabitSettingsTab';
import { HabitWizardModal } from './src/modules/habit-tracking/ui/HabitWizardModal';
import { WeekStartsOn } from './src/modules/habit-tracking/domain/types';

// Composition root (see PROJECT_PRINCIPLES.md §Conventions).
//
// Status: Habit Tracking's domain, infrastructure, and application
// layers (TASK-001 through TASK-015) are implemented and unit tested.
// The UI layer (TASK-016-022) is written but NOT build-verified —
// this sandbox has no access to the `obsidian`, `react`, or `nanoid`
// packages, so this file compiles only after `npm install` in a real
// environment. There is also no Today view / dashboard yet (that's
// part of the not-yet-designed cross-cutting shell), so the only
// entry points wired up here are the settings tab and a command —
// REQ-H005 asks for "at least two," and a command is a reasonable
// stand-in for the eventual dashboard action until that shell exists.
//
// KNOWN GAP, flagged rather than silently worked around: "week starts
// on" (REQ-C017) belongs to that same not-yet-built cross-cutting
// shell. WEEK_STARTS_ON_PLACEHOLDER below is a hardcoded stand-in —
// replace every reference to it with the real setting once the shell
// exists, per tasks-habit-tracking.md's Notes section.
const WEEK_STARTS_ON_PLACEHOLDER: WeekStartsOn = 'monday';

export default class LifeTrackerPlugin extends Plugin {
  habitService!: HabitService;

  async onload(): Promise<void> {
    const settingsAdapter = new ObsidianSettingsAdapter(this);
    const vaultAdapter = new ObsidianVaultAdapter(this.app);

    const habitSettingsStore = new HabitSettingsStore(settingsAdapter);
    const habitLogFile = new HabitLogFile(vaultAdapter);

    this.habitService = new HabitService({
      settingsStore: habitSettingsStore,
      logFile: habitLogFile,
      idGenerator: () => nanoid(6),
    });

    this.addSettingTab(
      new HabitSettingsTab(this.app, this, this.habitService, WEEK_STARTS_ON_PLACEHOLDER)
    );

    this.addCommand({
      id: 'life-tracker-new-habit',
      name: 'New habit',
      callback: () => {
        new HabitWizardModal(this.app, this.habitService, WEEK_STARTS_ON_PLACEHOLDER).open();
      },
    });

    // TODO(TASK-remaining / cross-cutting shell): register the Today
    // view and per-module views once that shell is designed. Until
    // then, the settings tab and command above are the only ways to
    // reach the habit wizard, and there's no dashboard to show
    // HabitDashboardList/HabitDetailView in yet.
  }

  onunload(): void {
    // Nothing to tear down yet — no registered views or long-lived
    // listeners exist until the cross-cutting shell adds them.
  }
}
