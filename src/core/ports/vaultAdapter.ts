// Cross-cutting port for vault file I/O, promoted here from
// habit-tracking/infrastructure/ once Data Point Tracking needed the
// same interface (Money Management will too). Habit Tracking's own
// vaultAdapter.ts now just re-exports this — no churn to its existing
// imports. Kept as our own interface (not Obsidian's Vault/TFile types
// directly) so parsing/serialization logic in any module's log-file
// class stays unit-testable against a fake, with no Obsidian runtime
// dependency.

export interface VaultFileRef {
  path: string;
}

export interface VaultAdapter {
  fileExists(path: string): Promise<boolean>;
  folderExists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>; // creates or overwrites
  createFolder(path: string): Promise<void>;
  listFilesUnder(folderPath: string): Promise<VaultFileRef[]>;
}
