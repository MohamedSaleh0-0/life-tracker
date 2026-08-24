import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MoneyService } from '../moneyService';
import { MoneySettingsStore } from '../../infrastructure/moneySettingsStore';
import { TransactionLogFile } from '../../infrastructure/transactionLogFile';
import { FakeSettingsAdapter } from '../../../../core/ports/__tests__/fakeSettingsAdapter';
import { FakeVaultAdapter } from '../../../../core/ports/__tests__/fakeVaultAdapter';

function makeService(fixedToday = '2026-08-19') {
  const settingsStore = new MoneySettingsStore(new FakeSettingsAdapter());
  const logFile = new TransactionLogFile(new FakeVaultAdapter());
  let idCounter = 0;
  const service = new MoneyService({
    settingsStore,
    logFile,
    idGenerator: () => `id${++idCounter}`,
    clock: () => new Date(`${fixedToday}T12:00:00`),
  });
  return { service, settingsStore, logFile };
}

describe('MoneyService accounts & balances', () => {
  test('a fresh account with no transactions shows its opening balance', async () => {
    const { service } = makeService();
    await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 100);
  });

  test('recording an expense reduces the balance (REQ-M004/M007)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    await service.recordTransaction({ date: '2026-08-19', accountId: account.id, type: 'expense', amount: -20 });

    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 80);
  });

  test('deleting a transaction updates the balance (REQ-M008)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    const tx = await service.recordTransaction({
      date: '2026-08-19',
      accountId: account.id,
      type: 'expense',
      amount: -20,
    });

    await service.deleteTransaction('2026-08-19', tx.id);

    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 100);
  });

  test('a transfer moves money between two accounts, net-zero overall (REQ-M002/M003)', async () => {
    const { service } = makeService();
    const checking = await service.createAccount({ name: 'Checking', currency: 'USD', openingBalance: 500 });
    const savings = await service.createAccount({ name: 'Savings', currency: 'USD', openingBalance: 0 });

    await service.recordTransfer({
      date: '2026-08-19',
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amount: 100,
    });

    const withBalances = await service.getAccountsWithBalances();
    const checkingBalance = withBalances.find((w) => w.account.id === checking.id)?.balance;
    const savingsBalance = withBalances.find((w) => w.account.id === savings.id)?.balance;
    assert.equal(checkingBalance, 400);
    assert.equal(savingsBalance, 100);
  });

  test('an archived account is excluded from getAccounts/getAccountsWithBalances', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Old', currency: 'USD', openingBalance: 0 });
    await service.updateAccount(account.id, { archived: true });

    assert.deepEqual(await service.getAccounts(), []);
    assert.deepEqual(await service.getAccountsWithBalances(), []);
  });
});

describe('MoneyService currency conversion / net worth', () => {
  test('getNetWorth sums accounts already in the primary currency', async () => {
    const { service } = makeService();
    await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    await service.createAccount({ name: 'Savings', currency: 'USD', openingBalance: 50 });

    const { total, excludedAccounts } = await service.getNetWorth();
    assert.equal(total, 150);
    assert.equal(excludedAccounts.length, 0);
  });

  test('applies a configured rate to convert a non-primary-currency account', async () => {
    const { service } = makeService();
    await service.setExchangeRates({ primaryCurrency: 'USD', ratesToPrimary: { EGP: 0.02 } });
    await service.createAccount({ name: 'USD wallet', currency: 'USD', openingBalance: 100 });
    await service.createAccount({ name: 'EGP wallet', currency: 'EGP', openingBalance: 1000 });

    const { total, excludedAccounts } = await service.getNetWorth();
    assert.equal(total, 120); // 100 + (1000 * 0.02)
    assert.equal(excludedAccounts.length, 0);
  });

  test('excludes (rather than mis-includes) an account whose currency has no configured rate', async () => {
    const { service } = makeService();
    await service.createAccount({ name: 'USD wallet', currency: 'USD', openingBalance: 100 });
    await service.createAccount({ name: 'JPY wallet', currency: 'JPY', openingBalance: 10000 });

    const { total, excludedAccounts } = await service.getNetWorth();
    assert.equal(total, 100);
    assert.equal(excludedAccounts.length, 1);
    assert.equal(excludedAccounts[0].currency, 'JPY');
  });
});

describe('MoneyService categories', () => {
  test('deleting a category leaves existing transactions resolving to Uncategorized (REQ-M015)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 0 });
    const category = await service.createCategory({ kind: 'expense', name: 'Food' });
    const tx = await service.recordTransaction({
      date: '2026-08-19',
      accountId: account.id,
      type: 'expense',
      categoryId: category.id,
      amount: -10,
    });

    await service.deleteCategory(category.id);

    const label = await service.resolveCategoryLabel(tx.categoryId);
    assert.equal(label, 'Uncategorized');
  });
});

describe('MoneyService.undoLastTransaction', () => {
  test('removes the most recently recorded transaction', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    await service.recordTransaction({ date: '2026-08-19', accountId: account.id, type: 'expense', amount: -20 });

    const undone = await service.undoLastTransaction();
    assert.equal(undone, true);

    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 100);
  });

  test('undoes both legs of the most recent transfer', async () => {
    const { service } = makeService();
    const checking = await service.createAccount({ name: 'Checking', currency: 'USD', openingBalance: 500 });
    const savings = await service.createAccount({ name: 'Savings', currency: 'USD', openingBalance: 0 });
    await service.recordTransfer({ date: '2026-08-19', fromAccountId: checking.id, toAccountId: savings.id, amount: 100 });

    await service.undoLastTransaction();

    const withBalances = await service.getAccountsWithBalances();
    assert.equal(withBalances.find((w) => w.account.id === checking.id)?.balance, 500);
    assert.equal(withBalances.find((w) => w.account.id === savings.id)?.balance, 0);
  });

  test('returns false when nothing has been recorded this session', async () => {
    const { service } = makeService();
    assert.equal(await service.undoLastTransaction(), false);
  });

  test('a second undo call after the first is a no-op (nothing left to undo)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    await service.recordTransaction({ date: '2026-08-19', accountId: account.id, type: 'expense', amount: -20 });

    assert.equal(await service.undoLastTransaction(), true);
    assert.equal(await service.undoLastTransaction(), false);
  });
});

describe('MoneyService.getIncomeExpenseTotals', () => {
  test('excludes transfers from the totals', async () => {
    const { service } = makeService();
    const checking = await service.createAccount({ name: 'Checking', currency: 'USD', openingBalance: 500 });
    const savings = await service.createAccount({ name: 'Savings', currency: 'USD', openingBalance: 0 });
    await service.recordTransaction({ date: '2026-08-19', accountId: checking.id, type: 'income', amount: 1000 });
    await service.recordTransfer({ date: '2026-08-19', fromAccountId: checking.id, toAccountId: savings.id, amount: 200 });

    const totals = await service.getIncomeExpenseTotals('2026-08-01', '2026-08-31');
    assert.equal(totals.income, 1000);
    assert.equal(totals.expense, 0);
  });
});

describe('MoneyService.getRecentNames / getPriceHistory', () => {
  test('getRecentNames deduplicates and returns most recent first (REQ-M009)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 0 });
    await service.recordTransaction({ date: '2026-08-17', accountId: account.id, type: 'expense', amount: -5, name: 'Coffee' });
    await service.recordTransaction({ date: '2026-08-19', accountId: account.id, type: 'expense', amount: -5, name: 'Coffee' });
    await service.recordTransaction({ date: '2026-08-18', accountId: account.id, type: 'expense', amount: -30, name: 'Groceries' });

    const names = await service.getRecentNames();
    assert.deepEqual(names, ['Coffee', 'Groceries']);
  });

  test('getPriceHistory returns every logged amount for that exact name, oldest first (REQ-M011)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 0 });
    await service.recordTransaction({ date: '2026-08-19', accountId: account.id, type: 'expense', amount: -6, name: 'Coffee' });
    await service.recordTransaction({ date: '2026-08-17', accountId: account.id, type: 'expense', amount: -5, name: 'Coffee' });

    const history = await service.getPriceHistory('Coffee');
    assert.deepEqual(history.map((h) => h.date), ['2026-08-17', '2026-08-19']);
  });
});

describe('MoneyService transaction time-of-day', () => {
  test('defaults to the current time from the clock when not provided', async () => {
    const { service } = makeService('2026-08-19'); // fixed clock is T12:00:00
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 0 });
    const tx = await service.recordTransaction({ date: '2026-08-19', accountId: account.id, type: 'expense', amount: -5 });
    assert.equal(tx.time, '12:00');
  });

  test('an explicitly provided time is used instead of the clock', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 0 });
    const tx = await service.recordTransaction({
      date: '2026-08-19',
      time: '07:45',
      accountId: account.id,
      type: 'expense',
      amount: -5,
    });
    assert.equal(tx.time, '07:45');
  });
});

describe('MoneyService recurring entries', () => {
  test('a newly created recurring entry is not due until its frequency has elapsed', async () => {
    const { service } = makeService('2026-08-01');
    const account = await service.createAccount({ name: 'Checking', currency: 'USD', openingBalance: 0 });
    await service.createRecurringEntry({
      name: 'Netflix',
      type: 'expense',
      accountId: account.id,
      amount: 15,
      frequency: 'monthly',
      dayOfMonth: 1,
    });

    assert.deepEqual(await service.getDueRecurringEntries(), []);
  });

  test('logRecurringEntry creates a linked transaction and advances lastHandledDate (REQ-M035)', async () => {
    const { service } = makeService('2026-09-01');
    const account = await service.createAccount({ name: 'Checking', currency: 'USD', openingBalance: 100 });
    const entry = await service.createRecurringEntry({
      name: 'Netflix',
      type: 'expense',
      accountId: account.id,
      amount: 15,
      frequency: 'monthly',
      dayOfMonth: 1,
    });
    // Force it into a due state: last handled a month ago -> next due 2026-09-01, today is 2026-09-01.
    await service.updateRecurringEntry(entry.id, { lastHandledDate: '2026-08-01' });

    const due = await service.getDueRecurringEntries();
    assert.equal(due.length, 1);

    const tx = await service.logRecurringEntry(entry.id, '2026-09-01');
    assert.equal(tx.recurringEntryId, entry.id);
    assert.equal(tx.amount, -15);

    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 85);

    assert.deepEqual(await service.getDueRecurringEntries(), []); // no longer due right after logging
  });

  test('skipRecurringEntry advances lastHandledDate without creating a transaction', async () => {
    const { service } = makeService('2026-09-01');
    const account = await service.createAccount({ name: 'Checking', currency: 'USD', openingBalance: 100 });
    const entry = await service.createRecurringEntry({
      name: 'Netflix',
      type: 'expense',
      accountId: account.id,
      amount: 15,
      frequency: 'monthly',
      dayOfMonth: 1,
    });

    await service.skipRecurringEntry(entry.id, '2026-09-01');

    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 100); // unchanged — nothing logged
    assert.deepEqual(await service.getDueRecurringEntries(), []);
  });

  test('editing the recurring template does not retroactively alter transactions already logged (REQ-M035)', async () => {
    const { service } = makeService('2026-09-01');
    const account = await service.createAccount({ name: 'Checking', currency: 'USD', openingBalance: 0 });
    const entry = await service.createRecurringEntry({
      name: 'Netflix',
      type: 'expense',
      accountId: account.id,
      amount: 15,
      frequency: 'monthly',
      dayOfMonth: 1,
    });
    const tx = await service.logRecurringEntry(entry.id, '2026-09-01');

    await service.updateRecurringEntry(entry.id, { amount: 25 }); // price increase going forward

    const stillLogged = (await service.listTransactions('2026-09-01', '2026-09-01')).find((t) => t.id === tx.id);
    assert.equal(stillLogged?.amount, -15); // untouched
  });
});

describe('MoneyService shopping lists', () => {
  test('addShoppingItem accepts an unknown price at add-time (REQ-M022)', async () => {
    const { service } = makeService();
    const list = await service.createShoppingList('Groceries');
    const item = await service.addShoppingItem({ listId: list.id, name: 'Milk' });
    assert.equal(item.estimatedPrice, undefined);
    assert.equal(item.status, 'pending');
  });

  test('getShoppingListSummary counts pending items and sums estimated price (REQ-M024)', async () => {
    const { service } = makeService();
    const list = await service.createShoppingList('Groceries');
    await service.addShoppingItem({ listId: list.id, name: 'Milk', estimatedPrice: 3 });
    await service.addShoppingItem({ listId: list.id, name: 'Bread', estimatedPrice: 2 });
    await service.addShoppingItem({ listId: list.id, name: 'Eggs' }); // unknown price

    const summary = await service.getShoppingListSummary(list.id);
    assert.equal(summary.pendingCount, 3);
    assert.equal(summary.estimatedTotal, 5);
  });

  test('markShoppingItemBought creates a linked expense transaction and moves the item to purchase history (REQ-M023)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    const list = await service.createShoppingList('Groceries');
    const item = await service.addShoppingItem({ listId: list.id, name: 'Milk', quantity: 2, estimatedPrice: 3 });

    const tx = await service.markShoppingItemBought(item.id, { actualPrice: 3.5, accountId: account.id, date: '2026-08-19' });

    assert.equal(tx.shoppingItemId, item.id);
    assert.equal(tx.amount, -3.5);
    assert.equal(tx.name, 'Milk');
    assert.equal(tx.quantity, 2);

    const items = await service.getShoppingItems(list.id);
    const bought = items.find((i) => i.id === item.id);
    assert.equal(bought?.status, 'bought');
    assert.equal(bought?.actualPrice, 3.5);
    assert.equal(bought?.transactionId, tx.id);

    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 96.5);
  });

  test('deleting the auto-created transaction reverts the shopping item to pending (REQ-M034)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    const list = await service.createShoppingList('Groceries');
    const item = await service.addShoppingItem({ listId: list.id, name: 'Milk' });
    const tx = await service.markShoppingItemBought(item.id, { actualPrice: 3.5, accountId: account.id, date: '2026-08-19' });

    await service.deleteTransaction('2026-08-19', tx.id);

    const items = await service.getShoppingItems(list.id);
    const reverted = items.find((i) => i.id === item.id);
    assert.equal(reverted?.status, 'pending');
    assert.equal(reverted?.transactionId, undefined);
    assert.equal(reverted?.actualPrice, undefined);
  });

  test('undoing the last transaction also reverts a shopping purchase (REQ-M010 + M034 explicit interaction)', async () => {
    const { service } = makeService();
    const account = await service.createAccount({ name: 'Wallet', currency: 'USD', openingBalance: 100 });
    const list = await service.createShoppingList('Groceries');
    const item = await service.addShoppingItem({ listId: list.id, name: 'Milk' });
    await service.markShoppingItemBought(item.id, { actualPrice: 3.5, accountId: account.id, date: '2026-08-19' });

    await service.undoLastTransaction();

    const items = await service.getShoppingItems(list.id);
    assert.equal(items.find((i) => i.id === item.id)?.status, 'pending');
    const [withBalance] = await service.getAccountsWithBalances();
    assert.equal(withBalance.balance, 100);
  });

  test('deleteShoppingList also removes its items', async () => {
    const { service } = makeService();
    const list = await service.createShoppingList('Groceries');
    await service.addShoppingItem({ listId: list.id, name: 'Milk' });

    await service.deleteShoppingList(list.id);

    assert.deepEqual(await service.getShoppingLists(), []);
    assert.deepEqual(await service.getShoppingItems(list.id), []);
  });
});
