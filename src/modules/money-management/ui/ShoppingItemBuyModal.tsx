// Mark a pending item bought (REQ-M023) — actual price, account,
// purchase date; creates the linked expense transaction automatically.

import React, { useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { MoneyService } from '../application/moneyService';
import { Account, ShoppingItem } from '../domain/types';
import { getTodayLocal } from '../../../core/date';

interface BuyFormProps {
  moneyService: MoneyService;
  item: ShoppingItem;
  accounts: Account[];
  onCancel: () => void;
  onSaved: () => void;
}

function BuyForm({ moneyService, item, accounts, onCancel, onSaved }: BuyFormProps) {
  const [actualPrice, setActualPrice] = useState(item.estimatedPrice !== undefined ? String(item.estimatedPrice) : '');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [date, setDate] = useState(getTodayLocal());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(actualPrice);
    if (actualPrice.trim() === '' || Number.isNaN(parsed)) {
      setError('Enter the price you paid.');
      return;
    }
    if (!accountId) {
      setError('Choose an account.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await moneyService.markShoppingItemBought(item.id, { actualPrice: parsed, accountId, date });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  if (accounts.length === 0) {
    return <p className="ltk-empty">Create an account first.</p>;
  }

  return (
    <form className="ltk-entry-form" onSubmit={handleSubmit}>
      <label>
        Price paid
        <input type="number" step="any" value={actualPrice} onChange={(e) => setActualPrice(e.target.value)} placeholder="0.00" />
      </label>
      <label>
        Account
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </select>
      </label>
      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      {error && <p className="ltk-form-error">{error}</p>}
      <div className="ltk-entry-form__actions">
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="ltk-button--accent" disabled={submitting}>
          Mark bought
        </button>
      </div>
    </form>
  );
}

export class ShoppingItemBuyModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private moneyService: MoneyService,
    private item: ShoppingItem,
    private accounts: Account[],
    private onSaved: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(`Buy ${this.item.name}`);
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <BuyForm
          moneyService={this.moneyService}
          item={this.item}
          accounts={this.accounts}
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
