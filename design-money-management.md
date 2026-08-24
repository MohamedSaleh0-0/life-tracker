# Design — Money Management Module (Phase 1: core ledger)

*Full design doc mirrors design-habit-tracking.md's structure once the
whole module ships. This pass covers Phase 1 only — see "Scope" below.*

## Scope

Money Management's full requirements doc covers accounts, transactions,
categories, recurring entries, shopping lists, and a 6-chart dashboard.
Implementing all of it at once, given recurring entries and shopping
lists both *produce* transactions and the dashboard *reads* them, would
mean building on an unverified foundation. This pass ships:

**Phase 1 (this pass):** Accounts, Categories (hierarchical, two
trees), Transactions (all four types incl. transfers as linked legs),
balance/net-worth math with manual-rate currency conversion,
undo-last-transaction, name autocomplete/price-history query support.

**Deferred to Phase 2/3:** Recurring Entries, Shopping Lists (incl.
REQ-M023's auto-transaction-on-purchase flow), the finance dashboard's
charts (REQ-M026-M033), satisfaction tracking (REQ-M016/M017).

## Resolved Open Question — multi-currency aggregation

Chosen: **manual exchange rates**, not scope-excluded. The user enters
a rate-to-primary-currency for each non-primary currency in settings;
`convertToPrimary()` (domain, pure) applies it. Aggregate views (net
worth, account-share chart — Phase 2/3, but the conversion utility is
built now since accounts/balances exist in Phase 1) show converted
totals in the primary currency. An account whose currency has no
configured rate is excluded from the aggregate and flagged in the UI
— never silently treated as if rate=1, which would silently corrupt
the total.

## Resolved Open Question — "goal/target progress" insight

Deferred entirely per explicit user steer ("skip for now, revisit
later") — not designed in this pass.

## Data Model

### Settings store (REQ-C008), three new top-level keys in the shared data.json

```typescript
interface Account {
  id: string;
  name: string;
  currency: string;       // free-text code, e.g. "USD", "EGP"
  openingBalance: number; // REQ-M001; balance itself is always computed, never stored (REQ-M004)
  archived: boolean;
  createdAt: string;
  order: number;
}

type CategoryKind = 'expense' | 'income';

interface Category {
  id: string;
  kind: CategoryKind;     // REQ-M013: separate trees for expense vs. income
  name: string;
  parentId?: string;      // absent = main category; present = subcategory, scoped to that parent (REQ-M012)
  order: number;
}

interface ExchangeRates {
  primaryCurrency: string;
  ratesToPrimary: Record<string, number>; // 1 unit of that currency = N units of primaryCurrency
}
```

### Markdown log file (REQ-C009/C010), extended per-entry (same pattern as Data Point Tracking)

One bracketed field per **transaction** (transactions, like data point
entries, can be multiple-per-day), keyed by the transaction's own id —
mirrors `dp-<entryId>` from Data Point Tracking:

```
- 2026-08-19 [tx-<id>:: <accountId>|<type>|<categoryId>|<amount>|<quantity>|<transferPairId>]
```

All six fields are structured (ids, enum, numbers) — none can contain
`|`, so a plain split is safe (unlike Data Point Tracking's free-text
value, which needed the "first two pipes only" trick). Empty slots
(`categoryId`, `quantity`, `transferPairId`) serialize as `''`.

Free-text fields (`name`, `note` — REQ-M006) get their own optional
sibling fields on the same line, only emitted when present (keeps
files clean, same principle as habit/data-point logs):

```
[txn-<id>:: <name>]
[txnote-<id>:: <note>]
```

`tx-`, `txn-`, `txnote-` are mutually exclusive literal prefixes (the
character right after `tx` differs in each: `-`, `n`, `n` then `o`),
so parsing them with three separate regexes has no ambiguity.

## Key Flows (Phase 1)

**Record expense/income/adjustment** (REQ-M002, M005, M006): one
consolidated form, a type selector switches visible fields. Writes one
`RawTransaction` via `TransactionLogFile.upsertTransaction`.

**Record transfer** (REQ-M003): `MoneyService.recordTransfer` writes
TWO transactions sharing a generated `transferPairId`, opposite signed
amounts, one leg per account. Balance math naturally nets to zero
across the two accounts combined; income/expense aggregation filters
`type === 'transfer'` out entirely.

**Balance** (REQ-M004/M007): `calculateAccountBalance` (domain, pure)
= `account.openingBalance + sum(that account's transaction amounts)`.
Never stored — recomputed on every read, so REQ-M008 (delete a
transaction → balance updates) falls out for free with no explicit
"recalculate" step.

**Delete a category with existing transactions** (REQ-M015): those
transactions' `categoryId` is left pointing at the now-missing id;
`MoneyService` resolves an unknown/absent `categoryId` to the
"Uncategorized" label at read time, rather than rewriting historical
transaction rows (same non-destructive philosophy as Habit Tracking's
orphaned-field-on-delete).

## Traceability
REQ-M001-M011 (Accounts & Transactions), REQ-M012-M015 (Categories).
REQ-M016-M035 (Satisfaction, Recurring, Shopping, Dashboard) deferred.

## Update — Recurring Entries, Shopping Lists, and time-of-day now implemented

The Phase 1/2 split above is superseded by this update. Recurring
Entries (REQ-M018-M020, M035) and Shopping Lists incl. the
auto-transaction-on-purchase flow (REQ-M021-M025, M034) are now built,
along with transaction time-of-day (not just date) and free-text
custom currencies (already supported — Account.currency was always a
free-text field, never a fixed list; the settings UI now also lets a
currency+rate be configured before any account uses it).

Transaction log format extended from 6 to 9 pipe-delimited main fields
to add `recurringEntryId`, `shoppingItemId`, and `time` — all
structured (no `|` risk), so parsing stays a plain split. See
transactionLogFile.ts's header comment for the exact field order.

Still deferred: the finance dashboard's charts (REQ-M026-M033) and
satisfaction tracking (REQ-M016/M017).
