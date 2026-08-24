// Settings-tab entry point into the habit creation wizard — REQ-H005's
// second entry point, alongside the dashboard action (HabitTrackerView).
// Also hosts the one cross-cutting setting that exists so far —
// "week starts on" (REQ-C017) — until a dedicated cross-cutting
// settings shell is designed for module toggles etc. (REQ-C004/C006).

import { App, PluginSettingTab, Setting, Plugin } from 'obsidian';
import { HabitService } from '../application/habitService';
import { WeekStartsOn } from '../domain/types';
import { HabitWizardModal } from './HabitWizardModal';
import { PluginSettingsStore } from '../../../core/pluginSettingsStore';

export class HabitSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private habitService: HabitService,
    private pluginSettingsStore: PluginSettingsStore,
    /** So an already-open HabitTrackerView / future wizard opens can pick up the change without a reload. */
    private onWeekStartsOnChange: (value: WeekStartsOn) => void
  ) {
    super(app, plugin);
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Life Tracker' });

    const weekStartsOn = await this.pluginSettingsStore.getWeekStartsOn();

    new Setting(containerEl)
      .setName('Week starts on')
      .setDesc(
        'Applied consistently across weekday scheduling, streaks, and period boundaries in every module (REQ-C017).'
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption('monday', 'Monday')
          .addOption('sunday', 'Sunday')
          .setValue(weekStartsOn)
          .onChange(async (value) => {
            const typed = value as WeekStartsOn;
            await this.pluginSettingsStore.setWeekStartsOn(typed);
            this.onWeekStartsOnChange(typed);
          })
      );

    containerEl.createEl('h3', { text: 'Habit Tracking' });

    new Setting(containerEl)
      .setName('Habits')
      .setDesc('Create and manage your tracked habits.')
      .addButton((btn) =>
        btn
          .setButtonText('New habit')
          .setCta()
          .onClick(async () => {
            const current = await this.pluginSettingsStore.getWeekStartsOn();
            new HabitWizardModal(this.app, this.habitService, current).open();
          })
      );

    // TODO(cross-cutting shell): once module-level enable/disable
    // (REQ-C004) and per-feature toggles (REQ-C006, e.g. trend charts
    // on/off globally) are designed, surface them here too rather than
    // only per-habit in HabitDetailView.
  }
}
