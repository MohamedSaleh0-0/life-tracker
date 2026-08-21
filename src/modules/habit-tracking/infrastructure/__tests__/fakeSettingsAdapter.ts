import { SettingsAdapter } from '../settingsAdapter';

/** Pure in-memory SettingsAdapter for tests — no Obsidian dependency. */
export class FakeSettingsAdapter implements SettingsAdapter {
  private data: Record<string, unknown> | null = null;

  async load(): Promise<Record<string, unknown> | null> {
    // Deep-clone on read/write so tests can't accidentally mutate
    // internal state through a returned reference — matches the
    // real Plugin.loadData()'s JSON round-trip semantics.
    return this.data ? JSON.parse(JSON.stringify(this.data)) : null;
  }

  async save(data: Record<string, unknown>): Promise<void> {
    this.data = JSON.parse(JSON.stringify(data));
  }
}
