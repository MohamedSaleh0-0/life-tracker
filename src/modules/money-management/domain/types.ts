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
