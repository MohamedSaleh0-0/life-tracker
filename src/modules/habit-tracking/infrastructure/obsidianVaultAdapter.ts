// Re-exported from src/core/adapters/obsidianVaultAdapter.ts — a single
// shared instance is now constructed once in main.ts and passed to
// every module, rather than each module wrapping the Obsidian Vault
// API separately.
export { ObsidianVaultAdapter } from '../../../core/adapters/obsidianVaultAdapter';
