import { VaultAdapter, VaultFileRef } from '../vaultAdapter';

export class FakeVaultAdapter implements VaultAdapter {
  private files = new Map<string, string>();
  private folders = new Set<string>();

  async fileExists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async folderExists(path: string): Promise<boolean> {
    return this.folders.has(path);
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`File not found: ${path}`);
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(path);
  }

  async listFilesUnder(folderPath: string): Promise<VaultFileRef[]> {
    return Array.from(this.files.keys())
      .filter((p) => p.startsWith(folderPath))
      .map((path) => ({ path }));
  }
}
