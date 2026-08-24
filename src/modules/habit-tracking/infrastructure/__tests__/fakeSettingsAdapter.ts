import { SettingsAdapter } from '../settingsAdapter';

export class FakeSettingsAdapter implements SettingsAdapter {
  private data: Record<string, unknown> | null = null;

  async load(): Promise<Record<string, unknown> | null> {
    return this.data ? JSON.parse(JSON.stringify(this.data)) : null;
  }

  async save(data: Record<string, unknown>): Promise<void> {
    this.data = JSON.parse(JSON.stringify(data));
  }
}
