// Create a category or subcategory (REQ-M012/M014) — name only;
// kind and parent are fixed by which "+ Add" button opened this.

import React, { useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { MoneyService } from '../application/moneyService';
import { CategoryKind } from '../domain/types';

interface CategoryFormProps {
  moneyService: MoneyService;
  kind: CategoryKind;
  parentId?: string;
  onCancel: () => void;
  onSaved: () => void;
}

function CategoryForm({ moneyService, kind, parentId, onCancel, onSaved }: CategoryFormProps) {
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
      await moneyService.createCategory({ kind, name: name.trim(), parentId });
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
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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

export class CategoryModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private moneyService: MoneyService,
    private kind: CategoryKind,
    private parentId: string | undefined,
    private onSaved: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.parentId ? 'New subcategory' : `New ${this.kind} category`);
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <CategoryForm
          moneyService={this.moneyService}
          kind={this.kind}
          parentId={this.parentId}
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
