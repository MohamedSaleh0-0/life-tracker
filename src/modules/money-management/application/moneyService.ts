// Orchestrates the domain layer (balance/currency/category/recurring
// math) and infrastructure layer (settings store, transaction log)
// into the operations the UI layer calls. No direct file I/O of its
// own. Mirrors habitService.ts/dataPointService.ts's structure and DI
// pattern. See design-money-management.md for scope/rationale.
//
// Update (this pass): category budgets. checkBudget() is the one new
// entry point the UI calls before recording an expense (or a shopping
// purchase, which creates one) against a budgeted category — it
// reports whether the transaction would push that category's spend
// for the current calendar month over its configured limit, without
// blocking anything itself; the UI layer decides whether to warn and
// let the user confirm or cancel.

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
  CategoryBudget,
  BudgetCheckResult,
  TransactionJudgment,
  Debt,
  NewDebtInput,
  DebtPayment,
} from '../domain/types';
import { calculateAccountBalance, calculateIncomeExpenseTotals } from '../domain/balanceCalculator';
import { convertToPrimary } from '../domain/currencyConverter';
import { buildCategoryTree, CategoryNode, resolveCategoryLabel } from '../domain/categoryTree';
import { isRecurringEntryDue } from '../domain/recurringDueCalculator';
import { debtRemaining, totalsByDirection } from '../domain/debtCalculator';
import { MoneySettingsStore } from '../infrastructure/moneySettingsStore';
import { TransactionLogFile, RawTransaction } from '../infrastructure/transactionLogFile';
import { getTodayLocal, monthBoundsFor } from '../../../core/date';

export interface MoneyServiceDeps {
  settingsStore: MoneySettingsStore;
  logFile: TransactionLogFile;
  idGenerator: () => string;
  clock?: () => Date;
  getRecentNamesLimit?: () => Promise<number>;
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
  private getRecentNamesLimit: () => Promise<number>;
  /** In-memory only (not persisted) — REQ-M010's "within the current session" scope. */
  private lastRecorded: { date: string; ids: string[] } | null = null;

  constructor(deps: MoneyServiceDeps) {
    this.settingsStore = deps.settingsStore;
    this.logFile = deps.logFile;
    this.idGenerator = deps.idGenerator;
    this.clock = deps.clock ?? (() => new Date());
    this.getRecentNamesLimit = deps.getRecentNamesLimit ?? (async () => 20);
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

  async archiveAccount(id: string): Promise<void> {
    await this.settingsStore.updateAccount(id, { archived: true });
  }

  async unarchiveAccount(id: string): Promise<void> {
    await this.settingsStore.updateAccount(id, { archived: false });
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

  /** Just the computed current balance for one account (REQ-M004/M007) — used by the account edit form, which shows/edits the current balance rather than the historical opening balance. */
  async getAccountBalance(accountId: string): Promise<number> {
    const [account, rawTxs] = await Promise.all([this.settingsStore.getAccount(accountId), this.logFile.readAll()]);
    if (!account) throw new Error(`Account not found: ${accountId}`);
    return calculateAccountBalance(account, rawTxs.map(toDomainTransaction));
  }

  /**
   * Adjusts an account's CURRENT balance to `targetBalance` by recording
   * a single balance-correction adjustment transaction for the
   * difference (never by rewriting `openingBalance`, which per
   * PROJECT_PRINCIPLES.md/REQ-M004 must stay untouched — a balance
   * changes only via a recorded transaction, so an edited "current
   * balance" becomes a dated adjustment, same as the manual adjustment
   * transaction type already supports). No-op (no transaction created)
   * if the target already equals the current balance.
   */
  async setAccountCurrentBalance(accountId: string, targetBalance: number, date?: string): Promise<Transaction | null> {
    const currentBalance = await this.getAccountBalance(accountId);
    const delta = targetBalance - currentBalance;
    if (delta === 0) return null;
    return this.recordTransaction({
      date: date ?? this.today(),
      accountId,
      type: 'adjustment',
      amount: delta,
      name: 'Balance adjustment (manual correction)',
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

  /** Removes a configured currency's rate entirely. Any account still using that currency simply falls back to "no rate configured" (excluded and flagged in aggregates), same as before it was ever added — nothing about the account itself is touched. */
  async removeCurrencyRate(currency: string): Promise<void> {
    const rates = await this.settingsStore.getExchangeRates();
    if (currency === rates.primaryCurrency) return; // the primary currency isn't a "rate" to remove
    const rest = { ...rates.ratesToPrimary };
    delete rest[currency];
    await this.settingsStore.setExchangeRates({ ...rates, ratesToPrimary: rest });
  }

  /** Every currency in active use by an account, or configured with a rate — lets the settings UI offer "add a currency" ahead of creating an account in it. Every rate is always "1 unit of this currency = N units of the primary currency" — never hardcoded to any one specific pair; the primary currency itself (default USD) is just as editable as any other. */
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

  // --- Budgets ---

  async getCategoryBudgets(): Promise<CategoryBudget[]> {
    return this.settingsStore.getCategoryBudgets();
  }

  async setCategoryBudget(categoryId: string, monthlyLimit: number): Promise<CategoryBudget> {
    return this.settingsStore.setCategoryBudget(categoryId, monthlyLimit);
  }

  async removeCategoryBudget(categoryId: string): Promise<void> {
    await this.settingsStore.removeCategoryBudget(categoryId);
  }

  /** Sum of expense transactions (as a positive magnitude) against exactly this category id, within [rangeStart, rangeEnd]. Archived transactions still count — archiving is organizational, not a reversal of the spend. Does not roll up subcategories; each category (main or sub) tracks its own budget and its own spend. */
  async getCategorySpend(categoryId: string, rangeStart: string, rangeEnd: string): Promise<number> {
    const raw = await this.logFile.readRange(rangeStart, rangeEnd);
    return raw
      .filter((t) => t.type === 'expense' && t.categoryId === categoryId)
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  }

  /**
   * Checks whether adding `additionalAmount` of expense to `categoryId`
   * on `date` would exceed that category's configured monthly budget.
   * Returns null if the category has no budget configured (nothing to
   * check). Purely informational — recording the transaction is a
   * separate step the UI takes afterward regardless of the result;
   * this never blocks anything on its own.
   */
  async checkBudget(
    categoryId: string | undefined,
    additionalAmount: number,
    date: string
  ): Promise<BudgetCheckResult | null> {
    if (!categoryId) return null;
    const budgets = await this.settingsStore.getCategoryBudgets();
    const budget = budgets.find((b) => b.categoryId === categoryId);
    if (!budget) return null;

    const [rangeStart, rangeEnd] = monthBoundsFor(date);
    const currentSpend = await this.getCategorySpend(categoryId, rangeStart, rangeEnd);
    const projectedSpend = currentSpend + Math.abs(additionalAmount);

    return {
      categoryId,
      monthlyLimit: budget.monthlyLimit,
      currentSpend,
      projectedSpend,
      exceeded: projectedSpend > budget.monthlyLimit,
    };
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
      archived: '',
      refundOf: '',
      essential: input.essential === undefined ? '' : input.essential ? 'true' : 'false',
      judgment: input.essential === false ? (input.judgment ?? '') : '',
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
      archived: '',
      refundOf: '',
      essential: '',
      judgment: '',
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
      archived: '',
      refundOf: '',
      essential: '',
      judgment: '',
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
   * A transfer's two legs must live or die together (REQ-M002/M003 integrity) —
   * deleting only one previously left the other orphaned with wrong balance math.
   */
  async deleteTransaction(date: string, id: string): Promise<void> {
    const existing = await this.logFile.findTransaction(date, id);
    await this.logFile.deleteTransaction(date, id);

    // A transfer's two legs must live or die together.
    if (existing?.transferPairId) {
      const day = await this.logFile.readDay(date);
      const otherLeg = day.find((t) => t.transferPairId === existing.transferPairId && t.id !== id);
      if (otherLeg) await this.logFile.deleteTransaction(date, otherLeg.id);
    }

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

  /**
   * Organizational hide/show — an archived transaction is excluded
   * from the default transaction list (and getArchivedTransactions
   * surfaces the archived set) but keeps counting toward account
   * balances AND toward budget spend, since archiving doesn't undo the
   * money movement the way delete or refund do.
   */
  async archiveTransaction(date: string, id: string): Promise<void> {
    await this.logFile.setArchived(date, id, true);
  }

  async unarchiveTransaction(date: string, id: string): Promise<void> {
    await this.logFile.setArchived(date, id, false);
  }

  /**
   * Edits a transaction's editable fields in place. Deliberately excludes
   * `date` and `type` — moving across year files or switching
   * expense/income/transfer/adjustment would break the invariants those
   * fields carry (transfer legs, shopping-item linkage). Use delete +
   * re-record for those cases.
   */
  async updateTransaction(
    date: string,
    id: string,
    patch: {
      accountId?: string;
      categoryId?: string;
      amount?: number;
      quantity?: number;
      name?: string;
      note?: string;
      time?: string;
    }
  ): Promise<Transaction> {
    const existing = await this.logFile.findTransaction(date, id);
    if (!existing) throw new Error(`Transaction not found: ${id} on ${date}`);

    await this.logFile.updateFields(date, id, {
      ...(patch.accountId !== undefined && { accountId: patch.accountId }),
      ...(patch.categoryId !== undefined && { categoryId: patch.categoryId ?? '' }),
      ...(patch.amount !== undefined && { amount: String(patch.amount) }),
      ...(patch.quantity !== undefined && { quantity: patch.quantity !== undefined ? String(patch.quantity) : '' }),
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.note !== undefined && { note: patch.note }),
      ...(patch.time !== undefined && { time: patch.time }),
    });

    const updated = await this.logFile.findTransaction(date, id);
    return toDomainTransaction(updated!);
  }

  /**
   * Refunds a transaction by recording a brand-new transaction with
   * the reversed amount on the same account (and category, when the
   * original had one) — "adds the money back" without touching the
   * original at all, so both the original charge and the refund stay
   * visible in history (and the refund correctly reduces the
   * category's budget spend going forward, since it's just another
   * transaction against that category). Transfers are refunded as an
   * adjustment on the refunded leg's own account.
   */
  async refundTransaction(date: string, id: string, refundDate?: string): Promise<Transaction> {
    const original = await this.logFile.findTransaction(date, id);
    if (!original) throw new Error(`Transaction not found: ${id} on ${date}`);

    const reversedAmount = -Number(original.amount);
    const raw: RawTransaction = {
      id: this.idGenerator(),
      date: refundDate ?? this.today(),
      time: this.nowHHMM(),
      accountId: original.accountId,
      type: original.type === 'transfer' ? 'adjustment' : original.type,
      categoryId: original.categoryId,
      amount: String(reversedAmount),
      quantity: '',
      transferPairId: '',
      recurringEntryId: '',
      shoppingItemId: '',
      archived: '',
      refundOf: id,
      essential: '',
      judgment: '',
      name: original.name ? `Refund: ${original.name}` : 'Refund',
      note: original.note,
    };
    await this.logFile.upsertTransaction(raw);
    this.lastRecorded = { date: raw.date, ids: [raw.id] };
    return toDomainTransaction(raw);
  }

  /**
   * Edits an existing transaction's Essential flag and/or Judgment
   * rating in place — the one "editing an existing entry" surface this
   * pass adds, deliberately scoped to just these two fields rather
   * than a full transaction editor (amount/date/account/etc. editing
   * wasn't asked for). Judgment is only meaningful when essential is
   * false; passing essential=true clears any judgment automatically.
   */
  async updateTransactionTags(
    date: string,
    id: string,
    essential: boolean | undefined,
    judgment: TransactionJudgment | undefined
  ): Promise<void> {
    await this.logFile.updateFields(date, id, {
      essential: essential === undefined ? '' : essential ? 'true' : 'false',
      judgment: essential === false ? (judgment ?? '') : '',
    });
  }

  /** REQ-M010: undo the most recently recorded transaction (or both legs of the most recent transfer) within the current session. Routes through deleteTransaction so a shopping-purchase revert (REQ-M034) applies here too. No-op if nothing's been recorded yet this session. */
  async undoLastTransaction(): Promise<boolean> {
    if (!this.lastRecorded) return false;
    const { date, ids } = this.lastRecorded;
    for (const id of ids) {
      await this.deleteTransaction(date, id);
    }
    this.lastRecorded = null;
    return true;
  }

  /** Active (non-archived) transactions in a range — the default view. Pass includeArchived to also get archived ones mixed in. */
  async listTransactions(rangeStart: string, rangeEnd: string, includeArchived = false): Promise<Transaction[]> {
    const raw = await this.logFile.readRange(rangeStart, rangeEnd);
    const filtered = includeArchived ? raw : raw.filter((t) => t.archived !== 'true');
    return filtered.map(toDomainTransaction).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }

  /** Only the archived transactions in a range, for a dedicated "Archived" view. */
  async getArchivedTransactions(rangeStart: string, rangeEnd: string): Promise<Transaction[]> {
    const raw = await this.logFile.readRange(rangeStart, rangeEnd);
    return raw
      .filter((t) => t.archived === 'true')
      .map(toDomainTransaction)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }

  async getIncomeExpenseTotals(rangeStart: string, rangeEnd: string): Promise<{ income: number; expense: number }> {
    const transactions = await this.listTransactions(rangeStart, rangeEnd);
    return calculateIncomeExpenseTotals(transactions);
  }

  /** REQ-M009: previously-used transaction names, for autocomplete on new entries — most recent first, deduplicated. */
  async getRecentNames(limit?: number): Promise<string[]> {
    const effectiveLimit = limit ?? (await this.getRecentNamesLimit());
    const all = await this.logFile.readAll();
    const seen = new Set<string>();
    const names: string[] = [];
    const sorted = [...all].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    for (const t of sorted) {
      if (!t.name || seen.has(t.name)) continue;
      seen.add(t.name);
      names.push(t.name);
      if (names.length >= effectiveLimit) break;
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
   * already logged from earlier cycles) and advances lastHandledDate.
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

  async renameShoppingList(id: string, name: string): Promise<ShoppingList> {
    return this.settingsStore.updateShoppingList(id, { name });
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
   * Budget checking happens in the UI layer (via checkBudget) before
   * this is called, same as for a manually-entered expense.
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
      essential: input.essential,
      judgment: input.judgment,
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

  /** Previously-used shopping item names, most recent first, deduplicated. */
  async getRecentItemNames(limit?: number): Promise<string[]> {
    const effectiveLimit = limit ?? (await this.getRecentNamesLimit());
    const all = await this.settingsStore.getShoppingItems();
    const seen = new Set<string>();
    const names: string[] = [];
    const sorted = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const i of sorted) {
      if (!i.name || seen.has(i.name)) continue;
      seen.add(i.name);
      names.push(i.name);
      if (names.length >= effectiveLimit) break;
    }
    return names;
  }

  async updateShoppingItemDetails(id: string, patch: Partial<NewShoppingItemInput>): Promise<ShoppingItem> {
    return this.settingsStore.updateShoppingItem(id, patch);
  }

  // --- Debts ---

  async createDebt(input: NewDebtInput): Promise<Debt> {
    const existing = await this.settingsStore.getDebts();
    const debt: Debt = {
      id: this.idGenerator(),
      ...input,
      archived: false,
      createdAt: this.today(),
      order: existing.length,
    };
    return this.settingsStore.createDebt(debt);
  }

  async updateDebt(id: string, patch: Partial<Debt>): Promise<Debt> {
    return this.settingsStore.updateDebt(id, patch);
  }

  async archiveDebt(id: string): Promise<void> {
    await this.settingsStore.updateDebt(id, { archived: true });
  }

  async deleteDebt(id: string): Promise<void> {
    await this.settingsStore.deleteDebt(id);
  }

  async getDebts(): Promise<Debt[]> {
    const all = await this.settingsStore.getDebts();
    return all.filter((d) => !d.archived).sort((a, b) => a.order - b.order);
  }

  async getDebtPayments(debtId: string): Promise<DebtPayment[]> {
    const all = await this.settingsStore.getDebtPayments();
    return all.filter((p) => p.debtId === debtId).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Records a payment against a debt. If `accountId` is provided, also
   * creates a real linked transaction (income if money owed to you came
   * in; expense if you paid down what you owe) — same REQ-M004 invariant
   * as shopping purchases: real money movement always goes through a
   * transaction. Omit accountId to log an untracked payment (e.g. cash
   * outside any tracked account).
   */
  async recordDebtPayment(
    debtId: string,
    input: { amount: number; date: string; accountId?: string; categoryId?: string; note?: string }
  ): Promise<DebtPayment> {
    const debt = (await this.settingsStore.getDebts()).find((d) => d.id === debtId);
    if (!debt) throw new Error(`Debt not found: ${debtId}`);

    let transactionId: string | undefined;
    if (input.accountId) {
      const tx = await this.recordTransaction({
        date: input.date,
        accountId: input.accountId,
        type: debt.direction === 'owed_to_me' ? 'income' : 'expense',
        categoryId: input.categoryId,
        amount: debt.direction === 'owed_to_me' ? Math.abs(input.amount) : -Math.abs(input.amount),
        name: `${debt.direction === 'owed_to_me' ? 'Repayment from' : 'Payment to'} ${debt.counterparty}`,
        note: input.note,
      });
      transactionId = tx.id;
    }

    const payment: DebtPayment = {
      id: this.idGenerator(),
      debtId,
      amount: Math.abs(input.amount),
      date: input.date,
      accountId: input.accountId,
      transactionId,
      note: input.note,
    };
    return this.settingsStore.createDebtPayment(payment);
  }

  /**
   * Deletes a payment; if it had a linked transaction, deletes that too
   * (same cascade principle as the transfer-leg fix above).
   */
  async deleteDebtPayment(paymentId: string): Promise<void> {
    const payments = await this.settingsStore.getDebtPayments();
    const payment = payments.find((p) => p.id === paymentId);
    if (payment?.transactionId) {
      await this.deleteTransaction(payment.date, payment.transactionId);
    }
    await this.settingsStore.deleteDebtPayment(paymentId);
  }

  /** Computes total debts by direction for a dashboard summary. */
  async getDebtTotals(): Promise<{ owedToMe: number; iOwe: number }> {
    const [debts, payments] = await Promise.all([
      this.settingsStore.getDebts(),
      this.settingsStore.getDebtPayments(),
    ]);
    return totalsByDirection(debts, payments);
  }

  /** Remaining balance on a single debt. */
  async getDebtRemaining(debtId: string): Promise<number> {
    const debts = await this.settingsStore.getDebts();
    const debt = debts.find((d) => d.id === debtId);
    if (!debt) throw new Error(`Debt not found: ${debtId}`);
    const payments = await this.settingsStore.getDebtPayments();
    return debtRemaining(debt, payments);
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
    archived: raw.archived === 'true',
    refundOfTransactionId: raw.refundOf || undefined,
    essential: raw.essential === 'true' ? true : raw.essential === 'false' ? false : undefined,
    judgment: (raw.judgment || undefined) as Transaction['judgment'],
    name: raw.name,
    note: raw.note,
  };
}