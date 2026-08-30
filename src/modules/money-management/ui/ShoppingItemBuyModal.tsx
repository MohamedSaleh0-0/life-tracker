// Mark a pending item bought (REQ-M023) — actual price, account,
// purchase date; creates the linked expense transaction automatically.
//
// This pass: same budget check + Essential/Judgment capture as the
// manual transaction entry form (buying an item is still creating a
// real expense transaction, so it goes through the same conventions).

import React, { useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { confirmAsync } from '../../../shared/ui-kit/ConfirmModal';
import { MoneyService } from '../application/moneyService';
import { Account, ShoppingItem, TransactionJudgment } from '../domain/types';
import { getTodayLocal } from '../../../core/date';
import { EssentialJudgmentFields, essentialJudgmentValid } from './EssentialJudgmentFields';

interface BuyFormProps {
  app: App;
  moneyService: MoneyService;
  item: ShoppingItem;
  accounts: Account[];
  onCancel: () => void;
  onSaved: () => void;
}

function BuyForm({ app, moneyService, item, accounts, onCancel, onSaved }: BuyFormProps) {
  const [actualPrice, setActualPrice] = useState(item.estimatedPrice !== undefined ? String(item.estimatedPrice) : '');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [date, setDate] = useState(getTodayLocal());
  const [essential, setEssential] = useState<boolean | undefined>(undefined);
  const [judgment, setJudgment] = useState<TransactionJudgment | undefined>(undefined);
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
    if (!essentialJudgmentValid(essential, judgment)) {
      setError(essential === undefined ? 'Choose whether this was essential.' : 'Choose a judgment rating.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const budgetCheck = await moneyService.checkBudget(item.categoryId, parsed, date);
      if (budgetCheck?.exceeded) {
        const proceed = await confirmAsync(
          app,
          'Budget exceeded',
          `This category's budget is ${budgetCheck.monthlyLimit.toFixed(2)}/month. You've already spent ${budgetCheck.currentSpend.toFixed(2)} this month — buying this would bring it to ${budgetCheck.projectedSpend.toFixed(2)}. Buy it anyway?`
        );
        if (!proceed) {
          setSubmitting(false);
          return;
        }
      }
      await moneyService.markShoppingItemBought(item.id, {
        actualPrice: parsed,
        accountId,
        date,
        essential,
        judgment: essential === false ? judgment : undefined,
      });
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
      <EssentialJudgmentFields
        essential={essential}
        onEssentialChange={(v) => {
          setEssential(v);
          if (v) setJudgment(undefined);
        }}
        judgment={judgment}
        onJudgmentChange={setJudgment}
      />
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
          app={this.app}
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
