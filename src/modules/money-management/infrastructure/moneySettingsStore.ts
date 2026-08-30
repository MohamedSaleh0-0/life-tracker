// CRUD for Account[], Category[], ExchangeRates, RecurringEntry[],
// ShoppingList[]/ShoppingItem[], and CategoryBudget[] against the
// plugin's settings blob (REQ-C008), under their own top-level keys —
// same data.json, separate keys from other modules'. Recurring
// entries, shopping items, and budgets are definitions/state that
// change over time but aren't time-series log data the way
// transactions are, so per PROJECT_PRINCIPLES.md's storage model they
// belong in settings, not the markdown log.

import { Account, Category, ExchangeRates, RecurringEntry, ShoppingList, ShoppingItem, CategoryBudget } from '../domain/types';
import { SettingsAdapter } from '../../../core/ports/settingsAdapter';

interface LifeTrackerData {
  accounts?: Account[];
  categories?: Category[];
  exchangeRates?: ExchangeRates;
  recurringEntries?: RecurringEntry[];
  shoppingLists?: ShoppingList[];
  shoppingItems?: ShoppingItem[];
  categoryBudgets?: CategoryBudget[];
  [key: string]: unknown;
}

const DEFAULT_RATES: ExchangeRates = { primaryCurrency: 'USD', ratesToPrimary: {} };

export class MoneySettingsStore {
  constructor(private adapter: SettingsAdapter) {}

  // --- Accounts ---

  async getAccounts(): Promise<Account[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.accounts ?? [];
  }

  async getAccount(id: string): Promise<Account | undefined> {
    const all = await this.getAccounts();
    return all.find((a) => a.id === id);
  }

  async createAccount(account: Account): Promise<Account> {
    const all = await this.getAccounts();
    all.push(account);
    await this.saveAccounts(all);
    return account;
  }

  async updateAccount(id: string, patch: Partial<Account>): Promise<Account> {
    const all = await this.getAccounts();
    const idx = all.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`Account not found: ${id}`);
    const updated: Account = { ...all[idx], ...patch, id: all[idx].id };
    all[idx] = updated;
    await this.saveAccounts(all);
    return updated;
  }

  private async saveAccounts(accounts: Account[]): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.accounts = accounts;
    await this.adapter.save(data);
  }

  // --- Categories ---

  async getCategories(): Promise<Category[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.categories ?? [];
  }

  async createCategory(category: Category): Promise<Category> {
    const all = await this.getCategories();
    all.push(category);
    await this.saveCategories(all);
    return category;
  }

  async renameCategory(id: string, name: string): Promise<Category> {
    const all = await this.getCategories();
    const idx = all.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Category not found: ${id}`);
    all[idx] = { ...all[idx], name };
    await this.saveCategories(all);
    return all[idx];
  }

  /** Removes a category (and, per REQ-M012, its subcategories if it's a main category). Existing transactions referencing it are left as-is; they resolve to "Uncategorized" at read time (REQ-M015), not rewritten here. Also removes any budget set on it (or its subcategories). */
  async deleteCategory(id: string): Promise<void> {
    const all = await this.getCategories();
    const removedIds = new Set(all.filter((c) => c.id === id || c.parentId === id).map((c) => c.id));
    const remaining = all.filter((c) => !removedIds.has(c.id));
    await this.saveCategories(remaining);

    const budgets = await this.getCategoryBudgets();
    const remainingBudgets = budgets.filter((b) => !removedIds.has(b.categoryId));
    if (remainingBudgets.length !== budgets.length) {
      await this.saveCategoryBudgets(remainingBudgets);
    }
  }

  private async saveCategories(categories: Category[]): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.categories = categories;
    await this.adapter.save(data);
  }

  // --- Exchange rates ---

  async getExchangeRates(): Promise<ExchangeRates> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.exchangeRates ?? DEFAULT_RATES;
  }

  async setExchangeRates(rates: ExchangeRates): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.exchangeRates = rates;
    await this.adapter.save(data);
  }

  // --- Recurring entries (REQ-M018-M020) ---

  async getRecurringEntries(): Promise<RecurringEntry[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.recurringEntries ?? [];
  }

  async createRecurringEntry(entry: RecurringEntry): Promise<RecurringEntry> {
    const all = await this.getRecurringEntries();
    all.push(entry);
    await this.saveRecurringEntries(all);
    return entry;
  }

  async updateRecurringEntry(id: string, patch: Partial<RecurringEntry>): Promise<RecurringEntry> {
    const all = await this.getRecurringEntries();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Recurring entry not found: ${id}`);
    const updated: RecurringEntry = { ...all[idx], ...patch, id: all[idx].id };
    all[idx] = updated;
    await this.saveRecurringEntries(all);
    return updated;
  }

  private async saveRecurringEntries(entries: RecurringEntry[]): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.recurringEntries = entries;
    await this.adapter.save(data);
  }

  // --- Shopping lists & items (REQ-M021-M025) ---

  async getShoppingLists(): Promise<ShoppingList[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.shoppingLists ?? [];
  }

  async createShoppingList(list: ShoppingList): Promise<ShoppingList> {
    const all = await this.getShoppingLists();
    all.push(list);
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.shoppingLists = all;
    await this.adapter.save(data);
    return list;
  }

  async updateShoppingList(id: string, patch: Partial<ShoppingList>): Promise<ShoppingList> {
    const all = await this.getShoppingLists();
    const idx = all.findIndex((l) => l.id === id);
    if (idx === -1) throw new Error(`Shopping list not found: ${id}`);
    const updated: ShoppingList = { ...all[idx], ...patch, id: all[idx].id };
    all[idx] = updated;
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.shoppingLists = all;
    await this.adapter.save(data);
    return updated;
  }

  async deleteShoppingList(id: string): Promise<void> {
    const lists = (await this.getShoppingLists()).filter((l) => l.id !== id);
    const items = (await this.getShoppingItems()).filter((i) => i.listId !== id);
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.shoppingLists = lists;
    data.shoppingItems = items;
    await this.adapter.save(data);
  }

  async getShoppingItems(): Promise<ShoppingItem[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.shoppingItems ?? [];
  }

  async createShoppingItem(item: ShoppingItem): Promise<ShoppingItem> {
    const all = await this.getShoppingItems();
    all.push(item);
    await this.saveShoppingItems(all);
    return item;
  }

  async updateShoppingItem(id: string, patch: Partial<ShoppingItem>): Promise<ShoppingItem> {
    const all = await this.getShoppingItems();
    const idx = all.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error(`Shopping item not found: ${id}`);
    const updated: ShoppingItem = { ...all[idx], ...patch, id: all[idx].id };
    all[idx] = updated;
    await this.saveShoppingItems(all);
    return updated;
  }

  async deleteShoppingItem(id: string): Promise<void> {
    const all = (await this.getShoppingItems()).filter((i) => i.id !== id);
    await this.saveShoppingItems(all);
  }

  private async saveShoppingItems(items: ShoppingItem[]): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.shoppingItems = items;
    await this.adapter.save(data);
  }

  // --- Budgets ---

  async getCategoryBudgets(): Promise<CategoryBudget[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.categoryBudgets ?? [];
  }

  async setCategoryBudget(categoryId: string, monthlyLimit: number): Promise<CategoryBudget> {
    const all = await this.getCategoryBudgets();
    const idx = all.findIndex((b) => b.categoryId === categoryId);
    const budget: CategoryBudget = { categoryId, monthlyLimit };
    if (idx === -1) {
      all.push(budget);
    } else {
      all[idx] = budget;
    }
    await this.saveCategoryBudgets(all);
    return budget;
  }

  async removeCategoryBudget(categoryId: string): Promise<void> {
    const all = await this.getCategoryBudgets();
    await this.saveCategoryBudgets(all.filter((b) => b.categoryId !== categoryId));
  }

  private async saveCategoryBudgets(budgets: CategoryBudget[]): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.categoryBudgets = budgets;
    await this.adapter.save(data);
  }
}
