import React, { useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { ConfirmModal } from '../../../shared/ui-kit/ConfirmModal';
import { MoneyService } from '../application/moneyService';
import { Account, Debt, DebtPayment } from '../domain/types';
import { debtRemaining } from '../domain/debtCalculator';
import { getTodayLocal } from '../../../core/date';
import { DebtModal } from './DebtModal';

interface PaymentFormProps {
  moneyService: MoneyService;
  debt: Debt;
  accounts: Account[];
  remaining: number;
  onSaved: () => void;
}

function PaymentForm({ moneyService, debt, accounts, remaining, onSaved }: PaymentFormProps) {
  const [amount, setAmount] = useState(String(remaining));
  const [date, setDate] = useState(getTodayLocal());
  const [linkAccount, setLinkAccount] = useState(accounts.length > 0);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(amount);
    if (amount.trim() === '' || Number.isNaN(parsed) || parsed <= 0) {
      setError('Enter a positive amount.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await moneyService.recordDebtPayment(debt.id, {
        amount: parsed,
        date,
        accountId: linkAccount ? accountId : undefined,
        note: note || undefined,
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
        Amount
        <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      {accounts.length > 0 && (
        <label className="ltk-entry-form__checkbox">
          <input type="checkbox" checked={linkAccount} onChange={(e) => setLinkAccount(e.target.checked)} />
          Money actually moved through an account
        </label>
      )}
      {linkAccount && accounts.length > 0 && (
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
      )}
      <label>
        Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p className="ltk-form-error">{error}</p>}
      <div className="ltk-entry-form__actions">
        <button type="submit" className="ltk-button--accent" disabled={submitting}>
          Record payment
        </button>
      </div>
    </form>
  );
}

interface DebtDetailProps {
  app: App;
  moneyService: MoneyService;
  debt: Debt;
  accounts: Account[];
  onChanged: (deleted?: boolean) => void;
}

function DebtDetail({ app, moneyService, debt, accounts, onChanged }: DebtDetailProps) {
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    moneyService.getDebtPayments(debt.id).then(setPayments);
  }, [debt.id, moneyService, refreshKey]);

  const remaining = debtRemaining(debt, payments);
  const notify = () => {
    setRefreshKey((k) => k + 1);
    onChanged();
  };

  const handleDeletePayment = async (p: DebtPayment) => {
    await moneyService.deleteDebtPayment(p.id);
    notify();
  };

  return (
    <div className="ltk-shopping-detail">
      <p className="ltk-empty">
        Principal: {debt.principal.toFixed(2)} · Remaining: <strong>{remaining.toFixed(2)}</strong>
        {debt.dueDate ? ` · due ${debt.dueDate}` : ''}
      </p>

      {remaining > 0 ? (
        <PaymentForm
          moneyService={moneyService}
          debt={debt}
          accounts={accounts}
          remaining={remaining}
          onSaved={notify}
        />
      ) : (
        <p className="ltk-empty">Fully settled.</p>
      )}

      <h4>Payment history</h4>
      {payments.length === 0 && <p className="ltk-empty">No payments logged yet.</p>}
      <ul className="ltk-shopping-items">
        {payments.map((p) => (
          <li key={p.id}>
            <span className="ltk-shopping-item__name">{p.date}</span>
            <span className="ltk-shopping-item__price">{p.amount.toFixed(2)}</span>
            {p.accountId && <span className="ltk-money-tx__tag">linked to account</span>}
            <button type="button" onClick={() => handleDeletePayment(p)}>
              Delete
            </button>
          </li>
        ))}
      </ul>

      <div className="ltk-shopping-detail__list-actions">
        <button type="button" onClick={() => new DebtModal(app, moneyService, debt, () => onChanged()).open()}>
          Edit debt
        </button>
        <button
          type="button"
          className="mod-warning"
          onClick={() =>
            new ConfirmModal(
              app,
              `Delete debt with ${debt.counterparty}?`,
              `This removes the debt and all ${payments.length} logged payment(s). Any transactions those payments created stay in your history unless you also delete them individually.`,
              async () => {
                await moneyService.deleteDebt(debt.id);
                onChanged(true);
              }
            ).open()
          }
        >
          Delete debt
        </button>
      </div>
    </div>
  );
}

export class DebtDetailModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private moneyService: MoneyService,
    private debt: Debt,
    private accounts: Account[],
    private onChanged: () => void = () => {}
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.debt.counterparty);
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <DebtDetail
          app={this.app}
          moneyService={this.moneyService}
          debt={this.debt}
          accounts={this.accounts}
          onChanged={(deleted) => {
            this.onChanged();
            if (deleted) this.close();
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