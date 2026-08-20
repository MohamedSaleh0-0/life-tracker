// Settings-tab entry point into the habit creation wizard — REQ-H005's
// second entry point, alongside the dashboard action (which lives in
// HabitDashboardList / wherever the Today view wires its own "+ Habit"
// button; that wiring belongs to the not-yet-built cross-cutting shell).

import { App, PluginSettingTab, Setting, Plugin } from 'obsidian';
import { HabitService } from '../application/habitService';
import { WeekStartsOn } from '../domain/types';
import { HabitWizardModal } from './HabitWizardModal';

export class HabitSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private habitService: HabitService,
    private weekStartsOn: WeekStartsOn
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Habit Tracking' });

    new Setting(containerEl)
      .setName('Habits')
      .setDesc('Create and manage your tracked habits.')
      .addButton((btn) =>
        btn
          .setButtonText('New habit')
          .setCta()
          .onClick(() => {
            new HabitWizardModal(this.app, this.habitService, this.weekStartsOn).open();
          })
      );

    // TODO(cross-cutting shell): once module-level enable/disable
    // (REQ-C004) and per-feature toggles (REQ-C006, e.g. trend charts
    // on/off globally) are designed, surface them here too rather than
    // only per-habit in HabitDetailView.
  }
}
