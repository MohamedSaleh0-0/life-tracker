// Pure domain logic: an account's balance is always derived from its
// transactions, never stored (REQ-M004). No I/O. Deleting a
// transaction "recalculates" the balance for free (REQ-M008) since
// there's nothing cached to invalidate — every read just re-sums.

import { Account, Transaction } from './types';

export function calculateAccountBalance(account: Account, allTransactions: Transaction[]): number {
  const delta = allTransactions
    .filter((t) => t.accountId === account.id)
    .reduce((sum, t) => sum + t.amount, 0);
  return account.openingBalance + delta;
}

/** Income/expense totals for a period, excluding transfers (REQ-M003) and adjustments (a balance correction, not real income/spend). */
export function calculateIncomeExpenseTotals(transactions: Transaction[]): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += Math.abs(t.amount);
  }
  return { income, expense };
}
