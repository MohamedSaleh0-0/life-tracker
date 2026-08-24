## core\__tests__\date.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addMonthsLocal, addDaysLocal, toLocalDateString, parseLocalDate } from '../date';

describe('addMonthsLocal', () => {
  test('adds months within the same year', () => {
    assert.equal(addMonthsLocal('2026-01-15', 1), '2026-02-15');
  });

  test('rolls over into the next year', () => {
    assert.equal(addMonthsLocal('2026-12-01', 1), '2027-01-01');
  });

  test('pins to a specific day-of-month when provided', () => {
    assert.equal(addMonthsLocal('2026-01-05', 1, 20), '2026-02-20');
  });

  test('12 months implements "yearly", including across a day-of-month pin', () => {
    assert.equal(addMonthsLocal('2026-03-10', 12, 10), '2027-03-10');
  });
});

describe('addDaysLocal / round-trip sanity (regression guard while touching this file)', () => {
  test('addDaysLocal still works', () => {
    assert.equal(addDaysLocal('2026-08-19', 5), '2026-08-24');
  });
  test('round-trip still works', () => {
    assert.equal(toLocalDateString(parseLocalDate('2026-08-19')), '2026-08-19');
  });
});

```

## core\__tests__\pluginSettingsStore.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PluginSettingsStore } from '../pluginSettingsStore';
import { FakeSettingsAdapter } from '../../modules/habit-tracking/infrastructure/__tests__/fakeSettingsAdapter';

describe('PluginSettingsStore.weekStartsOn', () => {
  test('defaults to monday when nothing has been saved', async () => {
    const store = new PluginSettingsStore(new FakeSettingsAdapter());
    assert.equal(await store.getWeekStartsOn(), 'monday');
  });

  test('round-trips a saved value', async () => {
    const store = new PluginSettingsStore(new FakeSettingsAdapter());
    await store.setWeekStartsOn('sunday');
    assert.equal(await store.getWeekStartsOn(), 'sunday');
  });

  test('does not clobber other keys already present in the settings blob', async () => {
    const adapter = new FakeSettingsAdapter();
    const store = new PluginSettingsStore(adapter);
    await adapter.save({ habits: [{ id: 'h1' }] });

    await store.setWeekStartsOn('sunday');

    const raw = await adapter.load();
    assert.deepEqual(raw?.habits, [{ id: 'h1' }]);
    assert.equal(raw?.weekStartsOn, 'sunday');
  });
});

```

## core\adapters\obsidianSettingsAdapter.ts

```typescript
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

```

## core\adapters\obsidianVaultAdapter.ts

```typescript
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

```

## core\date.ts

```typescript
// The one shared local-date function set (REQ-C012). Every module's
// "what is today" and date-formatting logic must go through this file —
// never UTC-based parsing (`.toISOString()`), which previously caused
// day-rollover bugs for UTC+2/+3 users. See PROJECT_PRINCIPLES.md
// §Storage Model.

/** Formats a Date as a local YYYY-MM-DD string. */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses a YYYY-MM-DD string into a local Date at midnight. */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns today's local date as YYYY-MM-DD. Accepts an injectable clock
 * (defaulting to the real Date) so callers can test against a fixed
 * "today" without depending on wall-clock time.
 */
export function getTodayLocal(now: () => Date = () => new Date()): string {
  return toLocalDateString(now());
}

/** Adds `n` days to a YYYY-MM-DD local date string. */
export function addDaysLocal(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return toLocalDateString(d);
}

/**
 * Adds `n` months to a YYYY-MM-DD local date string, optionally pinning
 * the result to a specific day-of-month (used by Money Management's
 * recurring entries, REQ-M018's monthly/yearly frequency + day-of-month).
 * Relies on JS Date's own month-overflow rollover (e.g. month 13 becomes
 * January of the next year), so this also correctly implements "yearly"
 * as addMonthsLocal(date, 12, dayOfMonth).
 */
export function addMonthsLocal(dateStr: string, n: number, dayOfMonth?: number): string {
  const d = parseLocalDate(dateStr);
  const targetDay = dayOfMonth ?? d.getDate();
  const result = new Date(d.getFullYear(), d.getMonth() + n, targetDay);
  return toLocalDateString(result);
}

```

## core\pluginSettingsStore.ts

```typescript
// Cross-cutting plugin settings (REQ-C017's "week starts on", and any
// future cross-cutting toggle) live under their own top-level key in
// the same settings blob HabitSettingsStore uses for `habits` — same
// data.json, different key, consistent with PROJECT_PRINCIPLES.md's
// "definitions/config -> plugin settings" rule.
//
// This is NOT the full cross-cutting settings shell (REQ-C004 module
// enable/disable, REQ-C006 per-feature toggles) — that's still
// undesigned. It's just the one setting that was blocking
// WEEK_STARTS_ON_PLACEHOLDER everywhere. Expand this store (or promote
// it into that shell) when the rest of the cross-cutting settings get
// designed, rather than letting each module invent its own.

import { SettingsAdapter } from '../modules/habit-tracking/infrastructure/settingsAdapter';
import { WeekStartsOn } from '../modules/habit-tracking/domain/types';

const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = 'monday';

interface LifeTrackerData {
  weekStartsOn?: WeekStartsOn;
  [key: string]: unknown;
}

export class PluginSettingsStore {
  constructor(private adapter: SettingsAdapter) {}

  async getWeekStartsOn(): Promise<WeekStartsOn> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.weekStartsOn ?? DEFAULT_WEEK_STARTS_ON;
  }

  async setWeekStartsOn(value: WeekStartsOn): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.weekStartsOn = value;
    await this.adapter.save(data);
  }
}

```

## core\ports\__tests__\fakeSettingsAdapter.ts

```typescript
import { SettingsAdapter } from '../settingsAdapter';

/** Pure in-memory SettingsAdapter for tests — no Obsidian dependency. Shared across modules. */
export class FakeSettingsAdapter implements SettingsAdapter {
  private data: Record<string, unknown> | null = null;

  async load(): Promise<Record<string, unknown> | null> {
    return this.data ? JSON.parse(JSON.stringify(this.data)) : null;
  }

  async save(data: Record<string, unknown>): Promise<void> {
    this.data = JSON.parse(JSON.stringify(data));
  }
}

```

## core\ports\__tests__\fakeVaultAdapter.ts

```typescript
import { VaultAdapter, VaultFileRef } from '../vaultAdapter';

/** Pure in-memory VaultAdapter for tests — no Obsidian dependency. Shared across modules. */
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

```

## core\ports\settingsAdapter.ts

```typescript
// Cross-cutting port for the plugin's settings blob (Obsidian's
// Plugin.loadData()/saveData()), promoted here alongside vaultAdapter.ts
// for the same reason — every module's *SettingsStore needs this, not
// just Habit Tracking's.

export interface SettingsAdapter {
  load(): Promise<Record<string, unknown> | null>;
  save(data: Record<string, unknown>): Promise<void>;
}

```

## core\ports\vaultAdapter.ts

```typescript
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

```

## core\ui\LifeTrackerSettingsTab.ts

```typescript
// ONE settings tab for the whole plugin, with in-page section
// navigation — replaces the previous approach of registering three
// separate PluginSettingTabs (one per module), which made Obsidian's
// settings sidebar show three indistinguishable "Life Tracker" entries
// with no way to tell them apart (each addSettingTab() call becomes
// its own top-level nav item, and none of them had a name to
// disambiguate). This is the cross-cutting settings shell that's been
// flagged as a to-do since the very first Habit Tracking pass.
//
// Also fixes the "every change scrolls back to the top" complaint:
// every mutation still calls this.display() to redraw (simplest way to
// reflect new state with Obsidian's imperative Setting API), but
// display() now captures containerEl.scrollTop before emptying and
// restores it after rebuilding, so editing something near the bottom
// of a long section doesn't punt you back to the top.

import { App, PluginSettingTab, Plugin, Setting } from 'obsidian';
import { PluginSettingsStore } from '../pluginSettingsStore';
import { WeekStartsOn } from '../../modules/habit-tracking/domain/types';
import { HabitService } from '../../modules/habit-tracking/application/habitService';
import { HabitWizardModal } from '../../modules/habit-tracking/ui/HabitWizardModal';
import { DataPointService } from '../../modules/data-point-tracking/application/dataPointService';
import { DataPointWizardModal } from '../../modules/data-point-tracking/ui/DataPointWizardModal';
import { MoneyService } from '../../modules/money-management/application/moneyService';
import { CategoryKind } from '../../modules/money-management/domain/types';
import { AccountModal } from '../../modules/money-management/ui/AccountModal';
import { CategoryModal } from '../../modules/money-management/ui/CategoryModal';
import { RecurringEntryModal } from '../../modules/money-management/ui/RecurringEntryModal';
import { ConfirmModal } from '../../shared/ui-kit/ConfirmModal';

type Section = 'general' | 'habits' | 'dataPoints' | 'money';

export class LifeTrackerSettingsTab extends PluginSettingTab {
  private activeSection: Section = 'general';

  constructor(
    app: App,
    plugin: Plugin,
    private pluginSettingsStore: PluginSettingsStore,
    private habitService: HabitService,
    private dataPointService: DataPointService,
    private moneyService: MoneyService,
    private onWeekStartsOnChange: (value: WeekStartsOn) => void,
    private getWeekStartsOn: () => WeekStartsOn
  ) {
    super(app, plugin);
  }

  async display(): Promise<void> {
    const previousScrollTop = this.containerEl.scrollTop;
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Life Tracker' });

    const nav = containerEl.createDiv({ cls: 'ltk-settings-nav' });
    this.renderNavButton(nav, 'general', 'General');
    this.renderNavButton(nav, 'habits', 'Habit Tracking');
    this.renderNavButton(nav, 'dataPoints', 'Data Point Tracking');
    this.renderNavButton(nav, 'money', 'Money Management');

    const body = containerEl.createDiv({ cls: 'ltk-settings-body' });

    switch (this.activeSection) {
      case 'general':
        await this.renderGeneralSection(body);
        break;
      case 'habits':
        this.renderHabitsSection(body);
        break;
      case 'dataPoints':
        this.renderDataPointsSection(body);
        break;
      case 'money':
        await this.renderMoneySection(body);
        break;
    }

    this.containerEl.scrollTop = previousScrollTop;
  }

  private renderNavButton(nav: HTMLElement, section: Section, label: string): void {
    const btn = nav.createEl('button', {
      text: label,
      cls: this.activeSection === section ? 'ltk-settings-nav__button is-active' : 'ltk-settings-nav__button',
    });
    btn.addEventListener('click', () => {
      this.activeSection = section;
      this.display();
    });
  }

  // --- General ---

  private async renderGeneralSection(containerEl: HTMLElement): Promise<void> {
    const weekStartsOn = await this.pluginSettingsStore.getWeekStartsOn();
    new Setting(containerEl)
      .setName('Week starts on')
      .setDesc('Applied consistently across weekday scheduling, streaks, and period boundaries in every module (REQ-C017).')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('monday', 'Monday')
          .addOption('saturday', 'Saturday')
          .addOption('sunday', 'Sunday')
          .setValue(weekStartsOn)
          .onChange(async (value) => {
            const typed = value as WeekStartsOn;
            await this.pluginSettingsStore.setWeekStartsOn(typed);
            this.onWeekStartsOnChange(typed);
          })
      );
  }

  // --- Habit Tracking ---

  private renderHabitsSection(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Habits')
      .setDesc('Create and manage your tracked habits.')
      .addButton((btn) =>
        btn
          .setButtonText('New habit')
          .setCta()
          .onClick(() => {
            new HabitWizardModal(this.app, this.habitService, this.getWeekStartsOn()).open();
          })
      );
  }

  // --- Data Point Tracking ---

  private renderDataPointsSection(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Data points')
      .setDesc('Create and manage your custom data points.')
      .addButton((btn) =>
        btn
          .setButtonText('New data point')
          .setCta()
          .onClick(() => {
            new DataPointWizardModal(this.app, this.dataPointService).open();
          })
      );
  }

  // --- Money Management ---

  private async renderMoneySection(containerEl: HTMLElement): Promise<void> {
    await this.renderAccountsSection(containerEl);
    await this.renderCurrencySection(containerEl);
    containerEl.createEl('h3', { text: 'Categories' });
    await this.renderCategorySection(containerEl, 'expense', 'Expense categories');
    await this.renderCategorySection(containerEl, 'income', 'Income categories');
    await this.renderRecurringSection(containerEl);
  }

  private async renderAccountsSection(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl('h3', { text: 'Accounts' });
    const accounts = await this.moneyService.getAccounts();

    for (const account of accounts) {
      new Setting(containerEl)
        .setName(account.name)
        .setDesc(`${account.currency} — opening balance ${account.openingBalance}`)
        .addButton((btn) =>
          btn.setButtonText('Edit').onClick(() => {
            new AccountModal(this.app, this.moneyService, account, () => this.display()).open();
          })
        );
    }

    new Setting(containerEl)
      .setName('Add account')
      .setDesc('REQ-M001: name, currency, opening balance.')
      .addButton((btn) =>
        btn
          .setButtonText('New account')
          .setCta()
          .onClick(() => {
            new AccountModal(this.app, this.moneyService, undefined, () => this.display()).open();
          })
      );
  }

  private async renderCurrencySection(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl('h3', { text: 'Currency conversion' });
    const rates = await this.moneyService.getExchangeRates();
    const knownCurrencies = await this.moneyService.getKnownCurrencies();

    new Setting(containerEl)
      .setName('Primary currency')
      .setDesc('Used for net worth and other aggregate totals across accounts of different currencies.')
      .addText((text) =>
        text.setValue(rates.primaryCurrency).onChange(async (value) => {
          const trimmed = value.trim();
          if (!trimmed) return;
          await this.moneyService.setExchangeRates({ ...rates, primaryCurrency: trimmed });
        })
      );

    const nonPrimaryCurrencies = knownCurrencies.filter((c) => c !== rates.primaryCurrency);

    for (const currency of nonPrimaryCurrencies) {
      new Setting(containerEl)
        .setName(`${currency} → ${rates.primaryCurrency}`)
        .setDesc(
          `How many ${rates.primaryCurrency} is 1 ${currency} worth? Leave blank to exclude ${currency} accounts from aggregate totals.`
        )
        .addText((text) =>
          text
            .setValue(rates.ratesToPrimary[currency] !== undefined ? String(rates.ratesToPrimary[currency]) : '')
            .setPlaceholder('e.g. 0.02')
            .onChange(async (value) => {
              const num = Number(value);
              if (value.trim() === '' || Number.isNaN(num)) return;
              await this.moneyService.setExchangeRates({
                ...rates,
                ratesToPrimary: { ...rates.ratesToPrimary, [currency]: num },
              });
            })
        );
    }

    // Any currency can be used — not restricted to a fixed list, and
    // no longer only derivable from an account that already exists.
    // This lets a rate be configured in advance, before creating the
    // account that will use it.
    let newCurrencyValue = '';
    new Setting(containerEl)
      .setName('Add a currency')
      .setDesc('Configure a rate for a currency ahead of creating an account in it.')
      .addText((text) => {
        text.setPlaceholder('e.g. GBP').onChange((value) => {
          newCurrencyValue = value.trim().toUpperCase();
        });
      })
      .addButton((btn) =>
        btn.setButtonText('Add').onClick(async () => {
          if (!newCurrencyValue || newCurrencyValue === rates.primaryCurrency) return;
          await this.moneyService.setExchangeRates({
            ...rates,
            ratesToPrimary: { ...rates.ratesToPrimary, [newCurrencyValue]: rates.ratesToPrimary[newCurrencyValue] ?? 0 },
          });
          this.display();
        })
      );
  }

  private async renderCategorySection(containerEl: HTMLElement, kind: CategoryKind, title: string): Promise<void> {
    containerEl.createEl('h4', { text: title });
    const tree = await this.moneyService.getCategoryTree(kind);

    for (const node of tree) {
      new Setting(containerEl)
        .setName(node.category.name)
        .addButton((btn) =>
          btn.setButtonText('+ Sub').onClick(() => {
            new CategoryModal(this.app, this.moneyService, kind, node.category.id, () => this.display()).open();
          })
        )
        .addButton((btn) =>
          btn
            .setButtonText('Delete')
            .setWarning()
            .onClick(() => {
              new ConfirmModal(
                this.app,
                `Delete "${node.category.name}"?`,
                'Existing transactions in this category (and its subcategories) will show as Uncategorized rather than being deleted.',
                async () => {
                  await this.moneyService.deleteCategory(node.category.id);
                  this.display();
                }
              ).open();
            })
        );

      for (const child of node.children) {
        new Setting(containerEl).setName(`— ${child.name}`).addButton((btn) =>
          btn
            .setButtonText('Delete')
            .setWarning()
            .onClick(() => {
              new ConfirmModal(
                this.app,
                `Delete "${child.name}"?`,
                'Existing transactions in this category will show as Uncategorized rather than being deleted.',
                async () => {
                  await this.moneyService.deleteCategory(child.id);
                  this.display();
                }
              ).open();
            })
        );
      }
    }

    new Setting(containerEl)
      .setName(`Add ${kind} category`)
      .addButton((btn) =>
        btn.setButtonText('New category').onClick(() => {
          new CategoryModal(this.app, this.moneyService, kind, undefined, () => this.display()).open();
        })
      );
  }

  private async renderRecurringSection(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl('h3', { text: 'Recurring entries' });
    const entries = await this.moneyService.getRecurringEntries();
    const accounts = await this.moneyService.getAccounts();

    for (const entry of entries) {
      new Setting(containerEl)
        .setName(entry.name)
        .setDesc(`${entry.type === 'expense' ? '-' : '+'}${entry.amount} · ${entry.frequency}`)
        .addButton((btn) =>
          btn.setButtonText('Edit').onClick(() => {
            new RecurringEntryModal(this.app, this.moneyService, accounts, entry, () => this.display()).open();
          })
        )
        .addButton((btn) =>
          btn
            .setButtonText('Archive')
            .setWarning()
            .onClick(async () => {
              await this.moneyService.archiveRecurringEntry(entry.id);
              this.display();
            })
        );
    }

    new Setting(containerEl)
      .setName('Add recurring entry')
      .setDesc('REQ-M018: subscriptions, bills, salary — logged or skipped each cycle from the Money view.')
      .addButton((btn) =>
        btn
          .setButtonText('New recurring entry')
          .setCta()
          .onClick(() => {
            if (accounts.length === 0) {
              new ConfirmModal(this.app, 'Create an account first', 'Recurring entries need an account to post to.', () => {}, 'OK').open();
              return;
            }
            new RecurringEntryModal(this.app, this.moneyService, accounts, undefined, () => this.display()).open();
          })
      );
  }
}

```

## modules\data-point-tracking\application\__tests__\dataPointService.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DataPointService,
  DeleteRequiresConfirmationError,
  InvalidEntryValueError,
} from '../dataPointService';
import { DataPointSettingsStore } from '../../infrastructure/dataPointSettingsStore';
import { DataPointLogFile } from '../../infrastructure/dataPointLogFile';
import { FakeSettingsAdapter } from '../../../../core/ports/__tests__/fakeSettingsAdapter';
import { FakeVaultAdapter } from '../../../../core/ports/__tests__/fakeVaultAdapter';

function makeService(fixedToday = '2026-08-19') {
  const settingsStore = new DataPointSettingsStore(new FakeSettingsAdapter());
  const logFile = new DataPointLogFile(new FakeVaultAdapter());
  let idCounter = 0;
  const service = new DataPointService({
    settingsStore,
    logFile,
    idGenerator: () => `id${++idCounter}`,
    clock: () => new Date(`${fixedToday}T12:00:00`),
  });
  return { service, settingsStore, logFile };
}

describe('DataPointService.createDataPoint', () => {
  test('generates an id, sets createdAt to today, sensible defaults', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Weight', type: 'number', unit: 'kg' });
    assert.equal(dp.id, 'id1');
    assert.equal(dp.createdAt, '2026-08-19');
    assert.equal(dp.archived, false);
  });
});

describe('DataPointService entry logging', () => {
  test('logs multiple entries for the same data point on the same day, each its own timestamped entry (REQ-D005)', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Water', type: 'number', unit: 'ml' });

    await service.logEntry(dp.id, '2026-08-19', '08:00', '250');
    await service.logEntry(dp.id, '2026-08-19', '14:00', '300');

    const today = await service.getEntriesForToday();
    const entries = today.get(dp.id) ?? [];
    assert.equal(entries.length, 2);
    assert.deepEqual(
      entries.map((e) => e.value),
      [250, 300]
    );
  });

  test('rejects a non-numeric value for a number data point (REQ-D009)', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Weight', type: 'number' });
    await assert.rejects(() => service.logEntry(dp.id, '2026-08-19', '08:00', 'abc'), InvalidEntryValueError);
  });

  test('rejects a malformed time value for a time-of-day data point', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Wake up', type: 'time' });
    await assert.rejects(
      () => service.logEntry(dp.id, '2026-08-19', '08:00', 'early'),
      InvalidEntryValueError
    );
  });

  test('accepts any non-empty text for a text data point', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Mood note', type: 'text' });
    const entry = await service.logEntry(dp.id, '2026-08-19', '08:00', 'Felt great');
    assert.equal(entry.value, 'Felt great');
  });

  test('editEntry updates only that entry, leaving siblings untouched (REQ-D008)', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Water', type: 'number', unit: 'ml' });

    const e1 = await service.logEntry(dp.id, '2026-08-19', '08:00', '250');
    const e2 = await service.logEntry(dp.id, '2026-08-19', '14:00', '300');
    await service.editEntry(e2.id, dp.id, '2026-08-19', '14:00', '350');

    const today = await service.getEntriesForToday();
    const entries = today.get(dp.id) ?? [];
    const editedE2 = entries.find((e) => e.id === e2.id);
    const untouchedE1 = entries.find((e) => e.id === e1.id);
    assert.equal(editedE2?.value, 350);
    assert.equal(untouchedE1?.value, 250);
  });

  test('deleteEntry removes only that entry (REQ-D012)', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Water', type: 'number' });
    const e1 = await service.logEntry(dp.id, '2026-08-19', '08:00', '250');
    const e2 = await service.logEntry(dp.id, '2026-08-19', '14:00', '300');

    await service.deleteEntry('2026-08-19', e1.id);

    const today = await service.getEntriesForToday();
    const entries = today.get(dp.id) ?? [];
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, e2.id);
  });

  test('an archived data point never appears in getEntriesForToday', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Old metric', type: 'number' });
    await service.logEntry(dp.id, '2026-08-19', '08:00', '5');
    await service.archiveDataPoint(dp.id);

    const today = await service.getEntriesForToday();
    assert.equal(today.has(dp.id), false);
  });
});

describe('DataPointService.deleteDataPoint', () => {
  test('deletes immediately when there is no history', async () => {
    const { service, settingsStore } = makeService();
    const dp = await service.createDataPoint({ name: 'Fresh metric', type: 'number' });
    await service.deleteDataPoint(dp.id);
    assert.equal(await settingsStore.get(dp.id), undefined);
  });

  test('throws DeleteRequiresConfirmationError when history exists and not confirmed', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Weight', type: 'number' });
    await service.logEntry(dp.id, '2026-08-19', '08:00', '70');

    await assert.rejects(() => service.deleteDataPoint(dp.id), DeleteRequiresConfirmationError);
  });

  test('deletes when confirmed: true, even with history', async () => {
    const { service, settingsStore } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Weight', type: 'number' });
    await service.logEntry(dp.id, '2026-08-19', '08:00', '70');

    await service.deleteDataPoint(dp.id, true);
    assert.equal(await settingsStore.get(dp.id), undefined);
  });
});

describe('DataPointService.getTrend', () => {
  test('returns one point per entry, applying the data point unit to labels', async () => {
    const { service } = makeService('2026-08-19');
    const dp = await service.createDataPoint({ name: 'Weight', type: 'number', unit: 'kg' });
    await service.logEntry(dp.id, '2026-08-17', '08:00', '70');
    await service.logEntry(dp.id, '2026-08-18', '08:00', '71');
    await service.logEntry(dp.id, '2026-08-19', '08:00', '69.5');

    const trend = await service.getTrend(dp.id, '2026-08-01', '2026-08-19');
    assert.equal(trend.length, 3);
    assert.equal(trend[0].label, '70 kg');
  });

  test('only includes entries for the requested data point, not others', async () => {
    const { service } = makeService('2026-08-19');
    const weight = await service.createDataPoint({ name: 'Weight', type: 'number' });
    const sleep = await service.createDataPoint({ name: 'Sleep', type: 'number' });
    await service.logEntry(weight.id, '2026-08-19', '08:00', '70');
    await service.logEntry(sleep.id, '2026-08-19', '23:00', '7.5');

    const trend = await service.getTrend(weight.id, '2026-08-01', '2026-08-19');
    assert.equal(trend.length, 1);
    assert.equal(trend[0].label, '70');
  });
});

```

## modules\data-point-tracking\application\dataPointService.ts

```typescript
// Orchestrates the domain layer (validation, trend aggregation) and
// infrastructure layer (settings store, log file) into the operations
// the UI layer calls. No direct file I/O of its own. Mirrors
// habitService.ts's structure and DI pattern.

import {
  DataPointDefinition,
  DataPointEntry,
  DataPointLogValue,
  NewDataPointInput,
  TrendPoint,
} from '../domain/types';
import { validateEntryValue } from '../domain/validation';
import { buildTrendPoints } from '../domain/trendAggregator';
import { DataPointSettingsStore } from '../infrastructure/dataPointSettingsStore';
import { DataPointLogFile, RawDataPointEntry } from '../infrastructure/dataPointLogFile';
import { getTodayLocal } from '../../../core/date';

/** Thrown by deleteDataPoint when history exists and confirmed !== true (mirrors Habit Tracking's REQ-H015-style gate). */
export class DeleteRequiresConfirmationError extends Error {
  constructor(public readonly definitionId: string) {
    super(`Data point ${definitionId} has existing history; deletion requires confirmation.`);
    this.name = 'DeleteRequiresConfirmationError';
  }
}

/** Thrown by logEntry/editEntry when the raw input fails REQ-D009 validation for the data point's type. */
export class InvalidEntryValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEntryValueError';
  }
}

export interface DataPointServiceDeps {
  settingsStore: DataPointSettingsStore;
  logFile: DataPointLogFile;
  idGenerator: () => string;
  clock?: () => Date;
}

export class DataPointService {
  private settingsStore: DataPointSettingsStore;
  private logFile: DataPointLogFile;
  private idGenerator: () => string;
  private clock: () => Date;

  constructor(deps: DataPointServiceDeps) {
    this.settingsStore = deps.settingsStore;
    this.logFile = deps.logFile;
    this.idGenerator = deps.idGenerator;
    this.clock = deps.clock ?? (() => new Date());
  }

  private today(): string {
    return getTodayLocal(this.clock);
  }

  async createDataPoint(input: NewDataPointInput): Promise<DataPointDefinition> {
    const existing = await this.settingsStore.getAll();
    const dataPoint: DataPointDefinition = {
      id: this.idGenerator(),
      name: input.name,
      type: input.type,
      unit: input.unit,
      archived: false,
      createdAt: this.today(),
      order: existing.length,
    };
    return this.settingsStore.create(dataPoint);
  }

  async updateDataPoint(id: string, patch: Partial<DataPointDefinition>): Promise<DataPointDefinition> {
    return this.settingsStore.update(id, patch);
  }

  async archiveDataPoint(id: string): Promise<void> {
    await this.settingsStore.update(id, { archived: true });
  }

  async deleteDataPoint(id: string, confirmed = false): Promise<void> {
    const hasHistory = await this.logFile.hasAnyLogEntry(id);
    if (hasHistory && !confirmed) {
      throw new DeleteRequiresConfirmationError(id);
    }
    await this.settingsStore.delete(id);
  }

  /** All non-archived data points, in display order — the dashboard's full list (REQ-C001/D007; data points have no schedule, so no pending/completed split like habits). */
  async getActiveDataPoints(): Promise<DataPointDefinition[]> {
    const all = await this.settingsStore.getAll();
    return all.filter((d) => !d.archived).sort((a, b) => a.order - b.order);
  }

  /** Logs a brand-new entry (REQ-D005/D006), validated against the definition's type (REQ-D009). */
  async logEntry(definitionId: string, date: string, time: string, rawInput: string): Promise<DataPointEntry> {
    const definition = await this.requireDefinition(definitionId);
    const validated = this.validateOrThrow(definition, rawInput);
    const raw: RawDataPointEntry = {
      id: this.idGenerator(),
      definitionId,
      date,
      time,
      rawValue: String(validated),
    };
    await this.logFile.upsertEntry(raw);
    return this.toDomainEntry(raw, definition);
  }

  /** Edits an already-logged entry in place (REQ-D008/D012) — same entryId, upsert overwrites. */
  async editEntry(
    entryId: string,
    definitionId: string,
    date: string,
    time: string,
    rawInput: string
  ): Promise<DataPointEntry> {
    const definition = await this.requireDefinition(definitionId);
    const validated = this.validateOrThrow(definition, rawInput);
    const raw: RawDataPointEntry = { id: entryId, definitionId, date, time, rawValue: String(validated) };
    await this.logFile.upsertEntry(raw);
    return this.toDomainEntry(raw, definition);
  }

  async deleteEntry(date: string, entryId: string): Promise<void> {
    await this.logFile.deleteEntry(date, entryId);
  }

  /** Today's logged entries, grouped by data point (REQ-D007's "today's logged entries as a list"). */
  async getEntriesForToday(): Promise<Map<string, DataPointEntry[]>> {
    const today = this.today();
    const raw = await this.logFile.readDay(today);
    const definitions = await this.settingsStore.getAll();
    const defsById = new Map(definitions.map((d) => [d.id, d]));

    const grouped = new Map<string, DataPointEntry[]>();
    for (const r of raw) {
      const def = defsById.get(r.definitionId);
      if (!def || def.archived) continue;
      const list = grouped.get(r.definitionId) ?? [];
      list.push(this.toDomainEntry(r, def));
      grouped.set(r.definitionId, list);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => a.time.localeCompare(b.time));
    }
    return grouped;
  }

  /** All of one data point's entries in a date range, typed per its definition — for the trend chart (number/time) or recent-entries list (text). REQ-D010/D011. */
  async getEntriesInRange(definitionId: string, rangeStart: string, rangeEnd: string): Promise<DataPointEntry[]> {
    const definition = await this.requireDefinition(definitionId);
    const raw = await this.logFile.readRange(rangeStart, rangeEnd);
    return raw
      .filter((r) => r.definitionId === definitionId)
      .map((r) => this.toDomainEntry(r, definition))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }

  /** Trend points for a number/time-of-day data point over a range (REQ-D010). Text-type data points have no numeric trend — see design doc's resolved Open Question. */
  async getTrend(definitionId: string, rangeStart: string, rangeEnd: string): Promise<TrendPoint[]> {
    const definition = await this.requireDefinition(definitionId);
    const entries = await this.getEntriesInRange(definitionId, rangeStart, rangeEnd);
    return buildTrendPoints(entries, definition.unit);
  }

  private async requireDefinition(id: string): Promise<DataPointDefinition> {
    const definition = await this.settingsStore.get(id);
    if (!definition) throw new Error(`Data point not found: ${id}`);
    return definition;
  }

  private validateOrThrow(definition: DataPointDefinition, rawInput: string): DataPointLogValue {
    const result = validateEntryValue(definition.type, rawInput);
    if (!result.valid) throw new InvalidEntryValueError(result.error);
    return result.value;
  }

  private toDomainEntry(raw: RawDataPointEntry, definition: DataPointDefinition): DataPointEntry {
    const value: DataPointLogValue = definition.type === 'number' ? Number(raw.rawValue) : raw.rawValue;
    return { id: raw.id, definitionId: raw.definitionId, date: raw.date, time: raw.time, value };
  }
}

```

## modules\data-point-tracking\domain\__tests__\trendAggregator.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrendPoints } from '../trendAggregator';
import { DataPointEntry } from '../types';

function makeEntry(overrides: Partial<DataPointEntry> = {}): DataPointEntry {
  return {
    id: 'e1',
    definitionId: 'd1',
    date: '2026-08-19',
    time: '08:00',
    value: 70,
    ...overrides,
  };
}

describe('buildTrendPoints', () => {
  test('every entry becomes its own point, not aggregated per day', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2026-08-19', time: '08:00', value: 250 }),
      makeEntry({ id: 'e2', date: '2026-08-19', time: '14:00', value: 300 }),
    ];
    const points = buildTrendPoints(entries);
    assert.equal(points.length, 2);
  });

  test('applies the unit to the label when provided', () => {
    const points = buildTrendPoints([makeEntry({ value: 72 })], 'kg');
    assert.equal(points[0].label, '72 kg');
  });

  test('time-of-day values convert to minutes-since-midnight for the numeric axis', () => {
    const points = buildTrendPoints([makeEntry({ value: '07:30' })]);
    assert.equal(points[0].value, 450); // 7*60 + 30
    assert.equal(points[0].label, '07:30');
  });

  test('points are sorted chronologically by date then time', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2026-08-20', time: '08:00', value: 1 }),
      makeEntry({ id: 'e2', date: '2026-08-19', time: '14:00', value: 2 }),
      makeEntry({ id: 'e3', date: '2026-08-19', time: '08:00', value: 3 }),
    ];
    const points = buildTrendPoints(entries);
    assert.deepEqual(
      points.map((p) => p.entryId),
      ['e3', 'e2', 'e1']
    );
  });

  test('text-type entries (neither number nor HH:MM) produce no trend point', () => {
    const points = buildTrendPoints([makeEntry({ value: 'Felt great' })]);
    assert.equal(points.length, 0);
  });
});

```

## modules\data-point-tracking\domain\__tests__\validation.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateEntryValue } from '../validation';

describe('validateEntryValue — number type', () => {
  test('accepts a valid number', () => {
    const result = validateEntryValue('number', '72.5');
    assert.equal(result.valid, true);
    if (result.valid) assert.equal(result.value, 72.5);
  });

  test('rejects non-numeric text', () => {
    const result = validateEntryValue('number', 'abc');
    assert.equal(result.valid, false);
  });

  test('rejects empty input', () => {
    const result = validateEntryValue('number', '   ');
    assert.equal(result.valid, false);
  });
});

describe('validateEntryValue — time type', () => {
  test('accepts a valid HH:MM time', () => {
    const result = validateEntryValue('time', '07:15');
    assert.equal(result.valid, true);
    if (result.valid) assert.equal(result.value, '07:15');
  });

  test('rejects an out-of-range hour', () => {
    assert.equal(validateEntryValue('time', '25:00').valid, false);
  });

  test('rejects an out-of-range minute', () => {
    assert.equal(validateEntryValue('time', '10:61').valid, false);
  });

  test('rejects a non-time string', () => {
    assert.equal(validateEntryValue('time', 'morning').valid, false);
  });
});

describe('validateEntryValue — text type', () => {
  test('accepts any non-empty text', () => {
    const result = validateEntryValue('text', 'Felt great today');
    assert.equal(result.valid, true);
    if (result.valid) assert.equal(result.value, 'Felt great today');
  });

  test('rejects empty text', () => {
    assert.equal(validateEntryValue('text', '').valid, false);
  });
});

```

## modules\data-point-tracking\domain\trendAggregator.ts

```typescript
// Pure domain logic: turn a flat list of logged entries into
// TrendPoints for the chart (REQ-D010). No I/O. Each entry becomes its
// own point — see design-data-point-tracking.md's resolved Open
// Question on aggregation (no daily-average mode yet).

import { DataPointEntry, TrendPoint } from './types';

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const TIME_VALUE_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function buildTrendPoints(entries: DataPointEntry[], unit?: string): TrendPoint[] {
  const points: TrendPoint[] = [];

  for (const entry of entries) {
    if (typeof entry.value === 'number') {
      points.push({
        date: entry.date,
        time: entry.time,
        value: entry.value,
        label: unit ? `${entry.value} ${unit}` : String(entry.value),
        entryId: entry.id,
      });
    } else if (TIME_VALUE_RE.test(entry.value)) {
      points.push({
        date: entry.date,
        time: entry.time,
        value: timeToMinutes(entry.value),
        label: entry.value,
        entryId: entry.id,
      });
    }
    // text-type entries produce no trend point — REQ-D011 shows them
    // as a list instead, built directly from raw entries in the UI.
  }

  return points.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

```

## modules\data-point-tracking\domain\types.ts

```typescript
// Domain types for the Data Point Tracking module.
// Pure data shapes only — no I/O, no Obsidian API, no React.
// See design-data-point-tracking.md.

export type DataPointType = 'number' | 'time' | 'text';

export interface DataPointDefinition {
  id: string; // nanoid, generated once at creation, never reused
  name: string;
  type: DataPointType;
  unit?: string; // number type only, optional (REQ-D001)
  archived: boolean; // REQ-D013, defaults false
  createdAt: string; // local date YYYY-MM-DD, via the shared date fn (REQ-C012)
  order: number;
}

export interface NewDataPointInput {
  name: string;
  type: DataPointType;
  unit?: string;
}

// The value a single logged entry holds. Number type stores a number;
// time-of-day and text types store a string ("HH:MM" / freeform).
export type DataPointLogValue = number | string;

// A single logged entry for a data point on a given day (REQ-D005: one
// or more entries per data point per day, each its own timestamped
// entry rather than overwriting).
export interface DataPointEntry {
  id: string; // stable id, generated once, used for edit/delete addressing
  definitionId: string;
  date: string; // YYYY-MM-DD the entry was logged under
  time: string; // HH:MM local time logged (REQ-D006)
  value: DataPointLogValue;
}

export type NewEntryInput = Pick<DataPointEntry, 'definitionId' | 'date' | 'time' | 'value'>;

// One point on a trend chart — every individual entry becomes its own
// point (see design-data-point-tracking.md's resolved Open Question),
// not a daily aggregate.
export interface TrendPoint {
  date: string;
  time: string;
  /** Numeric x-axis value: the raw number for 'number' type, minutes-since-midnight for 'time' type. */
  value: number;
  /** Human-readable label for the point (e.g. "72 kg" or "07:15"). */
  label: string;
  entryId: string;
}

```

## modules\data-point-tracking\domain\validation.ts

```typescript
// Pure validation: does a raw string input match a data point's type
// (REQ-D009 — reject non-numeric text for a number data point, etc.).
// No I/O.

import { DataPointType, DataPointLogValue } from './types';

export type ValidationResult =
  | { valid: true; value: DataPointLogValue }
  | { valid: false; error: string };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function validateEntryValue(type: DataPointType, raw: string): ValidationResult {
  const trimmed = raw.trim();

  if (type === 'number') {
    if (trimmed === '') return { valid: false, error: 'Enter a number.' };
    const num = Number(trimmed);
    if (Number.isNaN(num)) return { valid: false, error: "That doesn't look like a number." };
    return { valid: true, value: num };
  }

  if (type === 'time') {
    if (!TIME_RE.test(trimmed)) return { valid: false, error: 'Enter a time as HH:MM (24-hour).' };
    return { valid: true, value: trimmed };
  }

  if (trimmed === '') return { valid: false, error: 'Enter a value.' };
  return { valid: true, value: raw };
}

```

## modules\data-point-tracking\infrastructure\__tests__\dataPointLogFile.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DataPointLogFile, DataPointLogFileReadError } from '../dataPointLogFile';
import { FakeVaultAdapter } from '../../../../core/ports/__tests__/fakeVaultAdapter';

describe('DataPointLogFile round-trip', () => {
  test('writes an entry, reads it back', async () => {
    const log = new DataPointLogFile(new FakeVaultAdapter());
    await log.upsertEntry({ id: 'e1', definitionId: 'd1', date: '2026-08-19', time: '08:00', rawValue: '250' });

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 1);
    assert.equal(day[0].definitionId, 'd1');
    assert.equal(day[0].time, '08:00');
    assert.equal(day[0].rawValue, '250');
  });

  test('multiple entries for the same data point on the same day are all kept, each its own field (REQ-D005)', async () => {
    const log = new DataPointLogFile(new FakeVaultAdapter());
    await log.upsertEntry({ id: 'e1', definitionId: 'd1', date: '2026-08-19', time: '08:00', rawValue: '250' });
    await log.upsertEntry({ id: 'e2', definitionId: 'd1', date: '2026-08-19', time: '14:00', rawValue: '300' });

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 2);
    assert.deepEqual(day.map((e) => e.rawValue).sort(), ['250', '300']);
  });

  test('editing one entry (upsert with same id) does not disturb other entries that day (REQ-D008)', async () => {
    const log = new DataPointLogFile(new FakeVaultAdapter());
    await log.upsertEntry({ id: 'e1', definitionId: 'd1', date: '2026-08-19', time: '08:00', rawValue: '250' });
    await log.upsertEntry({ id: 'e2', definitionId: 'd1', date: '2026-08-19', time: '14:00', rawValue: '300' });
    await log.upsertEntry({ id: 'e2', definitionId: 'd1', date: '2026-08-19', time: '14:00', rawValue: '350' }); // edit

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 2);
    const e2 = day.find((e) => e.id === 'e2');
    assert.equal(e2?.rawValue, '350');
    const e1 = day.find((e) => e.id === 'e1');
    assert.equal(e1?.rawValue, '250'); // untouched
  });

  test('deleting one entry leaves the others intact (REQ-D012)', async () => {
    const log = new DataPointLogFile(new FakeVaultAdapter());
    await log.upsertEntry({ id: 'e1', definitionId: 'd1', date: '2026-08-19', time: '08:00', rawValue: '250' });
    await log.upsertEntry({ id: 'e2', definitionId: 'd1', date: '2026-08-19', time: '14:00', rawValue: '300' });

    await log.deleteEntry('2026-08-19', 'e1');

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 1);
    assert.equal(day[0].id, 'e2');
  });

  test('a text value containing a literal "|" round-trips correctly (only the first two pipes are delimiters)', async () => {
    const log = new DataPointLogFile(new FakeVaultAdapter());
    await log.upsertEntry({
      id: 'e1',
      definitionId: 'd1',
      date: '2026-08-19',
      time: '08:00',
      rawValue: 'Felt tired | but ok',
    });

    const day = await log.readDay('2026-08-19');
    assert.equal(day[0].rawValue, 'Felt tired | but ok');
  });

  test('a day with no entries produces no line in the file (clean for hand-editing)', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new DataPointLogFile(adapter);
    await log.upsertEntry({ id: 'e1', definitionId: 'd1', date: '2026-08-19', time: '08:00', rawValue: '250' });

    const raw = await adapter.readFile('Life Tracker/Logs/DataPoints/data-points-2026.md');
    assert.equal(raw, '- 2026-08-19 [dp-e1:: d1|08:00|250]\n');
  });

  test('readRange spans multiple year files', async () => {
    const log = new DataPointLogFile(new FakeVaultAdapter());
    await log.upsertEntry({ id: 'e1', definitionId: 'd1', date: '2025-12-30', time: '08:00', rawValue: '1' });
    await log.upsertEntry({ id: 'e2', definitionId: 'd1', date: '2026-01-02', time: '08:00', rawValue: '2' });

    const range = await log.readRange('2025-12-25', '2026-01-05');
    assert.equal(range.length, 2);
  });

  test('hasAnyLogEntry finds an entry across year files by definitionId, and correctly reports absence', async () => {
    const log = new DataPointLogFile(new FakeVaultAdapter());
    await log.upsertEntry({ id: 'e1', definitionId: 'zzz999', date: '2025-06-01', time: '08:00', rawValue: '1' });

    assert.equal(await log.hasAnyLogEntry('zzz999'), true);
    assert.equal(await log.hasAnyLogEntry('nonexistent'), false);
  });

  test('a corrupted/unreadable file surfaces a typed error rather than silently returning empty data', async () => {
    const brokenAdapter = new FakeVaultAdapter();
    brokenAdapter.fileExists = async () => true;
    brokenAdapter.readFile = async () => {
      throw new Error('simulated disk error');
    };
    const log = new DataPointLogFile(brokenAdapter);
    await assert.rejects(() => log.readDay('2026-08-19'), DataPointLogFileReadError);
  });
});

```

## modules\data-point-tracking\infrastructure\__tests__\dataPointSettingsStore.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DataPointSettingsStore } from '../dataPointSettingsStore';
import { FakeSettingsAdapter } from '../../../../core/ports/__tests__/fakeSettingsAdapter';
import { DataPointDefinition } from '../../domain/types';

function makeDataPoint(overrides: Partial<DataPointDefinition> = {}): DataPointDefinition {
  return {
    id: 'd1',
    name: 'Weight',
    type: 'number',
    unit: 'kg',
    archived: false,
    createdAt: '2026-08-01',
    order: 0,
    ...overrides,
  };
}

describe('DataPointSettingsStore CRUD', () => {
  test('create then getAll/get returns the data point', async () => {
    const store = new DataPointSettingsStore(new FakeSettingsAdapter());
    const dp = makeDataPoint();
    await store.create(dp);

    const all = await store.getAll();
    assert.equal(all.length, 1);
    assert.deepEqual(all[0], dp);
    assert.deepEqual(await store.get('d1'), dp);
  });

  test('update patches only the given fields and preserves id', async () => {
    const store = new DataPointSettingsStore(new FakeSettingsAdapter());
    await store.create(makeDataPoint());

    const updated = await store.update('d1', { name: 'Body weight' });
    assert.equal(updated.id, 'd1');
    assert.equal(updated.name, 'Body weight');
    assert.equal(updated.unit, 'kg');
  });

  test('archive is just update({ archived: true })', async () => {
    const store = new DataPointSettingsStore(new FakeSettingsAdapter());
    await store.create(makeDataPoint({ archived: false }));
    await store.update('d1', { archived: true });
    assert.equal((await store.get('d1'))?.archived, true);
  });

  test('delete removes the data point; others unaffected', async () => {
    const store = new DataPointSettingsStore(new FakeSettingsAdapter());
    await store.create(makeDataPoint({ id: 'd1' }));
    await store.create(makeDataPoint({ id: 'd2', name: 'Sleep' }));
    await store.delete('d1');
    const all = await store.getAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, 'd2');
  });

  test('updating a non-existent data point throws', async () => {
    const store = new DataPointSettingsStore(new FakeSettingsAdapter());
    await assert.rejects(() => store.update('nope', { name: 'x' }));
  });

  test('does not clobber the habits key already present in the shared blob', async () => {
    const adapter = new FakeSettingsAdapter();
    await adapter.save({ habits: [{ id: 'h1' }] });
    const store = new DataPointSettingsStore(adapter);
    await store.create(makeDataPoint());

    const raw = await adapter.load();
    assert.deepEqual(raw?.habits, [{ id: 'h1' }]);
    assert.equal((raw?.dataPoints as DataPointDefinition[]).length, 1);
  });
});

```

## modules\data-point-tracking\infrastructure\dataPointLogFile.ts

```typescript
// Reads/writes the yearly markdown log files for Data Point Tracking
// (REQ-C009/C010, extended for multi-entry days — REQ-D005). See
// design-data-point-tracking.md for the resolved storage-format Open
// Question.
//
// Line format, one bracketed field PER ENTRY (not per data point,
// since a data point can have several entries a day):
//   - 2026-08-19 [dp-<entryId>:: <definitionId>|<HH:MM>|<rawValue>]
//
// The key is just the entry's own id (mirrors habitLogFile's
// `habit-<id>` pattern — entries, not definitions, are the addressable
// unit here). The value packs definitionId and time ahead of the raw
// value, split on the first two `|` only, so a text entry's own value
// may itself contain `|` without breaking parsing. This module stores
// rawValue as a plain string always — type-aware interpretation
// (number vs. time vs. text) happens in the application layer, which
// has access to the definition's type; this layer doesn't need to
// know it.

import { VaultAdapter } from '../../../core/ports/vaultAdapter';

const DEFAULT_LOG_FOLDER = 'Life Tracker/Logs/DataPoints';

export interface DataPointLogFileConfig {
  logFolder?: string;
}

export interface RawDataPointEntry {
  id: string;
  definitionId: string;
  date: string;
  time: string;
  rawValue: string;
}

const LINE_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s+(.*)$/;
const FIELD_RE = /\[dp-([a-zA-Z0-9_-]+)::\s*([^\]]+)\]/g;

function parseFieldValue(raw: string): { definitionId: string; time: string; rawValue: string } {
  const firstPipe = raw.indexOf('|');
  const secondPipe = firstPipe === -1 ? -1 : raw.indexOf('|', firstPipe + 1);
  if (firstPipe === -1 || secondPipe === -1) {
    throw new Error(`Malformed data point log entry: "${raw}"`);
  }
  return {
    definitionId: raw.slice(0, firstPipe),
    time: raw.slice(firstPipe + 1, secondPipe),
    rawValue: raw.slice(secondPipe + 1),
  };
}

function serializeFieldValue(definitionId: string, time: string, rawValue: string): string {
  return `${definitionId}|${time}|${rawValue}`;
}

function yearOf(date: string): string {
  return date.slice(0, 4);
}

/** Mirrors HabitLogFileReadError — a corrupted/unreadable year file surfaces a typed error rather than silently returning empty data. */
export class DataPointLogFileReadError extends Error {
  constructor(
    public readonly path: string,
    public readonly cause: unknown
  ) {
    super(`Failed to read data point log file: ${path}`);
    this.name = 'DataPointLogFileReadError';
  }
}

export class DataPointLogFile {
  constructor(
    private adapter: VaultAdapter,
    private config: DataPointLogFileConfig = {}
  ) {}

  private get logFolder(): string {
    return this.config.logFolder ?? DEFAULT_LOG_FOLDER;
  }

  private pathForYear(year: string): string {
    return `${this.logFolder}/data-points-${year}.md`;
  }

  private async readYearFile(year: string): Promise<Map<string, RawDataPointEntry[]>> {
    const path = this.pathForYear(year);
    const result = new Map<string, RawDataPointEntry[]>();

    if (!(await this.adapter.fileExists(path))) return result;

    let content: string;
    try {
      content = await this.adapter.readFile(path);
    } catch (err) {
      throw new DataPointLogFileReadError(path, err);
    }

    for (const line of content.split('\n')) {
      const match = LINE_RE.exec(line);
      if (!match) continue;
      const [, date, fieldsRaw] = match;
      const entries: RawDataPointEntry[] = [];
      FIELD_RE.lastIndex = 0;
      let fieldMatch: RegExpExecArray | null;
      while ((fieldMatch = FIELD_RE.exec(fieldsRaw)) !== null) {
        const [, entryId, rawGroup] = fieldMatch;
        const { definitionId, time, rawValue } = parseFieldValue(rawGroup);
        entries.push({ id: entryId, definitionId, date, time, rawValue });
      }
      result.set(date, entries);
    }

    return result;
  }

  private serializeYearFile(days: Map<string, RawDataPointEntry[]>): string {
    const sortedDates = Array.from(days.keys()).sort();
    const lines: string[] = [];
    for (const date of sortedDates) {
      const entries = days.get(date)!;
      if (entries.length === 0) continue; // no line for an empty day — keeps the file clean
      const sorted = [...entries].sort((a, b) => (a.time + a.id).localeCompare(b.time + b.id));
      const fieldStrs = sorted
        .map((e) => `[dp-${e.id}:: ${serializeFieldValue(e.definitionId, e.time, e.rawValue)}]`)
        .join(' ');
      lines.push(`- ${date} ${fieldStrs}`);
    }
    return lines.length > 0 ? lines.join('\n') + '\n' : '';
  }

  private async writeYearFile(year: string, days: Map<string, RawDataPointEntry[]>): Promise<void> {
    if (!(await this.adapter.folderExists(this.logFolder))) {
      await this.adapter.createFolder(this.logFolder);
    }
    await this.adapter.writeFile(this.pathForYear(year), this.serializeYearFile(days));
  }

  /** All entries (across all data points) logged on a single day. */
  async readDay(date: string): Promise<RawDataPointEntry[]> {
    const days = await this.readYearFile(yearOf(date));
    return days.get(date) ?? [];
  }

  /** Flat list of entries in [startDate, endDate] inclusive, across however many year files that spans. */
  async readRange(startDate: string, endDate: string): Promise<RawDataPointEntry[]> {
    const startYear = Number(yearOf(startDate));
    const endYear = Number(yearOf(endDate));
    const result: RawDataPointEntry[] = [];

    for (let y = startYear; y <= endYear; y++) {
      const days = await this.readYearFile(String(y));
      for (const [date, entries] of days) {
        if (date >= startDate && date <= endDate) {
          result.push(...entries);
        }
      }
    }
    return result;
  }

  /** Adds a new entry, or overwrites an existing one with the same id (upsert) — used for both logging and editing (REQ-D005, REQ-D008). */
  async upsertEntry(entry: RawDataPointEntry): Promise<void> {
    const year = yearOf(entry.date);
    const days = await this.readYearFile(year);
    const existing = days.get(entry.date) ?? [];
    days.set(entry.date, [...existing.filter((e) => e.id !== entry.id), entry]);
    await this.writeYearFile(year, days);
  }

  /** Removes one entry by id from its date's line, without disturbing other entries that day (REQ-D008, REQ-D012). */
  async deleteEntry(date: string, entryId: string): Promise<void> {
    const year = yearOf(date);
    const days = await this.readYearFile(year);
    const existing = days.get(date) ?? [];
    days.set(date, existing.filter((e) => e.id !== entryId));
    await this.writeYearFile(year, days);
  }

  /** Whether any log entry exists anywhere for a given data point definition (delete-confirmation gate, same pattern as Habit Tracking's REQ-H015 check). */
  async hasAnyLogEntry(definitionId: string): Promise<boolean> {
    const files = await this.adapter.listFilesUnder(this.logFolder);
    for (const file of files) {
      const content = await this.adapter.readFile(file.path);
      FIELD_RE.lastIndex = 0;
      let fieldMatch: RegExpExecArray | null;
      while ((fieldMatch = FIELD_RE.exec(content)) !== null) {
        const { definitionId: fieldDefId } = parseFieldValue(fieldMatch[2]);
        if (fieldDefId === definitionId) return true;
      }
    }
    return false;
  }
}

```

## modules\data-point-tracking\infrastructure\dataPointSettingsStore.ts

```typescript
// CRUD for DataPointDefinition[] against the plugin's settings blob
// (REQ-C008), under its own `dataPoints` key — same data.json,
// separate key from Habit Tracking's `habits`. Mirrors
// habitSettingsStore.ts's structure.

import { DataPointDefinition } from '../domain/types';
import { SettingsAdapter } from '../../../core/ports/settingsAdapter';

interface LifeTrackerData {
  dataPoints?: DataPointDefinition[];
  [key: string]: unknown;
}

export class DataPointSettingsStore {
  constructor(private adapter: SettingsAdapter) {}

  async getAll(): Promise<DataPointDefinition[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.dataPoints ?? [];
  }

  async get(id: string): Promise<DataPointDefinition | undefined> {
    const all = await this.getAll();
    return all.find((d) => d.id === id);
  }

  private async saveAll(dataPoints: DataPointDefinition[]): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.dataPoints = dataPoints;
    await this.adapter.save(data);
  }

  async create(dataPoint: DataPointDefinition): Promise<DataPointDefinition> {
    const all = await this.getAll();
    all.push(dataPoint);
    await this.saveAll(all);
    return dataPoint;
  }

  async update(id: string, patch: Partial<DataPointDefinition>): Promise<DataPointDefinition> {
    const all = await this.getAll();
    const idx = all.findIndex((d) => d.id === id);
    if (idx === -1) throw new Error(`Data point not found: ${id}`);
    const updated: DataPointDefinition = { ...all[idx], ...patch, id: all[idx].id };
    all[idx] = updated;
    await this.saveAll(all);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const all = await this.getAll();
    await this.saveAll(all.filter((d) => d.id !== id));
  }
}

```

## modules\habit-tracking\application\__tests__\habitService.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HabitService, DeleteRequiresConfirmationError } from '../habitService';
import { HabitSettingsStore } from '../../infrastructure/habitSettingsStore';
import { HabitLogFile } from '../../infrastructure/habitLogFile';
import { FakeSettingsAdapter } from '../../infrastructure/__tests__/fakeSettingsAdapter';
import { FakeVaultAdapter } from '../../infrastructure/__tests__/fakeVaultAdapter';

function makeService(fixedToday = '2026-08-19') {
  const settingsStore = new HabitSettingsStore(new FakeSettingsAdapter());
  const logFile = new HabitLogFile(new FakeVaultAdapter());
  let idCounter = 0;
  const service = new HabitService({
    settingsStore,
    logFile,
    idGenerator: () => `id${++idCounter}`,
    clock: () => new Date(`${fixedToday}T12:00:00`),
  });
  return { service, settingsStore, logFile };
}

describe('HabitService.createHabit', () => {
  test('generates an id, sets createdAt to today, sensible defaults', async () => {
    const { service } = makeService('2026-08-19');
    const habit = await service.createHabit({
      type: 'boolean',
      name: 'Meditate',
      icon: '🧘',
      color: '#000',
      schedule: { mode: 'daily' },
    });
    assert.equal(habit.id, 'id1');
    assert.equal(habit.createdAt, '2026-08-19');
    assert.equal(habit.trendVisible, true);
    assert.equal(habit.archived, false);
  });

  test('order increments across successive creations', async () => {
    const { service } = makeService();
    const a = await service.createHabit({
      type: 'boolean',
      name: 'A',
      icon: '✅',
      color: '#000',
      schedule: { mode: 'daily' },
    });
    const b = await service.createHabit({
      type: 'boolean',
      name: 'B',
      icon: '✅',
      color: '#000',
      schedule: { mode: 'daily' },
    });
    assert.equal(a.order, 0);
    assert.equal(b.order, 1);
  });
});

describe('HabitService daily check-in flow', () => {
  test('a scheduled, unlogged habit appears in pending; logging it moves it to completed', async () => {
    const { service } = makeService('2026-08-19');
    const habit = await service.createHabit({
      type: 'boolean',
      name: 'Meditate',
      icon: '🧘',
      color: '#000',
      schedule: { mode: 'daily' },
    });

    let pending = await service.getPendingForToday();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, habit.id);

    await service.editTodayLog(habit.id, true);

    pending = await service.getPendingForToday();
    assert.equal(pending.length, 0);

    const completed = await service.getCompletedForToday();
    assert.equal(completed.length, 1);
    assert.equal(completed[0].value, true);
  });

  test('editing today\'s value updates it without creating a duplicate entry', async () => {
    const { service } = makeService('2026-08-19');
    const habit = await service.createHabit({
      type: 'numeric',
      name: 'Steps',
      icon: '👟',
      color: '#000',
      schedule: { mode: 'daily' },
      target: { value: 8000, unit: 'steps' },
    });

    await service.editTodayLog(habit.id, 3000);
    await service.editTodayLog(habit.id, 8500);

    const completed = await service.getCompletedForToday();
    assert.equal(completed.length, 1);
    assert.equal(completed[0].value, 8500);
  });

  test('logging a numeric value below target still counts as done (resolved Edge Case)', async () => {
    const { service } = makeService('2026-08-19');
    const habit = await service.createHabit({
      type: 'numeric',
      name: 'Steps',
      icon: '👟',
      color: '#000',
      schedule: { mode: 'daily' },
      target: { value: 8000, unit: 'steps' },
    });

    await service.editTodayLog(habit.id, 1000);
    const completed = await service.getCompletedForToday();
    assert.equal(completed.length, 1);
  });

  test('an archived habit never appears in pending or completed', async () => {
    const { service } = makeService('2026-08-19');
    const habit = await service.createHabit({
      type: 'boolean',
      name: 'Old habit',
      icon: '📦',
      color: '#000',
      schedule: { mode: 'daily' },
    });
    await service.archiveHabit(habit.id);

    assert.deepEqual(await service.getPendingForToday(), []);
    assert.deepEqual(await service.getCompletedForToday(), []);
  });
});

describe('HabitService.deleteHabit', () => {
  test('deletes immediately when there is no history', async () => {
    const { service, settingsStore } = makeService();
    const habit = await service.createHabit({
      type: 'boolean',
      name: 'Fresh habit',
      icon: '🌱',
      color: '#000',
      schedule: { mode: 'daily' },
    });
    await service.deleteHabit(habit.id);
    assert.equal(await settingsStore.get(habit.id), undefined);
  });

  test('throws DeleteRequiresConfirmationError when history exists and not confirmed', async () => {
    const { service } = makeService('2026-08-19');
    const habit = await service.createHabit({
      type: 'boolean',
      name: 'Habit with history',
      icon: '📈',
      color: '#000',
      schedule: { mode: 'daily' },
    });
    await service.editTodayLog(habit.id, true);

    await assert.rejects(
      () => service.deleteHabit(habit.id),
      DeleteRequiresConfirmationError
    );
  });

  test('deletes when confirmed: true, even with history, and does not throw', async () => {
    const { service, settingsStore } = makeService('2026-08-19');
    const habit = await service.createHabit({
      type: 'boolean',
      name: 'Habit with history',
      icon: '📈',
      color: '#000',
      schedule: { mode: 'daily' },
    });
    await service.editTodayLog(habit.id, true);

    await service.deleteHabit(habit.id, true);
    assert.equal(await settingsStore.get(habit.id), undefined);
  });
});

describe('HabitService.getHabitHistory', () => {
  test('reflects streak/completion-rate math from the domain layer end-to-end', async () => {
    const { service: pastService, settingsStore, logFile } = makeService('2026-08-17');
    const habit = await pastService.createHabit({
      type: 'boolean',
      name: 'Streak test',
      icon: '🔥',
      color: '#000',
      schedule: { mode: 'daily' },
    });

    const todayService = new HabitService({
      settingsStore,
      logFile,
      idGenerator: () => 'unused',
      clock: () => new Date('2026-08-19T12:00:00'),
    });

    await todayService.logHabit(habit.id, '2026-08-17', true);
    await todayService.logHabit(habit.id, '2026-08-18', true);
    await todayService.logHabit(habit.id, '2026-08-19', true);

    const stats = await todayService.getHabitHistory(habit.id, '2026-08-01', 'monday');
    assert.equal(stats.currentStreak, 3);
    assert.equal(stats.longestStreak, 3);
  });

  test('throws for an unknown habit id', async () => {
    const { service } = makeService();
    await assert.rejects(() => service.getHabitHistory('nope', '2026-08-01', 'monday'));
  });

  test('returns a day-by-day classification array covering the requested range, for the heatmap', async () => {
    const { service: pastService, settingsStore, logFile } = makeService('2026-08-15');
    const habit = await pastService.createHabit({
      type: 'boolean',
      name: 'Heatmap test',
      icon: '🗓️',
      color: '#000',
      schedule: { mode: 'daily' },
    });

    const todayService = new HabitService({
      settingsStore,
      logFile,
      idGenerator: () => 'unused',
      clock: () => new Date('2026-08-17T12:00:00'),
    });
    await todayService.logHabit(habit.id, '2026-08-15', true);
    await todayService.logHabit(habit.id, '2026-08-17', true);

    const result = await todayService.getHabitHistory(habit.id, '2026-08-15', 'monday');
    const byDate = new Map(result.days.map((d) => [d.date, d.status]));
    assert.equal(byDate.get('2026-08-15'), 'done');
    assert.equal(byDate.get('2026-08-16'), 'missed');
    assert.equal(byDate.get('2026-08-17'), 'done');
  });
});

```

## modules\habit-tracking\application\habitService.ts

```typescript
// Orchestrates the domain layer and infrastructure layer into the
// operations the UI layer calls. No direct file I/O of its own.

import { HabitDefinition, HabitSchedule, HabitTarget, WeekStartsOn, HabitHistoryResult, HabitLogValue, DayClassification } from '../domain/types';
import { isScheduledOn, classifyDay } from '../domain/scheduleEvaluator';
import { calculateHabitStats, LoggedDaysLookup } from '../domain/streakCalculator';
import { HabitSettingsStore } from '../infrastructure/habitSettingsStore';
import { HabitLogFile } from '../infrastructure/habitLogFile';
import { getTodayLocal, addDaysLocal } from '../../../core/date';

export interface NewHabitInput {
  type: HabitDefinition['type'];
  name: string;
  icon: string;
  color: string;
  schedule: HabitSchedule;
  target?: HabitTarget;
}

export interface CompletedHabitEntry {
  habit: HabitDefinition;
  value: HabitLogValue;
}

export class DeleteRequiresConfirmationError extends Error {
  constructor(public readonly habitId: string) {
    super(`Habit ${habitId} has existing history; deletion requires confirmation.`);
    this.name = 'DeleteRequiresConfirmationError';
  }
}

export interface HabitServiceDeps {
  settingsStore: HabitSettingsStore;
  logFile: HabitLogFile;
  idGenerator: () => string;
  clock?: () => Date;
}

export class HabitService {
  private settingsStore: HabitSettingsStore;
  private logFile: HabitLogFile;
  private idGenerator: () => string;
  private clock: () => Date;

  constructor(deps: HabitServiceDeps) {
    this.settingsStore = deps.settingsStore;
    this.logFile = deps.logFile;
    this.idGenerator = deps.idGenerator;
    this.clock = deps.clock ?? (() => new Date());
  }

  private today(): string {
    return getTodayLocal(this.clock);
  }

  async createHabit(input: NewHabitInput): Promise<HabitDefinition> {
    const existing = await this.settingsStore.getAll();
    const habit: HabitDefinition = {
      id: this.idGenerator(),
      type: input.type,
      name: input.name,
      icon: input.icon,
      color: input.color,
      schedule: input.schedule,
      target: input.target,
      trendVisible: true,
      archived: false,
      createdAt: this.today(),
      order: existing.length,
    };
    return this.settingsStore.create(habit);
  }

  async updateHabit(id: string, patch: Partial<HabitDefinition>): Promise<HabitDefinition> {
    return this.settingsStore.update(id, patch);
  }

  async archiveHabit(id: string): Promise<void> {
    await this.settingsStore.update(id, { archived: true });
  }

  async deleteHabit(id: string, confirmed = false): Promise<void> {
    const hasHistory = await this.logFile.hasAnyLogEntry(id);
    if (hasHistory && !confirmed) {
      throw new DeleteRequiresConfirmationError(id);
    }
    await this.settingsStore.delete(id);
  }

  async logHabit(id: string, date: string, value: HabitLogValue): Promise<void> {
    await this.logFile.writeField(date, id, value);
  }

  async editTodayLog(id: string, value: HabitLogValue): Promise<void> {
    await this.logHabit(id, this.today(), value);
  }

  async getPendingForToday(): Promise<HabitDefinition[]> {
    const today = this.today();
    const habits = await this.settingsStore.getAll();
    const todaysLog = await this.logFile.readDay(today);

    return habits.filter((h) => !h.archived && isScheduledOn(h, today) && !todaysLog.has(h.id));
  }

  async getCompletedForToday(): Promise<CompletedHabitEntry[]> {
    const today = this.today();
    const habits = await this.settingsStore.getAll();
    const todaysLog = await this.logFile.readDay(today);

    const completed: CompletedHabitEntry[] = [];
    for (const habit of habits) {
      if (habit.archived) continue;
      if (!isScheduledOn(habit, today)) continue;
      const value = todaysLog.get(habit.id);
      if (value !== undefined) completed.push({ habit, value });
    }
    return completed;
  }

  async getHabitHistory(
    id: string,
    rangeStart: string,
    weekStartsOn: WeekStartsOn
  ): Promise<HabitHistoryResult> {
    const habit = await this.settingsStore.get(id);
    if (!habit) throw new Error(`Habit not found: ${id}`);

    const today = this.today();
    const logged = await this.logFile.readRange(habit.createdAt, today);

    const lookup: LoggedDaysLookup = {
      isLoggedOn: (date: string) => logged.get(date)?.has(id) ?? false,
    };

    const stats = calculateHabitStats(habit, lookup, today, rangeStart, weekStartsOn);

    const days: DayClassification[] = [];
    let cursor = rangeStart;
    while (cursor <= today) {
      days.push({ date: cursor, status: classifyDay(habit, cursor, lookup.isLoggedOn(cursor)) });
      cursor = addDaysLocal(cursor, 1);
    }

    return { ...stats, days };
  }
}

```

## modules\habit-tracking\domain\__tests__\scheduleEvaluator.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isScheduledOn,
  classifyDay,
  weekBoundsFor,
  toLocalDateString,
  parseLocalDate,
} from '../scheduleEvaluator';
import { HabitDefinition } from '../types';

function makeHabit(overrides: Partial<HabitDefinition> = {}): HabitDefinition {
  return {
    id: 'h1',
    type: 'boolean',
    name: 'Test habit',
    icon: '✅',
    color: '#000000',
    schedule: { mode: 'daily' },
    trendVisible: true,
    archived: false,
    createdAt: '2026-01-01',
    order: 0,
    ...overrides,
  };
}

describe('isScheduledOn', () => {
  test('daily mode: scheduled every day from createdAt onward', () => {
    const habit = makeHabit({ schedule: { mode: 'daily' }, createdAt: '2026-01-01' });
    assert.equal(isScheduledOn(habit, '2026-01-01'), true);
    assert.equal(isScheduledOn(habit, '2026-06-15'), true);
    assert.equal(isScheduledOn(habit, '2025-12-31'), false);
  });

  test('weekdays mode: only scheduled on configured weekday indices', () => {
    const habit = makeHabit({
      schedule: { mode: 'weekdays', days: [0, 2, 4] },
      createdAt: '2026-01-01',
    });
    assert.equal(isScheduledOn(habit, '2026-08-17'), true);
    assert.equal(isScheduledOn(habit, '2026-08-18'), false);
    assert.equal(isScheduledOn(habit, '2026-08-19'), true);
    assert.equal(isScheduledOn(habit, '2026-08-21'), true);
    assert.equal(isScheduledOn(habit, '2026-08-22'), false);
    assert.equal(isScheduledOn(habit, '2026-08-23'), false);
  });

  test('weekdays mode: weekday matching is invariant to weekStartsOn', () => {
    const habit = makeHabit({
      schedule: { mode: 'weekdays', days: [5, 6] },
      createdAt: '2026-01-01',
    });
    assert.equal(isScheduledOn(habit, '2026-08-22'), true);
    assert.equal(isScheduledOn(habit, '2026-08-23'), true);
    assert.equal(isScheduledOn(habit, '2026-08-24'), false);
  });

  test('weeklyQuota mode: every day is eligible from createdAt onward', () => {
    const habit = makeHabit({
      schedule: { mode: 'weeklyQuota', timesPerWeek: 3 },
      createdAt: '2026-01-01',
    });
    for (const d of ['2026-08-17', '2026-08-18', '2026-08-23']) {
      assert.equal(isScheduledOn(habit, d), true);
    }
    assert.equal(isScheduledOn(habit, '2025-12-31'), false);
  });

  test('mid-week/mid-month creation: pre-creation dates excluded for all modes', () => {
    const daily = makeHabit({ schedule: { mode: 'daily' }, createdAt: '2026-08-10' });
    const weekdays = makeHabit({
      schedule: { mode: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
      createdAt: '2026-08-10',
    });
    const quota = makeHabit({
      schedule: { mode: 'weeklyQuota', timesPerWeek: 1 },
      createdAt: '2026-08-10',
    });
    for (const habit of [daily, weekdays, quota]) {
      assert.equal(isScheduledOn(habit, '2026-08-09'), false);
      assert.equal(isScheduledOn(habit, '2026-08-10'), true);
    }
  });
});

describe('classifyDay', () => {
  test('daily habit: done when logged, missed when scheduled but not logged', () => {
    const habit = makeHabit({ schedule: { mode: 'daily' }, createdAt: '2026-01-01' });
    assert.equal(classifyDay(habit, '2026-08-19', true), 'done');
    assert.equal(classifyDay(habit, '2026-08-19', false), 'missed');
    assert.equal(classifyDay(habit, '2025-12-31', false), 'not-scheduled');
  });

  test('weekdays habit: a non-scheduled day is not-scheduled, never missed', () => {
    const habit = makeHabit({
      schedule: { mode: 'weekdays', days: [0, 1, 2, 3, 4] },
      createdAt: '2026-01-01',
    });
    assert.equal(classifyDay(habit, '2026-08-22', false), 'not-scheduled');
    assert.equal(classifyDay(habit, '2026-08-17', false), 'missed');
    assert.equal(classifyDay(habit, '2026-08-17', true), 'done');
  });

  test('weeklyQuota habit: day-level status is only done or not-scheduled, never missed', () => {
    const habit = makeHabit({
      schedule: { mode: 'weeklyQuota', timesPerWeek: 3 },
      createdAt: '2026-01-01',
    });
    assert.equal(classifyDay(habit, '2026-08-19', true), 'done');
    assert.equal(classifyDay(habit, '2026-08-19', false), 'not-scheduled');
  });
});

describe('weekBoundsFor', () => {
  test('monday-start: 2026-08-19 (Wed) is in the Mon 08-17 .. Sun 08-23 week', () => {
    const [start, end] = weekBoundsFor('2026-08-19', 'monday');
    assert.equal(start, '2026-08-17');
    assert.equal(end, '2026-08-23');
  });

  test('sunday-start: 2026-08-19 (Wed) is in the Sun 08-16 .. Sat 08-22 week', () => {
    const [start, end] = weekBoundsFor('2026-08-19', 'sunday');
    assert.equal(start, '2026-08-16');
    assert.equal(end, '2026-08-22');
  });

  test('monday-start: a Sunday belongs to the week that started the prior Monday', () => {
    const [start, end] = weekBoundsFor('2026-08-23', 'monday');
    assert.equal(start, '2026-08-17');
    assert.equal(end, '2026-08-23');
  });

  test('sunday-start: a Sunday is the start of its own week', () => {
    const [start, end] = weekBoundsFor('2026-08-23', 'sunday');
    assert.equal(start, '2026-08-23');
    assert.equal(end, '2026-08-29');
  });

  test('saturday-start: 2026-08-19 (Wed) is in the Sat 08-15 .. Fri 08-21 week', () => {
    const [start, end] = weekBoundsFor('2026-08-19', 'saturday');
    assert.equal(start, '2026-08-15');
    assert.equal(end, '2026-08-21');
  });

  test('saturday-start: a Saturday is the start of its own week', () => {
    const [start, end] = weekBoundsFor('2026-08-15', 'saturday'); // Saturday
    assert.equal(start, '2026-08-15');
    assert.equal(end, '2026-08-21');
  });
});

describe('toLocalDateString / parseLocalDate round-trip', () => {
  test('round-trips without UTC drift', () => {
    const original = '2026-01-01';
    const roundTripped = toLocalDateString(parseLocalDate(original));
    assert.equal(roundTripped, original);
  });
});

```

## modules\habit-tracking\domain\__tests__\streakCalculator.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateHabitStats, LoggedDaysLookup } from '../streakCalculator';
import { HabitDefinition } from '../types';

function makeHabit(overrides: Partial<HabitDefinition> = {}): HabitDefinition {
  return {
    id: 'h1',
    type: 'boolean',
    name: 'Test habit',
    icon: '✅',
    color: '#000000',
    schedule: { mode: 'daily' },
    trendVisible: true,
    archived: false,
    createdAt: '2026-01-01',
    order: 0,
    ...overrides,
  };
}

function loggedOn(dates: string[]): LoggedDaysLookup {
  const set = new Set(dates);
  return { isLoggedOn: (d) => set.has(d) };
}

describe('calculateHabitStats — daily habits', () => {
  test('consecutive logged days build an increasing current streak', () => {
    const habit = makeHabit({ schedule: { mode: 'daily' }, createdAt: '2026-08-15' });
    const log = loggedOn(['2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19']);
    const stats = calculateHabitStats(habit, log, '2026-08-19', '2026-08-01', 'monday');
    assert.equal(stats.currentStreak, 5);
    assert.equal(stats.longestStreak, 5);
  });

  test('a missed day resets current streak to 0 but preserves longest streak', () => {
    const habit = makeHabit({ schedule: { mode: 'daily' }, createdAt: '2026-08-10' });
    const log = loggedOn(['2026-08-10', '2026-08-11', '2026-08-12']);
    const stats = calculateHabitStats(habit, log, '2026-08-14', '2026-08-01', 'monday');
    assert.equal(stats.currentStreak, 0);
    assert.equal(stats.longestStreak, 3);
  });

  test('completion rate over a range: half the scheduled days logged', () => {
    const habit = makeHabit({ schedule: { mode: 'daily' }, createdAt: '2026-08-01' });
    const log = loggedOn(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04']);
    const stats = calculateHabitStats(habit, log, '2026-08-08', '2026-08-01', 'monday');
    assert.equal(stats.completionRate, 0.5);
  });
});

describe('calculateHabitStats — weekdays habits', () => {
  test('a not-scheduled day (weekend) does not break the streak', () => {
    const habit = makeHabit({
      schedule: { mode: 'weekdays', days: [0, 1, 2, 3, 4] },
      createdAt: '2026-08-17',
    });
    const log = loggedOn([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-24',
    ]);
    const stats = calculateHabitStats(habit, log, '2026-08-24', '2026-08-01', 'monday');
    assert.equal(stats.currentStreak, 6);
  });

  test('a genuinely missed scheduled weekday does break the streak', () => {
    const habit = makeHabit({
      schedule: { mode: 'weekdays', days: [0, 1, 2, 3, 4] },
      createdAt: '2026-08-17',
    });
    const log = loggedOn(['2026-08-17', '2026-08-18', '2026-08-20']);
    const stats = calculateHabitStats(habit, log, '2026-08-20', '2026-08-01', 'monday');
    assert.equal(stats.currentStreak, 1);
    assert.equal(stats.longestStreak, 2);
  });
});

describe('calculateHabitStats — weeklyQuota habits', () => {
  test('meeting quota within a week counts that week as met', () => {
    const habit = makeHabit({
      schedule: { mode: 'weeklyQuota', timesPerWeek: 3 },
      createdAt: '2026-08-03',
    });
    const log = loggedOn(['2026-08-03', '2026-08-05', '2026-08-07']);
    const stats = calculateHabitStats(habit, log, '2026-08-09', '2026-08-03', 'monday');
    assert.equal(stats.currentStreak, 1);
    assert.equal(stats.completionRate, 1);
  });

  test('missing quota in a fully-elapsed week resets the week-streak', () => {
    const habit = makeHabit({
      schedule: { mode: 'weeklyQuota', timesPerWeek: 3 },
      createdAt: '2026-08-03',
    });
    const log = loggedOn(['2026-08-03', '2026-08-05', '2026-08-07', '2026-08-11']);
    const stats = calculateHabitStats(habit, log, '2026-08-16', '2026-08-03', 'monday');
    assert.equal(stats.currentStreak, 0);
    assert.equal(stats.longestStreak, 1);
  });

  test('an in-progress current week is never prematurely treated as missed', () => {
    const habit = makeHabit({
      schedule: { mode: 'weeklyQuota', timesPerWeek: 3 },
      createdAt: '2026-08-03',
    });
    const log = loggedOn(['2026-08-03', '2026-08-05', '2026-08-07', '2026-08-11']);
    const stats = calculateHabitStats(habit, log, '2026-08-12', '2026-08-03', 'monday');
    assert.equal(stats.currentStreak, 1);
  });
});

```

## modules\habit-tracking\domain\scheduleEvaluator.ts

```typescript
// Pure domain logic: is a habit scheduled on a given day, and what does
// that day's status classify as. No I/O.

import { HabitDefinition, WeekStartsOn, DayStatus } from './types';
import { toLocalDateString, parseLocalDate } from '../../../core/date';

export { toLocalDateString, parseLocalDate };

function internalWeekdayIndex(date: Date): number {
  const jsDay = date.getDay();
  return (jsDay + 6) % 7;
}

export function isScheduledOn(habit: HabitDefinition, date: string): boolean {
  if (date < habit.createdAt) return false;

  switch (habit.schedule.mode) {
    case 'daily':
      return true;
    case 'weekdays': {
      const idx = internalWeekdayIndex(parseLocalDate(date));
      return habit.schedule.days.includes(idx);
    }
    case 'weeklyQuota':
      return true;
  }
}

export function classifyDay(
  habit: HabitDefinition,
  date: string,
  isLogged: boolean
): DayStatus {
  if (!isScheduledOn(habit, date)) return 'not-scheduled';

  if (habit.schedule.mode === 'weeklyQuota') {
    return isLogged ? 'done' : 'not-scheduled';
  }

  return isLogged ? 'done' : 'missed';
}

/**
 * Maps a "week starts on" setting to its fixed internal weekday index
 * (Monday=0..Sunday=6). Exported so the UI's weekday-picker display
 * order can reuse the same lookup rather than duplicating the mapping.
 */
export function weekStartInternalIndex(weekStartsOn: WeekStartsOn): number {
  switch (weekStartsOn) {
    case 'monday':
      return 0;
    case 'saturday':
      return 5;
    case 'sunday':
      return 6;
  }
}

/**
 * Returns the [startDate, endDate] (inclusive, YYYY-MM-DD) of the week
 * containing `date`, per the weekStartsOn setting (REQ-C017). Generic
 * over any start day via weekStartInternalIndex — adding Saturday as a
 * third option required no change here beyond that lookup.
 */
export function weekBoundsFor(
  date: string,
  weekStartsOn: WeekStartsOn
): [string, string] {
  const dt = parseLocalDate(date);
  const idx = internalWeekdayIndex(dt);
  const startIdx = weekStartInternalIndex(weekStartsOn);

  const offsetToStart = (idx - startIdx + 7) % 7;
  const start = new Date(dt);
  start.setDate(dt.getDate() - offsetToStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return [toLocalDateString(start), toLocalDateString(end)];
}

```

## modules\habit-tracking\domain\streakCalculator.ts

```typescript
// Pure domain logic: streak and completion-rate math. No I/O.

import { HabitDefinition, WeekStartsOn, HabitStats } from './types';
import { classifyDay, weekBoundsFor } from './scheduleEvaluator';
import { addDaysLocal } from '../../../core/date';

export interface LoggedDaysLookup {
  isLoggedOn(date: string): boolean;
}

type PeriodResult = 'met' | 'not-met' | 'not-scheduled';
interface Period {
  date: string;
  result: PeriodResult;
}

const addDays = addDaysLocal;

function buildDailyPeriods(
  habit: HabitDefinition,
  log: LoggedDaysLookup,
  fromDate: string,
  toDate: string
): Period[] {
  const periods: Period[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    const status = classifyDay(habit, cursor, log.isLoggedOn(cursor));
    const result: PeriodResult =
      status === 'done' ? 'met' : status === 'missed' ? 'not-met' : 'not-scheduled';
    periods.push({ date: cursor, result });
    cursor = addDays(cursor, 1);
  }
  return periods;
}

function buildWeeklyQuotaPeriods(
  habit: HabitDefinition,
  log: LoggedDaysLookup,
  fromDate: string,
  toDate: string,
  weekStartsOn: WeekStartsOn
): Period[] {
  if (habit.schedule.mode !== 'weeklyQuota') {
    throw new Error('buildWeeklyQuotaPeriods called on a non-weeklyQuota habit');
  }
  const quota = habit.schedule.timesPerWeek;

  const periods: Period[] = [];
  const seenWeekStarts = new Set<string>();
  let cursor = fromDate;

  while (cursor <= toDate) {
    const [weekStart, weekEnd] = weekBoundsFor(cursor, weekStartsOn);

    if (!seenWeekStarts.has(weekStart)) {
      seenWeekStarts.add(weekStart);

      const clampedStart = weekStart < habit.createdAt ? habit.createdAt : weekStart;
      if (clampedStart <= weekEnd) {
        const clampedEnd = weekEnd > toDate ? toDate : weekEnd;

        let loggedCount = 0;
        let w = clampedStart;
        while (w <= clampedEnd) {
          if (log.isLoggedOn(w)) loggedCount++;
          w = addDays(w, 1);
        }

        const weekFullyElapsed = weekEnd <= toDate;
        let result: PeriodResult;
        if (loggedCount >= quota) {
          result = 'met';
        } else if (weekFullyElapsed) {
          result = 'not-met';
        } else {
          result = 'not-scheduled';
        }

        periods.push({ date: weekStart, result });
      }
    }

    cursor = addDays(cursor, 1);
  }

  return periods;
}

function currentStreakFromPeriods(periods: Period[]): number {
  let streak = 0;
  for (let i = periods.length - 1; i >= 0; i--) {
    const r = periods[i].result;
    if (r === 'not-scheduled') continue;
    if (r === 'met') {
      streak++;
      continue;
    }
    break;
  }
  return streak;
}

function longestStreakFromPeriods(periods: Period[]): number {
  let longest = 0;
  let running = 0;
  for (const p of periods) {
    if (p.result === 'not-scheduled') continue;
    if (p.result === 'met') {
      running++;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }
  return longest;
}

function completionRateFromPeriods(periods: Period[]): number {
  const scheduled = periods.filter((p) => p.result !== 'not-scheduled');
  if (scheduled.length === 0) return 0;
  const met = scheduled.filter((p) => p.result === 'met').length;
  return met / scheduled.length;
}

export function calculateHabitStats(
  habit: HabitDefinition,
  log: LoggedDaysLookup,
  today: string,
  rangeStart: string,
  weekStartsOn: WeekStartsOn
): HabitStats {
  const fullHistory =
    habit.schedule.mode === 'weeklyQuota'
      ? buildWeeklyQuotaPeriods(habit, log, habit.createdAt, today, weekStartsOn)
      : buildDailyPeriods(habit, log, habit.createdAt, today);

  const rangePeriods = fullHistory.filter((p) => p.date >= rangeStart);

  return {
    currentStreak: currentStreakFromPeriods(fullHistory),
    longestStreak: longestStreakFromPeriods(fullHistory),
    completionRate: completionRateFromPeriods(rangePeriods),
  };
}

```

## modules\habit-tracking\domain\types.ts

```typescript
// Domain types for the Habit Tracking module.
// Pure data shapes only — no I/O, no Obsidian API, no React.
// See design-habit-tracking.md §Data Model.

export type HabitType = 'boolean' | 'numeric';

export interface HabitTarget {
  value: number;
  unit: string;
}

export type HabitSchedule =
  | { mode: 'daily' }
  | { mode: 'weekdays'; days: number[] }
  | { mode: 'weeklyQuota'; timesPerWeek: number };

export interface HabitDefinition {
  id: string;
  type: HabitType;
  name: string;
  icon: string;
  color: string;
  schedule: HabitSchedule;
  target?: HabitTarget;
  trendVisible: boolean;
  archived: boolean;
  createdAt: string;
  order: number;
}

export type WeekStartsOn = 'monday' | 'saturday' | 'sunday';

export type DayStatus = 'done' | 'missed' | 'not-scheduled';

export interface DayClassification {
  date: string;
  status: DayStatus;
}

export interface HabitStats {
  currentStreak: number;
  longestStreak: number;
  completionRate: number;
}

export interface HabitHistoryResult extends HabitStats {
  days: DayClassification[];
}

export type HabitLogValue = boolean | number;

```

## modules\habit-tracking\infrastructure\__tests__\fakeSettingsAdapter.ts

```typescript
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

```

## modules\habit-tracking\infrastructure\__tests__\fakeVaultAdapter.ts

```typescript
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

```

## modules\habit-tracking\infrastructure\__tests__\habitLogFile.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HabitLogFile, HabitLogFileReadError } from '../habitLogFile';
import { FakeVaultAdapter } from './fakeVaultAdapter';

describe('HabitLogFile round-trip', () => {
  test('writes a day, reads it back', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter);

    await log.writeField('2026-08-19', 'a1b2c3', true);
    await log.writeField('2026-08-19', 'd4e5f6', 8000);

    const day = await log.readDay('2026-08-19');
    assert.equal(day.get('a1b2c3'), true);
    assert.equal(day.get('d4e5f6'), 8000);
  });

  test('editing one field does not disturb another field on the same day (REQ-H008)', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter);

    await log.writeField('2026-08-19', 'a1b2c3', true);
    await log.writeField('2026-08-19', 'd4e5f6', 8000);
    await log.writeField('2026-08-19', 'd4e5f6', 9500);

    const day = await log.readDay('2026-08-19');
    assert.equal(day.get('a1b2c3'), true);
    assert.equal(day.get('d4e5f6'), 9500);
  });

  test('a day with no entries produces no line in the file (clean for hand-editing)', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter);

    await log.writeField('2026-08-19', 'a1b2c3', true);
    const raw = await adapter.readFile('Life Tracker/Logs/Habits/habits-2026.md');
    assert.equal(raw, '- 2026-08-19 [habit-a1b2c3:: true]\n');
  });

  test('multiple days sort chronologically in the year file', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter);

    await log.writeField('2026-08-20', 'a1b2c3', true);
    await log.writeField('2026-08-19', 'a1b2c3', true);

    const raw = await adapter.readFile('Life Tracker/Logs/Habits/habits-2026.md');
    const lines = raw.trim().split('\n');
    assert.equal(lines[0].startsWith('- 2026-08-19'), true);
    assert.equal(lines[1].startsWith('- 2026-08-20'), true);
  });

  test('readRange spans multiple year files', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter);

    await log.writeField('2025-12-30', 'a1b2c3', true);
    await log.writeField('2026-01-02', 'a1b2c3', true);

    const range = await log.readRange('2025-12-25', '2026-01-05');
    assert.equal(range.size, 2);
    assert.ok(range.has('2025-12-30'));
    assert.ok(range.has('2026-01-02'));
  });

  test('hasAnyLogEntry finds an entry across year files, and correctly reports absence', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter);
    await log.writeField('2025-06-01', 'zzz999', true);

    assert.equal(await log.hasAnyLogEntry('zzz999'), true);
    assert.equal(await log.hasAnyLogEntry('nonexistent'), false);
  });

  test('respects a configurable log folder', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter, { logFolder: 'Custom/Path' });
    await log.writeField('2026-08-19', 'a1b2c3', true);
    assert.ok(await adapter.fileExists('Custom/Path/habits-2026.md'));
  });

  test('a corrupted/unreadable file surfaces a typed error rather than silently returning empty data', async () => {
    const brokenAdapter = new FakeVaultAdapter();
    brokenAdapter.fileExists = async () => true;
    brokenAdapter.readFile = async () => {
      throw new Error('simulated disk error');
    };
    const log = new HabitLogFile(brokenAdapter);
    await assert.rejects(() => log.readDay('2026-08-19'), HabitLogFileReadError);
  });

  test('numeric values round-trip as numbers, not strings', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new HabitLogFile(adapter);
    await log.writeField('2026-08-19', 'water', 2500);
    const day = await log.readDay('2026-08-19');
    assert.equal(typeof day.get('water'), 'number');
    assert.equal(day.get('water'), 2500);
  });
});

```

## modules\habit-tracking\infrastructure\__tests__\habitSettingsStore.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HabitSettingsStore } from '../habitSettingsStore';
import { FakeSettingsAdapter } from './fakeSettingsAdapter';
import { HabitDefinition } from '../../domain/types';

function makeHabit(overrides: Partial<HabitDefinition> = {}): HabitDefinition {
  return {
    id: 'h1',
    type: 'boolean',
    name: 'Drink water',
    icon: '💧',
    color: '#3b82f6',
    schedule: { mode: 'daily' },
    trendVisible: true,
    archived: false,
    createdAt: '2026-08-01',
    order: 0,
    ...overrides,
  };
}

describe('HabitSettingsStore CRUD', () => {
  test('create then getAll/get returns the habit', async () => {
    const store = new HabitSettingsStore(new FakeSettingsAdapter());
    const habit = makeHabit();
    await store.create(habit);

    const all = await store.getAll();
    assert.equal(all.length, 1);
    assert.deepEqual(all[0], habit);

    const fetched = await store.get('h1');
    assert.deepEqual(fetched, habit);
  });

  test('update patches only the given fields and preserves id', async () => {
    const store = new HabitSettingsStore(new FakeSettingsAdapter());
    await store.create(makeHabit());

    const updated = await store.update('h1', { name: 'Drink more water', id: 'should-be-ignored' as any });
    assert.equal(updated.id, 'h1');
    assert.equal(updated.name, 'Drink more water');
    assert.equal(updated.color, '#3b82f6');
  });

  test('archive is just update({ archived: true })', async () => {
    const store = new HabitSettingsStore(new FakeSettingsAdapter());
    await store.create(makeHabit({ archived: false }));

    await store.update('h1', { archived: true });
    const habit = await store.get('h1');
    assert.equal(habit?.archived, true);
  });

  test('delete removes the habit; other habits are unaffected', async () => {
    const store = new HabitSettingsStore(new FakeSettingsAdapter());
    await store.create(makeHabit({ id: 'h1' }));
    await store.create(makeHabit({ id: 'h2', name: 'Read' }));

    await store.delete('h1');
    const all = await store.getAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, 'h2');
  });

  test('updating a non-existent habit throws', async () => {
    const store = new HabitSettingsStore(new FakeSettingsAdapter());
    await assert.rejects(() => store.update('does-not-exist', { name: 'x' }));
  });

  test('starts empty when no data has ever been saved', async () => {
    const store = new HabitSettingsStore(new FakeSettingsAdapter());
    assert.deepEqual(await store.getAll(), []);
  });
});

```

## modules\habit-tracking\infrastructure\habitLogFile.ts

```typescript
// Reads/writes the yearly markdown log files (REQ-C009/C010).

import { VaultAdapter } from './vaultAdapter';
import { HabitLogValue } from '../domain/types';

const DEFAULT_LOG_FOLDER = 'Life Tracker/Logs/Habits';

export interface HabitLogFileConfig {
  logFolder?: string;
}

export type { HabitLogValue };

const LINE_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s+(.*)$/;
const FIELD_RE = /\[habit-([a-zA-Z0-9_-]+)::\s*([^\]]+)\]/g;

function parseFieldValue(raw: string): HabitLogValue {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== '') return num;
  throw new Error(`Unrecognized habit log value: "${raw}"`);
}

function serializeFieldValue(value: HabitLogValue): string {
  return String(value);
}

function yearOf(date: string): string {
  return date.slice(0, 4);
}

export class HabitLogFileReadError extends Error {
  constructor(
    public readonly path: string,
    public readonly cause: unknown
  ) {
    super(`Failed to read habit log file: ${path}`);
    this.name = 'HabitLogFileReadError';
  }
}

export class HabitLogFile {
  constructor(
    private adapter: VaultAdapter,
    private config: HabitLogFileConfig = {}
  ) {}

  private get logFolder(): string {
    return this.config.logFolder ?? DEFAULT_LOG_FOLDER;
  }

  private pathForYear(year: string): string {
    return `${this.logFolder}/habits-${year}.md`;
  }

  private async readYearFile(
    year: string
  ): Promise<Map<string, Map<string, HabitLogValue>>> {
    const path = this.pathForYear(year);
    const result = new Map<string, Map<string, HabitLogValue>>();

    if (!(await this.adapter.fileExists(path))) return result;

    let content: string;
    try {
      content = await this.adapter.readFile(path);
    } catch (err) {
      throw new HabitLogFileReadError(path, err);
    }

    for (const line of content.split('\n')) {
      const match = LINE_RE.exec(line);
      if (!match) continue;
      const [, date, fieldsRaw] = match;
      const fields = new Map<string, HabitLogValue>();
      FIELD_RE.lastIndex = 0;
      let fieldMatch: RegExpExecArray | null;
      while ((fieldMatch = FIELD_RE.exec(fieldsRaw)) !== null) {
        const [, habitId, rawValue] = fieldMatch;
        fields.set(habitId, parseFieldValue(rawValue));
      }
      result.set(date, fields);
    }

    return result;
  }

  private serializeYearFile(days: Map<string, Map<string, HabitLogValue>>): string {
    const sortedDates = Array.from(days.keys()).sort();
    const lines: string[] = [];
    for (const date of sortedDates) {
      const fields = days.get(date)!;
      if (fields.size === 0) continue;
      const fieldStrs = Array.from(fields.entries())
        .map(([id, value]) => `[habit-${id}:: ${serializeFieldValue(value)}]`)
        .join(' ');
      lines.push(`- ${date} ${fieldStrs}`);
    }
    return lines.length > 0 ? lines.join('\n') + '\n' : '';
  }

  private async writeYearFile(
    year: string,
    days: Map<string, Map<string, HabitLogValue>>
  ): Promise<void> {
    if (!(await this.adapter.folderExists(this.logFolder))) {
      await this.adapter.createFolder(this.logFolder);
    }
    await this.adapter.writeFile(this.pathForYear(year), this.serializeYearFile(days));
  }

  async readDay(date: string): Promise<Map<string, HabitLogValue>> {
    const days = await this.readYearFile(yearOf(date));
    return days.get(date) ?? new Map();
  }

  async readRange(
    startDate: string,
    endDate: string
  ): Promise<Map<string, Map<string, HabitLogValue>>> {
    const startYear = Number(yearOf(startDate));
    const endYear = Number(yearOf(endDate));
    const result = new Map<string, Map<string, HabitLogValue>>();

    for (let y = startYear; y <= endYear; y++) {
      const days = await this.readYearFile(String(y));
      for (const [date, fields] of days) {
        if (date >= startDate && date <= endDate) {
          result.set(date, fields);
        }
      }
    }
    return result;
  }

  async writeField(date: string, habitId: string, value: HabitLogValue): Promise<void> {
    const year = yearOf(date);
    const days = await this.readYearFile(year);
    const fields = days.get(date) ?? new Map<string, HabitLogValue>();
    fields.set(habitId, value);
    days.set(date, fields);
    await this.writeYearFile(year, days);
  }

  async hasAnyLogEntry(habitId: string): Promise<boolean> {
    const files = await this.adapter.listFilesUnder(this.logFolder);
    for (const file of files) {
      const content = await this.adapter.readFile(file.path);
      if (content.includes(`[habit-${habitId}::`)) return true;
    }
    return false;
  }
}

```

## modules\habit-tracking\infrastructure\habitSettingsStore.ts

```typescript
// CRUD for HabitDefinition[] against the plugin's settings blob.

import { HabitDefinition } from '../domain/types';
import { SettingsAdapter } from './settingsAdapter';

interface LifeTrackerData {
  habits?: HabitDefinition[];
  [key: string]: unknown;
}

export class HabitSettingsStore {
  constructor(private adapter: SettingsAdapter) {}

  async getAll(): Promise<HabitDefinition[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.habits ?? [];
  }

  async get(id: string): Promise<HabitDefinition | undefined> {
    const habits = await this.getAll();
    return habits.find((h) => h.id === id);
  }

  private async saveAll(habits: HabitDefinition[]): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.habits = habits;
    await this.adapter.save(data);
  }

  async create(habit: HabitDefinition): Promise<HabitDefinition> {
    const habits = await this.getAll();
    habits.push(habit);
    await this.saveAll(habits);
    return habit;
  }

  async update(id: string, patch: Partial<HabitDefinition>): Promise<HabitDefinition> {
    const habits = await this.getAll();
    const idx = habits.findIndex((h) => h.id === id);
    if (idx === -1) throw new Error(`Habit not found: ${id}`);
    const updated: HabitDefinition = { ...habits[idx], ...patch, id: habits[idx].id };
    habits[idx] = updated;
    await this.saveAll(habits);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const habits = await this.getAll();
    await this.saveAll(habits.filter((h) => h.id !== id));
  }
}

```

## modules\habit-tracking\infrastructure\obsidianSettingsAdapter.ts

```typescript
// Re-exported from src/core/adapters/obsidianSettingsAdapter.ts — see
// obsidianVaultAdapter.ts in this folder for why.
export { ObsidianSettingsAdapter } from '../../../core/adapters/obsidianSettingsAdapter';

```

## modules\habit-tracking\infrastructure\obsidianVaultAdapter.ts

```typescript
// Re-exported from src/core/adapters/obsidianVaultAdapter.ts — a single
// shared instance is now constructed once in main.ts and passed to
// every module, rather than each module wrapping the Obsidian Vault
// API separately.
export { ObsidianVaultAdapter } from '../../../core/adapters/obsidianVaultAdapter';

```

## modules\habit-tracking\infrastructure\settingsAdapter.ts

```typescript
// Re-exported from src/core/ports/settingsAdapter.ts — see vaultAdapter.ts
// in this folder for why.
export type { SettingsAdapter } from '../../../core/ports/settingsAdapter';

```

## modules\habit-tracking\infrastructure\vaultAdapter.ts

```typescript
// Re-exported from src/core/ports/vaultAdapter.ts, where this interface
// now lives (promoted once Data Point Tracking needed the same port —
// see that file's header comment). Kept here so every existing import
// of VaultAdapter/VaultFileRef from this path keeps working unchanged.
export type { VaultAdapter, VaultFileRef } from '../../../core/ports/vaultAdapter';

```

## modules\money-management\application\__tests__\moneyService.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MoneyService } from '../moneyService';
import { MoneySettingsStore } from '../../infrastructure/moneySettingsStore';
import { TransactionLogFile } from '../../infrastructure/transactionLogFile';
import { FakeSettingsAdapter } from '../../../../core/ports/__tests__/fakeSettingsAdapter';
import { FakeVaultAdapter } from '../../../../core/ports/__tests__/fakeVaultAdapter';

function makeService(fixedToday = '2026-08-19') {
  const settingsStore = new MoneySettingsStore(new FakeSettingsAdapter());
  const logFile = new TransactionLogFile(new FakeVaultAdapter());
  let idCounter = 0;
  const service = new MoneyService({
    settingsStore,
    logFile,
    idGenerator: () => `id${++idCounter}`,
    clock: () => new Date(`${fixedToday}T12:00:00`),
  });
  return { service, settingsStore, logFile };
}

describe('MoneyService accounts & balances', () => {
  test('a fresh account with no transactions shows its opening balance', async () => {
    const { service } = makeService();
    await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 100);
  });

  test('recording an expense reduces the balance (REQ-M004/M007)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    await service.recordTransaction({ date: '2026-08-19', accountId: account.id, type: 'expense', amount: -20 });

    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 80);
  });

  test('deleting a transaction updates the balance (REQ-M008)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    const tx = await service.recordTransaction({
      date: '2026-08-19',
      accountId: account.id,
      type: 'expense',
      amount: -20,
    });

    await service.deleteTransaction('2026-08-19', tx.id);

    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 100);
  });

  test('a transfer moves money between two accounts, net-zero overall (REQ-M002/M003)', async () => {
    const { service } = makeService();
    const checking = await service.createAccount({ name: 'Checking', currency: 'USD', openingBalance: 500 });
    const savings = await service.createAccount({ name: 'Savings', currency: 'USD', openingBalance: 0 });

    await service.recordTransfer({
      date: '2026-08-19',
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amount: 100,
    });

    const withBalances = await service.getAccountsWithBalances();
    const checkingBalance = withBalances.find((w) => w.account.id === checking.id)?.balance;
    const savingsBalance = withBalances.find((w) => w.account.id === savings.id)?.balance;
    assert.equal(checkingBalance, 400);
    assert.equal(savingsBalance, 100);
  });

  test('an archived account is excluded from getAccounts/getAccountsWithBalances', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Old', currency: 'USD', openingBalance: 0 });
    await service.updateAccount(account.id, { archived: true });

    assert.deepEqual(await service.getAccounts(), []);
    assert.deepEqual(await service.getAccountsWithBalances(), []);
  });
});

describe('MoneyService currency conversion / net worth', () => {
  test('getNetWorth sums accounts already in the primary currency', async () => {
    const { service } = makeService();
    await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    await service.createAccount({ name: 'Savings', currency: 'USD', openingBalance: 50 });

    const { total, excludedAccounts } = await service.getNetWorth();
    assert.equal(total, 150);
    assert.equal(excludedAccounts.length, 0);
  });

  test('applies a configured rate to convert a non-primary-currency account', async () => {
    const { service } = makeService();
    await service.setExchangeRates({ primaryCurrency: 'USD', ratesToPrimary: { EGP: 0.02 } });
    await service.createAccount({ name: 'USD wallet', currency: 'USD', openingBalance: 100 });
    await service.createAccount({ name: 'EGP wallet', currency: 'EGP', openingBalance: 1000 });

    const { total, excludedAccounts } = await service.getNetWorth();
    assert.equal(total, 120); // 100 + (1000 * 0.02)
    assert.equal(excludedAccounts.length, 0);
  });

  test('excludes (rather than mis-includes) an account whose currency has no configured rate', async () => {
    const { service } = makeService();
    await service.createAccount({ name: 'USD wallet', currency: 'USD', openingBalance: 100 });
    await service.createAccount({ name: 'JPY wallet', currency: 'JPY', openingBalance: 10000 });

    const { total, excludedAccounts } = await service.getNetWorth();
    assert.equal(total, 100);
    assert.equal(excludedAccounts.length, 1);
    assert.equal(excludedAccounts[0].currency, 'JPY');
  });
});

describe('MoneyService categories', () => {
  test('deleting a category leaves existing transactions resolving to Uncategorized (REQ-M015)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 0 });
    const category = await service.createCategory({ kind: 'expense', name: 'Food' });
    const tx = await service.recordTransaction({
      date: '2026-08-19',
      accountId: account.id,
      type: 'expense',
      categoryId: category.id,
      amount: -10,
    });

    await service.deleteCategory(category.id);

    const label = await service.resolveCategoryLabel(tx.categoryId);
    assert.equal(label, 'Uncategorized');
  });
});

describe('MoneyService.undoLastTransaction', () => {
  test('removes the most recently recorded transaction', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    await service.recordTransaction({ date: '2026-08-19', accountId: account.id, type: 'expense', amount: -20 });

    const undone = await service.undoLastTransaction();
    assert.equal(undone, true);

    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 100);
  });

  test('undoes both legs of the most recent transfer', async () => {
    const { service } = makeService();
    const checking = await service.createAccount({ name: 'Checking', currency: 'USD', openingBalance: 500 });
    const savings = await service.createAccount({ name: 'Savings', currency: 'USD', openingBalance: 0 });
    await service.recordTransfer({ date: '2026-08-19', fromAccountId: checking.id, toAccountId: savings.id, amount: 100 });

    await service.undoLastTransaction();

    const withBalances = await service.getAccountsWithBalances();
    assert.equal(withBalances.find((w) => w.account.id === checking.id)?.balance, 500);
    assert.equal(withBalances.find((w) => w.account.id === savings.id)?.balance, 0);
  });

  test('returns false when nothing has been recorded this session', async () => {
    const { service } = makeService();
    assert.equal(await service.undoLastTransaction(), false);
  });

  test('a second undo call after the first is a no-op (nothing left to undo)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    await service.recordTransaction({ date: '2026-08-19', accountId: account.id, type: 'expense', amount: -20 });

    assert.equal(await service.undoLastTransaction(), true);
    assert.equal(await service.undoLastTransaction(), false);
  });
});

describe('MoneyService.getIncomeExpenseTotals', () => {
  test('excludes transfers from the totals', async () => {
    const { service } = makeService();
    const checking = await service.createAccount({ name: 'Checking', currency: 'USD', openingBalance: 500 });
    const savings = await service.createAccount({ name: 'Savings', currency: 'USD', openingBalance: 0 });
    await service.recordTransaction({ date: '2026-08-19', accountId: checking.id, type: 'income', amount: 1000 });
    await service.recordTransfer({ date: '2026-08-19', fromAccountId: checking.id, toAccountId: savings.id, amount: 200 });

    const totals = await service.getIncomeExpenseTotals('2026-08-01', '2026-08-31');
    assert.equal(totals.income, 1000);
    assert.equal(totals.expense, 0);
  });
});

describe('MoneyService.getRecentNames / getPriceHistory', () => {
  test('getRecentNames deduplicates and returns most recent first (REQ-M009)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 0 });
    await service.recordTransaction({ date: '2026-08-17', accountId: account.id, type: 'expense', amount: -5, name: 'Coffee' });
    await service.recordTransaction({ date: '2026-08-19', accountId: account.id, type: 'expense', amount: -5, name: 'Coffee' });
    await service.recordTransaction({ date: '2026-08-18', accountId: account.id, type: 'expense', amount: -30, name: 'Groceries' });

    const names = await service.getRecentNames();
    assert.deepEqual(names, ['Coffee', 'Groceries']);
  });

  test('getPriceHistory returns every logged amount for that exact name, oldest first (REQ-M011)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 0 });
    await service.recordTransaction({ date: '2026-08-19', accountId: account.id, type: 'expense', amount: -6, name: 'Coffee' });
    await service.recordTransaction({ date: '2026-08-17', accountId: account.id, type: 'expense', amount: -5, name: 'Coffee' });

    const history = await service.getPriceHistory('Coffee');
    assert.deepEqual(history.map((h) => h.date), ['2026-08-17', '2026-08-19']);
  });
});

describe('MoneyService transaction time-of-day', () => {
  test('defaults to the current time from the clock when not provided', async () => {
    const { service } = makeService('2026-08-19'); // fixed clock is T12:00:00
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 0 });
    const tx = await service.recordTransaction({ date: '2026-08-19', accountId: account.id, type: 'expense', amount: -5 });
    assert.equal(tx.time, '12:00');
  });

  test('an explicitly provided time is used instead of the clock', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 0 });
    const tx = await service.recordTransaction({
      date: '2026-08-19',
      time: '07:45',
      accountId: account.id,
      type: 'expense',
      amount: -5,
    });
    assert.equal(tx.time, '07:45');
  });
});

describe('MoneyService recurring entries', () => {
  test('a newly created recurring entry is not due until its frequency has elapsed', async () => {
    const { service } = makeService('2026-08-01');
    const account = await service.createAccount({ name: 'Checking', currency: 'USD', openingBalance: 0 });
    await service.createRecurringEntry({
      name: 'Netflix',
      type: 'expense',
      accountId: account.id,
      amount: 15,
      frequency: 'monthly',
      dayOfMonth: 1,
    });

    assert.deepEqual(await service.getDueRecurringEntries(), []);
  });

  test('logRecurringEntry creates a linked transaction and advances lastHandledDate (REQ-M035)', async () => {
    const { service } = makeService('2026-09-01');
    const account = await service.createAccount({ name: 'Checking', currency: 'USD', openingBalance: 100 });
    const entry = await service.createRecurringEntry({
      name: 'Netflix',
      type: 'expense',
      accountId: account.id,
      amount: 15,
      frequency: 'monthly',
      dayOfMonth: 1,
    });
    // Force it into a due state: last handled a month ago -> next due 2026-09-01, today is 2026-09-01.
    await service.updateRecurringEntry(entry.id, { lastHandledDate: '2026-08-01' });

    const due = await service.getDueRecurringEntries();
    assert.equal(due.length, 1);

    const tx = await service.logRecurringEntry(entry.id, '2026-09-01');
    assert.equal(tx.recurringEntryId, entry.id);
    assert.equal(tx.amount, -15);

    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 85);

    assert.deepEqual(await service.getDueRecurringEntries(), []); // no longer due right after logging
  });

  test('skipRecurringEntry advances lastHandledDate without creating a transaction', async () => {
    const { service } = makeService('2026-09-01');
    const account = await service.createAccount({ name: 'Checking', currency: 'USD', openingBalance: 100 });
    const entry = await service.createRecurringEntry({
      name: 'Netflix',
      type: 'expense',
      accountId: account.id,
      amount: 15,
      frequency: 'monthly',
      dayOfMonth: 1,
    });

    await service.skipRecurringEntry(entry.id, '2026-09-01');

    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 100); // unchanged — nothing logged
    assert.deepEqual(await service.getDueRecurringEntries(), []);
  });

  test('editing the recurring template does not retroactively alter transactions already logged (REQ-M035)', async () => {
    const { service } = makeService('2026-09-01');
    const account = await service.createAccount({ name: 'Checking', currency: 'USD', openingBalance: 0 });
    const entry = await service.createRecurringEntry({
      name: 'Netflix',
      type: 'expense',
      accountId: account.id,
      amount: 15,
      frequency: 'monthly',
      dayOfMonth: 1,
    });
    const tx = await service.logRecurringEntry(entry.id, '2026-09-01');

    await service.updateRecurringEntry(entry.id, { amount: 25 }); // price increase going forward

    const stillLogged = (await service.listTransactions('2026-09-01', '2026-09-01')).find((t) => t.id === tx.id);
    assert.equal(stillLogged?.amount, -15); // untouched
  });
});

describe('MoneyService shopping lists', () => {
  test('addShoppingItem accepts an unknown price at add-time (REQ-M022)', async () => {
    const { service } = makeService();
    const list = await service.createShoppingList('Groceries');
    const item = await service.addShoppingItem({ listId: list.id, name: 'Milk' });
    assert.equal(item.estimatedPrice, undefined);
    assert.equal(item.status, 'pending');
  });

  test('getShoppingListSummary counts pending items and sums estimated price (REQ-M024)', async () => {
    const { service } = makeService();
    const list = await service.createShoppingList('Groceries');
    await service.addShoppingItem({ listId: list.id, name: 'Milk', estimatedPrice: 3 });
    await service.addShoppingItem({ listId: list.id, name: 'Bread', estimatedPrice: 2 });
    await service.addShoppingItem({ listId: list.id, name: 'Eggs' }); // unknown price

    const summary = await service.getShoppingListSummary(list.id);
    assert.equal(summary.pendingCount, 3);
    assert.equal(summary.estimatedTotal, 5);
  });

  test('markShoppingItemBought creates a linked expense transaction and moves the item to purchase history (REQ-M023)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    const list = await service.createShoppingList('Groceries');
    const item = await service.addShoppingItem({ listId: list.id, name: 'Milk', quantity: 2, estimatedPrice: 3 });

    const tx = await service.markShoppingItemBought(item.id, { actualPrice: 3.5, accountId: account.id, date: '2026-08-19' });

    assert.equal(tx.shoppingItemId, item.id);
    assert.equal(tx.amount, -3.5);
    assert.equal(tx.name, 'Milk');
    assert.equal(tx.quantity, 2);

    const items = await service.getShoppingItems(list.id);
    const bought = items.find((i) => i.id === item.id);
    assert.equal(bought?.status, 'bought');
    assert.equal(bought?.actualPrice, 3.5);
    assert.equal(bought?.transactionId, tx.id);

    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 96.5);
  });

  test('deleting the auto-created transaction reverts the shopping item to pending (REQ-M034)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    const list = await service.createShoppingList('Groceries');
    const item = await service.addShoppingItem({ listId: list.id, name: 'Milk' });
    const tx = await service.markShoppingItemBought(item.id, { actualPrice: 3.5, accountId: account.id, date: '2026-08-19' });

    await service.deleteTransaction('2026-08-19', tx.id);

    const items = await service.getShoppingItems(list.id);
    const reverted = items.find((i) => i.id === item.id);
    assert.equal(reverted?.status, 'pending');
    assert.equal(reverted?.transactionId, undefined);
    assert.equal(reverted?.actualPrice, undefined);
  });

  test('undoing the last transaction also reverts a shopping purchase (REQ-M010 + M034 explicit interaction)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    const list = await service.createShoppingList('Groceries');
    const item = await service.addShoppingItem({ listId: list.id, name: 'Milk' });
    await service.markShoppingItemBought(item.id, { actualPrice: 3.5, accountId: account.id, date: '2026-08-19' });

    await service.undoLastTransaction();

    const items = await service.getShoppingItems(list.id);
    assert.equal(items.find((i) => i.id === item.id)?.status, 'pending');
    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 100);
  });

  test('deleteShoppingList also removes its items', async () => {
    const { service } = makeService();
    const list = await service.createShoppingList('Groceries');
    await service.addShoppingItem({ listId: list.id, name: 'Milk' });

    await service.deleteShoppingList(list.id);

    assert.deepEqual(await service.getShoppingLists(), []);
    assert.deepEqual(await service.getShoppingItems(list.id), []);
  });
});

```

## modules\money-management\application\moneyService.ts

```typescript
// Orchestrates the domain layer (balance/currency/category/recurring
// math) and infrastructure layer (settings store, transaction log)
// into the operations the UI layer calls. No direct file I/O of its
// own. Mirrors habitService.ts/dataPointService.ts's structure and DI
// pattern. See design-money-management.md for scope/rationale.

import {
  Account,
  Category,
  NewAccountInput,
  NewCategoryInput,
  NewTransactionInput,
  NewTransferInput,
  Transaction,
  ExchangeRates,
  RecurringEntry,
  NewRecurringEntryInput,
  ShoppingList,
  ShoppingItem,
  NewShoppingItemInput,
  MarkItemBoughtInput,
} from '../domain/types';
import { calculateAccountBalance, calculateIncomeExpenseTotals } from '../domain/balanceCalculator';
import { convertToPrimary } from '../domain/currencyConverter';
import { buildCategoryTree, CategoryNode, resolveCategoryLabel } from '../domain/categoryTree';
import { isRecurringEntryDue } from '../domain/recurringDueCalculator';
import { MoneySettingsStore } from '../infrastructure/moneySettingsStore';
import { TransactionLogFile, RawTransaction } from '../infrastructure/transactionLogFile';
import { getTodayLocal } from '../../../core/date';

export interface MoneyServiceDeps {
  settingsStore: MoneySettingsStore;
  logFile: TransactionLogFile;
  idGenerator: () => string;
  clock?: () => Date;
}

export interface AccountWithBalance {
  account: Account;
  balance: number;
  /** Balance converted to the primary currency, or null if no rate is configured for this account's currency (design doc's resolved Open Question). */
  balanceInPrimary: number | null;
}

export class MoneyService {
  private settingsStore: MoneySettingsStore;
  private logFile: TransactionLogFile;
  private idGenerator: () => string;
  private clock: () => Date;
  /** In-memory only (not persisted) — REQ-M010's "within the current session" scope. */
  private lastRecorded: { date: string; ids: string[] } | null = null;

  constructor(deps: MoneyServiceDeps) {
    this.settingsStore = deps.settingsStore;
    this.logFile = deps.logFile;
    this.idGenerator = deps.idGenerator;
    this.clock = deps.clock ?? (() => new Date());
  }

  private today(): string {
    return getTodayLocal(this.clock);
  }

  private nowHHMM(): string {
    const now = this.clock();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  // --- Accounts ---

  async createAccount(input: NewAccountInput): Promise<Account> {
    const existing = await this.settingsStore.getAccounts();
    const account: Account = {
      id: this.idGenerator(),
      name: input.name,
      currency: input.currency,
      openingBalance: input.openingBalance,
      archived: false,
      createdAt: this.today(),
      order: existing.length,
    };
    return this.settingsStore.createAccount(account);
  }

  async updateAccount(id: string, patch: Partial<Account>): Promise<Account> {
    return this.settingsStore.updateAccount(id, patch);
  }

  async getAccounts(): Promise<Account[]> {
    const all = await this.settingsStore.getAccounts();
    return all.filter((a) => !a.archived).sort((a, b) => a.order - b.order);
  }

  /** Every active account with its computed balance (REQ-M007), plus that balance converted to the primary currency where a rate exists. */
  async getAccountsWithBalances(): Promise<AccountWithBalance[]> {
    const [accounts, rawTxs, rates] = await Promise.all([
      this.getAccounts(),
      this.logFile.readAll(),
      this.settingsStore.getExchangeRates(),
    ]);
    const transactions = rawTxs.map(toDomainTransaction);

    return accounts.map((account) => {
      const balance = calculateAccountBalance(account, transactions);
      return {
        account,
        balance,
        balanceInPrimary: convertToPrimary(balance, account.currency, rates),
      };
    });
  }

  /** Sum of every account's balance converted to the primary currency (design doc's resolved multi-currency Open Question). Accounts with no configured rate are excluded and reported separately so the total is never silently wrong. */
  async getNetWorth(): Promise<{ total: number; excludedAccounts: Account[] }> {
    const withBalances = await this.getAccountsWithBalances();
    let total = 0;
    const excludedAccounts: Account[] = [];
    for (const { account, balanceInPrimary } of withBalances) {
      if (balanceInPrimary === null) {
        excludedAccounts.push(account);
      } else {
        total += balanceInPrimary;
      }
    }
    return { total, excludedAccounts };
  }

  async getExchangeRates(): Promise<ExchangeRates> {
    return this.settingsStore.getExchangeRates();
  }

  async setExchangeRates(rates: ExchangeRates): Promise<void> {
    await this.settingsStore.setExchangeRates(rates);
  }

  /** Every currency in active use by an account, or configured with a rate — lets the settings UI offer "add a currency" ahead of creating an account in it, not just currencies already in use. */
  async getKnownCurrencies(): Promise<string[]> {
    const [accounts, rates] = await Promise.all([this.getAccounts(), this.getExchangeRates()]);
    const set = new Set<string>();
    for (const a of accounts) set.add(a.currency);
    for (const c of Object.keys(rates.ratesToPrimary)) set.add(c);
    set.add(rates.primaryCurrency);
    return Array.from(set).sort();
  }

  // --- Categories ---

  async createCategory(input: NewCategoryInput): Promise<Category> {
    const existing = await this.settingsStore.getCategories();
    const category: Category = {
      id: this.idGenerator(),
      kind: input.kind,
      name: input.name,
      parentId: input.parentId,
      order: existing.filter((c) => c.kind === input.kind && c.parentId === input.parentId).length,
    };
    return this.settingsStore.createCategory(category);
  }

  async renameCategory(id: string, name: string): Promise<Category> {
    return this.settingsStore.renameCategory(id, name);
  }

  async deleteCategory(id: string): Promise<void> {
    await this.settingsStore.deleteCategory(id);
  }

  async getCategoryTree(kind: 'expense' | 'income'): Promise<CategoryNode[]> {
    const all = await this.settingsStore.getCategories();
    return buildCategoryTree(all, kind);
  }

  // --- Transactions ---

  async recordTransaction(input: NewTransactionInput): Promise<Transaction> {
    const raw: RawTransaction = {
      id: this.idGenerator(),
      date: input.date,
      time: input.time ?? this.nowHHMM(),
      accountId: input.accountId,
      type: input.type,
      categoryId: input.categoryId ?? '',
      amount: String(input.amount),
      quantity: input.quantity !== undefined ? String(input.quantity) : '',
      transferPairId: '',
      recurringEntryId: input.recurringEntryId ?? '',
      shoppingItemId: input.shoppingItemId ?? '',
      name: input.name,
      note: input.note,
    };
    await this.logFile.upsertTransaction(raw);
    this.lastRecorded = { date: input.date, ids: [raw.id] };
    return toDomainTransaction(raw);
  }

  /** REQ-M003: a transfer is recorded as two linked legs, one per account, opposite signed amounts. */
  async recordTransfer(input: NewTransferInput): Promise<[Transaction, Transaction]> {
    const pairId = this.idGenerator();
    const time = input.time ?? this.nowHHMM();
    const fromLeg: RawTransaction = {
      id: this.idGenerator(),
      date: input.date,
      time,
      accountId: input.fromAccountId,
      type: 'transfer',
      categoryId: '',
      amount: String(-Math.abs(input.amount)),
      quantity: '',
      transferPairId: pairId,
      recurringEntryId: '',
      shoppingItemId: '',
      note: input.note,
    };
    const toLeg: RawTransaction = {
      id: this.idGenerator(),
      date: input.date,
      time,
      accountId: input.toAccountId,
      type: 'transfer',
      categoryId: '',
      amount: String(Math.abs(input.amount)),
      quantity: '',
      transferPairId: pairId,
      recurringEntryId: '',
      shoppingItemId: '',
      note: input.note,
    };
    await this.logFile.upsertTransaction(fromLeg);
    await this.logFile.upsertTransaction(toLeg);
    this.lastRecorded = { date: input.date, ids: [fromLeg.id, toLeg.id] };
    return [toDomainTransaction(fromLeg), toDomainTransaction(toLeg)];
  }

  /**
   * REQ-M008: deleting a transaction — balances are always recomputed
   * live, so there's no separate "recalculate" step needed after this.
   * REQ-M034: if this transaction was auto-created from a shopping
   * purchase, the source item reverts to pending.
   */
  async deleteTransaction(date: string, id: string): Promise<void> {
    await this.logFile.deleteTransaction(date, id);

    const items = await this.settingsStore.getShoppingItems();
    const linkedItem = items.find((i) => i.transactionId === id);
    if (linkedItem) {
      await this.settingsStore.updateShoppingItem(linkedItem.id, {
        status: 'pending',
        purchasedDate: undefined,
        actualPrice: undefined,
        accountId: undefined,
        transactionId: undefined,
      });
    }
  }

  /** REQ-M010: undo the most recently recorded transaction (or both legs of the most recent transfer) within the current session. Routes through deleteTransaction so a shopping-purchase revert (REQ-M034) applies here too, per the requirements doc's explicit note. No-op if nothing's been recorded yet this session. */
  async undoLastTransaction(): Promise<boolean> {
    if (!this.lastRecorded) return false;
    const { date, ids } = this.lastRecorded;
    for (const id of ids) {
      await this.deleteTransaction(date, id);
    }
    this.lastRecorded = null;
    return true;
  }

  async listTransactions(rangeStart: string, rangeEnd: string): Promise<Transaction[]> {
    const raw = await this.logFile.readRange(rangeStart, rangeEnd);
    return raw.map(toDomainTransaction).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }

  async getIncomeExpenseTotals(rangeStart: string, rangeEnd: string): Promise<{ income: number; expense: number }> {
    const transactions = await this.listTransactions(rangeStart, rangeEnd);
    return calculateIncomeExpenseTotals(transactions);
  }

  /** REQ-M009: previously-used transaction names, for autocomplete on new entries — most recent first, deduplicated. */
  async getRecentNames(limit = 20): Promise<string[]> {
    const all = await this.logFile.readAll();
    const seen = new Set<string>();
    const names: string[] = [];
    const sorted = [...all].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    for (const t of sorted) {
      if (!t.name || seen.has(t.name)) continue;
      seen.add(t.name);
      names.push(t.name);
      if (names.length >= limit) break;
    }
    return names;
  }

  /** REQ-M011: price-history for a given item name — every past transaction logged under that exact name, oldest first. */
  async getPriceHistory(name: string): Promise<{ date: string; amount: number }[]> {
    const all = await this.logFile.readAll();
    return all
      .filter((t) => t.name === name)
      .map((t) => ({ date: t.date, amount: Number(t.amount) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Resolves a transaction's category to a display label, via the full category list (REQ-M015: deleted category -> "Uncategorized"). */
  async resolveCategoryLabel(categoryId: string | undefined): Promise<string> {
    const categories = await this.settingsStore.getCategories();
    return resolveCategoryLabel(categoryId, categories);
  }

  // --- Recurring entries (REQ-M018-M020, M035) ---

  async createRecurringEntry(input: NewRecurringEntryInput): Promise<RecurringEntry> {
    const existing = await this.settingsStore.getRecurringEntries();
    const entry: RecurringEntry = {
      id: this.idGenerator(),
      name: input.name,
      type: input.type,
      accountId: input.accountId,
      categoryId: input.categoryId,
      amount: input.amount,
      frequency: input.frequency,
      dayOfMonth: input.dayOfMonth,
      note: input.note,
      archived: false,
      createdAt: this.today(),
      order: existing.length,
    };
    return this.settingsStore.createRecurringEntry(entry);
  }

  async updateRecurringEntry(id: string, patch: Partial<RecurringEntry>): Promise<RecurringEntry> {
    return this.settingsStore.updateRecurringEntry(id, patch);
  }

  async archiveRecurringEntry(id: string): Promise<void> {
    await this.settingsStore.updateRecurringEntry(id, { archived: true });
  }

  async getRecurringEntries(): Promise<RecurringEntry[]> {
    const all = await this.settingsStore.getRecurringEntries();
    return all.filter((r) => !r.archived).sort((a, b) => a.order - b.order);
  }

  /** REQ-M020: recurring entries currently due, for the "needs attention" area. */
  async getDueRecurringEntries(): Promise<RecurringEntry[]> {
    const today = this.today();
    const active = await this.getRecurringEntries();
    return active.filter((entry) => isRecurringEntryDue(entry, today));
  }

  /**
   * REQ-M020/M035: logs a due recurring entry — creates a transaction
   * linked back to the recurring entry's id (for traceability; later
   * edits to the template never retroactively alter transactions
   * already logged from earlier cycles, since this just copies the
   * current values once) and advances lastHandledDate.
   */
  async logRecurringEntry(id: string, date: string): Promise<Transaction> {
    const all = await this.settingsStore.getRecurringEntries();
    const entry = all.find((r) => r.id === id);
    if (!entry) throw new Error(`Recurring entry not found: ${id}`);

    const signedAmount = entry.type === 'expense' ? -Math.abs(entry.amount) : Math.abs(entry.amount);
    const tx = await this.recordTransaction({
      date,
      accountId: entry.accountId,
      type: entry.type,
      categoryId: entry.categoryId,
      amount: signedAmount,
      name: entry.name,
      note: entry.note,
      recurringEntryId: entry.id,
    });
    await this.settingsStore.updateRecurringEntry(id, { lastHandledDate: date });
    return tx;
  }

  /** REQ-M020: explicitly skip this cycle without logging a transaction — still advances lastHandledDate so it isn't immediately due again. */
  async skipRecurringEntry(id: string, date: string): Promise<void> {
    await this.settingsStore.updateRecurringEntry(id, { lastHandledDate: date });
  }

  // --- Shopping lists & items (REQ-M021-M025) ---

  async createShoppingList(name: string): Promise<ShoppingList> {
    const existing = await this.settingsStore.getShoppingLists();
    const list: ShoppingList = {
      id: this.idGenerator(),
      name,
      archived: false,
      createdAt: this.today(),
      order: existing.length,
    };
    return this.settingsStore.createShoppingList(list);
  }

  async deleteShoppingList(id: string): Promise<void> {
    await this.settingsStore.deleteShoppingList(id);
  }

  async getShoppingLists(): Promise<ShoppingList[]> {
    const all = await this.settingsStore.getShoppingLists();
    return all.filter((l) => !l.archived).sort((a, b) => a.order - b.order);
  }

  async addShoppingItem(input: NewShoppingItemInput): Promise<ShoppingItem> {
    const existing = await this.settingsStore.getShoppingItems();
    const item: ShoppingItem = {
      id: this.idGenerator(),
      listId: input.listId,
      name: input.name,
      categoryId: input.categoryId,
      quantity: input.quantity,
      estimatedPrice: input.estimatedPrice,
      note: input.note,
      dueDate: input.dueDate,
      status: 'pending',
      createdAt: this.today(),
      order: existing.filter((i) => i.listId === input.listId).length,
    };
    return this.settingsStore.createShoppingItem(item);
  }

  async deleteShoppingItem(id: string): Promise<void> {
    await this.settingsStore.deleteShoppingItem(id);
  }

  async getShoppingItems(listId: string): Promise<ShoppingItem[]> {
    const all = await this.settingsStore.getShoppingItems();
    return all.filter((i) => i.listId === listId).sort((a, b) => a.order - b.order);
  }

  /** REQ-M021/M024: pending-item count and estimated-price total for a list. */
  async getShoppingListSummary(listId: string): Promise<{ pendingCount: number; estimatedTotal: number }> {
    const items = await this.getShoppingItems(listId);
    const pending = items.filter((i) => i.status === 'pending');
    return {
      pendingCount: pending.length,
      estimatedTotal: pending.reduce((sum, i) => sum + (i.estimatedPrice ?? 0), 0),
    };
  }

  /**
   * REQ-M023: marking a pending item bought creates a linked expense
   * transaction using the actual price/account/date, using the item's
   * name/category/quantity, and moves the item into purchase history.
   */
  async markShoppingItemBought(itemId: string, input: MarkItemBoughtInput): Promise<Transaction> {
    const items = await this.settingsStore.getShoppingItems();
    const item = items.find((i) => i.id === itemId);
    if (!item) throw new Error(`Shopping item not found: ${itemId}`);

    const tx = await this.recordTransaction({
      date: input.date,
      time: input.time,
      accountId: input.accountId,
      type: 'expense',
      categoryId: item.categoryId,
      amount: -Math.abs(input.actualPrice),
      quantity: item.quantity,
      name: item.name,
      shoppingItemId: item.id,
    });

    await this.settingsStore.updateShoppingItem(itemId, {
      status: 'bought',
      purchasedDate: input.date,
      actualPrice: input.actualPrice,
      accountId: input.accountId,
      transactionId: tx.id,
    });

    return tx;
  }
}

function toDomainTransaction(raw: RawTransaction): Transaction {
  return {
    id: raw.id,
    date: raw.date,
    time: raw.time,
    accountId: raw.accountId,
    type: raw.type as Transaction['type'],
    categoryId: raw.categoryId || undefined,
    amount: Number(raw.amount),
    quantity: raw.quantity ? Number(raw.quantity) : undefined,
    transferPairId: raw.transferPairId || undefined,
    recurringEntryId: raw.recurringEntryId || undefined,
    shoppingItemId: raw.shoppingItemId || undefined,
    name: raw.name,
    note: raw.note,
  };
}

```

## modules\money-management\domain\__tests__\balanceCalculator.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAccountBalance, calculateIncomeExpenseTotals } from '../balanceCalculator';
import { Account, Transaction } from '../types';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Wallet',
    currency: 'USD',
    openingBalance: 100,
    archived: false,
    createdAt: '2026-01-01',
    order: 0,
    ...overrides,
  };
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    date: '2026-08-19',
    accountId: 'a1',
    type: 'expense',
    amount: -20,
    ...overrides,
  };
}

describe('calculateAccountBalance', () => {
  test('opening balance plus its own transactions, ignoring other accounts', () => {
    const account = makeAccount({ openingBalance: 100 });
    const txs = [
      makeTx({ id: 't1', accountId: 'a1', amount: -20 }),
      makeTx({ id: 't2', accountId: 'a1', amount: 50 }),
      makeTx({ id: 't3', accountId: 'a2', amount: -1000 }), // different account, must not affect a1
    ];
    assert.equal(calculateAccountBalance(account, txs), 130);
  });

  test('no transactions leaves the balance at opening balance', () => {
    const account = makeAccount({ openingBalance: 250 });
    assert.equal(calculateAccountBalance(account, []), 250);
  });

  test('an adjustment transaction shifts the balance like any other signed amount (REQ-M002)', () => {
    const account = makeAccount({ openingBalance: 0 });
    const txs = [makeTx({ type: 'adjustment', amount: 42 })];
    assert.equal(calculateAccountBalance(account, txs), 42);
  });
});

describe('calculateIncomeExpenseTotals', () => {
  test('sums income and expense separately, expense as a positive magnitude', () => {
    const txs = [
      makeTx({ type: 'income', amount: 500 }),
      makeTx({ type: 'expense', amount: -30 }),
      makeTx({ type: 'expense', amount: -15 }),
    ];
    const totals = calculateIncomeExpenseTotals(txs);
    assert.equal(totals.income, 500);
    assert.equal(totals.expense, 45);
  });

  test('excludes transfers from both totals (REQ-M003)', () => {
    const txs = [
      makeTx({ type: 'transfer', amount: -100, transferPairId: 'p1' }),
      makeTx({ type: 'transfer', amount: 100, transferPairId: 'p1' }),
    ];
    const totals = calculateIncomeExpenseTotals(txs);
    assert.equal(totals.income, 0);
    assert.equal(totals.expense, 0);
  });

  test('excludes adjustments from income/expense totals', () => {
    const txs = [makeTx({ type: 'adjustment', amount: 1000 })];
    const totals = calculateIncomeExpenseTotals(txs);
    assert.equal(totals.income, 0);
    assert.equal(totals.expense, 0);
  });
});

```

## modules\money-management\domain\__tests__\categoryTree.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildCategoryTree, resolveCategoryLabel } from '../categoryTree';
import { Category } from '../types';

function makeCategory(overrides: Partial<Category> = {}): Category {
  return { id: 'c1', kind: 'expense', name: 'Food', order: 0, ...overrides };
}

describe('buildCategoryTree', () => {
  test('groups subcategories under their main category, scoped by kind', () => {
    const categories: Category[] = [
      makeCategory({ id: 'food', kind: 'expense', name: 'Food', order: 0 }),
      makeCategory({ id: 'junk', kind: 'expense', name: 'Junk', parentId: 'food', order: 0 }),
      makeCategory({ id: 'fruit', kind: 'expense', name: 'Fruit', parentId: 'food', order: 1 }),
      makeCategory({ id: 'salary', kind: 'income', name: 'Salary', order: 0 }),
    ];

    const expenseTree = buildCategoryTree(categories, 'expense');
    assert.equal(expenseTree.length, 1);
    assert.equal(expenseTree[0].category.name, 'Food');
    assert.deepEqual(
      expenseTree[0].children.map((c) => c.name),
      ['Junk', 'Fruit']
    );

    const incomeTree = buildCategoryTree(categories, 'income');
    assert.equal(incomeTree.length, 1);
    assert.equal(incomeTree[0].category.name, 'Salary');
  });

  test('subcategories are not shared across unrelated main categories (REQ-M012)', () => {
    const categories: Category[] = [
      makeCategory({ id: 'food', kind: 'expense', name: 'Food' }),
      makeCategory({ id: 'transport', kind: 'expense', name: 'Transport' }),
      makeCategory({ id: 'junk', kind: 'expense', name: 'Junk', parentId: 'food' }),
    ];
    const tree = buildCategoryTree(categories, 'expense');
    const transportNode = tree.find((n) => n.category.id === 'transport');
    assert.equal(transportNode?.children.length, 0);
  });
});

describe('resolveCategoryLabel', () => {
  test('resolves a valid categoryId to its name', () => {
    const categories = [makeCategory({ id: 'food', name: 'Food' })];
    assert.equal(resolveCategoryLabel('food', categories), 'Food');
  });

  test('resolves an absent categoryId to Uncategorized', () => {
    assert.equal(resolveCategoryLabel(undefined, []), 'Uncategorized');
  });

  test('resolves a categoryId pointing at a deleted category to Uncategorized (REQ-M015)', () => {
    assert.equal(resolveCategoryLabel('does-not-exist', []), 'Uncategorized');
  });
});

```

## modules\money-management\domain\__tests__\currencyConverter.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { convertToPrimary } from '../currencyConverter';
import { ExchangeRates } from '../types';

describe('convertToPrimary', () => {
  test('an amount already in the primary currency passes through unchanged', () => {
    const rates: ExchangeRates = { primaryCurrency: 'USD', ratesToPrimary: {} };
    assert.equal(convertToPrimary(100, 'USD', rates), 100);
  });

  test('applies the configured rate for a non-primary currency', () => {
    const rates: ExchangeRates = { primaryCurrency: 'USD', ratesToPrimary: { EGP: 0.02 } };
    assert.equal(convertToPrimary(1000, 'EGP', rates), 20);
  });

  test('returns null (not a silent 1:1 guess) when no rate is configured', () => {
    const rates: ExchangeRates = { primaryCurrency: 'USD', ratesToPrimary: {} };
    assert.equal(convertToPrimary(1000, 'EGP', rates), null);
  });
});

```

## modules\money-management\domain\__tests__\recurringDueCalculator.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateNextDueDate, isRecurringEntryDue } from '../recurringDueCalculator';
import { RecurringEntry } from '../types';

function makeEntry(overrides: Partial<RecurringEntry> = {}): Pick<RecurringEntry, 'frequency' | 'dayOfMonth' | 'lastHandledDate' | 'createdAt'> {
  return {
    frequency: 'monthly',
    createdAt: '2026-01-01',
    ...overrides,
  };
}

describe('calculateNextDueDate', () => {
  test('never-handled weekly entry is due 7 days after creation', () => {
    const entry = makeEntry({ frequency: 'weekly', createdAt: '2026-08-01' });
    assert.equal(calculateNextDueDate(entry), '2026-08-08');
  });

  test('biweekly is 14 days after last handled', () => {
    const entry = makeEntry({ frequency: 'biweekly', createdAt: '2026-08-01', lastHandledDate: '2026-08-10' });
    assert.equal(calculateNextDueDate(entry), '2026-08-24');
  });

  test('monthly respects dayOfMonth', () => {
    const entry = makeEntry({ frequency: 'monthly', createdAt: '2026-01-05', dayOfMonth: 15 });
    assert.equal(calculateNextDueDate(entry), '2026-02-15');
  });

  test('yearly rolls the year forward, respecting dayOfMonth', () => {
    const entry = makeEntry({ frequency: 'yearly', createdAt: '2026-03-10', dayOfMonth: 10 });
    assert.equal(calculateNextDueDate(entry), '2027-03-10');
  });

  test('a handled entry bases the next due date off lastHandledDate, not createdAt', () => {
    const entry = makeEntry({ frequency: 'monthly', createdAt: '2026-01-05', lastHandledDate: '2026-06-05', dayOfMonth: 5 });
    assert.equal(calculateNextDueDate(entry), '2026-07-05');
  });
});

describe('isRecurringEntryDue', () => {
  test('is due once today reaches or passes the next due date', () => {
    const entry = makeEntry({ frequency: 'weekly', createdAt: '2026-08-01' }); // due 2026-08-08
    assert.equal(isRecurringEntryDue(entry, '2026-08-07'), false);
    assert.equal(isRecurringEntryDue(entry, '2026-08-08'), true);
    assert.equal(isRecurringEntryDue(entry, '2026-08-09'), true);
  });
});

```

## modules\money-management\domain\balanceCalculator.ts

```typescript
// Pure domain logic: an account's balance is always derived from its
// transactions, never stored (REQ-M004). No I/O. Deleting a
// transaction "recalculates" the balance for free (REQ-M008) since
// there's nothing cached to invalidate — every read just re-sums.

import { Account, Transaction } from './types';

export function calculateAccountBalance(account: Account, allTransactions: Transaction[]): number {
  const delta = allTransactions
    .filter((t) => t.accountId === account.id)
    .reduce((sum, t) => sum + t.amount, 0);
  return account.openingBalance + delta;
}

/** Income/expense totals for a period, excluding transfers (REQ-M003) and adjustments (a balance correction, not real income/spend). */
export function calculateIncomeExpenseTotals(transactions: Transaction[]): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += Math.abs(t.amount);
  }
  return { income, expense };
}

```

## modules\money-management\domain\categoryTree.ts

```typescript
// Pure domain logic: hierarchical category helpers (REQ-M012-M015).
// No I/O.

import { Category, CategoryKind, UNCATEGORIZED_LABEL } from './types';

export interface CategoryNode {
  category: Category;
  children: Category[];
}

/** Builds a { main category -> its subcategories } tree for one kind (expense or income), REQ-M012/M013. */
export function buildCategoryTree(categories: Category[], kind: CategoryKind): CategoryNode[] {
  const inKind = categories.filter((c) => c.kind === kind);
  const mains = inKind.filter((c) => !c.parentId).sort((a, b) => a.order - b.order);
  return mains.map((main) => ({
    category: main,
    children: inKind.filter((c) => c.parentId === main.id).sort((a, b) => a.order - b.order),
  }));
}

/** Resolves a transaction's categoryId to a display name — "Uncategorized" if absent or the category no longer exists (REQ-M015). Never mutates the transaction itself. */
export function resolveCategoryLabel(categoryId: string | undefined, categories: Category[]): string {
  if (!categoryId) return UNCATEGORIZED_LABEL;
  const category = categories.find((c) => c.id === categoryId);
  return category ? category.name : UNCATEGORIZED_LABEL;
}

```

## modules\money-management\domain\currencyConverter.ts

```typescript
// Pure domain logic: converting an amount to the primary reporting
// currency using manually-entered rates (design-money-management.md's
// resolved Open Question). No I/O.

import { ExchangeRates } from './types';

/**
 * Returns the amount converted to `rates.primaryCurrency`, or `null`
 * if `currency` isn't the primary currency and has no configured rate
 * — callers must exclude/flag rather than silently treat a missing
 * rate as 1, which would quietly corrupt an aggregate total.
 */
export function convertToPrimary(amount: number, currency: string, rates: ExchangeRates): number | null {
  if (currency === rates.primaryCurrency) return amount;
  const rate = rates.ratesToPrimary[currency];
  if (rate === undefined) return null;
  return amount * rate;
}

```

## modules\money-management\domain\recurringDueCalculator.ts

```typescript
// Pure domain logic: when is a recurring entry next due, and is it due
// right now (REQ-M019/M020). No I/O.

import { RecurringEntry } from './types';
import { addDaysLocal, addMonthsLocal } from '../../../core/date';

export function calculateNextDueDate(
  entry: Pick<RecurringEntry, 'frequency' | 'dayOfMonth' | 'lastHandledDate' | 'createdAt'>
): string {
  const base = entry.lastHandledDate ?? entry.createdAt;
  switch (entry.frequency) {
    case 'weekly':
      return addDaysLocal(base, 7);
    case 'biweekly':
      return addDaysLocal(base, 14);
    case 'monthly':
      return addMonthsLocal(base, 1, entry.dayOfMonth);
    case 'yearly':
      return addMonthsLocal(base, 12, entry.dayOfMonth);
  }
}

export function isRecurringEntryDue(
  entry: Pick<RecurringEntry, 'frequency' | 'dayOfMonth' | 'lastHandledDate' | 'createdAt'>,
  today: string
): boolean {
  return calculateNextDueDate(entry) <= today;
}

```

## modules\money-management\domain\types.ts

```typescript
// Domain types for Money Management. Pure data shapes only — no I/O,
// no Obsidian API, no React. See design-money-management.md.

export interface Account {
  id: string;
  name: string;
  currency: string; // free-text code — genuinely custom, not restricted to a fixed list (see Currency Conversion settings)
  openingBalance: number; // REQ-M001; balance itself is always computed (REQ-M004), never stored
  archived: boolean;
  createdAt: string;
  order: number;
}

export interface NewAccountInput {
  name: string;
  currency: string;
  openingBalance: number;
}

export type CategoryKind = 'expense' | 'income';

export interface Category {
  id: string;
  kind: CategoryKind; // REQ-M013: separate trees for expense vs. income
  name: string;
  parentId?: string; // absent = main category; present = subcategory scoped to that parent (REQ-M012)
  order: number;
}

export interface NewCategoryInput {
  kind: CategoryKind;
  name: string;
  parentId?: string;
}

export type TransactionType = 'expense' | 'income' | 'transfer' | 'adjustment';

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM local time the transaction occurred, not just the day
  accountId: string;
  type: TransactionType;
  categoryId?: string; // absent, or pointing at a since-deleted category, resolves to "Uncategorized" (REQ-M015)
  amount: number; // signed
  quantity?: number;
  name?: string;
  note?: string;
  /** Links the two legs of a transfer (REQ-M003) — both legs share this id. Absent for non-transfer types. */
  transferPairId?: string;
  /** Traceability back to the recurring entry that spawned this transaction (REQ-M035). Absent for manually-entered transactions. */
  recurringEntryId?: string;
  /** Traceability back to the shopping item this purchase was logged from (REQ-M023). Absent otherwise. */
  shoppingItemId?: string;
}

/** Input for expense/income/adjustment — transfers go through recordTransfer() instead, since they always produce two linked rows. */
export interface NewTransactionInput {
  date: string;
  time?: string; // defaults to "now" (via the service's clock) if omitted
  accountId: string;
  type: 'expense' | 'income' | 'adjustment';
  categoryId?: string;
  amount: number;
  quantity?: number;
  name?: string;
  note?: string;
  recurringEntryId?: string;
  shoppingItemId?: string;
}

export interface NewTransferInput {
  date: string;
  time?: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number; // positive magnitude moved
  note?: string;
}

export interface ExchangeRates {
  primaryCurrency: string;
  /** 1 unit of that currency key = N units of primaryCurrency. */
  ratesToPrimary: Record<string, number>;
}

export const UNCATEGORIZED_LABEL = 'Uncategorized';

// --- Recurring Entries (REQ-M018-M020, M035) ---

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export interface RecurringEntry {
  id: string;
  name: string;
  type: 'income' | 'expense';
  accountId: string;
  categoryId?: string;
  amount: number; // positive magnitude; sign applied when logged, based on type
  frequency: RecurringFrequency;
  /** Required for monthly/yearly; ignored for weekly/biweekly. */
  dayOfMonth?: number;
  note?: string;
  /** Undefined until first logged or skipped — due-date math falls back to createdAt. */
  lastHandledDate?: string;
  archived: boolean;
  createdAt: string;
  order: number;
}

export interface NewRecurringEntryInput {
  name: string;
  type: 'income' | 'expense';
  accountId: string;
  categoryId?: string;
  amount: number;
  frequency: RecurringFrequency;
  dayOfMonth?: number;
  note?: string;
}

// --- Shopping Lists (REQ-M021-M025) ---

export interface ShoppingList {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  order: number;
}

export type ShoppingItemStatus = 'pending' | 'bought';

export interface ShoppingItem {
  id: string;
  listId: string;
  name: string;
  categoryId?: string;
  quantity?: number;
  /** Optional at add-time (REQ-M022) — a price can be decided later, when actually buying. */
  estimatedPrice?: number;
  note?: string;
  /** Optional — when this item should be purchased or the activity done. */
  dueDate?: string;
  status: ShoppingItemStatus;
  createdAt: string;
  order: number;
  // Purchase-history fields (REQ-M025), populated only once status === 'bought':
  purchasedDate?: string;
  actualPrice?: number;
  accountId?: string;
  /** Traceability to the auto-created expense transaction (REQ-M023); used to revert to pending if that transaction is later deleted (REQ-M034). */
  transactionId?: string;
}

export interface NewShoppingItemInput {
  listId: string;
  name: string;
  categoryId?: string;
  quantity?: number;
  estimatedPrice?: number;
  note?: string;
  dueDate?: string;
}

export interface MarkItemBoughtInput {
  actualPrice: number;
  accountId: string;
  date: string;
  time?: string;
}

```

## modules\money-management\infrastructure\__tests__\moneySettingsStore.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MoneySettingsStore } from '../moneySettingsStore';
import { FakeSettingsAdapter } from '../../../../core/ports/__tests__/fakeSettingsAdapter';
import { Account, Category } from '../../domain/types';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Wallet',
    currency: 'USD',
    openingBalance: 0,
    archived: false,
    createdAt: '2026-01-01',
    order: 0,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return { id: 'c1', kind: 'expense', name: 'Food', order: 0, ...overrides };
}

describe('MoneySettingsStore accounts', () => {
  test('create then getAccounts/getAccount', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    const account = makeAccount();
    await store.createAccount(account);
    assert.deepEqual(await store.getAccounts(), [account]);
    assert.deepEqual(await store.getAccount('a1'), account);
  });

  test('update preserves id and untouched fields', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createAccount(makeAccount());
    const updated = await store.updateAccount('a1', { name: 'Main wallet' });
    assert.equal(updated.name, 'Main wallet');
    assert.equal(updated.currency, 'USD');
  });
});

describe('MoneySettingsStore categories', () => {
  test('create then getCategories', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createCategory(makeCategory());
    assert.equal((await store.getCategories()).length, 1);
  });

  test('renameCategory updates only the name', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createCategory(makeCategory({ name: 'Food' }));
    const renamed = await store.renameCategory('c1', 'Groceries');
    assert.equal(renamed.name, 'Groceries');
  });

  test('deleteCategory removes it and its subcategories (REQ-M012 scoping)', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createCategory(makeCategory({ id: 'food', name: 'Food' }));
    await store.createCategory(makeCategory({ id: 'junk', name: 'Junk', parentId: 'food' }));
    await store.createCategory(makeCategory({ id: 'transport', name: 'Transport' }));

    await store.deleteCategory('food');

    const remaining = await store.getCategories();
    assert.deepEqual(
      remaining.map((c) => c.id).sort(),
      ['transport']
    );
  });
});

describe('MoneySettingsStore exchange rates', () => {
  test('defaults to USD primary with no configured rates', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    const rates = await store.getExchangeRates();
    assert.equal(rates.primaryCurrency, 'USD');
    assert.deepEqual(rates.ratesToPrimary, {});
  });

  test('round-trips a saved configuration', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.setExchangeRates({ primaryCurrency: 'USD', ratesToPrimary: { EGP: 0.02 } });
    const rates = await store.getExchangeRates();
    assert.equal(rates.ratesToPrimary.EGP, 0.02);
  });
});

describe('MoneySettingsStore recurring entries', () => {
  function makeEntry(overrides: Partial<import('../../domain/types').RecurringEntry> = {}) {
    return {
      id: 'r1',
      name: 'Netflix',
      type: 'expense' as const,
      accountId: 'a1',
      amount: 15,
      frequency: 'monthly' as const,
      dayOfMonth: 1,
      archived: false,
      createdAt: '2026-01-01',
      order: 0,
      ...overrides,
    };
  }

  test('create then getRecurringEntries', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createRecurringEntry(makeEntry());
    assert.equal((await store.getRecurringEntries()).length, 1);
  });

  test('update preserves id and untouched fields, e.g. bumping lastHandledDate', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createRecurringEntry(makeEntry());
    const updated = await store.updateRecurringEntry('r1', { lastHandledDate: '2026-02-01' });
    assert.equal(updated.lastHandledDate, '2026-02-01');
    assert.equal(updated.name, 'Netflix');
  });
});

describe('MoneySettingsStore shopping lists & items', () => {
  test('create then getShoppingLists', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createShoppingList({ id: 'l1', name: 'Groceries', archived: false, createdAt: '2026-01-01', order: 0 });
    assert.equal((await store.getShoppingLists()).length, 1);
  });

  test('deleteShoppingList also removes its items', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createShoppingList({ id: 'l1', name: 'Groceries', archived: false, createdAt: '2026-01-01', order: 0 });
    await store.createShoppingItem({
      id: 'i1',
      listId: 'l1',
      name: 'Milk',
      status: 'pending',
      createdAt: '2026-01-01',
      order: 0,
    });

    await store.deleteShoppingList('l1');

    assert.equal((await store.getShoppingLists()).length, 0);
    assert.equal((await store.getShoppingItems()).length, 0);
  });

  test('updateShoppingItem marks bought with purchase-history fields', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createShoppingItem({
      id: 'i1',
      listId: 'l1',
      name: 'Milk',
      status: 'pending',
      createdAt: '2026-01-01',
      order: 0,
    });

    const updated = await store.updateShoppingItem('i1', {
      status: 'bought',
      purchasedDate: '2026-01-05',
      actualPrice: 3.5,
      accountId: 'a1',
      transactionId: 't1',
    });

    assert.equal(updated.status, 'bought');
    assert.equal(updated.actualPrice, 3.5);
  });

  test('deleteShoppingItem removes only that item', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createShoppingItem({ id: 'i1', listId: 'l1', name: 'Milk', status: 'pending', createdAt: '2026-01-01', order: 0 });
    await store.createShoppingItem({ id: 'i2', listId: 'l1', name: 'Bread', status: 'pending', createdAt: '2026-01-01', order: 1 });

    await store.deleteShoppingItem('i1');

    const remaining = await store.getShoppingItems();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 'i2');
  });
});

```

## modules\money-management\infrastructure\__tests__\transactionLogFile.test.ts

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TransactionLogFile, TransactionLogFileReadError, RawTransaction } from '../transactionLogFile';
import { FakeVaultAdapter } from '../../../../core/ports/__tests__/fakeVaultAdapter';

function makeRaw(overrides: Partial<RawTransaction> = {}): RawTransaction {
  return {
    id: 't1',
    date: '2026-08-19',
    time: '08:15',
    accountId: 'a1',
    type: 'expense',
    categoryId: 'food',
    amount: '-20',
    quantity: '',
    transferPairId: '',
    recurringEntryId: '',
    shoppingItemId: '',
    ...overrides,
  };
}

describe('TransactionLogFile round-trip', () => {
  test('writes a transaction, reads it back with all structured fields intact, including time', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw());

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 1);
    assert.equal(day[0].accountId, 'a1');
    assert.equal(day[0].type, 'expense');
    assert.equal(day[0].categoryId, 'food');
    assert.equal(day[0].amount, '-20');
    assert.equal(day[0].time, '08:15');
  });

  test('recurringEntryId and shoppingItemId round-trip (REQ-M035/M023 traceability)', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw({ id: 't1', recurringEntryId: 'rec1' }));
    await log.upsertTransaction(makeRaw({ id: 't2', shoppingItemId: 'item1' }));

    const day = await log.readDay('2026-08-19');
    assert.equal(day.find((t) => t.id === 't1')?.recurringEntryId, 'rec1');
    assert.equal(day.find((t) => t.id === 't2')?.shoppingItemId, 'item1');
  });

  test('optional name/note round-trip as separate fields, and are absent when not provided', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw({ id: 't1', name: 'Coffee', note: 'with a friend' }));
    await log.upsertTransaction(makeRaw({ id: 't2' })); // no name/note

    const day = await log.readDay('2026-08-19');
    const withNote = day.find((t) => t.id === 't1');
    const withoutNote = day.find((t) => t.id === 't2');
    assert.equal(withNote?.name, 'Coffee');
    assert.equal(withNote?.note, 'with a friend');
    assert.equal(withoutNote?.name, undefined);
    assert.equal(withoutNote?.note, undefined);
  });

  test('multiple transactions the same day are all kept independently', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw({ id: 't1', amount: '-20' }));
    await log.upsertTransaction(makeRaw({ id: 't2', amount: '-15' }));

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 2);
  });

  test('editing one transaction (upsert with same id) does not disturb others that day', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw({ id: 't1', amount: '-20' }));
    await log.upsertTransaction(makeRaw({ id: 't2', amount: '-15' }));
    await log.upsertTransaction(makeRaw({ id: 't1', amount: '-25' })); // edit t1

    const day = await log.readDay('2026-08-19');
    assert.equal(day.find((t) => t.id === 't1')?.amount, '-25');
    assert.equal(day.find((t) => t.id === 't2')?.amount, '-15');
  });

  test('deleteTransaction removes only that one (REQ-M008)', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw({ id: 't1' }));
    await log.upsertTransaction(makeRaw({ id: 't2' }));

    await log.deleteTransaction('2026-08-19', 't1');

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 1);
    assert.equal(day[0].id, 't2');
  });

  test('a transfer pair (two legs sharing transferPairId) both round-trip', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(
      makeRaw({ id: 't1', accountId: 'checking', type: 'transfer', amount: '-100', transferPairId: 'p1' })
    );
    await log.upsertTransaction(
      makeRaw({ id: 't2', accountId: 'savings', type: 'transfer', amount: '100', transferPairId: 'p1' })
    );

    const day = await log.readDay('2026-08-19');
    assert.equal(day.length, 2);
    assert.ok(day.every((t) => t.transferPairId === 'p1'));
  });

  test('readAll aggregates every transaction across every year file, for balance calculation', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw({ id: 't1', date: '2025-06-01' }));
    await log.upsertTransaction(makeRaw({ id: 't2', date: '2026-08-19' }));

    const all = await log.readAll();
    assert.equal(all.length, 2);
  });

  test('readRange spans multiple year files', async () => {
    const log = new TransactionLogFile(new FakeVaultAdapter());
    await log.upsertTransaction(makeRaw({ id: 't1', date: '2025-12-30' }));
    await log.upsertTransaction(makeRaw({ id: 't2', date: '2026-01-02' }));

    const range = await log.readRange('2025-12-25', '2026-01-05');
    assert.equal(range.length, 2);
  });

  test('a day with no entries produces no line in the file', async () => {
    const adapter = new FakeVaultAdapter();
    const log = new TransactionLogFile(adapter);
    await log.upsertTransaction(makeRaw());
    const raw = await adapter.readFile('Life Tracker/Logs/Money/transactions-2026.md');
    assert.equal(raw, '- 2026-08-19 [tx-t1:: a1|expense|food|-20|||||08:15]\n');
  });

  test('a corrupted/unreadable file surfaces a typed error rather than silently returning empty data', async () => {
    const brokenAdapter = new FakeVaultAdapter();
    brokenAdapter.fileExists = async () => true;
    brokenAdapter.readFile = async () => {
      throw new Error('simulated disk error');
    };
    const log = new TransactionLogFile(brokenAdapter);
    await assert.rejects(() => log.readDay('2026-08-19'), TransactionLogFileReadError);
  });
});

```

## modules\money-management\infrastructure\moneySettingsStore.ts

```typescript
// CRUD for Account[], Category[], ExchangeRates, RecurringEntry[], and
// ShoppingList[]/ShoppingItem[] against the plugin's settings blob
// (REQ-C008), under their own top-level keys — same data.json,
// separate keys from other modules'. Recurring entries and shopping
// items are definitions/state that change status over time but aren't
// time-series log data the way transactions are, so per
// PROJECT_PRINCIPLES.md's storage model they belong in settings, not
// the markdown log.

import { Account, Category, ExchangeRates, RecurringEntry, ShoppingList, ShoppingItem } from '../domain/types';
import { SettingsAdapter } from '../../../core/ports/settingsAdapter';

interface LifeTrackerData {
  accounts?: Account[];
  categories?: Category[];
  exchangeRates?: ExchangeRates;
  recurringEntries?: RecurringEntry[];
  shoppingLists?: ShoppingList[];
  shoppingItems?: ShoppingItem[];
  [key: string]: unknown;
}

const DEFAULT_RATES: ExchangeRates = { primaryCurrency: 'USD', ratesToPrimary: {} };

export class MoneySettingsStore {
  constructor(private adapter: SettingsAdapter) {}

  // --- Accounts ---

  async getAccounts(): Promise<Account[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.accounts ?? [];
  }

  async getAccount(id: string): Promise<Account | undefined> {
    const all = await this.getAccounts();
    return all.find((a) => a.id === id);
  }

  async createAccount(account: Account): Promise<Account> {
    const all = await this.getAccounts();
    all.push(account);
    await this.saveAccounts(all);
    return account;
  }

  async updateAccount(id: string, patch: Partial<Account>): Promise<Account> {
    const all = await this.getAccounts();
    const idx = all.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`Account not found: ${id}`);
    const updated: Account = { ...all[idx], ...patch, id: all[idx].id };
    all[idx] = updated;
    await this.saveAccounts(all);
    return updated;
  }

  private async saveAccounts(accounts: Account[]): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.accounts = accounts;
    await this.adapter.save(data);
  }

  // --- Categories ---

  async getCategories(): Promise<Category[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.categories ?? [];
  }

  async createCategory(category: Category): Promise<Category> {
    const all = await this.getCategories();
    all.push(category);
    await this.saveCategories(all);
    return category;
  }

  async renameCategory(id: string, name: string): Promise<Category> {
    const all = await this.getCategories();
    const idx = all.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Category not found: ${id}`);
    all[idx] = { ...all[idx], name };
    await this.saveCategories(all);
    return all[idx];
  }

  /** Removes a category (and, per REQ-M012, its subcategories if it's a main category). Existing transactions referencing it are left as-is; they resolve to "Uncategorized" at read time (REQ-M015), not rewritten here. */
  async deleteCategory(id: string): Promise<void> {
    const all = await this.getCategories();
    const remaining = all.filter((c) => c.id !== id && c.parentId !== id);
    await this.saveCategories(remaining);
  }

  private async saveCategories(categories: Category[]): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.categories = categories;
    await this.adapter.save(data);
  }

  // --- Exchange rates ---

  async getExchangeRates(): Promise<ExchangeRates> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.exchangeRates ?? DEFAULT_RATES;
  }

  async setExchangeRates(rates: ExchangeRates): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.exchangeRates = rates;
    await this.adapter.save(data);
  }

  // --- Recurring entries (REQ-M018-M020) ---

  async getRecurringEntries(): Promise<RecurringEntry[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.recurringEntries ?? [];
  }

  async createRecurringEntry(entry: RecurringEntry): Promise<RecurringEntry> {
    const all = await this.getRecurringEntries();
    all.push(entry);
    await this.saveRecurringEntries(all);
    return entry;
  }

  async updateRecurringEntry(id: string, patch: Partial<RecurringEntry>): Promise<RecurringEntry> {
    const all = await this.getRecurringEntries();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Recurring entry not found: ${id}`);
    const updated: RecurringEntry = { ...all[idx], ...patch, id: all[idx].id };
    all[idx] = updated;
    await this.saveRecurringEntries(all);
    return updated;
  }

  private async saveRecurringEntries(entries: RecurringEntry[]): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.recurringEntries = entries;
    await this.adapter.save(data);
  }

  // --- Shopping lists & items (REQ-M021-M025) ---

  async getShoppingLists(): Promise<ShoppingList[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.shoppingLists ?? [];
  }

  async createShoppingList(list: ShoppingList): Promise<ShoppingList> {
    const all = await this.getShoppingLists();
    all.push(list);
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.shoppingLists = all;
    await this.adapter.save(data);
    return list;
  }

  async deleteShoppingList(id: string): Promise<void> {
    const lists = (await this.getShoppingLists()).filter((l) => l.id !== id);
    const items = (await this.getShoppingItems()).filter((i) => i.listId !== id);
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.shoppingLists = lists;
    data.shoppingItems = items;
    await this.adapter.save(data);
  }

  async getShoppingItems(): Promise<ShoppingItem[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.shoppingItems ?? [];
  }

  async createShoppingItem(item: ShoppingItem): Promise<ShoppingItem> {
    const all = await this.getShoppingItems();
    all.push(item);
    await this.saveShoppingItems(all);
    return item;
  }

  async updateShoppingItem(id: string, patch: Partial<ShoppingItem>): Promise<ShoppingItem> {
    const all = await this.getShoppingItems();
    const idx = all.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error(`Shopping item not found: ${id}`);
    const updated: ShoppingItem = { ...all[idx], ...patch, id: all[idx].id };
    all[idx] = updated;
    await this.saveShoppingItems(all);
    return updated;
  }

  async deleteShoppingItem(id: string): Promise<void> {
    const all = (await this.getShoppingItems()).filter((i) => i.id !== id);
    await this.saveShoppingItems(all);
  }

  private async saveShoppingItems(items: ShoppingItem[]): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.shoppingItems = items;
    await this.adapter.save(data);
  }
}

```

## modules\money-management\infrastructure\transactionLogFile.ts

```typescript
// Reads/writes the yearly markdown log files for Money Management
// (REQ-C009/C010, per-entry like Data Point Tracking since multiple
// transactions per day are the norm, not the exception). See
// design-money-management.md's Data Model section for the exact
// format and why `tx-`/`txn-`/`txnote-` are unambiguous prefixes.
//
// Main field is nine pipe-delimited structured parts (none can contain
// `|`, so a plain split is always safe): account, type, category,
// amount, quantity, transferPairId, recurringEntryId, shoppingItemId,
// time. Time and the two traceability ids were added after the format
// first shipped; empty slots serialize as ''.

import { VaultAdapter } from '../../../core/ports/vaultAdapter';

const DEFAULT_LOG_FOLDER = 'Life Tracker/Logs/Money';

export interface TransactionLogFileConfig {
  logFolder?: string;
}

export interface RawTransaction {
  id: string;
  date: string;
  time: string; // HH:MM
  accountId: string;
  type: string;
  categoryId: string; // '' = none
  amount: string; // raw numeric string
  quantity: string; // '' = none
  transferPairId: string; // '' = none
  recurringEntryId: string; // '' = none
  shoppingItemId: string; // '' = none
  name?: string;
  note?: string;
}

const LINE_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s+(.*)$/;
const MAIN_RE = /\[tx-([a-zA-Z0-9_-]+)::\s*([^\]]+)\]/g;
const NAME_RE = /\[txn-([a-zA-Z0-9_-]+)::\s*([^\]]+)\]/g;
const NOTE_RE = /\[txnote-([a-zA-Z0-9_-]+)::\s*([^\]]+)\]/g;

const MAIN_FIELD_COUNT = 9;

function serializeMain(t: RawTransaction): string {
  return [
    t.accountId,
    t.type,
    t.categoryId,
    t.amount,
    t.quantity,
    t.transferPairId,
    t.recurringEntryId,
    t.shoppingItemId,
    t.time,
  ].join('|');
}

function parseMain(raw: string): Omit<RawTransaction, 'id' | 'date' | 'name' | 'note'> {
  const parts = raw.split('|');
  if (parts.length !== MAIN_FIELD_COUNT) {
    throw new Error(`Malformed transaction log entry: "${raw}"`);
  }
  const [accountId, type, categoryId, amount, quantity, transferPairId, recurringEntryId, shoppingItemId, time] =
    parts;
  return {
    accountId,
    type,
    categoryId,
    amount,
    quantity,
    transferPairId,
    recurringEntryId,
    shoppingItemId,
    time,
  };
}

function yearOf(date: string): string {
  return date.slice(0, 4);
}

export class TransactionLogFileReadError extends Error {
  constructor(
    public readonly path: string,
    public readonly cause: unknown
  ) {
    super(`Failed to read transaction log file: ${path}`);
    this.name = 'TransactionLogFileReadError';
  }
}

export class TransactionLogFile {
  constructor(
    private adapter: VaultAdapter,
    private config: TransactionLogFileConfig = {}
  ) {}

  private get logFolder(): string {
    return this.config.logFolder ?? DEFAULT_LOG_FOLDER;
  }

  private pathForYear(year: string): string {
    return `${this.logFolder}/transactions-${year}.md`;
  }

  private async readYearFile(year: string): Promise<Map<string, RawTransaction[]>> {
    const path = this.pathForYear(year);
    const result = new Map<string, RawTransaction[]>();

    if (!(await this.adapter.fileExists(path))) return result;

    let content: string;
    try {
      content = await this.adapter.readFile(path);
    } catch (err) {
      throw new TransactionLogFileReadError(path, err);
    }

    for (const line of content.split('\n')) {
      const match = LINE_RE.exec(line);
      if (!match) continue;
      const [, date, fieldsRaw] = match;

      const names = new Map<string, string>();
      NAME_RE.lastIndex = 0;
      let nameMatch: RegExpExecArray | null;
      while ((nameMatch = NAME_RE.exec(fieldsRaw)) !== null) names.set(nameMatch[1], nameMatch[2]);

      const notes = new Map<string, string>();
      NOTE_RE.lastIndex = 0;
      let noteMatch: RegExpExecArray | null;
      while ((noteMatch = NOTE_RE.exec(fieldsRaw)) !== null) notes.set(noteMatch[1], noteMatch[2]);

      const entries: RawTransaction[] = [];
      MAIN_RE.lastIndex = 0;
      let mainMatch: RegExpExecArray | null;
      while ((mainMatch = MAIN_RE.exec(fieldsRaw)) !== null) {
        const [, id, rawGroup] = mainMatch;
        entries.push({
          id,
          date,
          ...parseMain(rawGroup),
          name: names.get(id),
          note: notes.get(id),
        });
      }
      result.set(date, entries);
    }

    return result;
  }

  private serializeYearFile(days: Map<string, RawTransaction[]>): string {
    const sortedDates = Array.from(days.keys()).sort();
    const lines: string[] = [];
    for (const date of sortedDates) {
      const entries = days.get(date)!;
      if (entries.length === 0) continue;
      const sorted = [...entries].sort((a, b) => (a.time + a.id).localeCompare(b.time + b.id));
      const fieldStrs: string[] = [];
      for (const t of sorted) {
        fieldStrs.push(`[tx-${t.id}:: ${serializeMain(t)}]`);
        if (t.name) fieldStrs.push(`[txn-${t.id}:: ${t.name}]`);
        if (t.note) fieldStrs.push(`[txnote-${t.id}:: ${t.note}]`);
      }
      lines.push(`- ${date} ${fieldStrs.join(' ')}`);
    }
    return lines.length > 0 ? lines.join('\n') + '\n' : '';
  }

  private async writeYearFile(year: string, days: Map<string, RawTransaction[]>): Promise<void> {
    if (!(await this.adapter.folderExists(this.logFolder))) {
      await this.adapter.createFolder(this.logFolder);
    }
    await this.adapter.writeFile(this.pathForYear(year), this.serializeYearFile(days));
  }

  async readDay(date: string): Promise<RawTransaction[]> {
    const days = await this.readYearFile(yearOf(date));
    return days.get(date) ?? [];
  }

  async readRange(startDate: string, endDate: string): Promise<RawTransaction[]> {
    const startYear = Number(yearOf(startDate));
    const endYear = Number(yearOf(endDate));
    const result: RawTransaction[] = [];

    for (let y = startYear; y <= endYear; y++) {
      const days = await this.readYearFile(String(y));
      for (const [date, entries] of days) {
        if (date >= startDate && date <= endDate) result.push(...entries);
      }
    }
    return result;
  }

  /** All transactions ever logged — used for balance calculation (REQ-M004/M007), which is always over full history, not a range. */
  async readAll(): Promise<RawTransaction[]> {
    const files = await this.adapter.listFilesUnder(this.logFolder);
    const result: RawTransaction[] = [];
    for (const file of files) {
      const match = /transactions-(\d{4})\.md$/.exec(file.path);
      if (!match) continue;
      const days = await this.readYearFile(match[1]);
      for (const entries of days.values()) result.push(...entries);
    }
    return result;
  }

  async upsertTransaction(t: RawTransaction): Promise<void> {
    const year = yearOf(t.date);
    const days = await this.readYearFile(year);
    const existing = days.get(t.date) ?? [];
    days.set(t.date, [...existing.filter((e) => e.id !== t.id), t]);
    await this.writeYearFile(year, days);
  }

  /** REQ-M008: deleting a transaction — the caller re-derives the balance afterward from readAll(), nothing to "recalculate" here. */
  async deleteTransaction(date: string, id: string): Promise<void> {
    const year = yearOf(date);
    const days = await this.readYearFile(year);
    const existing = days.get(date) ?? [];
    days.set(date, existing.filter((e) => e.id !== id));
    await this.writeYearFile(year, days);
  }
}

```

## data.json

```json
{
  "habits": [
    {
      "id": "rYQ5VX",
      "type": "numeric",
      "name": "drink water",
      "icon": "🫗",
      "color": "#3b82f6",
      "schedule": {
        "mode": "weeklyQuota",
        "timesPerWeek": 3
      },
      "target": {
        "value": 5,
        "unit": "cups"
      },
      "trendVisible": true,
      "archived": false,
      "createdAt": "2026-08-21",
      "order": 0
    },
    {
      "id": "ERI6O3",
      "type": "boolean",
      "name": "sdf",
      "icon": "✅",
      "color": "#3b82f6",
      "schedule": {
        "mode": "daily"
      },
      "trendVisible": true,
      "archived": false,
      "createdAt": "2026-08-22",
      "order": 1
    },
    {
      "id": "i68BdJ",
      "type": "numeric",
      "name": "drink water",
      "icon": "✅",
      "color": "#3b82f6",
      "schedule": {
        "mode": "daily"
      },
      "target": {
        "value": 8,
        "unit": "cups"
      },
      "trendVisible": true,
      "archived": false,
      "createdAt": "2026-08-22",
      "order": 2
    },
    {
      "id": "IuoMrs",
      "type": "boolean",
      "name": "sfjld",
      "icon": "✅",
      "color": "#3b82f6",
      "schedule": {
        "mode": "daily"
      },
      "trendVisible": true,
      "archived": false,
      "createdAt": "2026-08-23",
      "order": 3
    }
  ],
  "dataPoints": [
    {
      "id": "FNW9tZ",
      "name": "Weight",
      "type": "number",
      "unit": "kg",
      "archived": false,
      "createdAt": "2026-08-23",
      "order": 0
    },
    {
      "id": "kVF0M5",
      "name": "Sleep duration",
      "type": "number",
      "unit": "hours",
      "archived": false,
      "createdAt": "2026-08-23",
      "order": 1
    },
    {
      "id": "bJ3iRD",
      "name": "sleep time",
      "type": "time",
      "archived": false,
      "createdAt": "2026-08-23",
      "order": 2
    }
  ],
  "accounts": [
    {
      "id": "NSIcRH",
      "name": "wallet",
      "currency": "EGP",
      "openingBalance": 700,
      "archived": false,
      "createdAt": "2026-08-23",
      "order": 0
    },
    {
      "id": "6FcOG8",
      "name": "VF cash",
      "currency": "EGP",
      "openingBalance": 120,
      "archived": false,
      "createdAt": "2026-08-23",
      "order": 1
    },
    {
      "id": "XEkalE",
      "name": "Savings",
      "currency": "EGP",
      "openingBalance": 10000,
      "archived": false,
      "createdAt": "2026-08-23",
      "order": 2
    }
  ],
  "exchangeRates": {
    "primaryCurrency": "USD",
    "ratesToPrimary": {
      "EGP": 0.02
    }
  },
  "categories": [
    {
      "id": "-d_IW0",
      "kind": "expense",
      "name": "food",
      "order": 0
    },
    {
      "id": "oyksDy",
      "kind": "expense",
      "name": "junk",
      "parentId": "-d_IW0",
      "order": 0
    },
    {
      "id": "sCD93Y",
      "kind": "expense",
      "name": "entertainment",
      "order": 1
    },
    {
      "id": "tGtqAi",
      "kind": "income",
      "name": "salary",
      "order": 0
    }
  ]
}
```

## design-data-point-tracking.md

```markdown
# Design — Data Point Tracking Module (abridged)

*Full design doc format matches design-habit-tracking.md's structure;
this pass focuses on resolving the two Open Questions blocking
implementation, plus the storage format they cascade into. Revisit for
a full write-up alongside a UI/UX pass, same as Habit Tracking.*

## Resolved Open Question — storage format for multi-entry days

Chosen: **(b) suffixed inline-field keys**, but the id lives in the
*value*, not smashed into the key, to avoid an ambiguous-to-parse key
(two ids concatenated with no reserved separator character, since
nanoid's alphabet includes `-`/`_`).

Format, one field per **entry** (not per data point):

```
- 2026-08-19 [dp-<entryId>:: <definitionId>|08:15|250]
```

- `dp-<entryId>` — entryId alone as the key, exactly like Habit
  Tracking's `habit-<id>` pattern (REQ-C010's "keyed by each item's own
  id" — entryId *is* that item now that entries, not data points, are
  the loggable unit).
- Value is `definitionId|HH:MM|rawValue`, split on the first two `|`
  characters only (rawValue may itself contain `|`, e.g. free text —
  the split is capped at 2, so the third segment onward all belongs to
  rawValue).
- **Known limitation, flagged rather than engineered around:** a text
  entry's value can't contain the literal `]` character (would
  terminate the bracket early) — same class of limitation Habit
  Tracking already accepts for its own bracket-delimited format.

Rejected: (a) array-style single field per data point per day — harder
to address/edit/delete one entry among several without re-serializing
the whole field, and non-Dataview-queryable as a scalar per entry.

## Resolved Open Question — trend chart aggregation for multi-entry days

Chosen: **(a) every individual entry as its own point**, plotted
against its logged timestamp (date + time), not aggregated. Simplest,
most information-preserving, and avoids needing a new per-data-point
aggregation-mode setting (REQ-C006-style) before shipping. A daily
aggregate mode (mean/sum/min/max) is easy to add later as an
opt-in toggle without a storage migration, since it's a pure
presentation-layer transform over the same entries — revisit if
requested.

## Traceability
Same requirement IDs as requirements-data-point-tracking.md
(REQ-D001–D013); architecture mirrors design-habit-tracking.md's
domain → application → infrastructure → ui layering.

```

## design-habit-tracking.md

```markdown
# Design — Habit Tracking Module

*Technical design only. Visual/component language (colors, exact wizard styling, whether to draw on the Lovable prototype's shadcn-style patterns) is out of scope here — deferred to the separate UI/UX design study called out in PROJECT_PRINCIPLES.md. This document covers architecture, data, and behavior: what the module does under the hood, not what it looks like.*

## Architecture Overview

Follows PROJECT_PRINCIPLES.md's layered convention, scoped to `src/modules/habit-tracking/`:

```
ui/                    React views, modals, settings tab
  ├─ HabitWizardModal.tsx       (create/edit, REQ-H004/H005/H014)
  ├─ HabitDashboardList.tsx     (pending/completed split, REQ-H006-H008)
  ├─ HabitDetailView.tsx        (streaks, heatmap, trend, REQ-H009-H013)
  └─ HabitSettingsTab.tsx       (wizard entry point, REQ-H005)
        │
application/           orchestration, no direct file I/O
  └─ habitService.ts   createHabit, updateHabit, archiveHabit, deleteHabit,
                        logHabit, editTodayLog, getPendingForToday,
                        getHabitHistory
        │
domain/                pure functions, no I/O, fully unit-testable
  ├─ scheduleEvaluator.ts   isScheduledOn(habit, date, weekStartsOn)
  └─ streakCalculator.ts    currentStreak, longestStreak, completionRate
        │
infrastructure/        Obsidian file I/O
  ├─ habitSettingsStore.ts  HabitDefinition[] CRUD via plugin data.json
  └─ habitLogFile.ts        parse/write yearly markdown log files
        │
shared/ui-kit/         reused across modules
  ├─ StepWizard.tsx         shared step-indicator shell (also used by Data Point wizard, per REQ-D003)
  └─ CalendarHeatmap.tsx    generic day-grid heatmap component
```

Data flows one direction on read (infra → domain → application → ui) and the reverse on write (ui action → application → infra), matching the project's layering. `scheduleEvaluator` and `streakCalculator` never import from `infrastructure` or `ui` — they take plain data in and return plain data out, which is what makes them unit-testable without an Obsidian runtime.

## Data Model

### Settings store (`data.json`, per REQ-C008)

```typescript
interface HabitDefinition {
  id: string;              // stable id, generated once at creation (nanoid, 6 chars)
                            // never reused, even after delete — avoids collisions
                            // with orphaned historical log entries (see Error Handling)
  type: 'boolean' | 'numeric';
  name: string;
  icon: string;             // emoji
  color: string;            // hex or theme token
  schedule: HabitSchedule;
  target?: { value: number; unit: string };  // numeric only, optional (REQ-H002)
  trendVisible: boolean;    // REQ-H013, defaults to true
  archived: boolean;        // REQ-H016, defaults to false
  createdAt: string;        // local date (YYYY-MM-DD) via the shared date fn, REQ-C012
  order: number;            // display order
}

type HabitSchedule =
  | { mode: 'daily' }
  | { mode: 'weekdays'; days: number[] }       // 0-6, Monday-based internally (see note)
  | { mode: 'weeklyQuota'; timesPerWeek: number };
```

**Note on weekday storage vs. REQ-C017 ("week starts on"):** weekday indices are stored in one fixed internal convention (Monday = 0) regardless of the user's "week starts on" setting. That setting only affects *display order* (picker UI) and *week-boundary math* (streak/completion-rate calculations use it to decide where one "week" ends and the next begins) — it's applied at the domain/UI boundary, never baked into stored data. This keeps a later change to the global setting retroactive across all history without a migration.

### Markdown log file (per REQ-C009/C010)

One file per calendar year, in a configurable vault folder (default `Life Tracker/Logs/Habits/`, e.g. `habits-2026.md`) — living in the visible vault, not `.obsidian/`, so Dataview can query it and the user can hand-edit it, per the storage rationale in PROJECT_PRINCIPLES.md.

> **Flagging:** the configurable log-folder-path setting has no REQ ID of its own. I'm including it because PROJECT_PRINCIPLES.md already establishes "don't hardcode a value a reasonable user would want as a preference" as a standing principle, so it falls under that rather than needing new product scope — but flagging per the design-phase rule that anything without a direct REQ ID should be surfaced rather than silently added.

One line per day, one bracketed inline field per logged habit that day, keyed by habit id:

```
- 2026-08-19 [habit-a1b2c3:: true] [habit-d4e5f6:: 8000]
```

- Boolean habits log `true`.
- Numeric habits log the raw number.
- A day with no habits logged simply has no line for that date (not an empty line) — keeps files clean for hand-editing and Dataview queries.
- Editing today's value (REQ-H008) rewrites only that habit's bracketed field on that day's line, leaving every other habit's entry on the same line untouched.

**Why separate log files per module** (habits vs. data points vs. transactions), rather than one shared daily log: different value shapes (data points may hold multiple timestamped entries per day, once that module's open storage question is resolved — habits never do), simpler Dataview queries scoped to one concern, and clean module disable/enable (REQ-C004/C005) without touching other modules' files.

## Interfaces & APIs

No network API (local plugin) — the module boundary is the `habitService` surface:

```typescript
createHabit(input: NewHabitInput): Promise<HabitDefinition>
updateHabit(id: string, patch: Partial<HabitDefinition>): Promise<HabitDefinition>
archiveHabit(id: string): Promise<void>
deleteHabit(id: string): Promise<void>   // throws if history exists and !confirmed

logHabit(id: string, date: LocalDate, value: boolean | number): Promise<void>
editTodayLog(id: string, value: boolean | number): Promise<void>

getPendingForToday(): Promise<HabitDefinition[]>       // scheduled-today, not-yet-logged
getCompletedForToday(): Promise<HabitWithTodayValue[]>
getHabitHistory(id: string, range: DateRange): Promise<{
  currentStreak: number;
  longestStreak: number;
  completionRate: number;          // 0-1, over `range`
  days: DayStatus[];                // for the heatmap: done | missed | not-scheduled
}>
```

## Key Flows

**Create Habit** (REQ-H001, H003, H004, H005): dashboard or settings-tab action opens `HabitWizardModal` → step 1 (name/icon/color, validated non-empty) → step 2 (type; numeric branches to optional target+unit) → step 3 (schedule) → step 4 (review, with edit-back links) → confirm → `habitService.createHabit` generates the id, sets `createdAt` via the shared local-date function, appends to settings → dashboard re-renders the pending list if the habit is scheduled today.

**Daily Check-In** (REQ-H006-H008): dashboard pending list is `getPendingForToday()`, which internally filters all non-archived habits through `scheduleEvaluator.isScheduledOn`. Boolean tap or numeric confirm calls `logHabit`, which writes today's line via `habitLogFile` and moves the habit to the completed section; streak numbers refresh via `getHabitHistory`. Edit reopens the same input pre-filled, and calls `editTodayLog`, which rewrites only that habit's field.

**Streaks & Heatmap** (REQ-H009-H013): `HabitDetailView` calls `getHabitHistory` for the selected range. Internally: `habitLogFile` reads the relevant year file(s) → `scheduleEvaluator` classifies each day as done / missed / not-scheduled → `streakCalculator` walks that classified sequence to compute current streak, longest streak, and completion rate. The heatmap renders the day-by-day classification via `CalendarHeatmap`; the optional trend chart (completion rate over time, only when `trendVisible` is true) renders via Recharts.

**Edit / Archive / Delete** (REQ-H014-H016): edit reopens the wizard shell pre-filled. Archive flips `archived: true` — hidden from the pending list, still readable in an "Archived" view. Delete checks whether any log entries exist for the id; if so, shows a confirmation modal (REQ-H015) before removing the `HabitDefinition`. **Deletion does not rewrite historical markdown log lines** — the habit's bracketed field simply becomes orphaned data the plugin ignores from then on (see Alternatives Considered).

## Technology Choices

- **Recharts** for the optional completion-rate trend chart — React-native and declarative, themes cleanly via CSS variables for Obsidian light/dark parity, no canvas layer to fight with.
- **Custom SVG/React component** for the calendar heatmap, not a charting library — a calendar-day grid with three-state coloring isn't a standard chart type either library models well; a small custom component gives direct control tied to `scheduleEvaluator`'s output.
- **nanoid** for habit ids — short, filename/Dataview-key-safe, works in Obsidian's mobile JS runtime without a Node `crypto` dependency.
- **Yearly log file split** — bounds individual file size and git-diff size as history accumulates over years of daily logging.

## Alternatives Considered

- **Chart.js instead of Recharts** — rejected: canvas-based, less idiomatic in a React codebase, harder to theme dynamically against Obsidian's CSS variables.
- **Single ever-growing log file** instead of yearly split — rejected: parse time and diff size both degrade unboundedly over years of use.
- **Rewriting historical log lines on habit delete** (to strip the deleted habit's field from every past day) — rejected: contradicts the hand-editable, non-destructive storage philosophy in PROJECT_PRINCIPLES.md, and would force a potentially large rewrite/diff on every delete for a purely cosmetic cleanup. An orphaned field is harmless and ignorable.
- **Per-habit "week starts on" override** — rejected: REQ-C017 defines this as one global cross-cutting setting; a per-habit override would contradict "applied consistently."

## Error Handling Strategy

- **Corrupted/unreadable year file** (product-vision Edge Case): `habitLogFile` read wraps parsing in try/catch; a parse failure surfaces a non-blocking error banner rather than throwing during dashboard load, and the module never writes to a file that failed to parse until the user takes explicit action — consistent with "fail safely, don't overwrite."
- **Mid-week/mid-month creation** (habit doc Edge Case): `scheduleEvaluator.isScheduledOn` returns `false` for any date before `habit.createdAt`, so pre-creation days are excluded from streak/completion-rate math without special-casing elsewhere.
- **Week-starts-on affecting weekday math** (REQ-C017): `scheduleEvaluator` and every weekday-based UI picker take `weekStartsOn` as an explicit parameter sourced from the one global setting — never hardcoded.
- **Below-target numeric logging** (resolved Edge Case): `logHabit` has no target-comparison gate; any successfully validated number is accepted and marked done. The target is read separately, purely for progress display.

## Test Strategy

- **Unit tests** (domain layer — non-negotiable per PROJECT_PRINCIPLES.md): `streakCalculator` across all three schedule modes, including a missed-day reset and a not-scheduled day *not* breaking a streak; `scheduleEvaluator.isScheduledOn` across all schedule modes and both `weekStartsOn` values; completion-rate math across multiple selectable ranges.
- **Integration tests**: yearly markdown log file round-trip (write a day, read it back, edit one habit's field without disturbing others on the same line); settings-store CRUD including archive and delete.
- **Manual UI test checklist** (no full e2e, per PROJECT_PRINCIPLES.md):
  - [ ] Complete the wizard end-to-end for a boolean and a numeric habit, on desktop and mobile
  - [ ] Tap-complete a boolean habit; verify it moves out of the pending list and the streak increments
  - [ ] Log, then edit, a numeric habit's value for today; verify only that field updates
  - [ ] View the heatmap for a habit with a mix of done/missed/not-scheduled days; verify visual distinction
  - [ ] Toggle trend visibility off/on for one habit; verify only that habit's chart is affected
  - [ ] Attempt to delete a habit with history; verify the confirmation modal on both cancel and confirm paths
  - [ ] Archive a habit; verify it disappears from the pending list but its history remains viewable
  - [ ] Change "week starts on"; verify weekday picker order and streak/completion-rate boundaries shift consistently

## Traceability

| REQ ID | Design section |
|---|---|
| REQ-H001, H003 | Data Model → `HabitDefinition` / `HabitSchedule` |
| REQ-H002 | Data Model → `target` field |
| REQ-H004, H005 | Key Flows → Create Habit |
| REQ-H006–H008 | Key Flows → Daily Check-In |
| REQ-H009–H012 | Architecture → `domain/`; Key Flows → Streaks & Heatmap |
| REQ-H013 | Data Model → `trendVisible`; Key Flows → Streaks & Heatmap |
| REQ-H014–H016 | Key Flows → Edit / Archive / Delete |
| REQ-C008–C010 | Data Model (settings store + markdown log format) |
| REQ-C012 | Data Model → `createdAt`; used throughout for all date math |
| REQ-C017 | Data Model note on weekday storage; Error Handling |

No design elements here fall outside an existing REQ ID except the log-folder-path setting, flagged above.

## Approval
- [ ] Approved by user on <date>

```

## design-money-management.md

```markdown
# Design — Money Management Module (Phase 1: core ledger)

*Full design doc mirrors design-habit-tracking.md's structure once the
whole module ships. This pass covers Phase 1 only — see "Scope" below.*

## Scope

Money Management's full requirements doc covers accounts, transactions,
categories, recurring entries, shopping lists, and a 6-chart dashboard.
Implementing all of it at once, given recurring entries and shopping
lists both *produce* transactions and the dashboard *reads* them, would
mean building on an unverified foundation. This pass ships:

**Phase 1 (this pass):** Accounts, Categories (hierarchical, two
trees), Transactions (all four types incl. transfers as linked legs),
balance/net-worth math with manual-rate currency conversion,
undo-last-transaction, name autocomplete/price-history query support.

**Deferred to Phase 2/3:** Recurring Entries, Shopping Lists (incl.
REQ-M023's auto-transaction-on-purchase flow), the finance dashboard's
charts (REQ-M026-M033), satisfaction tracking (REQ-M016/M017).

## Resolved Open Question — multi-currency aggregation

Chosen: **manual exchange rates**, not scope-excluded. The user enters
a rate-to-primary-currency for each non-primary currency in settings;
`convertToPrimary()` (domain, pure) applies it. Aggregate views (net
worth, account-share chart — Phase 2/3, but the conversion utility is
built now since accounts/balances exist in Phase 1) show converted
totals in the primary currency. An account whose currency has no
configured rate is excluded from the aggregate and flagged in the UI
— never silently treated as if rate=1, which would silently corrupt
the total.

## Resolved Open Question — "goal/target progress" insight

Deferred entirely per explicit user steer ("skip for now, revisit
later") — not designed in this pass.

## Data Model

### Settings store (REQ-C008), three new top-level keys in the shared data.json

```typescript
interface Account {
  id: string;
  name: string;
  currency: string;       // free-text code, e.g. "USD", "EGP"
  openingBalance: number; // REQ-M001; balance itself is always computed, never stored (REQ-M004)
  archived: boolean;
  createdAt: string;
  order: number;
}

type CategoryKind = 'expense' | 'income';

interface Category {
  id: string;
  kind: CategoryKind;     // REQ-M013: separate trees for expense vs. income
  name: string;
  parentId?: string;      // absent = main category; present = subcategory, scoped to that parent (REQ-M012)
  order: number;
}

interface ExchangeRates {
  primaryCurrency: string;
  ratesToPrimary: Record<string, number>; // 1 unit of that currency = N units of primaryCurrency
}
```

### Markdown log file (REQ-C009/C010), extended per-entry (same pattern as Data Point Tracking)

One bracketed field per **transaction** (transactions, like data point
entries, can be multiple-per-day), keyed by the transaction's own id —
mirrors `dp-<entryId>` from Data Point Tracking:

```
- 2026-08-19 [tx-<id>:: <accountId>|<type>|<categoryId>|<amount>|<quantity>|<transferPairId>]
```

All six fields are structured (ids, enum, numbers) — none can contain
`|`, so a plain split is safe (unlike Data Point Tracking's free-text
value, which needed the "first two pipes only" trick). Empty slots
(`categoryId`, `quantity`, `transferPairId`) serialize as `''`.

Free-text fields (`name`, `note` — REQ-M006) get their own optional
sibling fields on the same line, only emitted when present (keeps
files clean, same principle as habit/data-point logs):

```
[txn-<id>:: <name>]
[txnote-<id>:: <note>]
```

`tx-`, `txn-`, `txnote-` are mutually exclusive literal prefixes (the
character right after `tx` differs in each: `-`, `n`, `n` then `o`),
so parsing them with three separate regexes has no ambiguity.

## Key Flows (Phase 1)

**Record expense/income/adjustment** (REQ-M002, M005, M006): one
consolidated form, a type selector switches visible fields. Writes one
`RawTransaction` via `TransactionLogFile.upsertTransaction`.

**Record transfer** (REQ-M003): `MoneyService.recordTransfer` writes
TWO transactions sharing a generated `transferPairId`, opposite signed
amounts, one leg per account. Balance math naturally nets to zero
across the two accounts combined; income/expense aggregation filters
`type === 'transfer'` out entirely.

**Balance** (REQ-M004/M007): `calculateAccountBalance` (domain, pure)
= `account.openingBalance + sum(that account's transaction amounts)`.
Never stored — recomputed on every read, so REQ-M008 (delete a
transaction → balance updates) falls out for free with no explicit
"recalculate" step.

**Delete a category with existing transactions** (REQ-M015): those
transactions' `categoryId` is left pointing at the now-missing id;
`MoneyService` resolves an unknown/absent `categoryId` to the
"Uncategorized" label at read time, rather than rewriting historical
transaction rows (same non-destructive philosophy as Habit Tracking's
orphaned-field-on-delete).

## Traceability
REQ-M001-M011 (Accounts & Transactions), REQ-M012-M015 (Categories).
REQ-M016-M035 (Satisfaction, Recurring, Shopping, Dashboard) deferred.

## Update — Recurring Entries, Shopping Lists, and time-of-day now implemented

The Phase 1/2 split above is superseded by this update. Recurring
Entries (REQ-M018-M020, M035) and Shopping Lists incl. the
auto-transaction-on-purchase flow (REQ-M021-M025, M034) are now built,
along with transaction time-of-day (not just date) and free-text
custom currencies (already supported — Account.currency was always a
free-text field, never a fixed list; the settings UI now also lets a
currency+rate be configured before any account uses it).

Transaction log format extended from 6 to 9 pipe-delimited main fields
to add `recurringEntryId`, `shoppingItemId`, and `time` — all
structured (no `|` risk), so parsing stays a plain split. See
transactionLogFile.ts's header comment for the exact field order.

Still deferred: the finance dashboard's charts (REQ-M026-M033) and
satisfaction tracking (REQ-M016/M017).

```

## manifest.json

```json
{
  "id": "life-tracker",
  "name": "Life Tracker",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "Habit tracking, data point tracking, and money management, built for power users who want maximal control over their life-tracking data — stored as plain, hand-editable, Dataview-queryable markdown.",
  "author": "Mohamed Saleh",
  "authorUrl": "https://github.com/MohamedSaleh0-0",
  "isDesktopOnly": false
}

```

## package.json

```json
{
  "name": "life-tracker",
  "version": "0.1.0",
  "description": "Habit, data point, and money tracking for Obsidian.",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "test": "tsx --test \"src/**/*.test.ts\"",
    "lint": "eslint src main.ts"
  },
  "keywords": [],
  "author": "Mohamed Saleh",
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "builtin-modules": "^4.0.0",
    "esbuild": "^0.24.0",
    "eslint": "^9.0.0",
    "eslint-config-prettier": "^9.0.0",
    "obsidian": "latest",
    "prettier": "^3.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0"
  },
  "dependencies": {
    "nanoid": "^5.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.12.0"
  }
}

```

## package-lock.json

```json
{
  "name": "life-tracker",
  "version": "0.1.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "life-tracker",
      "version": "0.1.0",
      "license": "MIT",
      "dependencies": {
        "nanoid": "^5.0.0",
        "react": "^19.0.0",
        "react-dom": "^19.0.0",
        "recharts": "^2.12.0"
      },
      "devDependencies": {
        "@types/node": "^22.0.0",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "@typescript-eslint/eslint-plugin": "^8.0.0",
        "@typescript-eslint/parser": "^8.0.0",
        "builtin-modules": "^4.0.0",
        "esbuild": "^0.24.0",
        "eslint": "^9.0.0",
        "eslint-config-prettier": "^9.0.0",
        "obsidian": "latest",
        "prettier": "^3.0.0",
        "tsx": "^4.0.0",
        "typescript": "^5.5.0"
      }
    },
    "node_modules/@babel/runtime": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/runtime/-/runtime-7.29.7.tgz",
      "integrity": "sha512-Nq8OhGWiZIZGV6hLHoyAKLLcJihP/xFeBMGJoUrxTX2psI8dCifzLhZISFb+VWS3wFMRDmCGw5R+dOySCqPLhw==",
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@codemirror/state": {
      "version": "6.5.0",
      "resolved": "https://registry.npmjs.org/@codemirror/state/-/state-6.5.0.tgz",
      "integrity": "sha512-MwBHVK60IiIHDcoMet78lxt6iw5gJOGSbNbOIVBHWVXIH4/Nq1+GQgLLGgI1KlnN86WDXsPudVaqYHKBIx7Eyw==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "@marijn/find-cluster-break": "^1.0.0"
      }
    },
    "node_modules/@codemirror/view": {
      "version": "6.38.6",
      "resolved": "https://registry.npmjs.org/@codemirror/view/-/view-6.38.6.tgz",
      "integrity": "sha512-qiS0z1bKs5WOvHIAC0Cybmv4AJSkAXgX5aD6Mqd2epSLlVJsQl8NG23jCVouIgkh4All/mrbdsf2UOLFnJw0tw==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "@codemirror/state": "^6.5.0",
        "crelt": "^1.0.6",
        "style-mod": "^4.1.0",
        "w3c-keyname": "^2.2.4"
      }
    },
    "node_modules/@esbuild/aix-ppc64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/aix-ppc64/-/aix-ppc64-0.24.2.tgz",
      "integrity": "sha512-thpVCb/rhxE/BnMLQ7GReQLLN8q9qbHmI55F4489/ByVg2aQaQ6kbcLb6FHkocZzQhxc4gx0sCk0tJkKBFzDhA==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "aix"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/android-arm": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/android-arm/-/android-arm-0.24.2.tgz",
      "integrity": "sha512-tmwl4hJkCfNHwFB3nBa8z1Uy3ypZpxqxfTQOcHX+xRByyYgunVbZ9MzUUfb0RxaHIMnbHagwAxuTL+tnNM+1/Q==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/android-arm64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/android-arm64/-/android-arm64-0.24.2.tgz",
      "integrity": "sha512-cNLgeqCqV8WxfcTIOeL4OAtSmL8JjcN6m09XIgro1Wi7cF4t/THaWEa7eL5CMoMBdjoHOTh/vwTO/o2TRXIyzg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/android-x64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/android-x64/-/android-x64-0.24.2.tgz",
      "integrity": "sha512-B6Q0YQDqMx9D7rvIcsXfmJfvUYLoP722bgfBlO5cGvNVb5V/+Y7nhBE3mHV9OpxBf4eAS2S68KZztiPaWq4XYw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/darwin-arm64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/darwin-arm64/-/darwin-arm64-0.24.2.tgz",
      "integrity": "sha512-kj3AnYWc+CekmZnS5IPu9D+HWtUI49hbnyqk0FLEJDbzCIQt7hg7ucF1SQAilhtYpIujfaHr6O0UHlzzSPdOeA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/darwin-x64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/darwin-x64/-/darwin-x64-0.24.2.tgz",
      "integrity": "sha512-WeSrmwwHaPkNR5H3yYfowhZcbriGqooyu3zI/3GGpF8AyUdsrrP0X6KumITGA9WOyiJavnGZUwPGvxvwfWPHIA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/freebsd-arm64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/freebsd-arm64/-/freebsd-arm64-0.24.2.tgz",
      "integrity": "sha512-UN8HXjtJ0k/Mj6a9+5u6+2eZ2ERD7Edt1Q9IZiB5UZAIdPnVKDoG7mdTVGhHJIeEml60JteamR3qhsr1r8gXvg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/freebsd-x64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/freebsd-x64/-/freebsd-x64-0.24.2.tgz",
      "integrity": "sha512-TvW7wE/89PYW+IevEJXZ5sF6gJRDY/14hyIGFXdIucxCsbRmLUcjseQu1SyTko+2idmCw94TgyaEZi9HUSOe3Q==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-arm": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-arm/-/linux-arm-0.24.2.tgz",
      "integrity": "sha512-n0WRM/gWIdU29J57hJyUdIsk0WarGd6To0s+Y+LwvlC55wt+GT/OgkwoXCXvIue1i1sSNWblHEig00GBWiJgfA==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-arm64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-arm64/-/linux-arm64-0.24.2.tgz",
      "integrity": "sha512-7HnAD6074BW43YvvUmE/35Id9/NB7BeX5EoNkK9obndmZBUk8xmJJeU7DwmUeN7tkysslb2eSl6CTrYz6oEMQg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-ia32": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-ia32/-/linux-ia32-0.24.2.tgz",
      "integrity": "sha512-sfv0tGPQhcZOgTKO3oBE9xpHuUqguHvSo4jl+wjnKwFpapx+vUDcawbwPNuBIAYdRAvIDBfZVvXprIj3HA+Ugw==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-loong64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-loong64/-/linux-loong64-0.24.2.tgz",
      "integrity": "sha512-CN9AZr8kEndGooS35ntToZLTQLHEjtVB5n7dl8ZcTZMonJ7CCfStrYhrzF97eAecqVbVJ7APOEe18RPI4KLhwQ==",
      "cpu": [
        "loong64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-mips64el": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-mips64el/-/linux-mips64el-0.24.2.tgz",
      "integrity": "sha512-iMkk7qr/wl3exJATwkISxI7kTcmHKE+BlymIAbHO8xanq/TjHaaVThFF6ipWzPHryoFsesNQJPE/3wFJw4+huw==",
      "cpu": [
        "mips64el"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-ppc64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-ppc64/-/linux-ppc64-0.24.2.tgz",
      "integrity": "sha512-shsVrgCZ57Vr2L8mm39kO5PPIb+843FStGt7sGGoqiiWYconSxwTiuswC1VJZLCjNiMLAMh34jg4VSEQb+iEbw==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-riscv64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-riscv64/-/linux-riscv64-0.24.2.tgz",
      "integrity": "sha512-4eSFWnU9Hhd68fW16GD0TINewo1L6dRrB+oLNNbYyMUAeOD2yCK5KXGK1GH4qD/kT+bTEXjsyTCiJGHPZ3eM9Q==",
      "cpu": [
        "riscv64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-s390x": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-s390x/-/linux-s390x-0.24.2.tgz",
      "integrity": "sha512-S0Bh0A53b0YHL2XEXC20bHLuGMOhFDO6GN4b3YjRLK//Ep3ql3erpNcPlEFed93hsQAjAQDNsvcK+hV90FubSw==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-x64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.24.2.tgz",
      "integrity": "sha512-8Qi4nQcCTbLnK9WoMjdC9NiTG6/E38RNICU6sUNqK0QFxCYgoARqVqxdFmWkdonVsvGqWhmm7MO0jyTqLqwj0Q==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/netbsd-arm64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/netbsd-arm64/-/netbsd-arm64-0.24.2.tgz",
      "integrity": "sha512-wuLK/VztRRpMt9zyHSazyCVdCXlpHkKm34WUyinD2lzK07FAHTq0KQvZZlXikNWkDGoT6x3TD51jKQ7gMVpopw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "netbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/netbsd-x64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/netbsd-x64/-/netbsd-x64-0.24.2.tgz",
      "integrity": "sha512-VefFaQUc4FMmJuAxmIHgUmfNiLXY438XrL4GDNV1Y1H/RW3qow68xTwjZKfj/+Plp9NANmzbH5R40Meudu8mmw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "netbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/openbsd-arm64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/openbsd-arm64/-/openbsd-arm64-0.24.2.tgz",
      "integrity": "sha512-YQbi46SBct6iKnszhSvdluqDmxCJA+Pu280Av9WICNwQmMxV7nLRHZfjQzwbPs3jeWnuAhE9Jy0NrnJ12Oz+0A==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/openbsd-x64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/openbsd-x64/-/openbsd-x64-0.24.2.tgz",
      "integrity": "sha512-+iDS6zpNM6EnJyWv0bMGLWSWeXGN/HTaF/LXHXHwejGsVi+ooqDfMCCTerNFxEkM3wYVcExkeGXNqshc9iMaOA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/openharmony-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/openharmony-arm64/-/openharmony-arm64-0.28.2.tgz",
      "integrity": "sha512-WkhYDmpTjLvGlScA1rwjRUmhl4k8oXR3cIbtqWmELgU/dFeHHlEllxDvdWcNJV9rbzCexB5vz8gtNewWLgCT7Q==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openharmony"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/sunos-x64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/sunos-x64/-/sunos-x64-0.24.2.tgz",
      "integrity": "sha512-hTdsW27jcktEvpwNHJU4ZwWFGkz2zRJUz8pvddmXPtXDzVKTTINmlmga3ZzwcuMpUvLw7JkLy9QLKyGpD2Yxig==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "sunos"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/win32-arm64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-arm64/-/win32-arm64-0.24.2.tgz",
      "integrity": "sha512-LihEQ2BBKVFLOC9ZItT9iFprsE9tqjDjnbulhHoFxYQtQfai7qfluVODIYxt1PgdoyQkz23+01rzwNwYfutxUQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/win32-ia32": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-ia32/-/win32-ia32-0.24.2.tgz",
      "integrity": "sha512-q+iGUwfs8tncmFC9pcnD5IvRHAzmbwQ3GPS5/ceCyHdjXubwQWI12MKWSNSMYLJMq23/IUCvJMS76PDqXe1fxA==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/win32-x64": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.24.2.tgz",
      "integrity": "sha512-7VTgWzgMGvup6aSqDPLiW5zHaxYJGTO4OokMjIlrCtf+VpEL+cXKtCvg723iguPYI5oaUNdS+/V7OU2gvXVWEg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@eslint-community/eslint-utils": {
      "version": "4.10.1",
      "resolved": "https://registry.npmjs.org/@eslint-community/eslint-utils/-/eslint-utils-4.10.1.tgz",
      "integrity": "sha512-cuadcxVFE8sDK6iWJbs8Sn0av2Nrh2QSGQhVlBW9AaAHqHwjWsZHT8LJ4hFGPh7ASBV2deFdM7H/DPjulmh8rg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "eslint-visitor-keys": "^3.4.3"
      },
      "engines": {
        "node": "^12.22.0 || ^14.17.0 || >=16.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      },
      "peerDependencies": {
        "eslint": "^6.0.0 || ^7.0.0 || >=8.0.0"
      }
    },
    "node_modules/@eslint-community/regexpp": {
      "version": "4.12.2",
      "resolved": "https://registry.npmjs.org/@eslint-community/regexpp/-/regexpp-4.12.2.tgz",
      "integrity": "sha512-EriSTlt5OC9/7SXkRSCAhfSxxoSUgBm33OH+IkwbdpgoqsSsUg7y3uh+IICI/Qg4BBWr3U2i39RpmycbxMq4ew==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^12.0.0 || ^14.0.0 || >=16.0.0"
      }
    },
    "node_modules/@eslint/config-array": {
      "version": "0.21.2",
      "resolved": "https://registry.npmjs.org/@eslint/config-array/-/config-array-0.21.2.tgz",
      "integrity": "sha512-nJl2KGTlrf9GjLimgIru+V/mzgSK0ABCDQRvxw5BjURL7WfH5uoWmizbH7QB6MmnMBd8cIC9uceWnezL1VZWWw==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@eslint/object-schema": "^2.1.7",
        "debug": "^4.3.1",
        "minimatch": "^3.1.5"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      }
    },
    "node_modules/@eslint/config-array/node_modules/balanced-match": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz",
      "integrity": "sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@eslint/config-array/node_modules/brace-expansion": {
      "version": "1.1.18",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.18.tgz",
      "integrity": "sha512-Edep/X9fGqVNmzKBVsDYIOtD+z1tuezV70LBjdCst9Tqu76lsnvRiZ6oTic1n+/BIwX6QDGAO94PN4N2SADvtw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^1.0.0",
        "concat-map": "0.0.1"
      }
    },
    "node_modules/@eslint/config-array/node_modules/minimatch": {
      "version": "3.1.5",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz",
      "integrity": "sha512-VgjWUsnnT6n+NUk6eZq77zeFdpW2LWDzP6zFGrCbHXiYNul5Dzqk2HHQ5uFH2DNW5Xbp8+jVzaeNt94ssEEl4w==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^1.1.7"
      },
      "engines": {
        "node": "*"
      }
    },
    "node_modules/@eslint/config-helpers": {
      "version": "0.4.2",
      "resolved": "https://registry.npmjs.org/@eslint/config-helpers/-/config-helpers-0.4.2.tgz",
      "integrity": "sha512-gBrxN88gOIf3R7ja5K9slwNayVcZgK6SOUORm2uBzTeIEfeVaIhOpCtTox3P6R7o2jLFwLFTLnC7kU/RGcYEgw==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@eslint/core": "^0.17.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      }
    },
    "node_modules/@eslint/core": {
      "version": "0.17.0",
      "resolved": "https://registry.npmjs.org/@eslint/core/-/core-0.17.0.tgz",
      "integrity": "sha512-yL/sLrpmtDaFEiUj1osRP4TI2MDz1AddJL+jZ7KSqvBuliN4xqYY54IfdN8qD8Toa6g1iloph1fxQNkjOxrrpQ==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@types/json-schema": "^7.0.15"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      }
    },
    "node_modules/@eslint/eslintrc": {
      "version": "3.3.6",
      "resolved": "https://registry.npmjs.org/@eslint/eslintrc/-/eslintrc-3.3.6.tgz",
      "integrity": "sha512-l2Ul9PrHsPCKcEY/ac7VgFj9D80C7S68sOKc618SyHDPK36s1XcFebXY0iTzUVn4Yq+YbwvSnDmCz9yxjX+QrA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ajv": "^6.14.0",
        "debug": "^4.3.2",
        "espree": "^10.0.1",
        "globals": "^14.0.0",
        "ignore": "^5.2.0",
        "import-fresh": "^3.2.1",
        "js-yaml": "^4.3.0",
        "minimatch": "^3.1.5",
        "strip-json-comments": "^3.1.1"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/@eslint/eslintrc/node_modules/balanced-match": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz",
      "integrity": "sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@eslint/eslintrc/node_modules/brace-expansion": {
      "version": "1.1.18",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.18.tgz",
      "integrity": "sha512-Edep/X9fGqVNmzKBVsDYIOtD+z1tuezV70LBjdCst9Tqu76lsnvRiZ6oTic1n+/BIwX6QDGAO94PN4N2SADvtw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^1.0.0",
        "concat-map": "0.0.1"
      }
    },
    "node_modules/@eslint/eslintrc/node_modules/ignore": {
      "version": "5.3.2",
      "resolved": "https://registry.npmjs.org/ignore/-/ignore-5.3.2.tgz",
      "integrity": "sha512-hsBTNUqQTDwkWtcdYI2i06Y/nUBEsNEDJKjWdigLvegy8kDuJAS8uRlpkkcQpyEXL0Z/pjDy5HBmMjRCJ2gq+g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 4"
      }
    },
    "node_modules/@eslint/eslintrc/node_modules/minimatch": {
      "version": "3.1.5",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz",
      "integrity": "sha512-VgjWUsnnT6n+NUk6eZq77zeFdpW2LWDzP6zFGrCbHXiYNul5Dzqk2HHQ5uFH2DNW5Xbp8+jVzaeNt94ssEEl4w==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^1.1.7"
      },
      "engines": {
        "node": "*"
      }
    },
    "node_modules/@eslint/js": {
      "version": "9.39.5",
      "resolved": "https://registry.npmjs.org/@eslint/js/-/js-9.39.5.tgz",
      "integrity": "sha512-QywQuszQh77pIXCsq998c8hbhSTI/azTty1Z6N53dmAudKHhy573j3yvRLsX2BSp8YpLtoCEG8E9DJe+8zUh4A==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "url": "https://eslint.org/donate"
      }
    },
    "node_modules/@eslint/object-schema": {
      "version": "2.1.7",
      "resolved": "https://registry.npmjs.org/@eslint/object-schema/-/object-schema-2.1.7.tgz",
      "integrity": "sha512-VtAOaymWVfZcmZbp6E2mympDIHvyjXs/12LqWYjVw6qjrfF+VK+fyG33kChz3nnK+SU5/NeHOqrTEHS8sXO3OA==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      }
    },
    "node_modules/@eslint/plugin-kit": {
      "version": "0.4.1",
      "resolved": "https://registry.npmjs.org/@eslint/plugin-kit/-/plugin-kit-0.4.1.tgz",
      "integrity": "sha512-43/qtrDUokr7LJqoF2c3+RInu/t4zfrpYdoSDfYyhg52rwLV6TnOvdG4fXm7IkSB3wErkcmJS9iEhjVtOSEjjA==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@eslint/core": "^0.17.0",
        "levn": "^0.4.1"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      }
    },
    "node_modules/@humanfs/core": {
      "version": "0.19.2",
      "resolved": "https://registry.npmjs.org/@humanfs/core/-/core-0.19.2.tgz",
      "integrity": "sha512-UhXNm+CFMWcbChXywFwkmhqjs3PRCmcSa/hfBgLIb7oQ5HNb1wS0icWsGtSAUNgefHeI+eBrA8I1fxmbHsGdvA==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@humanfs/types": "^0.15.0"
      },
      "engines": {
        "node": ">=18.18.0"
      }
    },
    "node_modules/@humanfs/node": {
      "version": "0.16.8",
      "resolved": "https://registry.npmjs.org/@humanfs/node/-/node-0.16.8.tgz",
      "integrity": "sha512-gE1eQNZ3R++kTzFUpdGlpmy8kDZD/MLyHqDwqjkVQI0JMdI1D51sy1H958PNXYkM2rAac7e5/CnIKZrHtPh3BQ==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@humanfs/core": "^0.19.2",
        "@humanfs/types": "^0.15.0",
        "@humanwhocodes/retry": "^0.4.0"
      },
      "engines": {
        "node": ">=18.18.0"
      }
    },
    "node_modules/@humanfs/types": {
      "version": "0.15.0",
      "resolved": "https://registry.npmjs.org/@humanfs/types/-/types-0.15.0.tgz",
      "integrity": "sha512-ZZ1w0aoQkwuUuC7Yf+7sdeaNfqQiiLcSRbfI08oAxqLtpXQr9AIVX7Ay7HLDuiLYAaFPu8oBYNq/QIi9URHJ3Q==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": ">=18.18.0"
      }
    },
    "node_modules/@humanwhocodes/module-importer": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@humanwhocodes/module-importer/-/module-importer-1.0.1.tgz",
      "integrity": "sha512-bxveV4V8v5Yb4ncFTT3rPSgZBOpCkjfK0y4oVVVJwIuDVBRMDXrPyXRL988i5ap9m9bnyEEjWfm5WkBmtffLfA==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": ">=12.22"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/nzakas"
      }
    },
    "node_modules/@humanwhocodes/retry": {
      "version": "0.4.3",
      "resolved": "https://registry.npmjs.org/@humanwhocodes/retry/-/retry-0.4.3.tgz",
      "integrity": "sha512-bV0Tgo9K4hfPCek+aMAn81RppFKv2ySDQeMoSZuvTASywNTnVJCArCZE2FWqpvIatKu7VMRLWlR1EazvVhDyhQ==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": ">=18.18"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/nzakas"
      }
    },
    "node_modules/@marijn/find-cluster-break": {
      "version": "1.0.3",
      "resolved": "https://registry.npmjs.org/@marijn/find-cluster-break/-/find-cluster-break-1.0.3.tgz",
      "integrity": "sha512-FY+MKLBoTsLNJF/eLWaOsXGdz6uh3Iu1axjPf6TUq92IYumcTcXWHoS747JARLkcdlJ/Waiaxc5wQfFO8jC6NA==",
      "dev": true,
      "license": "MIT",
      "peer": true
    },
    "node_modules/@types/codemirror": {
      "version": "5.60.8",
      "resolved": "https://registry.npmjs.org/@types/codemirror/-/codemirror-5.60.8.tgz",
      "integrity": "sha512-VjFgDF/eB+Aklcy15TtOTLQeMjTo07k7KAjql8OK5Dirr7a6sJY4T1uVBDuTVG9VEmn1uUsohOpYnVfgC6/jyw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/tern": "*"
      }
    },
    "node_modules/@types/d3-array": {
      "version": "3.2.2",
      "resolved": "https://registry.npmjs.org/@types/d3-array/-/d3-array-3.2.2.tgz",
      "integrity": "sha512-hOLWVbm7uRza0BYXpIIW5pxfrKe0W+D5lrFiAEYR+pb6w3N2SwSMaJbXdUfSEv+dT4MfHBLtn5js0LAWaO6otw==",
      "license": "MIT"
    },
    "node_modules/@types/d3-color": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/@types/d3-color/-/d3-color-3.1.3.tgz",
      "integrity": "sha512-iO90scth9WAbmgv7ogoq57O9YpKmFBbmoEoCHDB2xMBY0+/KVrqAaCDyCE16dUspeOvIxFFRI+0sEtqDqy2b4A==",
      "license": "MIT"
    },
    "node_modules/@types/d3-ease": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/@types/d3-ease/-/d3-ease-3.0.2.tgz",
      "integrity": "sha512-NcV1JjO5oDzoK26oMzbILE6HW7uVXOHLQvHshBUW4UMdZGfiY6v5BeQwh9a9tCzv+CeefZQHJt5SRgK154RtiA==",
      "license": "MIT"
    },
    "node_modules/@types/d3-interpolate": {
      "version": "3.0.4",
      "resolved": "https://registry.npmjs.org/@types/d3-interpolate/-/d3-interpolate-3.0.4.tgz",
      "integrity": "sha512-mgLPETlrpVV1YRJIglr4Ez47g7Yxjl1lj7YKsiMCb27VJH9W8NVM6Bb9d8kkpG/uAQS5AmbA48q2IAolKKo1MA==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-color": "*"
      }
    },
    "node_modules/@types/d3-path": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/@types/d3-path/-/d3-path-3.1.1.tgz",
      "integrity": "sha512-VMZBYyQvbGmWyWVea0EHs/BwLgxc+MKi1zLDCONksozI4YJMcTt8ZEuIR4Sb1MMTE8MMW49v0IwI5+b7RmfWlg==",
      "license": "MIT"
    },
    "node_modules/@types/d3-scale": {
      "version": "4.0.9",
      "resolved": "https://registry.npmjs.org/@types/d3-scale/-/d3-scale-4.0.9.tgz",
      "integrity": "sha512-dLmtwB8zkAeO/juAMfnV+sItKjlsw2lKdZVVy6LRr0cBmegxSABiLEpGVmSJJ8O08i4+sGR6qQtb6WtuwJdvVw==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-time": "*"
      }
    },
    "node_modules/@types/d3-shape": {
      "version": "3.1.8",
      "resolved": "https://registry.npmjs.org/@types/d3-shape/-/d3-shape-3.1.8.tgz",
      "integrity": "sha512-lae0iWfcDeR7qt7rA88BNiqdvPS5pFVPpo5OfjElwNaT2yyekbM0C9vK+yqBqEmHr6lDkRnYNoTBYlAgJa7a4w==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-path": "*"
      }
    },
    "node_modules/@types/d3-time": {
      "version": "3.0.4",
      "resolved": "https://registry.npmjs.org/@types/d3-time/-/d3-time-3.0.4.tgz",
      "integrity": "sha512-yuzZug1nkAAaBlBBikKZTgzCeA+k1uy4ZFwWANOfKw5z5LRhV0gNA7gNkKm7HoK+HRN0wX3EkxGk0fpbWhmB7g==",
      "license": "MIT"
    },
    "node_modules/@types/d3-timer": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/@types/d3-timer/-/d3-timer-3.0.2.tgz",
      "integrity": "sha512-Ps3T8E8dZDam6fUyNiMkekK3XUsaUEik+idO9/YjPtfj2qruF8tFBXS7XhtE4iIXBLxhmLjP3SXpLhVf21I9Lw==",
      "license": "MIT"
    },
    "node_modules/@types/estree": {
      "version": "1.0.9",
      "resolved": "https://registry.npmjs.org/@types/estree/-/estree-1.0.9.tgz",
      "integrity": "sha512-GhdPgy1el4/ImP05X05Uw4cw2/M93BCUmnEvWZNStlCzEKME4Fkk+YpoA5OiHNQmoS7Cafb8Xa3Pya8m1Qrzeg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@types/json-schema": {
      "version": "7.0.15",
      "resolved": "https://registry.npmjs.org/@types/json-schema/-/json-schema-7.0.15.tgz",
      "integrity": "sha512-5+fP8P8MFNC+AyZCDxrB2pkZFPGzqQWUzpSeuuVLvm8VMcorNYavBqoFcxK8bQz4Qsbn4oUEEem4wDLfcysGHA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@types/node": {
      "version": "22.20.1",
      "resolved": "https://registry.npmjs.org/@types/node/-/node-22.20.1.tgz",
      "integrity": "sha512-EANqOCF9QFyra+4pfxUcX9STKJpCLjMbObVzljIJomAWSnuSIEAvyzEU53GaajbXJEgdh0iEcPL+DGvpUd4k1Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "undici-types": "~6.21.0"
      }
    },
    "node_modules/@types/react": {
      "version": "19.2.18",
      "resolved": "https://registry.npmjs.org/@types/react/-/react-19.2.18.tgz",
      "integrity": "sha512-AnzbBERsrLKtk2XSfTbYRLjQPdy116Sty4q+T+Bp3IC4l6jNBvreVPAHmpq9qhXQM7CXZPjLVmGMw9sy+hxQ3w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "csstype": "^3.2.2"
      }
    },
    "node_modules/@types/react-dom": {
      "version": "19.2.4",
      "resolved": "https://registry.npmjs.org/@types/react-dom/-/react-dom-19.2.4.tgz",
      "integrity": "sha512-Bsc+QHgp+P/F02XDzNCY9jnZNCUuLki36KT7VKrTXXLdHf+vHMNZnW1rVu5DNW/rCK+fya3DATySbLM4yhtKUw==",
      "dev": true,
      "license": "MIT",
      "peerDependencies": {
        "@types/react": "^19.2.0"
      }
    },
    "node_modules/@types/tern": {
      "version": "0.23.9",
      "resolved": "https://registry.npmjs.org/@types/tern/-/tern-0.23.9.tgz",
      "integrity": "sha512-ypzHFE/wBzh+BlH6rrBgS5I/Z7RD21pGhZ2rltb/+ZrVM1awdZwjx7hE5XfuYgHWk9uvV5HLZN3SloevCAp3Bw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/estree": "*"
      }
    },
    "node_modules/@typescript-eslint/eslint-plugin": {
      "version": "8.67.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/eslint-plugin/-/eslint-plugin-8.67.0.tgz",
      "integrity": "sha512-Un7Heoyj65NREbKAyIrFxeM143NZpExWmy1Nep4DLeQOeLlTeumPjoNKnBrU5D5moWXbPJgRa5Uwcdu0faVNGQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@eslint-community/regexpp": "^4.12.2",
        "@typescript-eslint/scope-manager": "8.67.0",
        "@typescript-eslint/type-utils": "8.67.0",
        "@typescript-eslint/utils": "8.67.0",
        "@typescript-eslint/visitor-keys": "8.67.0",
        "ignore": "^7.0.5",
        "natural-compare": "^1.4.0",
        "ts-api-utils": "^2.5.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "@typescript-eslint/parser": "^8.67.0",
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/@typescript-eslint/parser": {
      "version": "8.67.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/parser/-/parser-8.67.0.tgz",
      "integrity": "sha512-fUBfTuuEulWqX6V8+O3PtScV01tzYYRUDTAirHFKoRAt7nOzoGiPt0M/bB47wWNy0coOOcgEwAMUtBpykMxl6w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/scope-manager": "8.67.0",
        "@typescript-eslint/types": "8.67.0",
        "@typescript-eslint/typescript-estree": "8.67.0",
        "@typescript-eslint/visitor-keys": "8.67.0",
        "debug": "^4.4.3"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/@typescript-eslint/project-service": {
      "version": "8.67.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/project-service/-/project-service-8.67.0.tgz",
      "integrity": "sha512-cvE8c7ulYeXN9fYuszhCeCsbzyVEXuhrRCybnBre7TUmqb5nRmBfQAwCj0O3WJFDeyAZt4VYv51vMCC9LHSdYw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/tsconfig-utils": "^8.67.0",
        "@typescript-eslint/types": "^8.67.0",
        "debug": "^4.4.3"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/@typescript-eslint/scope-manager": {
      "version": "8.67.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/scope-manager/-/scope-manager-8.67.0.tgz",
      "integrity": "sha512-EgvsleTwS4E+WzzSvem8fAUubLwatMNF1B5hHSLQxcvs7q2dtRhGyujHwLJSYlG41niJ7GP24Aha2+0mb1b2kg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/types": "8.67.0",
        "@typescript-eslint/visitor-keys": "8.67.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      }
    },
    "node_modules/@typescript-eslint/tsconfig-utils": {
      "version": "8.67.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/tsconfig-utils/-/tsconfig-utils-8.67.0.tgz",
      "integrity": "sha512-vV+LUSv5njUWsknE71fqKTlXUva+R76SaeORd6Zojcunk/6DvKFXONU3BrAs2H49mbygUXt6gbYunzwqNwlhdg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/@typescript-eslint/type-utils": {
      "version": "8.67.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/type-utils/-/type-utils-8.67.0.tgz",
      "integrity": "sha512-aVWDXbRmdXO9siTfX4ditQI1T9+zVcNazT48EJCD0v40/9RIFoUgZ05CmGEq9H2gixRpjUn/iplwvlcvutJW/Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/types": "8.67.0",
        "@typescript-eslint/typescript-estree": "8.67.0",
        "@typescript-eslint/utils": "8.67.0",
        "debug": "^4.4.3",
        "ts-api-utils": "^2.5.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/@typescript-eslint/types": {
      "version": "8.67.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/types/-/types-8.67.0.tgz",
      "integrity": "sha512-sBtgslww8nsMYUjhdPBiSyUqSzT8uR6g93A2QXnQC8+cGdjz0CyaOdqHDRJb1AtORbZCNUJBBeFA/tNR2uQmww==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      }
    },
    "node_modules/@typescript-eslint/typescript-estree": {
      "version": "8.67.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/typescript-estree/-/typescript-estree-8.67.0.tgz",
      "integrity": "sha512-EKQBCE9yNlRJYm7jdTW5AhDacDUmSwQb0FAJAmK2EKYrNXIsa2vxcSZx6PvJ/dEdI6lS+Y9W+EXckLj0iPFGcw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/project-service": "8.67.0",
        "@typescript-eslint/tsconfig-utils": "8.67.0",
        "@typescript-eslint/types": "8.67.0",
        "@typescript-eslint/visitor-keys": "8.67.0",
        "debug": "^4.4.3",
        "minimatch": "^10.2.2",
        "semver": "^7.7.3",
        "tinyglobby": "^0.2.15",
        "ts-api-utils": "^2.5.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/@typescript-eslint/utils": {
      "version": "8.67.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/utils/-/utils-8.67.0.tgz",
      "integrity": "sha512-U9D1FdwEWBwok3hxxSdhclMb0twvt9QnjIQ0VfQ1AiX2epnpSgv2ubVDsayOFyY8K6FX+AQ7E0FKWVG3iKsj1A==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@eslint-community/eslint-utils": "^4.9.1",
        "@typescript-eslint/scope-manager": "8.67.0",
        "@typescript-eslint/types": "8.67.0",
        "@typescript-eslint/typescript-estree": "8.67.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/@typescript-eslint/visitor-keys": {
      "version": "8.67.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/visitor-keys/-/visitor-keys-8.67.0.tgz",
      "integrity": "sha512-fkv8dHRDqfGtTHuJeebdrQ7cX6Ad4WAS00rgHh9UGvMycF1mjBfsxry1XsLIFhWZ6Judlh6UdzK+TYlbpCXgnA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/types": "8.67.0",
        "eslint-visitor-keys": "^5.0.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      }
    },
    "node_modules/@typescript-eslint/visitor-keys/node_modules/eslint-visitor-keys": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-5.0.1.tgz",
      "integrity": "sha512-tD40eHxA35h0PEIZNeIjkHoDR4YjjJp34biM0mDvplBe//mB+IHCqHDGV7pxF+7MklTvighcCPPZC7ynWyjdTA==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=24"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/acorn": {
      "version": "8.18.0",
      "resolved": "https://registry.npmjs.org/acorn/-/acorn-8.18.0.tgz",
      "integrity": "sha512-lGq+9yr1/GuAWaVYIHRjvvySG5/4VfKIvC8EWxStPdcDh/Ka7FG3twP6v4d5BkravUilhIAsG4Qj83t02LWUPQ==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "acorn": "bin/acorn"
      },
      "engines": {
        "node": ">=0.4.0"
      }
    },
    "node_modules/acorn-jsx": {
      "version": "5.3.2",
      "resolved": "https://registry.npmjs.org/acorn-jsx/-/acorn-jsx-5.3.2.tgz",
      "integrity": "sha512-rq9s+JNhf0IChjtDXxllJ7g41oZk5SlXtp0LHwyA5cejwn7vKmKp4pPri6YEePv2PU65sAsegbXtIinmDFDXgQ==",
      "dev": true,
      "license": "MIT",
      "peerDependencies": {
        "acorn": "^6.0.0 || ^7.0.0 || ^8.0.0"
      }
    },
    "node_modules/ajv": {
      "version": "6.15.0",
      "resolved": "https://registry.npmjs.org/ajv/-/ajv-6.15.0.tgz",
      "integrity": "sha512-fgFx7Hfoq60ytK2c7DhnF8jIvzYgOMxfugjLOSMHjLIPgenqa7S7oaagATUq99mV6IYvN2tRmC0wnTYX6iPbMw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "fast-deep-equal": "^3.1.1",
        "fast-json-stable-stringify": "^2.0.0",
        "json-schema-traverse": "^0.4.1",
        "uri-js": "^4.2.2"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/epoberezkin"
      }
    },
    "node_modules/ansi-styles": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-4.3.0.tgz",
      "integrity": "sha512-zbB9rCJAT1rbjiVDb2hqKFHNYLxgtk8NURxZ3IZwD3F6NtxbXZQCnnSi1Lkx+IDohdPlFp222wVALIheZJQSEg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "color-convert": "^2.0.1"
      },
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
      }
    },
    "node_modules/argparse": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/argparse/-/argparse-2.0.1.tgz",
      "integrity": "sha512-8+9WqebbFzpX9OR+Wa6O29asIogeRMzcGtAINdpMHHyAg10f05aSFVBbcEqGf/PXw1EjAZ+q2/bEBg3DvurK3Q==",
      "dev": true,
      "license": "Python-2.0"
    },
    "node_modules/balanced-match": {
      "version": "4.0.4",
      "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-4.0.4.tgz",
      "integrity": "sha512-BLrgEcRTwX2o6gGxGOCNyMvGSp35YofuYzw9h1IMTRmKqttAZZVU67bdb9Pr2vUHA8+j3i2tJfjO6C6+4myGTA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "18 || 20 || >=22"
      }
    },
    "node_modules/brace-expansion": {
      "version": "5.0.9",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.9.tgz",
      "integrity": "sha512-ScQ4IuvIEF1TMlP7Zt+vjJ//9zlPb2SDcxWxM3bk8s6t6GGdJ7KO1dCcTidOPJKePW30LE/2cT7wCyPho9/Wxg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^4.0.2"
      },
      "engines": {
        "node": "20 || >=22"
      }
    },
    "node_modules/builtin-modules": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/builtin-modules/-/builtin-modules-4.0.0.tgz",
      "integrity": "sha512-p1n8zyCkt1BVrKNFymOHjcDSAl7oq/gUvfgULv2EblgpPVQlQr9yHnWjg9IJ2MhfwPqiYqMMrr01OY7yQoK2yA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18.20"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/callsites": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/callsites/-/callsites-3.1.0.tgz",
      "integrity": "sha512-P8BjAsXvZS+VIDUI11hHCQEv74YT67YUi5JJFNWIqL235sBmjX4+qx9Muvls5ivyNENctx46xQLQ3aTuE7ssaQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/chalk": {
      "version": "4.1.2",
      "resolved": "https://registry.npmjs.org/chalk/-/chalk-4.1.2.tgz",
      "integrity": "sha512-oKnbhFyRIXpUuez8iBMmyEa4nbj4IOQyuhc/wy9kY7/WVPcwIO9VA668Pu8RkO7+0G76SLROeyw9CpQ061i4mA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ansi-styles": "^4.1.0",
        "supports-color": "^7.1.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/chalk/chalk?sponsor=1"
      }
    },
    "node_modules/clsx": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/clsx/-/clsx-2.1.1.tgz",
      "integrity": "sha512-eYm0QWBtUrBWZWG0d386OGAw16Z995PiOVo2B7bjWSbHedGl5e0ZWaq65kOGgUSNesEIDkB9ISbTg/JK9dhCZA==",
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/color-convert": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/color-convert/-/color-convert-2.0.1.tgz",
      "integrity": "sha512-RRECPsj7iu/xb5oKYcsFHSppFNnsj/52OVTRKb4zP5onXwVF3zVmmToNcOfGC+CRDpfK/U584fMg38ZHCaElKQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "color-name": "~1.1.4"
      },
      "engines": {
        "node": ">=7.0.0"
      }
    },
    "node_modules/color-name": {
      "version": "1.1.4",
      "resolved": "https://registry.npmjs.org/color-name/-/color-name-1.1.4.tgz",
      "integrity": "sha512-dOy+3AuW3a2wNbZHIuMZpTcgjGuLU/uBL/ubcZF9OXbDo8ff4O8yVp5Bf0efS8uEoYo5q4Fx7dY9OgQGXgAsQA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/concat-map": {
      "version": "0.0.1",
      "resolved": "https://registry.npmjs.org/concat-map/-/concat-map-0.0.1.tgz",
      "integrity": "sha512-/Srv4dswyQNBfohGpz9o6Yb3Gz3SrUDqBH5rTuhGR7ahtlbYKnVxw2bCFMRljaA7EXHaXZ8wsHdodFvbkhKmqg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/crelt": {
      "version": "1.0.7",
      "resolved": "https://registry.npmjs.org/crelt/-/crelt-1.0.7.tgz",
      "integrity": "sha512-aK6BbWfhf4U/wCcLHKPJl/xa6VkVstRaPywWtMKGwuOLc/wZTyQYuoxgvZnNsBvv7Kg3YTBQYYBCggcviQczuA==",
      "dev": true,
      "license": "MIT",
      "peer": true
    },
    "node_modules/cross-spawn": {
      "version": "7.0.6",
      "resolved": "https://registry.npmjs.org/cross-spawn/-/cross-spawn-7.0.6.tgz",
      "integrity": "sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "path-key": "^3.1.0",
        "shebang-command": "^2.0.0",
        "which": "^2.0.1"
      },
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/csstype": {
      "version": "3.2.3",
      "resolved": "https://registry.npmjs.org/csstype/-/csstype-3.2.3.tgz",
      "integrity": "sha512-z1HGKcYy2xA8AGQfwrn0PAy+PB7X/GSj3UVJW9qKyn43xWa+gl5nXmU4qqLMRzWVLFC8KusUX8T/0kCiOYpAIQ==",
      "license": "MIT"
    },
    "node_modules/d3-array": {
      "version": "3.2.4",
      "resolved": "https://registry.npmjs.org/d3-array/-/d3-array-3.2.4.tgz",
      "integrity": "sha512-tdQAmyA18i4J7wprpYq8ClcxZy3SC31QMeByyCFyRt7BVHdREQZ5lpzoe5mFEYZUWe+oq8HBvk9JjpibyEV4Jg==",
      "license": "ISC",
      "dependencies": {
        "internmap": "1 - 2"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-color": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/d3-color/-/d3-color-3.1.0.tgz",
      "integrity": "sha512-zg/chbXyeBtMQ1LbD/WSoW2DpC3I0mpmPdW+ynRTj/x2DAWYrIY7qeZIHidozwV24m4iavr15lNwIwLxRmOxhA==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-ease": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-ease/-/d3-ease-3.0.1.tgz",
      "integrity": "sha512-wR/XK3D3XcLIZwpbvQwQ5fK+8Ykds1ip7A2Txe0yxncXSdq1L9skcG7blcedkOX+ZcgxGAmLX1FrRGbADwzi0w==",
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-format": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/d3-format/-/d3-format-3.1.2.tgz",
      "integrity": "sha512-AJDdYOdnyRDV5b6ArilzCPPwc1ejkHcoyFarqlPqT7zRYjhavcT3uSrqcMvsgh2CgoPbK3RCwyHaVyxYcP2Arg==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-interpolate": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-interpolate/-/d3-interpolate-3.0.1.tgz",
      "integrity": "sha512-3bYs1rOD33uo8aqJfKP3JWPAibgw8Zm2+L9vBKEHJ2Rg+viTR7o5Mmv5mZcieN+FRYaAOWX5SJATX6k1PWz72g==",
      "license": "ISC",
      "dependencies": {
        "d3-color": "1 - 3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-path": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/d3-path/-/d3-path-3.1.0.tgz",
      "integrity": "sha512-p3KP5HCf/bvjBSSKuXid6Zqijx7wIfNW+J/maPs+iwR35at5JCbLUT0LzF1cnjbCHWhqzQTIN2Jpe8pRebIEFQ==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-scale": {
      "version": "4.0.2",
      "resolved": "https://registry.npmjs.org/d3-scale/-/d3-scale-4.0.2.tgz",
      "integrity": "sha512-GZW464g1SH7ag3Y7hXjf8RoUuAFIqklOAq3MRl4OaWabTFJY9PN/E1YklhXLh+OQ3fM9yS2nOkCoS+WLZ6kvxQ==",
      "license": "ISC",
      "dependencies": {
        "d3-array": "2.10.0 - 3",
        "d3-format": "1 - 3",
        "d3-interpolate": "1.2.0 - 3",
        "d3-time": "2.1.1 - 3",
        "d3-time-format": "2 - 4"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-shape": {
      "version": "3.2.0",
      "resolved": "https://registry.npmjs.org/d3-shape/-/d3-shape-3.2.0.tgz",
      "integrity": "sha512-SaLBuwGm3MOViRq2ABk3eLoxwZELpH6zhl3FbAoJ7Vm1gofKx6El1Ib5z23NUEhF9AsGl7y+dzLe5Cw2AArGTA==",
      "license": "ISC",
      "dependencies": {
        "d3-path": "^3.1.0"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-time": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/d3-time/-/d3-time-3.1.0.tgz",
      "integrity": "sha512-VqKjzBLejbSMT4IgbmVgDjpkYrNWUYJnbCGo874u7MMKIWsILRX+OpX/gTk8MqjpT1A/c6HY2dCA77ZN0lkQ2Q==",
      "license": "ISC",
      "dependencies": {
        "d3-array": "2 - 3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-time-format": {
      "version": "4.1.0",
      "resolved": "https://registry.npmjs.org/d3-time-format/-/d3-time-format-4.1.0.tgz",
      "integrity": "sha512-dJxPBlzC7NugB2PDLwo9Q8JiTR3M3e4/XANkreKSUxF8vvXKqm1Yfq4Q5dl8budlunRVlUUaDUgFt7eA8D6NLg==",
      "license": "ISC",
      "dependencies": {
        "d3-time": "1 - 3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-timer": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-timer/-/d3-timer-3.0.1.tgz",
      "integrity": "sha512-ndfJ/JxxMd3nw31uyKoY2naivF+r29V+Lc0svZxe1JvvIRmi8hUsrMvdOwgS1o6uBHmiz91geQ0ylPP0aj1VUA==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/debug": {
      "version": "4.4.3",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
      "integrity": "sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/decimal.js-light": {
      "version": "2.5.1",
      "resolved": "https://registry.npmjs.org/decimal.js-light/-/decimal.js-light-2.5.1.tgz",
      "integrity": "sha512-qIMFpTMZmny+MMIitAB6D7iVPEorVw6YQRWkvarTkT4tBeSLLiHzcwj6q0MmYSFCiVpiqPJTJEYIrpcPzVEIvg==",
      "license": "MIT"
    },
    "node_modules/deep-is": {
      "version": "0.1.4",
      "resolved": "https://registry.npmjs.org/deep-is/-/deep-is-0.1.4.tgz",
      "integrity": "sha512-oIPzksmTg4/MriiaYGO+okXDT7ztn/w3Eptv/+gSIdMdKsJo0u4CfYNFJPy+4SKMuCqGw2wxnA+URMg3t8a/bQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/dom-helpers": {
      "version": "5.2.1",
      "resolved": "https://registry.npmjs.org/dom-helpers/-/dom-helpers-5.2.1.tgz",
      "integrity": "sha512-nRCa7CK3VTrM2NmGkIy4cbK7IZlgBE/PYMn55rrXefr5xXDP0LdtfPnblFDoVdcAfslJ7or6iqAUnx0CCGIWQA==",
      "license": "MIT",
      "dependencies": {
        "@babel/runtime": "^7.8.7",
        "csstype": "^3.0.2"
      }
    },
    "node_modules/esbuild": {
      "version": "0.24.2",
      "resolved": "https://registry.npmjs.org/esbuild/-/esbuild-0.24.2.tgz",
      "integrity": "sha512-+9egpBW8I3CD5XPe0n6BfT5fxLzxrlDzqydF3aviG+9ni1lDC/OvMHcxqEFV0+LANZG5R1bFMWfUrjVsdwxJvA==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "bin": {
        "esbuild": "bin/esbuild"
      },
      "engines": {
        "node": ">=18"
      },
      "optionalDependencies": {
        "@esbuild/aix-ppc64": "0.24.2",
        "@esbuild/android-arm": "0.24.2",
        "@esbuild/android-arm64": "0.24.2",
        "@esbuild/android-x64": "0.24.2",
        "@esbuild/darwin-arm64": "0.24.2",
        "@esbuild/darwin-x64": "0.24.2",
        "@esbuild/freebsd-arm64": "0.24.2",
        "@esbuild/freebsd-x64": "0.24.2",
        "@esbuild/linux-arm": "0.24.2",
        "@esbuild/linux-arm64": "0.24.2",
        "@esbuild/linux-ia32": "0.24.2",
        "@esbuild/linux-loong64": "0.24.2",
        "@esbuild/linux-mips64el": "0.24.2",
        "@esbuild/linux-ppc64": "0.24.2",
        "@esbuild/linux-riscv64": "0.24.2",
        "@esbuild/linux-s390x": "0.24.2",
        "@esbuild/linux-x64": "0.24.2",
        "@esbuild/netbsd-arm64": "0.24.2",
        "@esbuild/netbsd-x64": "0.24.2",
        "@esbuild/openbsd-arm64": "0.24.2",
        "@esbuild/openbsd-x64": "0.24.2",
        "@esbuild/sunos-x64": "0.24.2",
        "@esbuild/win32-arm64": "0.24.2",
        "@esbuild/win32-ia32": "0.24.2",
        "@esbuild/win32-x64": "0.24.2"
      }
    },
    "node_modules/escape-string-regexp": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/escape-string-regexp/-/escape-string-regexp-4.0.0.tgz",
      "integrity": "sha512-TtpcNJ3XAzx3Gq8sWRzJaVajRs0uVxA2YAkdb1jm2YkPz4G6egUFAyA3n5vtEIZefPk5Wa4UXbKuS5fKkJWdgA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/eslint": {
      "version": "9.39.5",
      "resolved": "https://registry.npmjs.org/eslint/-/eslint-9.39.5.tgz",
      "integrity": "sha512-DgZS62aPLXKlnxILS/AYCoRvHaZeXceIzlXPkkGGzJWSow1aEk0lbTlxUSlyjC8jcaKxAdOnTDz+o1JFSBsyjw==",
      "deprecated": "This version is no longer supported. Please see https://eslint.org/version-support for other options.",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@eslint-community/eslint-utils": "^4.8.0",
        "@eslint-community/regexpp": "^4.12.1",
        "@eslint/config-array": "^0.21.2",
        "@eslint/config-helpers": "^0.4.2",
        "@eslint/core": "^0.17.0",
        "@eslint/eslintrc": "^3.3.6",
        "@eslint/js": "9.39.5",
        "@eslint/plugin-kit": "^0.4.1",
        "@humanfs/node": "^0.16.6",
        "@humanwhocodes/module-importer": "^1.0.1",
        "@humanwhocodes/retry": "^0.4.2",
        "@types/estree": "^1.0.6",
        "ajv": "^6.14.0",
        "chalk": "^4.0.0",
        "cross-spawn": "^7.0.6",
        "debug": "^4.3.2",
        "escape-string-regexp": "^4.0.0",
        "eslint-scope": "^8.4.0",
        "eslint-visitor-keys": "^4.2.1",
        "espree": "^10.4.0",
        "esquery": "^1.5.0",
        "esutils": "^2.0.2",
        "fast-deep-equal": "^3.1.3",
        "file-entry-cache": "^8.0.0",
        "find-up": "^5.0.0",
        "glob-parent": "^6.0.2",
        "ignore": "^5.2.0",
        "imurmurhash": "^0.1.4",
        "is-glob": "^4.0.0",
        "json-stable-stringify-without-jsonify": "^1.0.1",
        "lodash.merge": "^4.6.2",
        "minimatch": "^3.1.5",
        "natural-compare": "^1.4.0",
        "optionator": "^0.9.3"
      },
      "bin": {
        "eslint": "bin/eslint.js"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "url": "https://eslint.org/donate"
      },
      "peerDependencies": {
        "jiti": "*"
      },
      "peerDependenciesMeta": {
        "jiti": {
          "optional": true
        }
      }
    },
    "node_modules/eslint-config-prettier": {
      "version": "9.1.2",
      "resolved": "https://registry.npmjs.org/eslint-config-prettier/-/eslint-config-prettier-9.1.2.tgz",
      "integrity": "sha512-iI1f+D2ViGn+uvv5HuHVUamg8ll4tN+JRHGc6IJi4TP9Kl976C57fzPXgseXNs8v0iA8aSJpHsTWjDb9QJamGQ==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "eslint-config-prettier": "bin/cli.js"
      },
      "peerDependencies": {
        "eslint": ">=7.0.0"
      }
    },
    "node_modules/eslint-scope": {
      "version": "8.4.0",
      "resolved": "https://registry.npmjs.org/eslint-scope/-/eslint-scope-8.4.0.tgz",
      "integrity": "sha512-sNXOfKCn74rt8RICKMvJS7XKV/Xk9kA7DyJr8mJik3S7Cwgy3qlkkmyS2uQB3jiJg6VNdZd/pDBJu0nvG2NlTg==",
      "dev": true,
      "license": "BSD-2-Clause",
      "dependencies": {
        "esrecurse": "^4.3.0",
        "estraverse": "^5.2.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/eslint-visitor-keys": {
      "version": "3.4.3",
      "resolved": "https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-3.4.3.tgz",
      "integrity": "sha512-wpc+LXeiyiisxPlEkUzU6svyS1frIO3Mgxj1fdy7Pm8Ygzguax2N3Fa/D/ag1WqbOprdI+uY6wMUl8/a2G+iag==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": "^12.22.0 || ^14.17.0 || >=16.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/eslint/node_modules/balanced-match": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz",
      "integrity": "sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/eslint/node_modules/brace-expansion": {
      "version": "1.1.18",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.18.tgz",
      "integrity": "sha512-Edep/X9fGqVNmzKBVsDYIOtD+z1tuezV70LBjdCst9Tqu76lsnvRiZ6oTic1n+/BIwX6QDGAO94PN4N2SADvtw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^1.0.0",
        "concat-map": "0.0.1"
      }
    },
    "node_modules/eslint/node_modules/eslint-visitor-keys": {
      "version": "4.2.1",
      "resolved": "https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-4.2.1.tgz",
      "integrity": "sha512-Uhdk5sfqcee/9H/rCOJikYz67o0a2Tw2hGRPOG2Y1R2dg7brRe1uG0yaNQDHu+TO/uQPF/5eCapvYSmHUjt7JQ==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/eslint/node_modules/ignore": {
      "version": "5.3.2",
      "resolved": "https://registry.npmjs.org/ignore/-/ignore-5.3.2.tgz",
      "integrity": "sha512-hsBTNUqQTDwkWtcdYI2i06Y/nUBEsNEDJKjWdigLvegy8kDuJAS8uRlpkkcQpyEXL0Z/pjDy5HBmMjRCJ2gq+g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 4"
      }
    },
    "node_modules/eslint/node_modules/minimatch": {
      "version": "3.1.5",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz",
      "integrity": "sha512-VgjWUsnnT6n+NUk6eZq77zeFdpW2LWDzP6zFGrCbHXiYNul5Dzqk2HHQ5uFH2DNW5Xbp8+jVzaeNt94ssEEl4w==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^1.1.7"
      },
      "engines": {
        "node": "*"
      }
    },
    "node_modules/espree": {
      "version": "10.4.0",
      "resolved": "https://registry.npmjs.org/espree/-/espree-10.4.0.tgz",
      "integrity": "sha512-j6PAQ2uUr79PZhBjP5C5fhl8e39FmRnOjsD5lGnWrFU8i2G776tBK7+nP8KuQUTTyAZUwfQqXAgrVH5MbH9CYQ==",
      "dev": true,
      "license": "BSD-2-Clause",
      "dependencies": {
        "acorn": "^8.15.0",
        "acorn-jsx": "^5.3.2",
        "eslint-visitor-keys": "^4.2.1"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/espree/node_modules/eslint-visitor-keys": {
      "version": "4.2.1",
      "resolved": "https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-4.2.1.tgz",
      "integrity": "sha512-Uhdk5sfqcee/9H/rCOJikYz67o0a2Tw2hGRPOG2Y1R2dg7brRe1uG0yaNQDHu+TO/uQPF/5eCapvYSmHUjt7JQ==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/esquery": {
      "version": "1.7.0",
      "resolved": "https://registry.npmjs.org/esquery/-/esquery-1.7.0.tgz",
      "integrity": "sha512-Ap6G0WQwcU/LHsvLwON1fAQX9Zp0A2Y6Y/cJBl9r/JbW90Zyg4/zbG6zzKa2OTALELarYHmKu0GhpM5EO+7T0g==",
      "dev": true,
      "license": "BSD-3-Clause",
      "dependencies": {
        "estraverse": "^5.1.0"
      },
      "engines": {
        "node": ">=0.10"
      }
    },
    "node_modules/esrecurse": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/esrecurse/-/esrecurse-4.3.0.tgz",
      "integrity": "sha512-KmfKL3b6G+RXvP8N1vr3Tq1kL/oCFgn2NYXEtqP8/L3pKapUA4G8cFVaoF3SU323CD4XypR/ffioHmkti6/Tag==",
      "dev": true,
      "license": "BSD-2-Clause",
      "dependencies": {
        "estraverse": "^5.2.0"
      },
      "engines": {
        "node": ">=4.0"
      }
    },
    "node_modules/estraverse": {
      "version": "5.3.0",
      "resolved": "https://registry.npmjs.org/estraverse/-/estraverse-5.3.0.tgz",
      "integrity": "sha512-MMdARuVEQziNTeJD8DgMqmhwR11BRQ/cBP+pLtYdSTnf3MIO8fFeiINEbX36ZdNlfU/7A9f3gUw49B3oQsvwBA==",
      "dev": true,
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=4.0"
      }
    },
    "node_modules/esutils": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/esutils/-/esutils-2.0.3.tgz",
      "integrity": "sha512-kVscqXk4OCp68SZ0dkgEKVi6/8ij300KBWTJq32P/dYeWTSwK41WyTxalN1eRmA5Z9UU/LX9D7FWSmV9SAYx6g==",
      "dev": true,
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/eventemitter3": {
      "version": "4.0.7",
      "resolved": "https://registry.npmjs.org/eventemitter3/-/eventemitter3-4.0.7.tgz",
      "integrity": "sha512-8guHBZCwKnFhYdHr2ysuRWErTwhoN2X8XELRlrRwpmfeY2jjuUN4taQMsULKUVo1K4DvZl+0pgfyoysHxvmvEw==",
      "license": "MIT"
    },
    "node_modules/fast-deep-equal": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/fast-deep-equal/-/fast-deep-equal-3.1.3.tgz",
      "integrity": "sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/fast-equals": {
      "version": "5.4.1",
      "resolved": "https://registry.npmjs.org/fast-equals/-/fast-equals-5.4.1.tgz",
      "integrity": "sha512-DjlFSM5Pk9cGcL0q5QXl66eGzx0N6szNgaswwc5ZphlBohjTVJSnGgI+rJVOgOi65qUoQnDZN4nDqi33udtydQ==",
      "license": "MIT",
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/fast-json-stable-stringify": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/fast-json-stable-stringify/-/fast-json-stable-stringify-2.1.0.tgz",
      "integrity": "sha512-lhd/wF+Lk98HZoTCtlVraHtfh5XYijIjalXck7saUtuanSDyLMxnHhSXEDJqHxD7msR8D0uCmqlkwjCV8xvwHw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/fast-levenshtein": {
      "version": "2.0.6",
      "resolved": "https://registry.npmjs.org/fast-levenshtein/-/fast-levenshtein-2.0.6.tgz",
      "integrity": "sha512-DCXu6Ifhqcks7TZKY3Hxp3y6qphY5SJZmrWMDrKcERSOXWQdMhU9Ig/PYrzyw/ul9jOIyh0N4M0tbC5hodg8dw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/fdir": {
      "version": "6.5.0",
      "resolved": "https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz",
      "integrity": "sha512-tIbYtZbucOs0BRGqPJkshJUYdL+SDH7dVM8gjy+ERp3WAUjLEFJE+02kanyHtwjWOnwrKYBiwAmM0p4kLJAnXg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=12.0.0"
      },
      "peerDependencies": {
        "picomatch": "^3 || ^4"
      },
      "peerDependenciesMeta": {
        "picomatch": {
          "optional": true
        }
      }
    },
    "node_modules/file-entry-cache": {
      "version": "8.0.0",
      "resolved": "https://registry.npmjs.org/file-entry-cache/-/file-entry-cache-8.0.0.tgz",
      "integrity": "sha512-XXTUwCvisa5oacNGRP9SfNtYBNAMi+RPwBFmblZEF7N7swHYQS6/Zfk7SRwx4D5j3CH211YNRco1DEMNVfZCnQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "flat-cache": "^4.0.0"
      },
      "engines": {
        "node": ">=16.0.0"
      }
    },
    "node_modules/find-up": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/find-up/-/find-up-5.0.0.tgz",
      "integrity": "sha512-78/PXT1wlLLDgTzDs7sjq9hzz0vXD+zn+7wypEe4fXQxCmdmqfGsEPQxmiCSQI3ajFV91bVSsvNtrJRiW6nGng==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "locate-path": "^6.0.0",
        "path-exists": "^4.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/flat-cache": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/flat-cache/-/flat-cache-4.0.1.tgz",
      "integrity": "sha512-f7ccFPK3SXFHpx15UIGyRJ/FJQctuKZ0zVuN3frBo4HnK3cay9VEW0R6yPYFHC0AgqhukPzKjq22t5DmAyqGyw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "flatted": "^3.2.9",
        "keyv": "^4.5.4"
      },
      "engines": {
        "node": ">=16"
      }
    },
    "node_modules/flatted": {
      "version": "3.4.4",
      "resolved": "https://registry.npmjs.org/flatted/-/flatted-3.4.4.tgz",
      "integrity": "sha512-5+ybhBZANEJxaH3X5evAFatUxLfEHSr7n6kYJ+1Qd0mUqr4eu9gIf6GDbWHf8RJijHrjjO8G+la14SlL2SeS1Q==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/fsevents": {
      "version": "2.3.3",
      "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz",
      "integrity": "sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^8.16.0 || ^10.6.0 || >=11.0.0"
      }
    },
    "node_modules/glob-parent": {
      "version": "6.0.2",
      "resolved": "https://registry.npmjs.org/glob-parent/-/glob-parent-6.0.2.tgz",
      "integrity": "sha512-XxwI8EOhVQgWp6iDL+3b0r86f4d6AX6zSU55HfB4ydCEuXLXc5FcYeOu+nnGftS4TEju/11rt4KJPTMgbfmv4A==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "is-glob": "^4.0.3"
      },
      "engines": {
        "node": ">=10.13.0"
      }
    },
    "node_modules/globals": {
      "version": "14.0.0",
      "resolved": "https://registry.npmjs.org/globals/-/globals-14.0.0.tgz",
      "integrity": "sha512-oahGvuMGQlPw/ivIYBjVSrWAfWLBeku5tpPE2fOPLi+WHffIWbuh2tCjhyQhTBPMf5E9jDEH4FOmTYgYwbKwtQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/has-flag": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz",
      "integrity": "sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/ignore": {
      "version": "7.0.6",
      "resolved": "https://registry.npmjs.org/ignore/-/ignore-7.0.6.tgz",
      "integrity": "sha512-BAg6QkE8W+TuQLrrw0Ugr7HegXduRuuj8/ti2kSOc+jz1dmx8/WNcjr6XGnq5YpDWxFwwaavqD0+jIUOKelTsw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 4"
      }
    },
    "node_modules/import-fresh": {
      "version": "3.3.1",
      "resolved": "https://registry.npmjs.org/import-fresh/-/import-fresh-3.3.1.tgz",
      "integrity": "sha512-TR3KfrTZTYLPB6jUjfx6MF9WcWrHL9su5TObK4ZkYgBdWKPOFoSoQIdEuTuR82pmtxH2spWG9h6etwfr1pLBqQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "parent-module": "^1.0.0",
        "resolve-from": "^4.0.0"
      },
      "engines": {
        "node": ">=6"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/imurmurhash": {
      "version": "0.1.4",
      "resolved": "https://registry.npmjs.org/imurmurhash/-/imurmurhash-0.1.4.tgz",
      "integrity": "sha512-JmXMZ6wuvDmLiHEml9ykzqO6lwFbof0GG4IkcGaENdCRDDmMVnny7s5HsIgHCbaq0w2MyPhDqkhTUgS2LU2PHA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.8.19"
      }
    },
    "node_modules/internmap": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/internmap/-/internmap-2.0.3.tgz",
      "integrity": "sha512-5Hh7Y1wQbvY5ooGgPbDaL5iYLAPzMTUrjMulskHLH6wnv/A+1q5rgEaiuqEjB+oxGXIVZs1FF+R/KPN3ZSQYYg==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/is-extglob": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/is-extglob/-/is-extglob-2.1.1.tgz",
      "integrity": "sha512-SbKbANkN603Vi4jEZv49LeVJMn4yGwsbzZworEoyEiutsN3nJYdbO36zfhGJ6QEDpOZIFkDtnq5JRxmvl3jsoQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/is-glob": {
      "version": "4.0.3",
      "resolved": "https://registry.npmjs.org/is-glob/-/is-glob-4.0.3.tgz",
      "integrity": "sha512-xelSayHH36ZgE7ZWhli7pW34hNbNl8Ojv5KVmkJD4hBdD3th8Tfk9vYasLM+mXWOZhFkgZfxhLSnrwRr4elSSg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "is-extglob": "^2.1.1"
      },
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/isexe": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/isexe/-/isexe-2.0.0.tgz",
      "integrity": "sha512-RHxMLp9lnKHGHRng9QFhRCMbYAcVpn69smSGcq3f36xjgVVWThj4qqLbTLlq7Ssj8B+fIQ1EuCEGI2lKsyQeIw==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/js-tokens": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/js-tokens/-/js-tokens-4.0.0.tgz",
      "integrity": "sha512-RdJUflcE3cUzKiMqQgsCu06FPu9UdIJO0beYbPhHN4k6apgJtifcoCtT9bcxOpYBtpD2kCM6Sbzg4CausW/PKQ==",
      "license": "MIT"
    },
    "node_modules/js-yaml": {
      "version": "4.3.1",
      "resolved": "https://registry.npmjs.org/js-yaml/-/js-yaml-4.3.1.tgz",
      "integrity": "sha512-CY6crGq313MX8GkwvB7tzgp99vjQxY1++5y10/BKN/GUfHqWaOGQMNZkBvqSzsZKWk/ijwHlWzzkLulsGHhjWQ==",
      "dev": true,
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/puzrin"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/nodeca"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "argparse": "^2.0.1"
      },
      "bin": {
        "js-yaml": "bin/js-yaml.js"
      }
    },
    "node_modules/json-buffer": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/json-buffer/-/json-buffer-3.0.1.tgz",
      "integrity": "sha512-4bV5BfR2mqfQTJm+V5tPPdf+ZpuhiIvTuAB5g8kcrXOZpTT/QwwVRWBywX1ozr6lEuPdbHxwaJlm9G6mI2sfSQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/json-schema-traverse": {
      "version": "0.4.1",
      "resolved": "https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-0.4.1.tgz",
      "integrity": "sha512-xbbCH5dCYU5T8LcEhhuh7HJ88HXuW3qsI3Y0zOZFKfZEHcpWiHU/Jxzk629Brsab/mMiHQti9wMP+845RPe3Vg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/json-stable-stringify-without-jsonify": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/json-stable-stringify-without-jsonify/-/json-stable-stringify-without-jsonify-1.0.1.tgz",
      "integrity": "sha512-Bdboy+l7tA3OGW6FjyFHWkP5LuByj1Tk33Ljyq0axyzdk9//JSi2u3fP1QSmd1KNwq6VOKYGlAu87CisVir6Pw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/keyv": {
      "version": "4.5.4",
      "resolved": "https://registry.npmjs.org/keyv/-/keyv-4.5.4.tgz",
      "integrity": "sha512-oxVHkHR/EJf2CNXnWxRLW6mg7JyCCUcG0DtEGmL2ctUo1PNTin1PUil+r/+4r5MpVgC/fn1kjsx7mjSujKqIpw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "json-buffer": "3.0.1"
      }
    },
    "node_modules/levn": {
      "version": "0.4.1",
      "resolved": "https://registry.npmjs.org/levn/-/levn-0.4.1.tgz",
      "integrity": "sha512-+bT2uH4E5LGE7h/n3evcS/sQlJXCpIp6ym8OWJ5eV6+67Dsql/LaaT7qJBAt2rzfoa/5QBGBhxDix1dMt2kQKQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "prelude-ls": "^1.2.1",
        "type-check": "~0.4.0"
      },
      "engines": {
        "node": ">= 0.8.0"
      }
    },
    "node_modules/locate-path": {
      "version": "6.0.0",
      "resolved": "https://registry.npmjs.org/locate-path/-/locate-path-6.0.0.tgz",
      "integrity": "sha512-iPZK6eYjbxRu3uB4/WZ3EsEIMJFMqAoopl3R+zuq0UjcAm/MO6KCweDgPfP3elTztoKP3KtnVHxTn2NHBSDVUw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "p-locate": "^5.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/lodash": {
      "version": "4.18.1",
      "resolved": "https://registry.npmjs.org/lodash/-/lodash-4.18.1.tgz",
      "integrity": "sha512-dMInicTPVE8d1e5otfwmmjlxkZoUpiVLwyeTdUsi/Caj/gfzzblBcCE5sRHV/AsjuCmxWrte2TNGSYuCeCq+0Q==",
      "license": "MIT"
    },
    "node_modules/lodash.merge": {
      "version": "4.6.2",
      "resolved": "https://registry.npmjs.org/lodash.merge/-/lodash.merge-4.6.2.tgz",
      "integrity": "sha512-0KpjqXRVvrYyCsX1swR/XTK0va6VQkQM6MNo7PqW77ByjAhoARA8EfrP1N4+KlKj8YS0ZUCtRT/YUuhyYDujIQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/loose-envify": {
      "version": "1.4.0",
      "resolved": "https://registry.npmjs.org/loose-envify/-/loose-envify-1.4.0.tgz",
      "integrity": "sha512-lyuxPGr/Wfhrlem2CL/UcnUc1zcqKAImBDzukY7Y5F/yQiNdko6+fRLevlw1HgMySw7f611UIY408EtxRSoK3Q==",
      "license": "MIT",
      "dependencies": {
        "js-tokens": "^3.0.0 || ^4.0.0"
      },
      "bin": {
        "loose-envify": "cli.js"
      }
    },
    "node_modules/minimatch": {
      "version": "10.2.6",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-10.2.6.tgz",
      "integrity": "sha512-vpLQEs+VLCr1nU0BXS07maYoFwlDAH0gngQuuttxIwutDFEMHq2blX+8vpgxDdK3J1PwjCJiep77OitTZ4Ll1A==",
      "dev": true,
      "license": "BlueOak-1.0.0",
      "dependencies": {
        "brace-expansion": "^5.0.8"
      },
      "engines": {
        "node": "18 || 20 || >=22"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/moment": {
      "version": "2.29.4",
      "resolved": "https://registry.npmjs.org/moment/-/moment-2.29.4.tgz",
      "integrity": "sha512-5LC9SOxjSc2HF6vO2CyuTDNivEdoz2IvyJJGj6X8DJ0eFyfszE0QiEd+iXmBvUP3WHxSjFH/vIsA0EN00cgr8w==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "*"
      }
    },
    "node_modules/ms": {
      "version": "2.1.3",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/nanoid": {
      "version": "5.1.16",
      "resolved": "https://registry.npmjs.org/nanoid/-/nanoid-5.1.16.tgz",
      "integrity": "sha512-kVrnsrJqMR8+oLJnGEmSWw9BivK5mt7H3FZatVRjrc5wGqFYuBxX1yG7+A7Gi5AefkX6t/oCkizcQgpu0cY1dQ==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "bin": {
        "nanoid": "bin/nanoid.js"
      },
      "engines": {
        "node": "^18 || >=20"
      }
    },
    "node_modules/natural-compare": {
      "version": "1.4.0",
      "resolved": "https://registry.npmjs.org/natural-compare/-/natural-compare-1.4.0.tgz",
      "integrity": "sha512-OWND8ei3VtNC9h7V60qff3SVobHr996CTwgxubgyQYEpg290h9J0buyECNNJexkFm5sOajh5G116RYA1c8ZMSw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/object-assign": {
      "version": "4.1.1",
      "resolved": "https://registry.npmjs.org/object-assign/-/object-assign-4.1.1.tgz",
      "integrity": "sha512-rJgTQnkUnH1sFw8yT6VSU3zD3sWmu6sZhIseY8VX+GRu3P6F7Fu+JNDoXfklElbLJSnc3FUQHVe4cU5hj+BcUg==",
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/obsidian": {
      "version": "1.13.1",
      "resolved": "https://registry.npmjs.org/obsidian/-/obsidian-1.13.1.tgz",
      "integrity": "sha512-qtTEA2pmhJzhuhJqzbBFRYhpIOqvW+krDYjtFynv66KbxBbumHBlsJfWw3I4jtnK/6fZwbQhCrmmDdRwXmX56w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/codemirror": "5.60.8",
        "moment": "2.29.4"
      },
      "peerDependencies": {
        "@codemirror/state": "6.5.0",
        "@codemirror/view": "6.38.6"
      }
    },
    "node_modules/optionator": {
      "version": "0.9.4",
      "resolved": "https://registry.npmjs.org/optionator/-/optionator-0.9.4.tgz",
      "integrity": "sha512-6IpQ7mKUxRcZNLIObR0hz7lxsapSSIYNZJwXPGeF0mTVqGKFIXj1DQcMoT22S3ROcLyY/rz0PWaWZ9ayWmad9g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "deep-is": "^0.1.3",
        "fast-levenshtein": "^2.0.6",
        "levn": "^0.4.1",
        "prelude-ls": "^1.2.1",
        "type-check": "^0.4.0",
        "word-wrap": "^1.2.5"
      },
      "engines": {
        "node": ">= 0.8.0"
      }
    },
    "node_modules/p-limit": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/p-limit/-/p-limit-3.1.0.tgz",
      "integrity": "sha512-TYOanM3wGwNGsZN2cVTYPArw454xnXj5qmWF1bEoAc4+cU/ol7GVh7odevjp1FNHduHc3KZMcFduxU5Xc6uJRQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "yocto-queue": "^0.1.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/p-locate": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/p-locate/-/p-locate-5.0.0.tgz",
      "integrity": "sha512-LaNjtRWUBY++zB5nE/NwcaoMylSPk+S+ZHNB1TzdbMJMny6dynpAGt7X/tl/QYq3TIeE6nxHppbo2LGymrG5Pw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "p-limit": "^3.0.2"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/parent-module": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/parent-module/-/parent-module-1.0.1.tgz",
      "integrity": "sha512-GQ2EWRpQV8/o+Aw8YqtfZZPfNRWZYkbidE9k5rpl/hC3vtHHBfGm2Ifi6qWV+coDGkrUKZAxE3Lot5kcsRlh+g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "callsites": "^3.0.0"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/path-exists": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/path-exists/-/path-exists-4.0.0.tgz",
      "integrity": "sha512-ak9Qy5Q7jYb2Wwcey5Fpvg2KoAc/ZIhLSLOSBmRmygPsGwkVVt0fZa0qrtMz+m6tJTAHfZQ8FnmB4MG4LWy7/w==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/path-key": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/path-key/-/path-key-3.1.1.tgz",
      "integrity": "sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/picomatch": {
      "version": "4.0.5",
      "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-4.0.5.tgz",
      "integrity": "sha512-RvwwcruNjI1ncT5xRakeyS9Lf8lcItv34KD+aif+VH9kduAyfYBipGh12274xtenIPZ119/R9BdTBa8gAwSh0A==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/sponsors/jonschlinkert"
      }
    },
    "node_modules/prelude-ls": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/prelude-ls/-/prelude-ls-1.2.1.tgz",
      "integrity": "sha512-vkcDPrRZo1QZLbn5RLGPpg/WmIQ65qoWWhcGKf/b5eplkkarX0m9z8ppCat4mlOqUsWpyNuYgO3VRyrYHSzX5g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 0.8.0"
      }
    },
    "node_modules/prettier": {
      "version": "3.9.6",
      "resolved": "https://registry.npmjs.org/prettier/-/prettier-3.9.6.tgz",
      "integrity": "sha512-OpN0zzVdiaiAhxpuuj5efpIS4sY9j7bY6uR5mnj5yPzGkdkjNKSJeUThPb60Jw29QuAZgA4o+/iB49kFiaBX6g==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "prettier": "bin/prettier.cjs"
      },
      "engines": {
        "node": ">=14"
      },
      "funding": {
        "url": "https://github.com/prettier/prettier?sponsor=1"
      }
    },
    "node_modules/prop-types": {
      "version": "15.8.1",
      "resolved": "https://registry.npmjs.org/prop-types/-/prop-types-15.8.1.tgz",
      "integrity": "sha512-oj87CgZICdulUohogVAR7AjlC0327U4el4L6eAvOqCeudMDVU0NThNaV+b9Df4dXgSP1gXMTnPdhfe/2qDH5cg==",
      "license": "MIT",
      "dependencies": {
        "loose-envify": "^1.4.0",
        "object-assign": "^4.1.1",
        "react-is": "^16.13.1"
      }
    },
    "node_modules/prop-types/node_modules/react-is": {
      "version": "16.13.1",
      "resolved": "https://registry.npmjs.org/react-is/-/react-is-16.13.1.tgz",
      "integrity": "sha512-24e6ynE2H+OKt4kqsOvNd8kBpV65zoxbA4BVsEOB3ARVWQki/DHzaUoC5KuON/BiccDaCCTZBuOcfZs70kR8bQ==",
      "license": "MIT"
    },
    "node_modules/punycode": {
      "version": "2.3.1",
      "resolved": "https://registry.npmjs.org/punycode/-/punycode-2.3.1.tgz",
      "integrity": "sha512-vYt7UD1U9Wg6138shLtLOvdAu+8DsC/ilFtEVHcH+wydcSpNE20AfSOduf6MkRFahL5FY7X1oU7nKVZFtfq8Fg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/react": {
      "version": "19.2.8",
      "resolved": "https://registry.npmjs.org/react/-/react-19.2.8.tgz",
      "integrity": "sha512-PWaYA1L/q9u2u7xYQi+Y3L3Yfnie7XyLeaJICV1MGD6LprsBxcAqGjYyr0eY3p+QdsA+x/Irkt4Qif8D63+Sbw==",
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/react-dom": {
      "version": "19.2.8",
      "resolved": "https://registry.npmjs.org/react-dom/-/react-dom-19.2.8.tgz",
      "integrity": "sha512-rVprimfGBG3DR+Tq0IQG2DT5PxKth1WIGDmj5yPmlzr4YBe7uyE+Du4oVqTDXZSHGGGXRtTJEGSSePyQCMBglQ==",
      "license": "MIT",
      "dependencies": {
        "scheduler": "^0.27.0"
      },
      "peerDependencies": {
        "react": "^19.2.8"
      }
    },
    "node_modules/react-is": {
      "version": "18.3.1",
      "resolved": "https://registry.npmjs.org/react-is/-/react-is-18.3.1.tgz",
      "integrity": "sha512-/LLMVyas0ljjAtoYiPqYiL8VWXzUUdThrmU5+n20DZv+a+ClRoevUzw5JxU+Ieh5/c87ytoTBV9G1FiKfNJdmg==",
      "license": "MIT"
    },
    "node_modules/react-smooth": {
      "version": "4.0.4",
      "resolved": "https://registry.npmjs.org/react-smooth/-/react-smooth-4.0.4.tgz",
      "integrity": "sha512-gnGKTpYwqL0Iii09gHobNolvX4Kiq4PKx6eWBCYYix+8cdw+cGo3do906l1NBPKkSWx1DghC1dlWG9L2uGd61Q==",
      "license": "MIT",
      "dependencies": {
        "fast-equals": "^5.0.1",
        "prop-types": "^15.8.1",
        "react-transition-group": "^4.4.5"
      },
      "peerDependencies": {
        "react": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0",
        "react-dom": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"
      }
    },
    "node_modules/react-transition-group": {
      "version": "4.4.5",
      "resolved": "https://registry.npmjs.org/react-transition-group/-/react-transition-group-4.4.5.tgz",
      "integrity": "sha512-pZcd1MCJoiKiBR2NRxeCRg13uCXbydPnmB4EOeRrY7480qNWO8IIgQG6zlDkm6uRMsURXPuKq0GWtiM59a5Q6g==",
      "license": "BSD-3-Clause",
      "dependencies": {
        "@babel/runtime": "^7.5.5",
        "dom-helpers": "^5.0.1",
        "loose-envify": "^1.4.0",
        "prop-types": "^15.6.2"
      },
      "peerDependencies": {
        "react": ">=16.6.0",
        "react-dom": ">=16.6.0"
      }
    },
    "node_modules/recharts": {
      "version": "2.15.4",
      "resolved": "https://registry.npmjs.org/recharts/-/recharts-2.15.4.tgz",
      "integrity": "sha512-UT/q6fwS3c1dHbXv2uFgYJ9BMFHu3fwnd7AYZaEQhXuYQ4hgsxLvsUXzGdKeZrW5xopzDCvuA2N41WJ88I7zIw==",
      "deprecated": "1.x and 2.x branches are no longer active. Bump to Recharts v3 to receive latest features and bugfixes. See https://github.com/recharts/recharts/wiki/3.0-migration-guide",
      "license": "MIT",
      "dependencies": {
        "clsx": "^2.0.0",
        "eventemitter3": "^4.0.1",
        "lodash": "^4.17.21",
        "react-is": "^18.3.1",
        "react-smooth": "^4.0.4",
        "recharts-scale": "^0.4.4",
        "tiny-invariant": "^1.3.1",
        "victory-vendor": "^36.6.8"
      },
      "engines": {
        "node": ">=14"
      },
      "peerDependencies": {
        "react": "^16.0.0 || ^17.0.0 || ^18.0.0 || ^19.0.0",
        "react-dom": "^16.0.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"
      }
    },
    "node_modules/recharts-scale": {
      "version": "0.4.5",
      "resolved": "https://registry.npmjs.org/recharts-scale/-/recharts-scale-0.4.5.tgz",
      "integrity": "sha512-kivNFO+0OcUNu7jQquLXAxz1FIwZj8nrj+YkOKc5694NbjCvcT6aSZiIzNzd2Kul4o4rTto8QVR9lMNtxD4G1w==",
      "license": "MIT",
      "dependencies": {
        "decimal.js-light": "^2.4.1"
      }
    },
    "node_modules/resolve-from": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/resolve-from/-/resolve-from-4.0.0.tgz",
      "integrity": "sha512-pb/MYmXstAkysRFx8piNI1tGFNQIFA3vkE3Gq4EuA1dF6gHp/+vgZqsCGJapvy8N3Q+4o7FwvquPJcnZ7RYy4g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=4"
      }
    },
    "node_modules/scheduler": {
      "version": "0.27.0",
      "resolved": "https://registry.npmjs.org/scheduler/-/scheduler-0.27.0.tgz",
      "integrity": "sha512-eNv+WrVbKu1f3vbYJT/xtiF5syA5HPIMtf9IgY/nKg0sWqzAUEvqY/xm7OcZc/qafLx/iO9FgOmeSAp4v5ti/Q==",
      "license": "MIT"
    },
    "node_modules/semver": {
      "version": "7.8.5",
      "resolved": "https://registry.npmjs.org/semver/-/semver-7.8.5.tgz",
      "integrity": "sha512-Y7/KDsb8LjooZpwaqGyulO6DQlksgCncchHGk+sZIY4SBvUocMBEFH5Ur1fI4dV+Jvl0w6cjvucaIi40puRioA==",
      "dev": true,
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/shebang-command": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/shebang-command/-/shebang-command-2.0.0.tgz",
      "integrity": "sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "shebang-regex": "^3.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/shebang-regex": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/shebang-regex/-/shebang-regex-3.0.0.tgz",
      "integrity": "sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/strip-json-comments": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/strip-json-comments/-/strip-json-comments-3.1.1.tgz",
      "integrity": "sha512-6fPc+R4ihwqP6N/aIv2f1gMH8lOVtWQHoqC4yK6oSDVVocumAsfCqjkXnqiYMhmMwS/mEHLp7Vehlt3ql6lEig==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/style-mod": {
      "version": "4.1.3",
      "resolved": "https://registry.npmjs.org/style-mod/-/style-mod-4.1.3.tgz",
      "integrity": "sha512-i/n8VsZydrugj3Iuzll8+x/00GH2vnYsk1eomD8QiRrSAeW6ItbCQDtfXCeJHd0iwiNagqjQkvpvREEPtW3IoQ==",
      "dev": true,
      "license": "MIT",
      "peer": true
    },
    "node_modules/supports-color": {
      "version": "7.2.0",
      "resolved": "https://registry.npmjs.org/supports-color/-/supports-color-7.2.0.tgz",
      "integrity": "sha512-qpCAvRl9stuOHveKsn7HncJRvv501qIacKzQlO/+Lwxc9+0q2wLyv4Dfvt80/DPn2pqOBsJdDiogXGR9+OvwRw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "has-flag": "^4.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/tiny-invariant": {
      "version": "1.3.3",
      "resolved": "https://registry.npmjs.org/tiny-invariant/-/tiny-invariant-1.3.3.tgz",
      "integrity": "sha512-+FbBPE1o9QAYvviau/qC5SE3caw21q3xkvWKBtja5vgqOWIHHJ3ioaq1VPfn/Szqctz2bU/oYeKd9/z5BL+PVg==",
      "license": "MIT"
    },
    "node_modules/tinyglobby": {
      "version": "0.2.17",
      "resolved": "https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.17.tgz",
      "integrity": "sha512-wXR/dYpcqKmfWpEdZjiKJOwCNFndD0DMnrW/cYjVGttEkBfVgcLFHoNrlj47mjOVic9yyNu65alsgF4NQyTa2g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "fdir": "^6.5.0",
        "picomatch": "^4.0.4"
      },
      "engines": {
        "node": ">=12.0.0"
      },
      "funding": {
        "url": "https://github.com/sponsors/SuperchupuDev"
      }
    },
    "node_modules/ts-api-utils": {
      "version": "2.5.0",
      "resolved": "https://registry.npmjs.org/ts-api-utils/-/ts-api-utils-2.5.0.tgz",
      "integrity": "sha512-OJ/ibxhPlqrMM0UiNHJ/0CKQkoKF243/AEmplt3qpRgkW8VG7IfOS41h7V8TjITqdByHzrjcS/2si+y4lIh8NA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18.12"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4"
      }
    },
    "node_modules/tsx": {
      "version": "4.23.12",
      "resolved": "https://registry.npmjs.org/tsx/-/tsx-4.23.12.tgz",
      "integrity": "sha512-FDf4L4sYzKtzWYhU/Xm0AQFdTjdIxNo9ElTf2mxXM6k8YMHXzYUe4yODVaXP4V9uMFbVg8c0qyBccK2OOxb45Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "esbuild": "~0.28.0"
      },
      "bin": {
        "tsx": "dist/cli.mjs"
      },
      "engines": {
        "node": ">=18.0.0"
      },
      "optionalDependencies": {
        "fsevents": "~2.3.3"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/aix-ppc64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/aix-ppc64/-/aix-ppc64-0.28.2.tgz",
      "integrity": "sha512-XExcO+dvLKvVtNTibSTBej1NCAbaGhWn9Ww1ZPx80qsahhPFe/8jgWP0IchNe0F3HwkU7n8ejhH8bjonqht8mQ==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "aix"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/android-arm": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/android-arm/-/android-arm-0.28.2.tgz",
      "integrity": "sha512-kXXoiPVVGQcnIYGOeaovwOURpniDBpSq4A03qkQ+BMQqtGG6HYap3xne9C1O1yo4TR3qxlCX5IqqmX6fFo2Lqg==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/android-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/android-arm64/-/android-arm64-0.28.2.tgz",
      "integrity": "sha512-5YfKeeI8qWfBZIX+u2xZC3Zlb3Os/gLS2sbEKM+I4ZOcsWmHS2WLysCcQZDAFRslDUU5Oiq44gf6PYN1vGwG5A==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/android-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/android-x64/-/android-x64-0.28.2.tgz",
      "integrity": "sha512-O387ite7SzUyCcy3JQX4P4bLtEA7bLLkx+esve5JHnyYfNTxcVpXZo9jhdB0lTKN44gztELTdU7nS8Nr16Fs1Q==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/darwin-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/darwin-arm64/-/darwin-arm64-0.28.2.tgz",
      "integrity": "sha512-n4KqkOQrraxHJcgjM1RvwbigfQKIKJVpM7xp+KsxiyUSrRdIXnt73VhrPAx0fV44hgfmIVKjxMN9J1t5jySVkw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/darwin-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/darwin-x64/-/darwin-x64-0.28.2.tgz",
      "integrity": "sha512-uq6suIWYP37qzGddBKPw5QEQPi6HiLGsO7UmkpfyaYNQ3D+rN6w6WfwH+nuqcGXWvawGwxOEroO4YGnFh95azw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/freebsd-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/freebsd-arm64/-/freebsd-arm64-0.28.2.tgz",
      "integrity": "sha512-n+I0BTSRIoy+d6RPKnEVwql5UwBJolytvY4mAOIEJorKlqgPII8ix6slVVrfZ5Tnj7glIZvloylbB/EJPMWEXw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/freebsd-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/freebsd-x64/-/freebsd-x64-0.28.2.tgz",
      "integrity": "sha512-78XJTJkvPs0kz2w61301PJjXl4g7q3JqiYMZ/M/yVI73EHBrCRTgkhu9oqG7vPqq+a/yadEW8aD+agKlk5xrmg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/linux-arm": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-arm/-/linux-arm-0.28.2.tgz",
      "integrity": "sha512-XlDnu2q5yoqems+xay6wSAcg9DDD7K9RLKZEBOMZm3ckNpJBvOX20tSfby8KfrrhINDyv9V2YVZKY/SpoGJI8w==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/linux-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-arm64/-/linux-arm64-0.28.2.tgz",
      "integrity": "sha512-pW4AC0P3it8c7do9MVM4p51FzHzdM/TZrerurgRcHJ2WTa1VQ1CIq18xncfpBJw4ojkiZZrKW2yIBWBP92j6Ug==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/linux-ia32": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-ia32/-/linux-ia32-0.28.2.tgz",
      "integrity": "sha512-CYbnj78HsIeA+DhgUKgFCfvNsTHFhMMrinUrMZpDXJXKN8T3XViTZ/+wtHeVxEWY8ewSzTFN+nRmSwO2tZaLUQ==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/linux-loong64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-loong64/-/linux-loong64-0.28.2.tgz",
      "integrity": "sha512-buwkd8nsph4R+ajRvw0qM5Hja/TXQow3ptzWO2EbG/cqcIkHloRrdlBtQlshyYGTNFvfkfJ5tpPLVkY4DtsPfQ==",
      "cpu": [
        "loong64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/linux-mips64el": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-mips64el/-/linux-mips64el-0.28.2.tgz",
      "integrity": "sha512-ZVykbDyk7519VwiNb9Lcj9m8XM6v5V9uKPvrEMkkEedVewf+0itkhahp4HDpgERXhwLRpWFypsGbG/J8s0QjJA==",
      "cpu": [
        "mips64el"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/linux-ppc64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-ppc64/-/linux-ppc64-0.28.2.tgz",
      "integrity": "sha512-CAXl+Dtd9UUuJd8pKKdwh6MLm3MUMiqMPmhZ3tTSXPqfyQ3vDl6R5hZdZ/kYojK4ofXtdfSv1tFq8XzWx3heNQ==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/linux-riscv64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-riscv64/-/linux-riscv64-0.28.2.tgz",
      "integrity": "sha512-GeXCej4IQtU1B+QlDV8W/RRvbzI3O/Stss+/bCXv4lZls5WGRtu2a+3JkA3i4qIUlMXpcHebWpF8AkJhATowuA==",
      "cpu": [
        "riscv64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/linux-s390x": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-s390x/-/linux-s390x-0.28.2.tgz",
      "integrity": "sha512-3H1weTYZPxt/WOhByszQZybS9w5lKzUn1FDMsgEChbHWQwHYQQRfBxgCcZvPhjHfKyJjIievvMmEUawJrdY9Dg==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/linux-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.28.2.tgz",
      "integrity": "sha512-4xTZr1FUmSoQW4XIWmit3tzQrUTZM+N3P0XV8xROKYF50XfI7xeO90+1bZvNwxIufQ9hDQVRJH5YhgPVF8A/HQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/netbsd-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/netbsd-arm64/-/netbsd-arm64-0.28.2.tgz",
      "integrity": "sha512-sSATRjPeDBg3pdgHoQfoYBob11Kk1FGa9lui5RIHZCoCkJa9QKlvl3/vKz2usCmYYjs7ymJR/2Nnsqe+Hjt5nw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "netbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/netbsd-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/netbsd-x64/-/netbsd-x64-0.28.2.tgz",
      "integrity": "sha512-lqnzCV+mM0gIADaKihiCg6ifgfU2L3h5E33rNQBN1Y4MaVGnzryzmvvf7UHxprpQdE8hpqLolJ9Rl+SkIRDpyw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "netbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/openbsd-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/openbsd-arm64/-/openbsd-arm64-0.28.2.tgz",
      "integrity": "sha512-AL2qJILH7lNjrDmCQDvdxMfAUIv8KMNZOvrwAQ8i8//ntL9FflhOyMJ8OZSMBb8/AWXe3/5v5S20y3zCoZWKoQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/openbsd-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/openbsd-x64/-/openbsd-x64-0.28.2.tgz",
      "integrity": "sha512-QtiuPytchRyC4rwUKhexJdQKvDuZ6hWloi3igqPQNUJCS1/v9EiO3UTOXR6A3FoMo4fnAKbWJdqaIwhOzh8qEw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/sunos-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/sunos-x64/-/sunos-x64-0.28.2.tgz",
      "integrity": "sha512-GPMSkTOtMnv2U2F8gxe4Io6qmVs+YKyp832Etqqxr0hFngmXQ3rzwytelm3GIn7T4VviRUlf3sOgBOiTdvaf7g==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "sunos"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/win32-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-arm64/-/win32-arm64-0.28.2.tgz",
      "integrity": "sha512-PIhhEkE9uPBleRBrQEJpUn7MBnibZzbGzYWPmY3x+YoVg/95zbjB4CxPPOQ8l5tYYM4mMaCthF8/1DIfBQQyWQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/win32-ia32": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-ia32/-/win32-ia32-0.28.2.tgz",
      "integrity": "sha512-YmJbfTlvU7Sdn9BB+4PRES4oB6pxgS37MAONj+hBr/cpXS1aBPKXxNnDbu+QCWPj0o9dgyxeq79g6c5P8KeuYA==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/@esbuild/win32-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.28.2.tgz",
      "integrity": "sha512-5ebpxr3nWMzrL/rnUI755Jkuee0bHL/Gq0WTF9lvcpv73wAp5eu8MfBUgWK9bhWvZjj7yX8etf/8tI8Ney695g==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tsx/node_modules/esbuild": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/esbuild/-/esbuild-0.28.2.tgz",
      "integrity": "sha512-HKVLS8dvII+xoKW9kmqxbRKrnWEXfJJr/FZhhJmiqIB0e053QNYFqOBouTMO/k5sID4MvCiUCvv8b9M4h32wIA==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "bin": {
        "esbuild": "bin/esbuild"
      },
      "engines": {
        "node": ">=18"
      },
      "optionalDependencies": {
        "@esbuild/aix-ppc64": "0.28.2",
        "@esbuild/android-arm": "0.28.2",
        "@esbuild/android-arm64": "0.28.2",
        "@esbuild/android-x64": "0.28.2",
        "@esbuild/darwin-arm64": "0.28.2",
        "@esbuild/darwin-x64": "0.28.2",
        "@esbuild/freebsd-arm64": "0.28.2",
        "@esbuild/freebsd-x64": "0.28.2",
        "@esbuild/linux-arm": "0.28.2",
        "@esbuild/linux-arm64": "0.28.2",
        "@esbuild/linux-ia32": "0.28.2",
        "@esbuild/linux-loong64": "0.28.2",
        "@esbuild/linux-mips64el": "0.28.2",
        "@esbuild/linux-ppc64": "0.28.2",
        "@esbuild/linux-riscv64": "0.28.2",
        "@esbuild/linux-s390x": "0.28.2",
        "@esbuild/linux-x64": "0.28.2",
        "@esbuild/netbsd-arm64": "0.28.2",
        "@esbuild/netbsd-x64": "0.28.2",
        "@esbuild/openbsd-arm64": "0.28.2",
        "@esbuild/openbsd-x64": "0.28.2",
        "@esbuild/openharmony-arm64": "0.28.2",
        "@esbuild/sunos-x64": "0.28.2",
        "@esbuild/win32-arm64": "0.28.2",
        "@esbuild/win32-ia32": "0.28.2",
        "@esbuild/win32-x64": "0.28.2"
      }
    },
    "node_modules/type-check": {
      "version": "0.4.0",
      "resolved": "https://registry.npmjs.org/type-check/-/type-check-0.4.0.tgz",
      "integrity": "sha512-XleUoc9uwGXqjWwXaUTZAmzMcFZ5858QA2vvx1Ur5xIcixXIP+8LnFDgRplU30us6teqdlskFfu+ae4K79Ooew==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "prelude-ls": "^1.2.1"
      },
      "engines": {
        "node": ">= 0.8.0"
      }
    },
    "node_modules/typescript": {
      "version": "5.9.3",
      "resolved": "https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz",
      "integrity": "sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==",
      "dev": true,
      "license": "Apache-2.0",
      "bin": {
        "tsc": "bin/tsc",
        "tsserver": "bin/tsserver"
      },
      "engines": {
        "node": ">=14.17"
      }
    },
    "node_modules/undici-types": {
      "version": "6.21.0",
      "resolved": "https://registry.npmjs.org/undici-types/-/undici-types-6.21.0.tgz",
      "integrity": "sha512-iwDZqg0QAGrg9Rav5H4n0M64c3mkR59cJ6wQp+7C4nI0gsmExaedaYLNO44eT4AtBBwjbTiGPMlt2Md0T9H9JQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/uri-js": {
      "version": "4.4.1",
      "resolved": "https://registry.npmjs.org/uri-js/-/uri-js-4.4.1.tgz",
      "integrity": "sha512-7rKUyy33Q1yc98pQ1DAmLtwX109F7TIfWlW1Ydo8Wl1ii1SeHieeh0HHfPeL2fMXK6z0s8ecKs9frCuLJvndBg==",
      "dev": true,
      "license": "BSD-2-Clause",
      "dependencies": {
        "punycode": "^2.1.0"
      }
    },
    "node_modules/victory-vendor": {
      "version": "36.9.2",
      "resolved": "https://registry.npmjs.org/victory-vendor/-/victory-vendor-36.9.2.tgz",
      "integrity": "sha512-PnpQQMuxlwYdocC8fIJqVXvkeViHYzotI+NJrCuav0ZYFoq912ZHBk3mCeuj+5/VpodOjPe1z0Fk2ihgzlXqjQ==",
      "license": "MIT AND ISC",
      "dependencies": {
        "@types/d3-array": "^3.0.3",
        "@types/d3-ease": "^3.0.0",
        "@types/d3-interpolate": "^3.0.1",
        "@types/d3-scale": "^4.0.2",
        "@types/d3-shape": "^3.1.0",
        "@types/d3-time": "^3.0.0",
        "@types/d3-timer": "^3.0.0",
        "d3-array": "^3.1.6",
        "d3-ease": "^3.0.1",
        "d3-interpolate": "^3.0.1",
        "d3-scale": "^4.0.2",
        "d3-shape": "^3.1.0",
        "d3-time": "^3.0.0",
        "d3-timer": "^3.0.1"
      }
    },
    "node_modules/w3c-keyname": {
      "version": "2.2.8",
      "resolved": "https://registry.npmjs.org/w3c-keyname/-/w3c-keyname-2.2.8.tgz",
      "integrity": "sha512-dpojBhNsCNN7T82Tm7k26A6G9ML3NkhDsnw9n/eoxSRlVBB4CEtIQ/KTCLI2Fwf3ataSXRhYFkQi3SlnFwPvPQ==",
      "dev": true,
      "license": "MIT",
      "peer": true
    },
    "node_modules/which": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/which/-/which-2.0.2.tgz",
      "integrity": "sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "isexe": "^2.0.0"
      },
      "bin": {
        "node-which": "bin/node-which"
      },
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/word-wrap": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/word-wrap/-/word-wrap-1.2.5.tgz",
      "integrity": "sha512-BN22B5eaMMI9UMtjrGd5g5eCYPpCPDUy0FJXbYsaT5zYxjFOckS53SQDE3pWkVoWpHXVb3BrYcEN4Twa55B5cA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/yocto-queue": {
      "version": "0.1.0",
      "resolved": "https://registry.npmjs.org/yocto-queue/-/yocto-queue-0.1.0.tgz",
      "integrity": "sha512-rVksvsnNCdJ/ohGc6xgPwyN8eheCxsiLM8mxuE/t/mOVqJewPuO1miLpTHQiRgTKCLexL4MeAFVagts7HmNZ2Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    }
  }
}

```

## tsconfig.json

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES2020",
    "allowJs": true,
    "noImplicitAny": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "isolatedModules": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "lib": ["DOM", "ES2020"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "main.ts"],
  "exclude": ["node_modules", "**/__tests__/**"]
}

```
