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
