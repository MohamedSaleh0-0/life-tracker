// Create/edit an account (REQ-M001) — name, currency, opening balance.

import React, { useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { MoneyService } from '../application/moneyService';
import { Account } from '../domain/types';

interface AccountFormProps {
  moneyService: MoneyService;
  existingAccount?: Account;
  onCancel: () => void;
  onSaved: () => void;
}

function AccountForm({ moneyService, existingAccount, onCancel, onSaved }: AccountFormProps) {
  const [name, setName] = useState(existingAccount?.name ?? '');
  const [currency, setCurrency] = useState(existingAccount?.currency ?? 'USD');
  const [openingBalance, setOpeningBalance] = useState(
    existingAccount ? String(existingAccount.openingBalance) : '0'
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') {
      setError('Enter a name.');
      return;
    }
    const parsed = Number(openingBalance);
    if (Number.isNaN(parsed)) {
      setError('Opening balance must be a number.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (existingAccount) {
        await moneyService.updateAccount(existingAccount.id, {
          name: name.trim(),
          currency: currency.trim(),
          openingBalance: parsed,
        });
      } else {
        await moneyService.createAccount({ name: name.trim(), currency: currency.trim(), openingBalance: parsed });
      }
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
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Checking" />
      </label>
      <label>
        Currency
        <input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USD" />
      </label>
      <label>
        Opening balance
        <input type="number" step="any" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
      </label>
      {error && <p className="ltk-form-error">{error}</p>}
      <div className="ltk-entry-form__actions">
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="ltk-button--accent" disabled={submitting}>
          {existingAccount ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  );
}

export class AccountModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private moneyService: MoneyService,
    private existingAccount: Account | undefined,
    private onSaved: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.existingAccount ? 'Edit account' : 'New account');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <AccountForm
          moneyService={this.moneyService}
          existingAccount={this.existingAccount}
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
