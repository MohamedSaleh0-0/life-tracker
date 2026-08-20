// Minimal port for reading/writing the plugin's settings blob
// (Obsidian's Plugin.loadData()/saveData()), analogous to VaultAdapter —
// same rationale: testable without the real `obsidian` package.

export interface SettingsAdapter {
  load(): Promise<Record<string, unknown> | null>;
  save(data: Record<string, unknown>): Promise<void>;
}
