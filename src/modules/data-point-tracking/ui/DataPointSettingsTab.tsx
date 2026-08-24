// Settings-tab entry point into the data point creation wizard —
// REQ-D004's second entry point, alongside the dashboard's "+ New data
// point" action (DataPointTrackerView).

import { App, PluginSettingTab, Setting, Plugin } from 'obsidian';
import { DataPointService } from '../application/dataPointService';
import { DataPointWizardModal } from './DataPointWizardModal';

export class DataPointSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private dataPointService: DataPointService
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Data Point Tracking' });

    new Setting(containerEl)
      .setName('Data points')
      .setDesc('Create and manage your custom data points.')
      .addButton((btn) =>
        btn
          .setButtonText('New data point')
          .setCta()
          .onClick(() => {
            new DataPointWizardModal(this.app, this.dataPointService).open();
          })
      );
  }
}
