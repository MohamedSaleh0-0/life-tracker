// Create a shopping list (REQ-M021) — name only. Any purpose: groceries,
// a wish-list, or any other list the user wants (per the user's ask —
// not restricted to "groceries").

import React, { useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { MoneyService } from '../application/moneyService';

function ShoppingListForm({
  moneyService,
  onCancel,
  onSaved,
}: {
  moneyService: MoneyService;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') {
      setError('Enter a name.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await moneyService.createShoppingList(name.trim());
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
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries, Wish list" autoFocus />
      </label>
      {error && <p className="ltk-form-error">{error}</p>}
      <div className="ltk-entry-form__actions">
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="ltk-button--accent" disabled={submitting}>
          Create
        </button>
      </div>
    </form>
  );
}

export class ShoppingListModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private moneyService: MoneyService,
    private onSaved: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('New shopping list');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <ShoppingListForm
          moneyService={this.moneyService}
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
