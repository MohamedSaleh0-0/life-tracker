// Settings-tab entry point: manage accounts, currency conversion
// rates, and both category trees. Redraws itself (this.display())
// after every mutation, same pattern PluginSettingTab expects.

import { App, PluginSettingTab, Setting, Plugin } from 'obsidian';
import { MoneyService } from '../application/moneyService';
import { CategoryKind } from '../domain/types';
import { AccountModal } from './AccountModal';
import { CategoryModal } from './CategoryModal';
import { ConfirmModal } from '../../../shared/ui-kit/ConfirmModal';

export class MoneySettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private moneyService: MoneyService
  ) {
    super(app, plugin);
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Money Management' });

    await this.renderAccountsSection(containerEl);
    await this.renderCurrencySection(containerEl);

    containerEl.createEl('h3', { text: 'Categories' });
    await this.renderCategorySection(containerEl, 'expense', 'Expense categories');
    await this.renderCategorySection(containerEl, 'income', 'Income categories');
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
    const accounts = await this.moneyService.getAccounts();

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

    const nonPrimaryCurrencies = Array.from(
      new Set(accounts.map((a) => a.currency).filter((c) => c !== rates.primaryCurrency))
    );

    if (nonPrimaryCurrencies.length === 0) {
      containerEl.createEl('p', {
        text: 'All your accounts use the primary currency — nothing to configure yet.',
        cls: 'ltk-empty',
      });
      return;
    }

    for (const currency of nonPrimaryCurrencies) {
      new Setting(containerEl)
        .setName(`${currency} → ${rates.primaryCurrency}`)
        .setDesc(`How many ${rates.primaryCurrency} is 1 ${currency} worth? Leave blank to exclude ${currency} accounts from aggregate totals.`)
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
}
