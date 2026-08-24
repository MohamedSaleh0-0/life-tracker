// One shopping list's pending items (with Buy/Delete) and a collapsible
// purchase history section, separate from pending (REQ-M025).

import React, { useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { MoneyService } from '../application/moneyService';
import { Account, ShoppingItem, ShoppingList } from '../domain/types';
import { ShoppingItemModal } from './ShoppingItemModal';
import { ShoppingItemBuyModal } from './ShoppingItemBuyModal';

interface ShoppingListDetailProps {
  app: App;
  moneyService: MoneyService;
  list: ShoppingList;
  accounts: Account[];
}

function ShoppingListDetail({ app, moneyService, list, accounts }: ShoppingListDetailProps) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    moneyService.getShoppingItems(list.id).then(setItems);
  }, [list.id, moneyService, refreshKey]);

  const pending = items.filter((i) => i.status === 'pending');
  const bought = items.filter((i) => i.status === 'bought').sort((a, b) => (b.purchasedDate ?? '').localeCompare(a.purchasedDate ?? ''));
  const estimatedTotal = pending.reduce((sum, i) => sum + (i.estimatedPrice ?? 0), 0);

  const handleDelete = async (item: ShoppingItem) => {
    await moneyService.deleteShoppingItem(item.id);
    refresh();
  };

  return (
    <div className="ltk-shopping-detail">
      <div className="ltk-shopping-detail__summary">
        <span>{pending.length} pending</span>
        {estimatedTotal > 0 && <span>· est. {estimatedTotal.toFixed(2)}</span>}
        <button
          type="button"
          className="ltk-button--accent"
          onClick={() => new ShoppingItemModal(app, moneyService, list.id, refresh).open()}
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
              onClick={() => new ShoppingItemBuyModal(app, moneyService, item, accounts, refresh).open()}
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export class ShoppingListDetailModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private moneyService: MoneyService,
    private list: ShoppingList,
    private accounts: Account[]
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.list.name);
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <ShoppingListDetail app={this.app} moneyService={this.moneyService} list={this.list} accounts={this.accounts} />
      </ErrorBoundary>
    );
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
  }
}
