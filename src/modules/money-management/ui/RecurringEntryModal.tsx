// Create/edit a recurring entry (REQ-M018) — name, type, account,
// category, amount, frequency, and day-of-month for monthly/yearly.

import React, { useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { MoneyService } from '../application/moneyService';
import { Account, RecurringEntry, RecurringFrequency } from '../domain/types';
import { CategoryNode } from '../domain/categoryTree';

interface RecurringEntryFormProps {
  moneyService: MoneyService;
  accounts: Account[];
  existingEntry?: RecurringEntry;
  onCancel: () => void;
  onSaved: () => void;
}

function RecurringEntryForm({ moneyService, accounts, existingEntry, onCancel, onSaved }: RecurringEntryFormProps) {
  const [name, setName] = useState(existingEntry?.name ?? '');
  const [type, setType] = useState<'income' | 'expense'>(existingEntry?.type ?? 'expense');
  const [accountId, setAccountId] = useState(existingEntry?.accountId ?? accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(existingEntry?.categoryId ?? '');
  const [amount, setAmount] = useState(existingEntry ? String(existingEntry.amount) : '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(existingEntry?.frequency ?? 'monthly');
  const [dayOfMonth, setDayOfMonth] = useState(existingEntry?.dayOfMonth ? String(existingEntry.dayOfMonth) : '1');
  const [note, setNote] = useState(existingEntry?.note ?? '');
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    moneyService.getCategoryTree(type).then(setCategoryTree);
  }, [type, moneyService]);

  const needsDayOfMonth = frequency === 'monthly' || frequency === 'yearly';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') {
      setError('Enter a name.');
      return;
    }
    const parsedAmount = Number(amount);
    if (amount.trim() === '' || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a positive amount.');
      return;
    }
    if (!accountId) {
      setError('Choose an account.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        name: name.trim(),
        type,
        accountId,
        categoryId: categoryId || undefined,
        amount: parsedAmount,
        frequency,
        dayOfMonth: needsDayOfMonth ? Number(dayOfMonth) : undefined,
        note: note || undefined,
      };
      if (existingEntry) {
        await moneyService.updateRecurringEntry(existingEntry.id, input);
      } else {
        await moneyService.createRecurringEntry(input);
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
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Netflix, Rent, Salary" />
      </label>
      <label>
        Type
        <select value={type} onChange={(e) => setType(e.target.value as 'income' | 'expense')}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
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
        Category
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
        Amount
        <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </label>
      <label>
        Frequency
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </label>
      {needsDayOfMonth && (
        <label>
          Day of month
          <input
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
          />
        </label>
      )}
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
          {existingEntry ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  );
}

export class RecurringEntryModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private moneyService: MoneyService,
    private accounts: Account[],
    private existingEntry: RecurringEntry | undefined,
    private onSaved: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.existingEntry ? 'Edit recurring entry' : 'New recurring entry');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <RecurringEntryForm
          moneyService={this.moneyService}
          accounts={this.accounts}
          existingEntry={this.existingEntry}
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
