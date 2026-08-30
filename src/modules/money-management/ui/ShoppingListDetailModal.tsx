// One shopping list's pending items (with Buy/Delete) and a collapsible
// purchase history section, separate from pending (REQ-M025).
//
// This pass fixes two things:
//  - Buying/adding/deleting an item only ever refreshed THIS modal's
//    own item list (via a local refreshKey) — the underlying Money
//    view behind it (account balances, shopping-list pending counts on
//    the card, recent transactions) stayed stale until a manual
//    refresh. `onChanged` is now called after every item-level
//    mutation too, not just list rename/delete, so the caller
//    (MoneyTrackerView) can refresh its own state right away.
//  - "Buy again" on a purchase-history row: clones that item back into
//    pending (same name/category/quantity, estimated price seeded
//    from what was actually paid last time) and immediately opens the
//    Buy flow for it, so re-buying something is one click instead of
//    re-typing it from scratch.

import React, { useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { MoneyService } from '../application/moneyService';
import { Account, ShoppingItem, ShoppingList } from '../domain/types';
import { ShoppingItemModal } from './ShoppingItemModal';
import { ShoppingItemBuyModal } from './ShoppingItemBuyModal';
import { RenameModal } from '../../../shared/ui-kit/RenameModal';
import { ConfirmModal } from '../../../shared/ui-kit/ConfirmModal';

interface ShoppingListDetailProps {
  app: App;
  moneyService: MoneyService;
  list: ShoppingList;
  accounts: Account[];
  /** Called after ANY change to this list or its items — rename, delete, item added/bought/deleted — so the host view can refresh its own state. `deleted`/`newName` are only meaningful for list-level changes. */
  onChanged: (deleted?: boolean, newName?: string) => void;
}

function ShoppingListDetail({ app, moneyService, list, accounts, onChanged }: ShoppingListDetailProps) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    moneyService.getShoppingItems(list.id).then(setItems);
  }, [list.id, moneyService, refreshKey]);

  /** Refetches this modal's own item list AND notifies the host view — every item-level mutation below goes through this instead of a purely local refresh. */
  const notifyChanged = () => {
    setRefreshKey((k) => k + 1);
    onChanged();
  };

  const pending = items.filter((i) => i.status === 'pending');
  const bought = items.filter((i) => i.status === 'bought').sort((a, b) => (b.purchasedDate ?? '').localeCompare(a.purchasedDate ?? ''));
  const estimatedTotal = pending.reduce((sum, i) => sum + (i.estimatedPrice ?? 0), 0);

  const handleDelete = async (item: ShoppingItem) => {
    await moneyService.deleteShoppingItem(item.id);
    notifyChanged();
  };

  const handleBuyAgain = async (historyItem: ShoppingItem) => {
    const newItem = await moneyService.addShoppingItem({
      listId: list.id,
      name: historyItem.name,
      categoryId: historyItem.categoryId,
      quantity: historyItem.quantity,
      estimatedPrice: historyItem.actualPrice,
    });
    notifyChanged();
    new ShoppingItemBuyModal(app, moneyService, newItem, accounts, notifyChanged).open();
  };

  return (
    <div className="ltk-shopping-detail">
      <div className="ltk-shopping-detail__summary">
        <span>{pending.length} pending</span>
        {estimatedTotal > 0 && <span>· est. {estimatedTotal.toFixed(2)}</span>}
        <button
          type="button"
          className="ltk-button--accent"
          onClick={() => new ShoppingItemModal(app, moneyService, list.id, notifyChanged).open()}
        >
          + Add item
        </button>
      </div>

      {pending.length === 0 && <p className="ltk-empty">Nothing pending.</p>}
      <ul className="ltk-shopping-items">
        {pending.map((item) => (
          <li key={item.id}>
            <span className="ltk-shopping-item__name">{item.name}</span>
            {item.quantity !== undefined && <span className="ltk-shopping-item__qty">×{item.quantity}</span>}
            {item.estimatedPrice !== undefined && (
              <span className="ltk-shopping-item__price">est. {item.estimatedPrice.toFixed(2)}</span>
            )}
            {item.dueDate && <span className="ltk-shopping-item__due">due {item.dueDate}</span>}
            <button
              type="button"
              onClick={() => new ShoppingItemBuyModal(app, moneyService, item, accounts, notifyChanged).open()}
            >
              Buy
            </button>
            <button type="button" onClick={() => handleDelete(item)}>
              Delete
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className="ltk-back-button" onClick={() => setShowHistory((v) => !v)}>
        {showHistory ? '▾' : '▸'} Purchase history ({bought.length})
      </button>
      {showHistory && (
        <ul className="ltk-shopping-items ltk-shopping-items--history">
          {bought.map((item) => (
            <li key={item.id}>
              <span className="ltk-shopping-item__name">{item.name}</span>
              <span className="ltk-shopping-item__price">{item.actualPrice?.toFixed(2)}</span>
              <span className="ltk-shopping-item__due">{item.purchasedDate}</span>
              <button type="button" onClick={() => handleBuyAgain(item)}>
                Buy again
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="ltk-shopping-detail__list-actions">
        <button
          type="button"
          onClick={() =>
            new RenameModal(app, 'Rename shopping list', list.name, async (newName) => {
              await moneyService.renameShoppingList(list.id, newName);
              onChanged(false, newName);
            }).open()
          }
        >
          Rename list
        </button>
        <button
          type="button"
          className="mod-warning"
          onClick={() =>
            new ConfirmModal(
              app,
              `Delete "${list.name}"?`,
              `This removes the list and all ${items.length} item(s) in it (pending and purchase history). Transactions already logged from purchases are not affected.`,
              async () => {
                await moneyService.deleteShoppingList(list.id);
                onChanged(true);
              }
            ).open()
          }
        >
          Delete list
        </button>
      </div>
    </div>
  );
}

export class ShoppingListDetailModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private moneyService: MoneyService,
    private list: ShoppingList,
    private accounts: Account[],
    /** Called on every change — item add/buy/delete, or list rename/delete — so the host view (MoneyTrackerView) can refresh its own data. */
    private onChanged: () => void = () => {}
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.list.name);
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <ShoppingListDetail
          app={this.app}
          moneyService={this.moneyService}
          list={this.list}
          accounts={this.accounts}
          onChanged={(deleted, newName) => {
            this.onChanged();
            if (deleted) {
              this.close();
            } else if (newName) {
              this.list = { ...this.list, name: newName };
              this.titleEl.setText(newName);
            }
          }}
        />
      </ErrorBoundary>
    );
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
  }
}
