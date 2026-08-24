// Thin wrapper over Obsidian's Plugin.loadData()/saveData(). One shared
// instance is constructed in main.ts and passed to every module's
// *SettingsStore (they each only touch their own top-level key in the
// shared data.json blob).

import { Plugin } from 'obsidian';
import { SettingsAdapter } from '../ports/settingsAdapter';

export class ObsidianSettingsAdapter implements SettingsAdapter {
  constructor(private plugin: Plugin) {}

  async load(): Promise<Record<string, unknown> | null> {
    return (await this.plugin.loadData()) ?? null;
  }

  async save(data: Record<string, unknown>): Promise<void> {
    await this.plugin.saveData(data);
  }
}
