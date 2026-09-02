// Create/edit an individual shopping list item (REQ-M022).
// Supports category assignment, quantity, estimated price, optional note, and due date.
// Gated by FeatureFlags (REQ-C006).

import React, { useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { MoneyService } from '../application/moneyService';
import { ShoppingItem } from '../domain/types';
import { CategoryNode } from '../domain/categoryTree';
import { FeatureFlags, DEFAULT_FEATURE_FLAGS } from '../../../core/featureFlags';

interface ShoppingItemFormProps {
  moneyService: MoneyService;
  listId: string;
  existingItem?: ShoppingItem;
  featureFlags?: FeatureFlags;
  onCancel: () => void;
  onSaved: () => void;
}

function ShoppingItemForm({
  moneyService,
  listId,
  existingItem,
  featureFlags,
  onCancel,
  onSaved,
}: ShoppingItemFormProps) {
  const flags = featureFlags ?? DEFAULT_FEATURE_FLAGS;
  const [name, setName] = useState(existingItem?.name ?? '');
  const [categoryId, setCategoryId] = useState(existingItem?.categoryId ?? '');
  const [quantity, setQuantity] = useState(existingItem?.quantity !== undefined ? String(existingItem.quantity) : '1');
  const [estimatedPrice, setEstimatedPrice] = useState(
    existingItem?.estimatedPrice !== undefined ? String(existingItem.estimatedPrice) : ''
  );
  const [note, setNote] = useState(existingItem?.note ?? '');
  const [dueDate, setDueDate] = useState(existingItem?.dueDate ?? '');

  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      moneyService.getCategoryTree('expense'),
      moneyService.getRecentItemNames(),
    ]).then(([tree, names]) => {
      if (!cancelled) {
        setCategoryTree(tree);
        setRecentNames(names);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [moneyService]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') {
      setError('Enter an item name.');
      return;
    }
    const parsedQty = flags.moneyTransactionQuantity && quantity.trim() ? Number(quantity) : undefined;
    const parsedPrice = estimatedPrice.trim() ? Number(estimatedPrice) : undefined;
    if (parsedPrice !== undefined && (Number.isNaN(parsedPrice) || parsedPrice < 0)) {
      setError('Estimated price must be a valid positive number.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const input = {
        listId,
        name: name.trim(),
        categoryId: categoryId || undefined,
        quantity: parsedQty,
        estimatedPrice: parsedPrice,
        note: flags.moneyTransactionNotes && note.trim() ? note.trim() : undefined,
        dueDate: flags.moneyShoppingDueDates && dueDate.trim() ? dueDate.trim() : undefined,
      };

      if (existingItem) {
        await moneyService.updateShoppingItemDetails(existingItem.id, input);
      } else {
        await moneyService.addShoppingItem(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  };

  return (
    <form className="ltk-entry-form" onSubmit={handleSubmit}>
      <label>
        Item name
        <input
          list="recent-shopping-items"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Milk, Apples"
          autoFocus
          required
        />
        <datalist id="recent-shopping-items">
          {recentNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </label>

      <label>
        Category (optional)
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">(Uncategorized)</option>
          {categoryTree.map((node) => (
            <optgroup key={node.category.id} label={node.category.name}>
              <option value={node.category.id}>{node.category.name}</option>
              {node.children.map((child) => (
                <option key={child.id} value={child.id}>
                  ↳ {child.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="ltk-entry-form__row">
        {flags.moneyTransactionQuantity && (
          <label>
            Quantity
            <input
              type="number"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
            />
          </label>
        )}
        <label>
          Estimated price (optional)
          <input
            type="number"
            step="any"
            value={estimatedPrice}
            onChange={(e) => setEstimatedPrice(e.target.value)}
            placeholder="0.00"
          />
        </label>
      </div>

      {flags.moneyShoppingDueDates && (
        <label>
          Due date (optional)
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      )}

      {flags.moneyTransactionNotes && (
        <label>
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2% organic only" />
        </label>
      )}

      {error && <p className="ltk-form-error">{error}</p>}

      <div className="ltk-entry-form__actions">
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="ltk-button--accent" disabled={submitting}>
          {existingItem ? 'Save' : 'Add'}
        </button>
      </div>
    </form>
  );
}

export class ShoppingItemModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private moneyService: MoneyService,
    private listId: string,
    private onSaved: () => void,
    private existingItem?: ShoppingItem,
    private featureFlags?: FeatureFlags
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.existingItem ? 'Edit item' : 'Add item');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <ShoppingItemForm
          moneyService={this.moneyService}
          listId={this.listId}
          existingItem={this.existingItem}
          featureFlags={this.featureFlags}
          onCancel={() => this.close()}
          onSaved={() => {
            this.onSaved();
            this.close();
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