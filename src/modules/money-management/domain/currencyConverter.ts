// Pure domain logic: converting an amount to the primary reporting
// currency using manually-entered rates (design-money-management.md's
// resolved Open Question). No I/O.

import { ExchangeRates } from './types';

/**
 * Returns the amount converted to `rates.primaryCurrency`, or `null`
 * if `currency` isn't the primary currency and has no configured rate
 * — callers must exclude/flag rather than silently treat a missing
 * rate as 1, which would quietly corrupt an aggregate total.
 */
export function convertToPrimary(amount: number, currency: string, rates: ExchangeRates): number | null {
  if (currency === rates.primaryCurrency) return amount;
  const rate = rates.ratesToPrimary[currency];
  if (rate === undefined) return null;
  return amount * rate;
}
