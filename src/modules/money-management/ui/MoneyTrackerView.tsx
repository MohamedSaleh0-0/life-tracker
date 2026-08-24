// ItemView hosting Money Management's dashboard: due recurring entries
// (REQ-M020), account balances, net worth, shopping lists, and a
// recent transactions list. The full finance dashboard's charts
// (REQ-M026-M033) are still deferred — see design-money-management.md.

import React, { useEffect, useState } from 'react';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { TransactionEntryModal } from './TransactionEntryModal';
import { ShoppingListModal } from './ShoppingListModal';
import { ShoppingListDetailModal } from './ShoppingListDetailModal';
import { MoneyService, AccountWithBalance } from '../application/moneyService';
import { Account, RecurringEntry, ShoppingList, Transaction } from '../domain/types';
import { getTodayLocal, addDaysLocal } from '../../../core/date';

export const VIEW_TYPE_MONEY_TRACKER = 'life-tracker-money';

function formatAmount(amount: number, currency: string): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}${currency} ${Math.abs(amount).toFixed(2)}`;
}

interface MoneyTrackerRootProps {
  view: MoneyTrackerView;
  moneyService: MoneyService;
}

function MoneyTrackerRoot({ view, moneyService }: MoneyTrackerRootProps) {
  const [accountsWithBalances, setAccountsWithBalances] = useState<AccountWithBalance[]>([]);
  const [netWorth, setNetWorth] = useState<{ total: number; excludedAccounts: Account[] } | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categoryLabels, setCategoryLabels] = useState<Map<string, string>>(new Map());
  const [primaryCurrency, setPrimaryCurrency] = useState('USD');
  const [dueRecurring, setDueRecurring] = useState<RecurringEntry[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [shoppingSummaries, setShoppingSummaries] = useState<Map<string, { pendingCount: number; estimatedTotal: number }>>(new Map());
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [withBalances, worth, rates, recentTxs, due, lists] = await Promise.all([
        moneyService.getAccountsWithBalances(),
        moneyService.getNetWorth(),
        moneyService.getExchangeRates(),
        moneyService.listTransactions(addDaysLocal(getTodayLocal(), -30), getTodayLocal()),
        moneyService.getDueRecurringEntries(),
        moneyService.getShoppingLists(),
      ]);
      if (cancelled) return;

      setAccountsWithBalances(withBalances);
      setNetWorth(worth);
      setPrimaryCurrency(rates.primaryCurrency);
      const recent = recentTxs.slice(0, 25);
      setTransactions(recent);
      setDueRecurring(due);
      setShoppingLists(lists);

      const summaries = new Map<string, { pendingCount: number; estimatedTotal: number }>();
      for (const list of lists) {
        summaries.set(list.id, await moneyService.getShoppingListSummary(list.id));
      }
      if (!cancelled) setShoppingSummaries(summaries);

      const labels = new Map<string, string>();
      for (const t of recent) {
        if (t.categoryId && !labels.has(t.categoryId)) {
          labels.set(t.categoryId, await moneyService.resolveCategoryLabel(t.categoryId));
        }
      }
      if (!cancelled) setCategoryLabels(labels);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, moneyService]);

  const accounts = accountsWithBalances.map((w) => w.account);

  const handleAddTransaction = () => {
    new TransactionEntryModal(view.app, moneyService, accounts, refresh).open();
  };

  const handleDeleteTransaction = async (t: Transaction) => {
    await moneyService.deleteTransaction(t.date, t.id);
    refresh();
  };

  const handleLogRecurring = async (entry: RecurringEntry) => {
    await moneyService.logRecurringEntry(entry.id, getTodayLocal());
    refresh();
  };

  const handleSkipRecurring = async (entry: RecurringEntry) => {
    await moneyService.skipRecurringEntry(entry.id, getTodayLocal());
    refresh();
  };

  const accountLookup = new Map(accountsWithBalances.map((w) => [w.account.id, w.account]));

  return (
    <div className="ltk-habit-view">
      <div className="ltk-habit-view__header">
        <h2>Money</h2>
        <button
          type="button"
          className="ltk-button ltk-button--accent"
          onClick={handleAddTransaction}
          disabled={accounts.length === 0}
        >
          + Add transaction
        </button>
      </div>

      {accounts.length === 0 && (
        <p className="ltk-empty">No accounts yet — add one in Settings → Life Tracker → Money Management.</p>
      )}

      {dueRecurring.length > 0 && (
        <div className="ltk-money-due">
          <h3>Needs attention</h3>
          {dueRecurring.map((entry) => (
            <div key={entry.id} className="ltk-money-due__row">
              <span className="ltk-money-due__name">{entry.name}</span>
              <span className="ltk-money-due__amount">{entry.type === 'expense' ? '-' : '+'}{entry.amount}</span>
              <button type="button" onClick={() => handleLogRecurring(entry)}>
                Log
              </button>
              <button type="button" onClick={() => handleSkipRecurring(entry)}>
                Skip
              </button>
            </div>
          ))}
        </div>
      )}

      {netWorth && accounts.length > 0 && (
        <div className="ltk-money-networth">
          <span className="ltk-money-networth__label">Net worth</span>
          <span className="ltk-money-networth__value">{formatAmount(netWorth.total, primaryCurrency)}</span>
          {netWorth.excludedAccounts.length > 0 && (
            <span className="ltk-money-networth__flag">
              excludes {netWorth.excludedAccounts.map((a) => a.name).join(', ')} (no exchange rate set)
            </span>
          )}
        </div>
      )}

      {accounts.length > 0 && (
        <div className="ltk-money-accounts">
          {accountsWithBalances.map(({ account, balance }) => (
            <div key={account.id} className="ltk-money-account-card">
              <span className="ltk-money-account-card__name">{account.name}</span>
              <span className="ltk-money-account-card__balance">{formatAmount(balance, account.currency)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="ltk-money-section-header">
        <h3>Shopping lists</h3>
        <button type="button" onClick={() => new ShoppingListModal(view.app, moneyService, refresh).open()}>
          + New list
        </button>
      </div>
      {shoppingLists.length === 0 && <p className="ltk-empty">No shopping lists yet.</p>}
      {shoppingLists.length > 0 && (
        <div className="ltk-shopping-lists">
          {shoppingLists.map((list) => {
            const summary = shoppingSummaries.get(list.id);
            return (
              <div
                key={list.id}
                className="ltk-shopping-list-card"
                onClick={() => new ShoppingListDetailModal(view.app, moneyService, list, accounts).open()}
              >
                <span className="ltk-shopping-list-card__name">{list.name}</span>
                <span className="ltk-shopping-list-card__summary">
                  {summary ? `${summary.pendingCount} pending` : '…'}
                  {summary && summary.estimatedTotal > 0 ? ` · est. ${summary.estimatedTotal.toFixed(2)}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <h3>Recent transactions</h3>
      {transactions.length === 0 && <p className="ltk-empty">No transactions in the last 30 days.</p>}
      {transactions.length > 0 && (
        <ul className="ltk-money-transactions">
          {transactions.map((t) => {
            const account = accountLookup.get(t.accountId);
            const description =
              t.name || (t.type === 'transfer' ? 'Transfer' : t.type === 'adjustment' ? 'Adjustment' : 'Untitled');
            return (
              <li key={t.id}>
                <span className="ltk-money-tx__date">
                  {t.date} {t.time}
                </span>
                <span className="ltk-money-tx__desc">
                  {description}
                  {t.categoryId && <span className="ltk-money-tx__category"> · {categoryLabels.get(t.categoryId) ?? '…'}</span>}
                </span>
                <span className={`ltk-money-tx__amount ltk-money-tx__amount--${t.amount < 0 ? 'neg' : 'pos'}`}>
                  {formatAmount(t.amount, account?.currency ?? '')}
                </span>
                <button type="button" onClick={() => handleDeleteTransaction(t)}>
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export class MoneyTrackerView extends ItemView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private moneyService: MoneyService
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_MONEY_TRACKER;
  }

  getDisplayText(): string {
    return 'Money';
  }

  getIcon(): string {
    return 'wallet';
  }

  async onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <MoneyTrackerRoot view={this} moneyService={this.moneyService} />
      </ErrorBoundary>
    );
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }
}
