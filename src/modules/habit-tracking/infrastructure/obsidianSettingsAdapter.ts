// Thin wrapper over Obsidian's Plugin.loadData()/saveData(). Not covered
// by tests in this environment (no access to the `obsidian` package
// here) — deliberately thin so there's little logic left to get wrong.

import { Plugin } from 'obsidian';
import { SettingsAdapter } from './settingsAdapter';

export class ObsidianSettingsAdapter implements SettingsAdapter {
  constructor(private plugin: Plugin) {}

  async load(): Promise<Record<string, unknown> | null> {
    return (await this.plugin.loadData()) ?? null;
  }

  async save(data: Record<string, unknown>): Promise<void> {
    await this.plugin.saveData(data);
  }
}
