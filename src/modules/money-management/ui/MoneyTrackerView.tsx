// ItemView hosting Money Management's dashboard: due recurring entries
// (REQ-M020), account balances, net worth, shopping lists, and a
// recent transactions list. The full finance dashboard's charts
// (REQ-M026-M033) are still deferred — see design-money-management.md.
//
// This pass:
//  - Adds a manual "Refresh" button in the header, alongside the
//    existing active-leaf-change auto-refresh, since auto-refresh
//    alone wasn't reliably catching every case new data could show up
//    (e.g. a transaction logged from the command palette while this
//    pane was already the active leaf).
//  - Transaction rows: "Delete" is replaced with "Archive" (removes
//    it from this default view, without touching its balance impact)
//    and a new "Refund" button (records a new, opposite-signed
//    transaction that adds the money back, leaving the original
//    transaction untouched). A "Show archived" toggle reveals the
//    archived list with an "Unarchive" action.
//  - Shopping list cards get inline Rename/Delete affordances via the
//    detail modal (ShoppingListDetailModal), which now supports both,
//    PLUS a "+ Add item" button directly on the card (no longer
//    requiring opening the detail modal first just to add one item) —
//    also fixed to actually refresh this view's own state (balances,
//    shopping summaries, recent transactions) after any change made
//    inside the detail modal, not just after renaming/deleting the
//    list itself.
//  - Transaction rows show an Essential/Judgment badge when set, with
//    an "Edit tags" action to set/change them after the fact.

import React, { useEffect, useState } from 'react';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { TransactionEntryModal } from './TransactionEntryModal';
import { ShoppingListModal } from './ShoppingListModal';
import { ShoppingListDetailModal } from './ShoppingListDetailModal';
import { ShoppingItemModal } from './ShoppingItemModal';
import { TransactionTagsModal } from './TransactionTagsModal';
import { MoneyService, AccountWithBalance } from '../application/moneyService';
import { Account, RecurringEntry, ShoppingList, Transaction, JUDGMENT_OPTIONS } from '../domain/types';
import { getTodayLocal, addDaysLocal } from '../../../core/date';

export const VIEW_TYPE_MONEY_TRACKER = 'life-tracker-money';

function judgmentLabel(judgment: Transaction['judgment']): string {
  return JUDGMENT_OPTIONS.find((o) => o.value === judgment)?.label ?? judgment ?? '';
}

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
  const [archivedTransactions, setArchivedTransactions] = useState<Transaction[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [categoryLabels, setCategoryLabels] = useState<Map<string, string>>(new Map());
  const [primaryCurrency, setPrimaryCurrency] = useState('USD');
  const [dueRecurring, setDueRecurring] = useState<RecurringEntry[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [shoppingSummaries, setShoppingSummaries] = useState<Map<string, { pendingCount: number; estimatedTotal: number }>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  // Registers `refresh` with the hosting ItemView so it can be called
  // from Obsidian's active-leaf-change event (see MoneyTrackerView
  // below) — the class-based View has no other way to reach into this
  // function component's state.
  useEffect(() => {
    view.registerRefreshHandler(refresh);
    return () => view.registerRefreshHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rangeStart = addDaysLocal(getTodayLocal(), -30);
        const rangeEnd = getTodayLocal();
        const [withBalances, worth, rates, recentTxs, archivedTxs, due, lists] = await Promise.all([
          moneyService.getAccountsWithBalances(),
          moneyService.getNetWorth(),
          moneyService.getExchangeRates(),
          moneyService.listTransactions(rangeStart, rangeEnd),
          moneyService.getArchivedTransactions(rangeStart, rangeEnd),
          moneyService.getDueRecurringEntries(),
          moneyService.getShoppingLists(),
        ]);
        if (cancelled) return;

        setLoadError(null);
        setAccountsWithBalances(withBalances);
        setNetWorth(worth);
        setPrimaryCurrency(rates.primaryCurrency);
        const recent = recentTxs.slice(0, 25);
        setTransactions(recent);
        setArchivedTransactions(archivedTxs.slice(0, 25));
        setDueRecurring(due);
        setShoppingLists(lists);

        const summaries = new Map<string, { pendingCount: number; estimatedTotal: number }>();
        for (const list of lists) {
          summaries.set(list.id, await moneyService.getShoppingListSummary(list.id));
        }
        if (!cancelled) setShoppingSummaries(summaries);

        const labels = new Map<string, string>();
        for (const t of [...recent, ...archivedTxs]) {
          if (t.categoryId && !labels.has(t.categoryId)) {
            labels.set(t.categoryId, await moneyService.resolveCategoryLabel(t.categoryId));
          }
        }
        if (!cancelled) setCategoryLabels(labels);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load Money data.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, moneyService]);

  const accounts = accountsWithBalances.map((w) => w.account);

  const handleAddTransaction = async () => {
    // Fetch fresh rather than trusting `accounts` state, which can be
    // stale until the leaf-focus refresh above fires — this button
    // otherwise stayed disabled (or opened with an empty account list)
    // right after creating the first account elsewhere.
    const freshAccounts = await moneyService.getAccounts();
    new TransactionEntryModal(view.app, moneyService, freshAccounts, refresh).open();
  };

  const handleArchiveTransaction = async (t: Transaction) => {
    await moneyService.archiveTransaction(t.date, t.id);
    refresh();
  };

  const handleUnarchiveTransaction = async (t: Transaction) => {
    await moneyService.unarchiveTransaction(t.date, t.id);
    refresh();
  };

  const handleRefundTransaction = async (t: Transaction) => {
    await moneyService.refundTransaction(t.date, t.id);
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

  const renderTransactionRow = (t: Transaction, archivedView: boolean) => {
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
          {t.refundOfTransactionId && <span className="ltk-money-tx__tag"> refund</span>}
          {t.essential === true && <span className="ltk-money-tx__tag ltk-money-tx__tag--essential"> essential</span>}
          {t.essential === false && t.judgment && (
            <span className="ltk-money-tx__tag ltk-money-tx__tag--judgment"> {judgmentLabel(t.judgment)}</span>
          )}
        </span>
        <span className={`ltk-money-tx__amount ltk-money-tx__amount--${t.amount < 0 ? 'neg' : 'pos'}`}>
          {formatAmount(t.amount, account?.currency ?? '')}
        </span>
        {archivedView ? (
          <button type="button" onClick={() => handleUnarchiveTransaction(t)}>
            Unarchive
          </button>
        ) : (
          <>
            <button type="button" onClick={() => handleRefundTransaction(t)}>
              Refund
            </button>
            <button type="button" onClick={() => handleArchiveTransaction(t)}>
              Archive
            </button>
            {t.type === 'expense' && (
              <button type="button" onClick={() => new TransactionTagsModal(view.app, moneyService, t, refresh).open()}>
                Edit tags
              </button>
            )}
          </>
        )}
      </li>
    );
  };

  return (
    <div className="ltk-habit-view">
      <div className="ltk-habit-view__header">
        <h2>Money</h2>
        <div className="ltk-habit-view__header-actions">
          <button type="button" className="ltk-icon-button" onClick={refresh} aria-label="Refresh" title="Refresh">
            ⟳
          </button>
          <button type="button" className="ltk-button ltk-button--accent" onClick={handleAddTransaction}>
            + Add transaction
          </button>
        </div>
      </div>

      {loadError && (
        <div className="ltk-money-load-error">
          <p>Couldn't load Money data: {loadError}</p>
          <button type="button" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      {accounts.length === 0 && !loadError && (
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
                onClick={() => new ShoppingListDetailModal(view.app, moneyService, list, accounts, refresh).open()}
              >
                <span className="ltk-shopping-list-card__name">{list.name}</span>
                <span className="ltk-shopping-list-card__summary">
                  {summary ? `${summary.pendingCount} pending` : '…'}
                  {summary && summary.estimatedTotal > 0 ? ` · est. ${summary.estimatedTotal.toFixed(2)}` : ''}
                </span>
                <button
                  type="button"
                  className="ltk-shopping-list-card__add"
                  onClick={(e) => {
                    e.stopPropagation();
                    new ShoppingItemModal(view.app, moneyService, list.id, refresh).open();
                  }}
                >
                  + Add item
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="ltk-money-section-header">
        <h3>{showArchived ? 'Archived transactions' : 'Recent transactions'}</h3>
        <button type="button" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Show recent' : 'Show archived'}
        </button>
      </div>

      {showArchived ? (
        <>
          {archivedTransactions.length === 0 && <p className="ltk-empty">No archived transactions.</p>}
          {archivedTransactions.length > 0 && (
            <ul className="ltk-money-transactions">{archivedTransactions.map((t) => renderTransactionRow(t, true))}</ul>
          )}
        </>
      ) : (
        <>
          {transactions.length === 0 && <p className="ltk-empty">No transactions in the last 30 days.</p>}
          {transactions.length > 0 && (
            <ul className="ltk-money-transactions">{transactions.map((t) => renderTransactionRow(t, false))}</ul>
          )}
        </>
      )}
    </div>
  );
}

export class MoneyTrackerView extends ItemView {
  private root: Root | null = null;
  private refreshHandler: (() => void) | null = null;

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

  /** Called by MoneyTrackerRoot so this class-based view can trigger a data refresh from workspace events. */
  registerRefreshHandler(handler: (() => void) | null): void {
    this.refreshHandler = handler;
  }

  async onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <MoneyTrackerRoot view={this} moneyService={this.moneyService} />
      </ErrorBoundary>
    );

    // Re-fetch every time this leaf becomes active again — covers both
    // "I edited accounts/categories in Settings, then switched back to
    // this already-open tab" and "I closed this pane and reopened it"
    // (Obsidian reuses the existing leaf rather than remounting it, so
    // onOpen() alone only fires once per leaf's lifetime). The header's
    // manual Refresh button covers everything else (e.g. logging a
    // transaction via the command palette while this pane stays active).
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        if (leaf === this.leaf) {
          this.refreshHandler?.();
        }
      })
    );
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }
}
