# Requirements — Money Management Module

## Overview
Covers accounts, transactions (expense/income/transfer/adjustment), hierarchical categories, recurring bills/income, shopping lists, and a finance dashboard with charts and insights. Shopping Lists is included here (not a separate module) per your confirmation, since shopping purchases connect directly to spending.

## User Stories / Primary Flows
- As a user, I want to track multiple accounts and log expenses/income/transfers/balance adjustments, so my balances stay accurate.
- As a user, I want hierarchical categories, separate for expenses and income, so I can organize spending meaningfully.
- As a user, I want recurring bills/income flagged when due, so I don't forget to log them.
- As a user, I want shopping lists with pending items and purchase history, so shopping and spending stay connected — including having a purchase automatically reflected in my accounts once I buy it.
- As a user, I want charts and insights about my spending and net worth, not just raw totals.
- As a user, I want full control over which charts/features are visible, so the dashboard matches how I actually use it.

## Functional Requirements (EARS)

### Accounts & Transactions
- REQ-M001: The system shall allow the user to define one or more accounts, each with a name, currency, and opening balance.
- REQ-M002: The system shall support four transaction types: expense, income, transfer (between two of the user's own accounts), and adjustment (a signed balance correction).
- REQ-M003: The system shall record a transfer as two linked legs (one per account) and shall exclude transfers from income/expense totals.
- REQ-M004: An account's balance shall change only as the result of a recorded transaction, including adjustments; the system shall not allow directly editing a stored balance number.
- REQ-M005: The system shall provide a single consolidated entry form for expense/income/transfer, where a type selector switches the visible fields rather than requiring a separate form per type.
- REQ-M006: A transaction shall require date, account, type, category, and a signed amount; it shall accept an optional name/description (free text), quantity, and note.
- REQ-M007: The system shall calculate and display each account's current balance from its recorded transactions.
- REQ-M008: If the user deletes a transaction, then the system shall recalculate any affected account balance(s) immediately.
- REQ-M009: The system shall remember previously-used transaction names and offer them as autocomplete suggestions on new entries.
- REQ-M010: The plugin shall provide a command to undo the most recently logged transaction within the current session; if the undone transaction was auto-created from a shopping purchase (REQ-M023), undo shall also revert that shopping item to pending, consistent with REQ-M034.
- REQ-M011: The system shall maintain a price-history record of item names and their logged cost over time.

### Categories
- REQ-M012: The system shall support hierarchical categories: a main category (e.g. "Food") containing its own scoped subcategories (e.g. "Junk", "Fruits"); subcategories shall not be shared across unrelated main categories.
- REQ-M013: The system shall maintain separate category trees for expenses and for income ("sources").
- REQ-M014: The system shall allow the user to add, rename, and remove main categories and subcategories independently in the expense tree and the income tree.
- REQ-M015: If the user deletes a category that has existing transactions assigned to it, then the system shall relabel those transactions as "Uncategorized" rather than deleting or blocking the deletion.

### Satisfaction Tracking (optional feature)
- REQ-M016: The system shall support an optional "how do you feel about this purchase" prompt (e.g. happy / neutral / regret) on expense entries only.
- REQ-M017: Satisfaction tracking shall be independently toggleable in settings, defaulting to on.

### Recurring Entries
- REQ-M018: The system shall allow the user to define a recurring entry with name, type (income/expense), account, category, amount, frequency (weekly/biweekly/monthly/yearly), and — for monthly/yearly — a day-of-month; it shall accept an optional note.
- REQ-M019: The system shall track each recurring entry's last-handled date and determine when it is next due based on its frequency.
- REQ-M020: The system shall list currently-due recurring entries in a dedicated "needs attention" area, each with an action to log it or explicitly skip it for this cycle.
- REQ-M035: When the user logs a due recurring entry, the system shall create a transaction linked back to that recurring entry's definition, for traceability; subsequent edits to the recurring entry's template (amount, category, account, etc.) shall not retroactively alter transactions already logged from earlier cycles.

### Shopping Lists
- REQ-M021: The system shall allow the user to create multiple named shopping lists.
- REQ-M022: A shopping list item shall have name, category, quantity, estimated price, an optional note, and a status of pending or bought.
- REQ-M023: When the user marks a pending item as bought, the system shall prompt for actual price, account, and purchase date, shall automatically create a linked expense transaction using those values together with the item's name, category, and quantity, and shall move the item into that list's purchase history.
- REQ-M024: The system shall display, per shopping list, a pending-item count and the estimated-price total of pending items.
- REQ-M025: The system shall display each list's purchase history as a section separate from (and collapsible relative to) its pending items.

### Finance Dashboard & Insights
- REQ-M026: The system shall provide a period selector (Today / This week / This month / Last 3 months / Last 6 months / This year / Custom range) shared across finance views.
- REQ-M027: For the selected period, the system shall display total balance, income, expenses, and net. (See Open Questions — multi-currency aggregation needs a design.md decision before this can be built as stated for users with accounts in more than one currency.)
- REQ-M028: The system shall display a chart of income vs. expenses over the selected period.
- REQ-M029: The system shall display a net-worth-over-time chart with a selectable trailing window (e.g. 3/6/12/24 months), always including a zero baseline. (Same multi-currency caveat as REQ-M027.)
- REQ-M030: The system shall display expenses-by-category and income-by-source breakdown charts.
- REQ-M031: The system shall display each account's share of total positive balance as a chart, and shall list negative-balance accounts separately since they can't be represented as a pie/donut slice. (Same multi-currency caveat as REQ-M027.)
- REQ-M032: The system shall provide a full, searchable, filterable (by account and type) transaction history, embedded in the dashboard rather than a separate view.
- REQ-M033: The system shall allow the user to independently show or hide each chart type on the finance dashboard via settings.
- REQ-M034: If the user deletes a transaction that was auto-created from a shopping-list purchase (REQ-M023), the system shall revert that shopping item back to pending status (proposed default — flag if you'd rather the item simply stay "bought" with no linked transaction).

## Non-Functional Requirements
- Performance, security, and platform requirements follow PROJECT_PRINCIPLES.md; no finance-specific additions identified.

## Non-Goals
- This module will NOT include investment or stock-portfolio tracking (not requested).
- This module will NOT handle multi-currency conversion/exchange rates in this phase — accounts have a currency field, but cross-currency totals/conversion are out of scope unless requested later. (This creates an open tension with the aggregate-chart requirements below — see Open Questions.)
- This module will NOT auto-import transactions from bank feeds or APIs — manual entry only, consistent with the local-first principle.

## Edge Cases & Error Handling
- A recurring entry's category is later deleted: relabeled "Uncategorized," same handling as REQ-M015.
- A shopping list item is deleted while still pending: allowed, no balance/transaction impact since nothing was logged yet.
- A transaction auto-created from a shopping purchase is later deleted: the source shopping item reverts to pending, per REQ-M034.
- A transaction auto-created from a shopping purchase is later *edited* (e.g. amount corrected): needs a decision — should the shopping item's stored purchase-history price stay in sync with the edited transaction, or is it allowed to diverge? Flagged for design.md.

## Open Questions
- **Multi-currency aggregation (deferred to design.md — see requirements-product-vision.md Open Questions for full framing):** REQ-M027, M029, and M031 assume balances can be aggregated across accounts, which only cleanly works if those accounts share a currency; this needs a concrete resolution (e.g. single "primary" reporting currency vs. per-currency grouping) before that part of the dashboard is designed.
- **"Goal/target progress" for Money Management:** you selected this as a wanted insight type, but no budget or savings-target feature existed in the prior implementation. Does this mean: a per-category budget (e.g. "$300/mo on Food, 80% used"), a savings goal (e.g. "$5,000 emergency fund, 60% there"), or something else?
- **"Streak/consistency insight" for Money Management:** you also selected this, but it doesn't map as directly onto money as it does onto habits. Candidates: a no-spend-day streak, spending pace vs. typical pace for the period, or something else — needs your steer before this becomes a requirement rather than a guess.
- **Cross-currency transfers:** explicitly out of scope per the non-goal above, or should a transfer between two differently-curr­ency accounts be supported with a manual exchange rate?
- **Recurring entries left un-reviewed for multiple cycles:** does each missed cycle stack up as separate due items, or does "due" just track a single growing gap since the last handled date (as the prior implementation's "overdue since <date>" phrasing suggests)?

## Approval
- [ ] Approved by user on <date>
