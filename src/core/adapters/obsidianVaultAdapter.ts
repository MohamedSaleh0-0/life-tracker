// Thin wrapper around Obsidian's Vault API implementing VaultAdapter.
// One shared instance is constructed in main.ts and passed to every
// module's log-file class, rather than each module wrapping Obsidian's
// Vault API separately.

import { App, TFile, normalizePath } from 'obsidian';
import { VaultAdapter, VaultFileRef } from '../ports/vaultAdapter';

export class ObsidianVaultAdapter implements VaultAdapter {
  constructor(private app: App) {}

  async fileExists(path: string): Promise<boolean> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return f instanceof TFile;
  }

  async folderExists(path: string): Promise<boolean> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return f !== null && !(f instanceof TFile);
  }

  async readFile(path: string): Promise<string> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(f instanceof TFile)) throw new Error(`Not a file: ${path}`);
    return this.app.vault.read(f);
  }

  async writeFile(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    const f = this.app.vault.getAbstractFileByPath(normalized);
    if (f instanceof TFile) {
      await this.app.vault.modify(f, content);
    } else {
      await this.app.vault.create(normalized, content);
    }
  }

  async createFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!(await this.folderExists(normalized))) {
      await this.app.vault.createFolder(normalized);
    }
  }

  async listFilesUnder(folderPath: string): Promise<VaultFileRef[]> {
    const normalized = normalizePath(folderPath);
    return this.app.vault
      .getFiles()
      .filter((f) => f.path.startsWith(normalized))
      .map((f) => ({ path: f.path }));
  }
}
