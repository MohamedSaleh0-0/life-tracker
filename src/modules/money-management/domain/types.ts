// Domain types for Money Management. Pure data shapes only — no I/O,
// no Obsidian API, no React. See design-money-management.md.
//
// Update: Transaction gained `archived` (organizational — hidden from
// the default view but still counts toward balances) and
// `refundOfTransactionId` (traceability for refunds, which are new
// transactions, never edits of the original). Also new: CategoryBudget
// — an optional monthly spending cap per category, checked before an
// expense transaction (or a shopping-item purchase, which creates one)
// is recorded, so overspending triggers a warning instead of silently
// going through.

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
  /** Organizational only — hidden from the default transaction list but still counted in balances. Distinct from delete. */
  archived?: boolean;
  /** Set on a refund transaction — points back at the original transaction it reverses. Absent on every other transaction, including the original that was refunded. */
  refundOfTransactionId?: string;
  /**
   * Whether this expense was essential. Optional at the type level
   * specifically so old entries logged before this field existed read
   * back as "not set" rather than erroring or silently defaulting to
   * a value — the entry FORMS require picking one for new/edited
   * transactions, but the data model itself stays permissive for
   * backward compatibility.
   */
  essential?: boolean;
  /** Only meaningful (and only ever set) when essential === false. Ordered best to worst: wise, fair, childish, wasted. */
  judgment?: TransactionJudgment;
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
  /** Only meaningful for expense transactions — captured in the entry form when type === 'expense'. */
  essential?: boolean;
  judgment?: TransactionJudgment;
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
  /** 1 unit of that currency key = N units of primaryCurrency. Every currency the user adds is configured relative to this one primary currency (defaults USD) — never hardcoded to any specific pair. */
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
  essential?: boolean;
  judgment?: TransactionJudgment;
}

// --- Budgets ---

/** A monthly spending cap on one category (main or sub) — resets every calendar month. Checked before an expense transaction against this category is recorded, so overspending prompts a warning rather than going through silently. */
export interface CategoryBudget {
  categoryId: string;
  monthlyLimit: number;
}

export interface BudgetCheckResult {
  categoryId: string;
  monthlyLimit: number;
  /** Already-spent amount in the category this calendar month, before this transaction. */
  currentSpend: number;
  /** currentSpend + the amount this transaction would add. */
  projectedSpend: number;
  exceeded: boolean;
}

// --- Essential flag + Judgment rating ---

/** Ordered best to worst — only meaningful when a transaction is NOT essential. */
export type TransactionJudgment = 'wise' | 'fair' | 'childish' | 'wasted';

export const JUDGMENT_OPTIONS: { value: TransactionJudgment; label: string }[] = [
  { value: 'wise', label: 'Wise' },
  { value: 'fair', label: 'Fair' },
  { value: 'childish', label: 'Childish' },
  { value: 'wasted', label: 'Wasted Money' },
];

// --- Debt Management ---

export type DebtDirection = 'owed_to_me' | 'i_owe';

export interface Debt {
  id: string;
  direction: DebtDirection;
  counterparty: string; // person/entity name
  principal: number; // original amount, always positive
  createdAt: string;
  dueDate?: string;
  note?: string;
  archived: boolean;
  order: number;
}

export interface NewDebtInput {
  direction: DebtDirection;
  counterparty: string;
  principal: number;
  dueDate?: string;
  note?: string;
}

export interface DebtPayment {
  id: string;
  debtId: string;
  amount: number; // positive, partial or full
  date: string;
  accountId?: string; // present -> creates a linked transaction
  transactionId?: string; // traceability, same pattern as shopping purchases
  note?: string;
}
