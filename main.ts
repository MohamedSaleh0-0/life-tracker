import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { nanoid } from 'nanoid';
import { ObsidianSettingsAdapter } from './src/core/adapters/obsidianSettingsAdapter';
import { ObsidianVaultAdapter } from './src/core/adapters/obsidianVaultAdapter';
import { PluginSettingsStore } from './src/core/pluginSettingsStore';
import { LifeTrackerSettingsTab } from './src/core/ui/LifeTrackerSettingsTab';

import { HabitSettingsStore } from './src/modules/habit-tracking/infrastructure/habitSettingsStore';
import { HabitLogFile } from './src/modules/habit-tracking/infrastructure/habitLogFile';
import { HabitService } from './src/modules/habit-tracking/application/habitService';
import { HabitWizardModal } from './src/modules/habit-tracking/ui/HabitWizardModal';
import { HabitTrackerView, VIEW_TYPE_HABIT_TRACKER } from './src/modules/habit-tracking/ui/HabitTrackerView';
import { WeekStartsOn } from './src/modules/habit-tracking/domain/types';

import { DataPointSettingsStore } from './src/modules/data-point-tracking/infrastructure/dataPointSettingsStore';
import { DataPointLogFile } from './src/modules/data-point-tracking/infrastructure/dataPointLogFile';
import { DataPointService } from './src/modules/data-point-tracking/application/dataPointService';
import { DataPointWizardModal } from './src/modules/data-point-tracking/ui/DataPointWizardModal';
import {
  DataPointTrackerView,
  VIEW_TYPE_DATA_POINT_TRACKER,
} from './src/modules/data-point-tracking/ui/DataPointTrackerView';

import { MoneySettingsStore } from './src/modules/money-management/infrastructure/moneySettingsStore';
import { TransactionLogFile } from './src/modules/money-management/infrastructure/transactionLogFile';
import { MoneyService } from './src/modules/money-management/application/moneyService';
import { TransactionEntryModal } from './src/modules/money-management/ui/TransactionEntryModal';
import { MoneyTrackerView, VIEW_TYPE_MONEY_TRACKER } from './src/modules/money-management/ui/MoneyTrackerView';

// Composition root (see PROJECT_PRINCIPLES.md §Conventions).
//
// STATUS:
// - Habit Tracking: feature-complete per its requirements doc.
// - Data Point Tracking: feature-complete per its requirements doc.
// - Money Management: accounts, categories, all four transaction types
//   (with time-of-day, not just date), balance/net-worth math with
//   manual currency conversion, undo-last-transaction, recurring
//   entries (REQ-M018-M020/M035), and shopping lists incl. the
//   auto-transaction-on-purchase flow (REQ-M021-M025/M034). The finance
//   dashboard's charts (REQ-M026-M033) and satisfaction tracking
//   (REQ-M016/M017) are still not built — see design-money-management.md.
// - Settings: ONE registered PluginSettingTab (LifeTrackerSettingsTab)
//   with in-page section navigation, replacing three separate
//   per-module tabs that were indistinguishable in Obsidian's sidebar.
export default class LifeTrackerPlugin extends Plugin {
  habitService!: HabitService;
  dataPointService!: DataPointService;
  moneyService!: MoneyService;
  pluginSettingsStore!: PluginSettingsStore;
  weekStartsOn: WeekStartsOn = 'monday';

  async onload(): Promise<void> {
    const settingsAdapter = new ObsidianSettingsAdapter(this);
    const vaultAdapter = new ObsidianVaultAdapter(this.app);

    this.pluginSettingsStore = new PluginSettingsStore(settingsAdapter);
    this.weekStartsOn = await this.pluginSettingsStore.getWeekStartsOn();

    // --- Habit Tracking ---
    const habitSettingsStore = new HabitSettingsStore(settingsAdapter);
    const habitLogFile = new HabitLogFile(vaultAdapter);
    this.habitService = new HabitService({
      settingsStore: habitSettingsStore,
      logFile: habitLogFile,
      idGenerator: () => nanoid(6),
    });

    // --- Data Point Tracking ---
    const dataPointSettingsStore = new DataPointSettingsStore(settingsAdapter);
    const dataPointLogFile = new DataPointLogFile(vaultAdapter);
    this.dataPointService = new DataPointService({
      settingsStore: dataPointSettingsStore,
      logFile: dataPointLogFile,
      idGenerator: () => nanoid(6),
    });

    // --- Money Management ---
    const moneySettingsStore = new MoneySettingsStore(settingsAdapter);
    const transactionLogFile = new TransactionLogFile(vaultAdapter);
    this.moneyService = new MoneyService({
      settingsStore: moneySettingsStore,
      logFile: transactionLogFile,
      idGenerator: () => nanoid(6),
    });

    // --- Single unified settings tab ---
    this.addSettingTab(
      new LifeTrackerSettingsTab(
        this.app,
        this,
        this.pluginSettingsStore,
        this.habitService,
        this.dataPointService,
        this.moneyService,
        (value) => {
          this.weekStartsOn = value;
        },
        () => this.weekStartsOn
      )
    );

    // --- Views ---
    this.registerView(
      VIEW_TYPE_HABIT_TRACKER,
      (leaf: WorkspaceLeaf) => new HabitTrackerView(leaf, this.habitService, this.weekStartsOn)
    );
    this.registerView(
      VIEW_TYPE_DATA_POINT_TRACKER,
      (leaf: WorkspaceLeaf) => new DataPointTrackerView(leaf, this.dataPointService)
    );
    this.registerView(
      VIEW_TYPE_MONEY_TRACKER,
      (leaf: WorkspaceLeaf) => new MoneyTrackerView(leaf, this.moneyService)
    );

    // --- Ribbon icons ---
    this.addRibbonIcon('check-circle', 'Open habit tracker', () => this.activateView(VIEW_TYPE_HABIT_TRACKER));
    this.addRibbonIcon('line-chart', 'Open data point tracker', () => this.activateView(VIEW_TYPE_DATA_POINT_TRACKER));
    this.addRibbonIcon('wallet', 'Open money tracker', () => this.activateView(VIEW_TYPE_MONEY_TRACKER));

    // --- Commands ---
    this.addCommand({
      id: 'life-tracker-open-habits',
      name: 'Open habit tracker',
      callback: () => this.activateView(VIEW_TYPE_HABIT_TRACKER),
    });
    this.addCommand({
      id: 'life-tracker-new-habit',
      name: 'New habit',
      callback: () => new HabitWizardModal(this.app, this.habitService, this.weekStartsOn).open(),
    });

    this.addCommand({
      id: 'life-tracker-open-data-points',
      name: 'Open data point tracker',
      callback: () => this.activateView(VIEW_TYPE_DATA_POINT_TRACKER),
    });
    this.addCommand({
      id: 'life-tracker-new-data-point',
      name: 'New data point',
      callback: () => new DataPointWizardModal(this.app, this.dataPointService).open(),
    });

    this.addCommand({
      id: 'life-tracker-open-money',
      name: 'Open money tracker',
      callback: () => this.activateView(VIEW_TYPE_MONEY_TRACKER),
    });
    this.addCommand({
      id: 'life-tracker-new-transaction',
      name: 'Add transaction',
      callback: async () => {
        const accounts = await this.moneyService.getAccounts();
        new TransactionEntryModal(this.app, this.moneyService, accounts, () => {
          /* no dashboard refresh needed from a command-triggered add — the view re-fetches on its own next open/focus */
        }).open();
      },
    });
    this.addCommand({
      id: 'life-tracker-undo-transaction',
      name: 'Undo last transaction',
      callback: async () => {
        const undone = await this.moneyService.undoLastTransaction();
        new Notice(undone ? 'Undid last transaction.' : 'Nothing to undo this session.');
      },
    });

    // TODO(cross-cutting shell): once module enable/disable (REQ-C004)
    // exists, each module's view registration + ribbon icon should be
    // conditional on that module being enabled. Also still missing:
    // the all-module "Today" view (REQ-C001) — these are each module's
    // own per-module view only, per REQ-C002's "dedicated per-module
    // views... separate from the Today view."
  }

  /** Opens the given view type in an existing leaf if one's already open, otherwise creates one. */
  private async activateView(viewType: string): Promise<void> {
    const { workspace } = this.app;

    const existing = workspace.getLeavesOfType(viewType)[0];
    if (existing) {
      workspace.revealLeaf(existing);
      return;
    }

    const leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
    await leaf.setViewState({ type: viewType, active: true });
    workspace.revealLeaf(leaf);
  }

  onunload(): void {
    // Registered views are torn down by Obsidian automatically; no
    // other long-lived listeners exist yet.
  }
}
