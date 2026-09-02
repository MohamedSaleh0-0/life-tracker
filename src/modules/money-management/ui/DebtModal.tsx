import React, { useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { MoneyService } from '../application/moneyService';
import { Debt, DebtDirection } from '../domain/types';

interface DebtFormProps {
  moneyService: MoneyService;
  existingDebt?: Debt;
  onCancel: () => void;
  onSaved: () => void;
}

function DebtForm({ moneyService, existingDebt, onCancel, onSaved }: DebtFormProps) {
  const [direction, setDirection] = useState<DebtDirection>(existingDebt?.direction ?? 'owed_to_me');
  const [counterparty, setCounterparty] = useState(existingDebt?.counterparty ?? '');
  const [principal, setPrincipal] = useState(existingDebt ? String(existingDebt.principal) : '');
  const [dueDate, setDueDate] = useState(existingDebt?.dueDate ?? '');
  const [note, setNote] = useState(existingDebt?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (counterparty.trim() === '') {
      setError('Enter who this is with.');
      return;
    }
    const parsed = Number(principal);
    if (principal.trim() === '' || Number.isNaN(parsed) || parsed <= 0) {
      setError('Enter a positive amount.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        direction,
        counterparty: counterparty.trim(),
        principal: parsed,
        dueDate: dueDate || undefined,
        note: note || undefined,
      };
      if (existingDebt) {
        await moneyService.updateDebt(existingDebt.id, input);
      } else {
        await moneyService.createDebt(input);
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
        Direction
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as DebtDirection)}
          disabled={!!existingDebt}
        >
          <option value="owed_to_me">Owed to me</option>
          <option value="i_owe">I owe</option>
        </select>
      </label>
      <label>
        {direction === 'owed_to_me' ? 'Who owes you' : 'Who you owe'}
        <input
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          placeholder="e.g. Sam"
          autoFocus
        />
      </label>
      <label>
        {existingDebt ? 'Principal (original amount — editing does not affect payments already logged)' : 'Amount'}
        <input
          type="number"
          step="any"
          value={principal}
          onChange={(e) => setPrincipal(e.target.value)}
          placeholder="0.00"
        />
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
          {existingDebt ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  );
}

export class DebtModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private moneyService: MoneyService,
    private existingDebt: Debt | undefined,
    private onSaved: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.existingDebt ? 'Edit debt' : 'New debt');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <DebtForm
          moneyService={this.moneyService}
          existingDebt={this.existingDebt}
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