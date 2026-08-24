// Cross-cutting port for the plugin's settings blob (Obsidian's
// Plugin.loadData()/saveData()), promoted here alongside vaultAdapter.ts
// for the same reason — every module's *SettingsStore needs this, not
// just Habit Tracking's.

export interface SettingsAdapter {
  load(): Promise<Record<string, unknown> | null>;
  save(data: Record<string, unknown>): Promise<void>;
}
