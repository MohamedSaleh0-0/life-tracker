# Tasks — Money Management Module (Phase 1)

See design-money-management.md for full scope/rationale. Mirrors the
other two modules' layering order.

## Domain (pure logic, no I/O)
- [x] `types.ts` — Account, Category, Transaction (4 types), ExchangeRates.
- [x] `balanceCalculator.ts` — calculateAccountBalance (REQ-M004/M007), calculateIncomeExpenseTotals excluding transfers/adjustments. Tested.
- [x] `currencyConverter.ts` — convertToPrimary using manual rates; returns null (never a silent 1:1 guess) when unconfigured. Tested.
- [x] `categoryTree.ts` — buildCategoryTree (two kinds, scoped subcategories), resolveCategoryLabel -> "Uncategorized" (REQ-M015). Tested.

## Infrastructure
- [x] `moneySettingsStore.ts` — CRUD for accounts, categories (incl. cascade-delete of scoped subcategories), exchange rates. Tested.
- [x] `transactionLogFile.ts` — per-transaction yearly markdown log, `[tx-<id>:: account|type|category|amount|qty|transferPairId]` + optional `[txn-<id>::name]`/`[txnote-<id>::note]`. Tested, incl. transfer-pair round-trip and the corrupted-file error path.

## Application
- [x] `moneyService.ts` — accounts (create/update/list/balances), net worth with currency conversion + excluded-accounts flag, categories (create/rename/delete), recordTransaction, recordTransfer (two linked legs), deleteTransaction, undoLastTransaction (session-scoped, REQ-M010), listTransactions, getIncomeExpenseTotals, getRecentNames (REQ-M009), getPriceHistory (REQ-M011), resolveCategoryLabel. Tested end-to-end, including transfer balance math and the undo flow.

## UI
- [x] `TransactionEntryModal.tsx` — the one consolidated form REQ-M005 asks for; a type selector switches visible fields.
- [x] `AccountModal.tsx`, `CategoryModal.tsx` — create/edit.
- [x] `MoneySettingsTab.tsx` — accounts, currency-conversion rates, both category trees.
- [x] `MoneyTrackerView.tsx` — ItemView: account balances, net worth (converted + excluded-accounts flag), recent transactions with delete. Ribbon icon + 3 commands (open, add transaction, undo).

## Explicitly deferred (Phase 2/3)
- [ ] Recurring Entries (REQ-M018-M020, M035) — "needs attention" due list, log/skip actions, traceability back to the template.
- [ ] Shopping Lists (REQ-M021-M025) — pending/purchased split, REQ-M023's auto-transaction-on-purchase flow (which also needs REQ-M034's delete-reverts-to-pending behavior on the transaction side).
- [ ] Finance dashboard charts (REQ-M026-M033) — period selector, income/expense chart, category breakdown, net-worth-over-time, account-share chart, searchable transaction history embedded in-dashboard (today it's a flat recent-25 list).
- [ ] Satisfaction tracking (REQ-M016/M017).

## Verification
- [ ] `npm install && npm test` locally (no network access in this environment to run it here).
- [ ] `npm run build` clean.
- [ ] Manual checklist: create 2 accounts (same currency, then different currencies); set an exchange rate and confirm net worth converts + an unrated currency is excluded and flagged; record expense/income/transfer/adjustment; confirm transfer nets to zero across both accounts; delete a transaction and confirm balance updates; delete a category with existing transactions, confirm they show Uncategorized; undo the last transaction (and the last transfer, both legs); name autocomplete suggests a previously-used name.
