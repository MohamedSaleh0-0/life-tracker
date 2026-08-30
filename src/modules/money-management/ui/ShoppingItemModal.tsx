// Add an item to a shopping list (REQ-M022) — name, category, quantity,
// optional estimated price (can be decided later, at purchase time —
// REQ-M022's explicit allowance), optional note, optional due date.
//
// Update: the category field now supports creating a brand-new main
// category or subcategory inline, same "+ New category…" pattern
// already used in TransactionEntryModal — previously this form only
// offered a plain picker over categories that already existed,
// forcing a trip to Settings first if the right one didn't exist yet.

import React, { useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { MoneyService } from '../application/moneyService';
import { CategoryNode } from '../domain/categoryTree';

const NEW_OPTION = '__new__';

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

  // Inline "+ New category / subcategory" — same pattern as
  // TransactionEntryModal, so a shopping item never needs to be
  // blocked on a trip to Settings just to categorize it.
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState('');

  const refreshCategoryTree = async () => {
    setCategoryTree(await moneyService.getCategoryTree('expense'));
  };

  useEffect(() => {
    refreshCategoryTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moneyService]);

  const handleCategorySelect = (value: string) => {
    if (value === NEW_OPTION) {
      setShowNewCategory(true);
      return;
    }
    setCategoryId(value);
  };

  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const created = await moneyService.createCategory({
      kind: 'expense',
      name: trimmed,
      parentId: newCategoryParentId || undefined,
    });
    await refreshCategoryTree();
    setCategoryId(created.id);
    setShowNewCategory(false);
    setNewCategoryName('');
    setNewCategoryParentId('');
  };

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
        <select value={showNewCategory ? NEW_OPTION : categoryId} onChange={(e) => handleCategorySelect(e.target.value)}>
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
          <option value={NEW_OPTION}>+ New category / subcategory…</option>
        </select>
      </label>
      {showNewCategory && (
        <div className="ltk-inline-create">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="New category name"
            autoFocus
          />
          <select value={newCategoryParentId} onChange={(e) => setNewCategoryParentId(e.target.value)}>
            <option value="">As a main category</option>
            {categoryTree.map((node) => (
              <option key={node.category.id} value={node.category.id}>
                Sub of: {node.category.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleCreateCategory}>
            Add
          </button>
          <button type="button" onClick={() => setShowNewCategory(false)}>
            Cancel
          </button>
        </div>
      )}
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
