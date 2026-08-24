// Add an item to a shopping list (REQ-M022) — name, category, quantity,
// optional estimated price (can be decided later, at purchase time —
// REQ-M022's explicit allowance), optional note, optional due date.

import React, { useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { MoneyService } from '../application/moneyService';
import { CategoryNode } from '../domain/categoryTree';

interface ShoppingItemFormProps {
  moneyService: MoneyService;
  listId: string;
  onCancel: () => void;
  onSaved: () => void;
}

function ShoppingItemForm({ moneyService, listId, onCancel, onSaved }: ShoppingItemFormProps) {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    moneyService.getCategoryTree('expense').then(setCategoryTree);
  }, [moneyService]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') {
      setError('Enter a name.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await moneyService.addShoppingItem({
        listId,
        name: name.trim(),
        categoryId: categoryId || undefined,
        quantity: quantity ? Number(quantity) : undefined,
        estimatedPrice: estimatedPrice.trim() !== '' ? Number(estimatedPrice) : undefined,
        note: note || undefined,
        dueDate: dueDate || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="ltk-entry-form" onSubmit={handleSubmit}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Milk" autoFocus />
      </label>
      <label>
        Category (optional)
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Uncategorized</option>
          {categoryTree.map((node) => (
            <React.Fragment key={node.category.id}>
              <option value={node.category.id}>{node.category.name}</option>
              {node.children.map((child) => (
                <option key={child.id} value={child.id}>
                  &nbsp;&nbsp;{child.name}
                </option>
              ))}
            </React.Fragment>
          ))}
        </select>
      </label>
      <label>
        Quantity (optional)
        <input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </label>
      <label>
        Estimated price (optional — can decide when buying)
        <input type="number" step="any" value={estimatedPrice} onChange={(e) => setEstimatedPrice(e.target.value)} />
      </label>
      <label>
        Due date (optional)
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      <label>
        Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p className="ltk-form-error">{error}</p>}
      <div className="ltk-entry-form__actions">
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="ltk-button--accent" disabled={submitting}>
          Add
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
    private onSaved: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Add item');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <ShoppingItemForm
          moneyService={this.moneyService}
          listId={this.listId}
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
