// Create/edit an account (REQ-M001).
//
// Update: editing an EXISTING account now shows and edits its CURRENT
// balance, not the historical opening balance — "opening balance" is
// meaningless to look at once an account has real history, and users
// expect to see/adjust what's actually in the account today. Since
// REQ-M004 requires a balance to only ever change via a recorded
// transaction (never by rewriting a stored number), changing this
// field doesn't touch `openingBalance` at all — it records a single
// balance-correction "adjustment" transaction for the difference
// (MoneyService.setAccountCurrentBalance), exactly like the existing
// manual "Adjustment" transaction type already supports. Creating a
// brand-new account still asks for "Opening balance", since there's
// no current balance yet to show.

import React, { useEffect, useState } from 'react';
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
  const [balanceInput, setBalanceInput] = useState(existingAccount ? '' : '0');
  const [loadingBalance, setLoadingBalance] = useState(!!existingAccount);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!existingAccount) return;
    let cancelled = false;
    moneyService.getAccountBalance(existingAccount.id).then((balance) => {
      if (!cancelled) {
        setBalanceInput(String(balance));
        setLoadingBalance(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [existingAccount, moneyService]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') {
      setError('Enter a name.');
      return;
    }
    const parsed = Number(balanceInput);
    if (Number.isNaN(parsed)) {
      setError(`${existingAccount ? 'Current' : 'Opening'} balance must be a number.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (existingAccount) {
        await moneyService.updateAccount(existingAccount.id, {
          name: name.trim(),
          currency: currency.trim(),
        });
        // Never rewrites openingBalance — a balance-correction
        // adjustment transaction is recorded for the difference
        // instead (REQ-M004: balances change only via a transaction).
        await moneyService.setAccountCurrentBalance(existingAccount.id, parsed);
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
        {existingAccount ? 'Current balance' : 'Opening balance'}
        <input
          type="number"
          step="any"
          value={balanceInput}
          onChange={(e) => setBalanceInput(e.target.value)}
          disabled={loadingBalance}
          placeholder={loadingBalance ? 'Loading…' : undefined}
        />
      </label>
      {existingAccount && (
        <p className="ltk-empty">
          Changing this records a balance-correction transaction for the difference — it doesn't rewrite history.
        </p>
      )}
      {error && <p className="ltk-form-error">{error}</p>}
      <div className="ltk-entry-form__actions">
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="ltk-button--accent" disabled={submitting || loadingBalance}>
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
