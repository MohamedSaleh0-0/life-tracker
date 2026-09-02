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
import { RenameModal } from '../../shared/ui-kit/RenameModal';

type Section = 'general' | 'habits' | 'dataPoints' | 'money' | 'advanced';

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
    this.renderNavButton(nav, 'advanced', 'Advanced');

    const body = containerEl.createDiv({ cls: 'ltk-settings-body' });

    switch (this.activeSection) {
      case 'general':
        await this.renderGeneralSection(body);
        break;
      case 'habits':
        await this.renderHabitsSection(body);
        break;
      case 'dataPoints':
        this.renderDataPointsSection(body);
        break;
      case 'money':
        await this.renderMoneySection(body);
        break;
      case 'advanced':
        await this.renderAdvancedSection(body);
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

    const prayerLocation = await this.pluginSettingsStore.getPrayerLocation();

    new Setting(containerEl)
      .setName('Prayer location (for prayer-relative habit reminders)')
      .setDesc('Needed only if you use prayer-time-based reminders. Latitude and longitude, plus calculation method.')
      .addText((t) =>
        t
          .setPlaceholder('Latitude')
          .setValue(prayerLocation ? String(prayerLocation.lat) : '')
          .onChange(async (v) => {
            const lat = Number(v);
            if (Number.isNaN(lat)) return;
            const cur =
              (await this.pluginSettingsStore.getPrayerLocation()) ??
              { lat: 0, lon: 0, calculationMethod: PluginSettingsStore.DEFAULT_CALCULATION_METHOD };
            await this.pluginSettingsStore.setPrayerLocation({ ...cur, lat });
          })
      )
      .addText((t) =>
        t
          .setPlaceholder('Longitude')
          .setValue(prayerLocation ? String(prayerLocation.lon) : '')
          .onChange(async (v) => {
            const lon = Number(v);
            if (Number.isNaN(lon)) return;
            const cur =
              (await this.pluginSettingsStore.getPrayerLocation()) ??
              { lat: 0, lon: 0, calculationMethod: PluginSettingsStore.DEFAULT_CALCULATION_METHOD };
            await this.pluginSettingsStore.setPrayerLocation({ ...cur, lon });
          })
      )
      .addDropdown((dd) =>
        dd
          .addOption('2', 'ISNA (North America)')
          .addOption('3', 'Muslim World League')
          .addOption('4', 'Umm al-Qura (Makkah)')
          .addOption('5', 'Egyptian General Authority')
          .setValue(String(prayerLocation?.calculationMethod ?? PluginSettingsStore.DEFAULT_CALCULATION_METHOD))
          .onChange(async (v) => {
            const cur =
              (await this.pluginSettingsStore.getPrayerLocation()) ??
              { lat: 0, lon: 0, calculationMethod: PluginSettingsStore.DEFAULT_CALCULATION_METHOD };
            await this.pluginSettingsStore.setPrayerLocation({ ...cur, calculationMethod: Number(v) });
          })
      );
  }

  private async renderHabitsSection(containerEl: HTMLElement): Promise<void> {
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

    const currentThreshold = await this.pluginSettingsStore.getHeatmapDimThresholdPercent();
    new Setting(containerEl)
      .setName('Commitment heatmap — dim below (%)')
      .setDesc(
        'On the Habits view\'s overall-commitment heatmap, a day at or below this % of habits completed renders at the dimmest still-colored shade; doing none of that day\'s habits always renders uncolored regardless of this setting.'
      )
      .addText((text) =>
        text
          .setValue(String(currentThreshold))
          .setPlaceholder('50')
          .onChange(async (value) => {
            const num = Number(value);
            if (value.trim() === '' || Number.isNaN(num) || num < 1 || num > 100) return;
            await this.pluginSettingsStore.setHeatmapDimThresholdPercent(num);
          })
      );
  }

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

  private async renderMoneySection(containerEl: HTMLElement): Promise<void> {
    await this.renderAccountsSection(containerEl);
    await this.renderCurrencySection(containerEl);
    containerEl.createEl('h3', { text: 'Categories' });
    await this.renderCategorySection(containerEl, 'expense', 'Expense categories');
    await this.renderCategorySection(containerEl, 'income', 'Income categories');
    await this.renderBudgetsSection(containerEl);
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
        )
        .addButton((btn) =>
          btn
            .setButtonText('Archive')
            .setWarning()
            .onClick(() => {
              new ConfirmModal(
                this.app,
                `Archive "${account.name}"?`,
                'Archived accounts are hidden from balances and the Money view, but nothing is deleted — you can restore this later from a future "show archived accounts" toggle.',
                async () => {
                  await this.moneyService.archiveAccount(account.id);
                  this.display();
                },
                'Archive'
              ).open();
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
      .setDesc(
        'Every other currency below is valued relative to THIS currency (default USD) — never hardcoded to any specific pair. Change it here if you\'d rather report totals in something other than USD.'
      )
      .addText((text) =>
        text.setValue(rates.primaryCurrency).onChange(async (value) => {
          const trimmed = value.trim();
          if (!trimmed) return;
          await this.moneyService.setExchangeRates({ ...rates, primaryCurrency: trimmed });
        })
      );

    const nonPrimaryCurrencies = knownCurrencies.filter((c) => c !== rates.primaryCurrency);

    for (const currency of nonPrimaryCurrencies) {
      const accountsUsingIt = (await this.moneyService.getAccounts()).filter((a) => a.currency === currency);
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
        )
        .addButton((btn) =>
          btn
            .setButtonText('Remove')
            .setWarning()
            .onClick(() => {
              new ConfirmModal(
                this.app,
                `Remove ${currency}?`,
                accountsUsingIt.length > 0
                  ? `${accountsUsingIt.length} account(s) still use ${currency} (${accountsUsingIt.map((a) => a.name).join(', ')}) — they'll just show as excluded from aggregate totals until a rate is configured again, same as any currency with no rate. Nothing about those accounts is deleted.`
                  : `No accounts currently use ${currency}.`,
                async () => {
                  await this.moneyService.removeCurrencyRate(currency);
                  this.display();
                },
                'Remove'
              ).open();
            })
        );
    }

    let newCurrencyValue = '';
    new Setting(containerEl)
      .setName('Add a currency')
      .setDesc(`Configure a rate for a currency (relative to ${rates.primaryCurrency}) ahead of creating an account in it.`)
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

    const renameHandler = (id: string, currentName: string) => () => {
      new RenameModal(this.app, `Rename "${currentName}"`, currentName, async (newName) => {
        await this.moneyService.renameCategory(id, newName);
        this.display();
      }).open();
    };

    for (const node of tree) {
      new Setting(containerEl)
        .setName(node.category.name)
        .addButton((btn) => btn.setButtonText('Rename').onClick(renameHandler(node.category.id, node.category.name)))
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
        new Setting(containerEl)
          .setName(`— ${child.name}`)
          .addButton((btn) => btn.setButtonText('Rename').onClick(renameHandler(child.id, child.name)))
          .addButton((btn) =>
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

  private async renderBudgetsSection(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl('h3', { text: 'Budgets' });
    containerEl.createEl('p', {
      text: 'A monthly spending cap per category (resets every calendar month). Recording an expense — manually or by buying a shopping-list item — that would push a budgeted category over its limit shows a warning first; nothing is ever blocked automatically.',
      cls: 'ltk-empty',
    });

    const [expenseTree, budgets] = await Promise.all([
      this.moneyService.getCategoryTree('expense'),
      this.moneyService.getCategoryBudgets(),
    ]);
    const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, b.monthlyLimit]));

    const flatCategories: { id: string; label: string }[] = [];
    for (const node of expenseTree) {
      flatCategories.push({ id: node.category.id, label: node.category.name });
      for (const child of node.children) {
        flatCategories.push({ id: child.id, label: `${node.category.name} / ${child.name}` });
      }
    }

    if (flatCategories.length === 0) {
      containerEl.createEl('p', { text: 'Add an expense category first.', cls: 'ltk-empty' });
      return;
    }

    for (const cat of flatCategories) {
      const existing = budgetByCategory.get(cat.id);
      new Setting(containerEl)
        .setName(cat.label)
        .setDesc('Monthly limit — leave blank for no budget on this category.')
        .addText((text) =>
          text
            .setValue(existing !== undefined ? String(existing) : '')
            .setPlaceholder('e.g. 500')
            .onChange(async (value) => {
              if (value.trim() === '') {
                await this.moneyService.removeCategoryBudget(cat.id);
                return;
              }
              const num = Number(value);
              if (Number.isNaN(num) || num <= 0) return;
              await this.moneyService.setCategoryBudget(cat.id, num);
            })
        );
    }
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

  private async renderAdvancedSection(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl('h3', { text: 'Amounts & steppers' });

    const amountStep = await this.pluginSettingsStore.getAmountStepperIncrement();
    new Setting(containerEl)
      .setName('Transaction amount stepper increment')
      .setDesc('How much +/- buttons change values in transaction entry.')
      .addText((t) =>
        t.setValue(String(amountStep)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isNaN(n) || n <= 0) return;
          await this.pluginSettingsStore.setAmountStepperIncrement(n);
        })
      );

    const habitStep = await this.pluginSettingsStore.getHabitStepperIncrement();
    new Setting(containerEl)
      .setName('Numeric habit stepper increment')
      .setDesc('How much +/- buttons change values on habit check-ins.')
      .addText((t) =>
        t.setValue(String(habitStep)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isNaN(n) || n <= 0) return;
          await this.pluginSettingsStore.setHabitStepperIncrement(n);
        })
      );

    containerEl.createEl('h3', { text: 'Autocomplete & windows' });

    const namesLimit = await this.pluginSettingsStore.getRecentNamesLimit();
    new Setting(containerEl)
      .setName('Recent-names autocomplete list length')
      .setDesc('Max suggestions shown in name autocompletion.')
      .addText((t) =>
        t.setValue(String(namesLimit)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isNaN(n) || n <= 0) return;
          await this.pluginSettingsStore.setRecentNamesLimit(n);
        })
      );

    const txWindow = await this.pluginSettingsStore.getRecentTransactionsWindowDays();
    new Setting(containerEl)
      .setName('Recent transactions window (days)')
      .setDesc('How many days of history to display on the main Money dashboard.')
      .addText((t) =>
        t.setValue(String(txWindow)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isNaN(n) || n <= 0) return;
          await this.pluginSettingsStore.setRecentTransactionsWindowDays(n);
        })
      );

    const trendWindow = await this.pluginSettingsStore.getTrendWindowDays();
    new Setting(containerEl)
      .setName('Habit / data point trend window (days)')
      .setDesc('Default trailing window for charts and history views.')
      .addText((t) =>
        t.setValue(String(trendWindow)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isNaN(n) || n <= 0) return;
          await this.pluginSettingsStore.setTrendWindowDays(n);
        })
      );

    const snapMinutes = await this.pluginSettingsStore.getClockSnapMinutes();
    new Setting(containerEl)
      .setName('Clock picker drag precision (minutes)')
      .setDesc('How finely dragging the clock face snaps — lower = more precise but fiddlier to drag.')
      .addDropdown((dd) =>
        dd
          .addOption('1', '1 minute')
          .addOption('5', '5 minutes')
          .addOption('15', '15 minutes')
          .setValue(String(snapMinutes))
          .onChange(async (v) => {
            await this.pluginSettingsStore.setClockSnapMinutes(Number(v));
          })
      );

    containerEl.createEl('h3', { text: 'Log file locations' });
    containerEl.createEl('p', {
      text: 'Advanced — where each module writes its markdown logs. Leave blank to use the default under "Life Tracker/Logs/".',
      cls: 'ltk-empty',
    });
    const overrides = await this.pluginSettingsStore.getLogFolderOverrides();
    const folderSetting = (module: 'habits' | 'dataPoints' | 'money', label: string, defaultPath: string) => {
      new Setting(containerEl)
        .setName(label)
        .addText((t) =>
          t
            .setPlaceholder(defaultPath)
            .setValue(overrides[module] ?? '')
            .onChange(async (v) => {
              await this.pluginSettingsStore.setLogFolderOverride(module, v.trim());
            })
        );
    };
    folderSetting('habits', 'Habit logs folder', 'Life Tracker/Logs/Habits');
    folderSetting('dataPoints', 'Data point logs folder', 'Life Tracker/Logs/DataPoints');
    folderSetting('money', 'Money logs folder', 'Life Tracker/Logs/Money');
  }
}