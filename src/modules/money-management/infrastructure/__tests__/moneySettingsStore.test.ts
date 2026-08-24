import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MoneySettingsStore } from '../moneySettingsStore';
import { FakeSettingsAdapter } from '../../../../core/ports/__tests__/fakeSettingsAdapter';
import { Account, Category } from '../../domain/types';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Wallet',
    currency: 'USD',
    openingBalance: 0,
    archived: false,
    createdAt: '2026-01-01',
    order: 0,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return { id: 'c1', kind: 'expense', name: 'Food', order: 0, ...overrides };
}

describe('MoneySettingsStore accounts', () => {
  test('create then getAccounts/getAccount', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    const account = makeAccount();
    await store.createAccount(account);
    assert.deepEqual(await store.getAccounts(), [account]);
    assert.deepEqual(await store.getAccount('a1'), account);
  });

  test('update preserves id and untouched fields', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createAccount(makeAccount());
    const updated = await store.updateAccount('a1', { name: 'Main wallet' });
    assert.equal(updated.name, 'Main wallet');
    assert.equal(updated.currency, 'USD');
  });
});

describe('MoneySettingsStore categories', () => {
  test('create then getCategories', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createCategory(makeCategory());
    assert.equal((await store.getCategories()).length, 1);
  });

  test('renameCategory updates only the name', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createCategory(makeCategory({ name: 'Food' }));
    const renamed = await store.renameCategory('c1', 'Groceries');
    assert.equal(renamed.name, 'Groceries');
  });

  test('deleteCategory removes it and its subcategories (REQ-M012 scoping)', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createCategory(makeCategory({ id: 'food', name: 'Food' }));
    await store.createCategory(makeCategory({ id: 'junk', name: 'Junk', parentId: 'food' }));
    await store.createCategory(makeCategory({ id: 'transport', name: 'Transport' }));

    await store.deleteCategory('food');

    const remaining = await store.getCategories();
    assert.deepEqual(
      remaining.map((c) => c.id).sort(),
      ['transport']
    );
  });
});

describe('MoneySettingsStore exchange rates', () => {
  test('defaults to USD primary with no configured rates', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    const rates = await store.getExchangeRates();
    assert.equal(rates.primaryCurrency, 'USD');
    assert.deepEqual(rates.ratesToPrimary, {});
  });

  test('round-trips a saved configuration', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.setExchangeRates({ primaryCurrency: 'USD', ratesToPrimary: { EGP: 0.02 } });
    const rates = await store.getExchangeRates();
    assert.equal(rates.ratesToPrimary.EGP, 0.02);
  });
});

describe('MoneySettingsStore recurring entries', () => {
  function makeEntry(overrides: Partial<import('../../domain/types').RecurringEntry> = {}) {
    return {
      id: 'r1',
      name: 'Netflix',
      type: 'expense' as const,
      accountId: 'a1',
      amount: 15,
      frequency: 'monthly' as const,
      dayOfMonth: 1,
      archived: false,
      createdAt: '2026-01-01',
      order: 0,
      ...overrides,
    };
  }

  test('create then getRecurringEntries', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createRecurringEntry(makeEntry());
    assert.equal((await store.getRecurringEntries()).length, 1);
  });

  test('update preserves id and untouched fields, e.g. bumping lastHandledDate', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createRecurringEntry(makeEntry());
    const updated = await store.updateRecurringEntry('r1', { lastHandledDate: '2026-02-01' });
    assert.equal(updated.lastHandledDate, '2026-02-01');
    assert.equal(updated.name, 'Netflix');
  });
});

describe('MoneySettingsStore shopping lists & items', () => {
  test('create then getShoppingLists', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createShoppingList({ id: 'l1', name: 'Groceries', archived: false, createdAt: '2026-01-01', order: 0 });
    assert.equal((await store.getShoppingLists()).length, 1);
  });

  test('deleteShoppingList also removes its items', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createShoppingList({ id: 'l1', name: 'Groceries', archived: false, createdAt: '2026-01-01', order: 0 });
    await store.createShoppingItem({
      id: 'i1',
      listId: 'l1',
      name: 'Milk',
      status: 'pending',
      createdAt: '2026-01-01',
      order: 0,
    });

    await store.deleteShoppingList('l1');

    assert.equal((await store.getShoppingLists()).length, 0);
    assert.equal((await store.getShoppingItems()).length, 0);
  });

  test('updateShoppingItem marks bought with purchase-history fields', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createShoppingItem({
      id: 'i1',
      listId: 'l1',
      name: 'Milk',
      status: 'pending',
      createdAt: '2026-01-01',
      order: 0,
    });

    const updated = await store.updateShoppingItem('i1', {
      status: 'bought',
      purchasedDate: '2026-01-05',
      actualPrice: 3.5,
      accountId: 'a1',
      transactionId: 't1',
    });

    assert.equal(updated.status, 'bought');
    assert.equal(updated.actualPrice, 3.5);
  });

  test('deleteShoppingItem removes only that item', async () => {
    const store = new MoneySettingsStore(new FakeSettingsAdapter());
    await store.createShoppingItem({ id: 'i1', listId: 'l1', name: 'Milk', status: 'pending', createdAt: '2026-01-01', order: 0 });
    await store.createShoppingItem({ id: 'i2', listId: 'l1', name: 'Bread', status: 'pending', createdAt: '2026-01-01', order: 1 });

    await store.deleteShoppingItem('i1');

    const remaining = await store.getShoppingItems();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 'i2');
  });
});
