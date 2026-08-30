// Minimal "edit Essential/Judgment on an existing transaction" modal —
// deliberately scoped to just these two fields (not a full transaction
// editor for amount/date/account/etc., which wasn't asked for). Opened
// via an "Edit tags" action on each transaction row.

import React, { useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { MoneyService } from '../application/moneyService';
import { Transaction, TransactionJudgment } from '../domain/types';
import { EssentialJudgmentFields } from './EssentialJudgmentFields';

interface TagsFormProps {
  moneyService: MoneyService;
  transaction: Transaction;
  onCancel: () => void;
  onSaved: () => void;
}

function TagsForm({ moneyService, transaction, onCancel, onSaved }: TagsFormProps) {
  const [essential, setEssential] = useState<boolean | undefined>(transaction.essential);
  const [judgment, setJudgment] = useState<TransactionJudgment | undefined>(transaction.judgment);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await moneyService.updateTransactionTags(transaction.date, transaction.id, essential, judgment);
      onSaved();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="ltk-entry-form" onSubmit={handleSubmit}>
      <p className="ltk-empty">
        {transaction.name || 'Untitled'} · {transaction.date}
      </p>
      <EssentialJudgmentFields
        essential={essential}
        onEssentialChange={(v) => {
          setEssential(v);
          if (v) setJudgment(undefined);
        }}
        judgment={judgment}
        onJudgmentChange={setJudgment}
      />
      <div className="ltk-entry-form__actions">
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="ltk-button--accent" disabled={submitting}>
          Save
        </button>
      </div>
    </form>
  );
}

export class TransactionTagsModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private moneyService: MoneyService,
    private transaction: Transaction,
    private onSaved: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Essential / Judgment');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <TagsForm
          moneyService={this.moneyService}
          transaction={this.transaction}
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
