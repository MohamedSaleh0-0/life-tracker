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
