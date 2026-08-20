// A minimal, Obsidian-shaped port for the file operations this module
// needs. Keeping this as our own interface — rather than importing
// Obsidian's App/Vault/TFile types directly into habitLogFile.ts — means
// the parsing/serialization logic can be unit-tested against a fake
// implementation, with no dependency on the Obsidian runtime. The real
// implementation (obsidianVaultAdapter.ts) is a thin wrapper with almost
// no logic of its own, so the risk of it diverging from this contract
// is low.
//
// Flagging: this port/adapter split isn't spelled out in
// design-habit-tracking.md's Interfaces & APIs section — it's an
// implementation-level decision made while writing the code (driven by
// wanting this layer to actually be testable in a sandbox with no
// package-registry access), worth a sanity check against the design.

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
