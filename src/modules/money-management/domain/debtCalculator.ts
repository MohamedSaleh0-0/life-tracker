import { Debt, DebtPayment } from './types';

export function debtRemaining(debt: Debt, payments: DebtPayment[]): number {
  const paid = payments.filter((p) => p.debtId === debt.id).reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, debt.principal - paid);
}

export function debtIsSettled(debt: Debt, payments: DebtPayment[]): boolean {
  return debtRemaining(debt, payments) <= 0;
}

/** Sum of remaining balances, split by direction — for a dashboard summary card. */
export function totalsByDirection(
  debts: Debt[],
  payments: DebtPayment[]
): { owedToMe: number; iOwe: number } {
  let owedToMe = 0;
  let iOwe = 0;
  for (const debt of debts) {
    if (debt.archived) continue;
    const remaining = debtRemaining(debt, payments);
    if (debt.direction === 'owed_to_me') owedToMe += remaining;
    else iOwe += remaining;
  }
  return { owedToMe, iOwe };
}
