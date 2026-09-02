// Single consolidated entry form for expense/income/transfer/adjustment (REQ-M005).
// Category selection offers scoped subcategories (REQ-M012) and an inline "+ New category"
// creator. Supports Essential/Judgment tags and budget check warnings.
//
// Update: Gated by FeatureFlags (REQ-C006) — quantity, note, time-of-day,
// budget check, and essential/judgment fields render only when enabled.

import React, { useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { ConfirmModal } from '../../../shared/ui-kit/ConfirmModal';
import { EssentialJudgmentFields, essentialJudgmentValid } from './EssentialJudgmentFields';
import { MoneyService } from '../application/moneyService';
import {
  Account,
  TransactionType,
  TransactionJudgment,
} from '../domain/types';
import { CategoryNode } from '../domain/categoryTree';
import { getTodayLocal } from '../../../core/date';
import { PluginSettingsStore } from '../../../core/pluginSettingsStore';
import { FeatureFlags, DEFAULT_FEATURE_FLAGS } from '../../../core/featureFlags';

function nowHHMM(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

interface TransactionFormProps {
  app: App;
  moneyService: MoneyService;
  accounts: Account[];
  onCancel: () => void;
  onSaved: () => void;
  pluginSettingsStore?: PluginSettingsStore;
  featureFlags?: FeatureFlags;
}

function TransactionForm({
  app,
  moneyService,
  accounts,
  onCancel,
  onSaved,
  pluginSettingsStore,
  featureFlags,
}: TransactionFormProps) {
  const flags = featureFlags ?? DEFAULT_FEATURE_FLAGS;
  const [type, setType] = useState<TransactionType>('expense');
  const [date, setDate] = useState(getTodayLocal());
  const [time, setTime] = useState(nowHHMM());
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [quantity, setQuantity] = useState('');
  const [essential, setEssential] = useState<boolean | undefined>(undefined);
  const [judgment, setJudgment] = useState<TransactionJudgment | undefined>(undefined);

  const [stepperIncrement, setStepperIncrement] = useState(5);
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (pluginSettingsStore) {
      pluginSettingsStore.getAmountStepperIncrement().then(setStepperIncrement);
    }
    moneyService.getRecentNames().then(setRecentNames);
  }, [moneyService, pluginSettingsStore]);

  useEffect(() => {
    if (type === 'expense' || type === 'income') {
      moneyService.getCategoryTree(type).then((tree) => {
        setCategoryTree(tree);
        setCategoryId('');
      });
    }
  }, [type, moneyService]);

  const handleStepAmount = (delta: number) => {
    const current = Number(amount) || 0;
    const next = Math.max(0, current + delta);
    setAmount(String(next));
  };

  const commitTransaction = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const parsedAmount = Number(amount);
      const parsedQty = flags.moneyTransactionQuantity && quantity.trim() ? Number(quantity) : undefined;
      const effectiveTime = flags.moneyTransactionTimeOfDay ? time : nowHHMM();

      if (type === 'transfer') {
        await moneyService.recordTransfer({
          date,
          time: effectiveTime,
          fromAccountId: accountId,
          toAccountId,
          amount: parsedAmount,
          note: flags.moneyTransactionNotes ? (note || undefined) : undefined,
        });
      } else {
        const signedAmount = type === 'expense' ? -Math.abs(parsedAmount) : Math.abs(parsedAmount);
        await moneyService.recordTransaction({
          date,
          time: effectiveTime,
          accountId,
          type,
          categoryId: categoryId || undefined,
          amount: signedAmount,
          quantity: parsedQty,
          name: name.trim() || undefined,
          note: flags.moneyTransactionNotes ? (note || undefined) : undefined,
          essential: type === 'expense' && flags.moneyEssentialJudgment ? essential : undefined,
          judgment: type === 'expense' && flags.moneyEssentialJudgment ? judgment : undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(amount);
    if (amount.trim() === '' || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a positive amount.');
      return;
    }
    if (type === 'transfer' && accountId === toAccountId) {
      setError('Cannot transfer to the same account.');
      return;
    }
    if (type === 'expense' && flags.moneyEssentialJudgment && !essentialJudgmentValid(essential, judgment)) {
      setError('Please choose whether this purchase was essential.');
      return;
    }

    // Budget check warning (REQ-M018-style notification before overspending)
    if (type === 'expense' && categoryId && flags.moneyBudgetChecking) {
      const budgetCheck = await moneyService.checkBudget(categoryId, parsedAmount, date);
      if (budgetCheck?.exceeded) {
        new ConfirmModal(
          app,
          'Monthly Budget Exceeded',
          `This purchase of ${parsedAmount} pushes this category to ${budgetCheck.projectedSpend.toFixed(2)} (Limit: ${budgetCheck.monthlyLimit.toFixed(2)}). Continue anyway?`,
          () => commitTransaction(),
          'Proceed'
        ).open();
        return;
      }
    }

    await commitTransaction();
  };

  return (
    <form className="ltk-entry-form" onSubmit={handleSubmit}>
      <div className="ltk-entry-form__row">
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        {flags.moneyTransactionTimeOfDay && (
          <label>
            Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
        )}
      </div>

      <div className="ltk-entry-form__row">
        <label>
          {type === 'transfer' ? 'From Account' : 'Account'}
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </label>
        {type === 'transfer' && (
          <label>
            To Account
            <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label>
        Amount
        <div className="ltk-numeric-stepper">
          <button type="button" onClick={() => handleStepAmount(-stepperIncrement)}>
            −
          </button>
          <input
            type="number"
            step="any"
            className="ltk-numeric-stepper__value"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
          <button type="button" onClick={() => handleStepAmount(stepperIncrement)}>
            +
          </button>
        </div>
      </label>

      {type !== 'transfer' && (
        <>
          <label>
            Name / Item
            <input
              list="recent-names"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Coffee, Groceries"
            />
            <datalist id="recent-names">
              {recentNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>

          {(type === 'expense' || type === 'income') && (
            <label>
              Category
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">(Uncategorized)</option>
                {categoryTree.map((node) => (
                  <optgroup key={node.category.id} label={node.category.name}>
                    <option value={node.category.id}>{node.category.name}</option>
                    {node.children.map((child: { id: string; name: string }) => (
                      <option key={child.id} value={child.id}>
                        ↳ {child.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}

          {type === 'expense' && flags.moneyEssentialJudgment && (
            <EssentialJudgmentFields
              essential={essential}
              onEssentialChange={setEssential}
              judgment={judgment}
              onJudgmentChange={setJudgment}
            />
          )}

          {flags.moneyTransactionQuantity && (
            <label>
              Quantity (optional)
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
              />
            </label>
          )}
        </>
      )}

      {flags.moneyTransactionNotes && (
        <label>
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}

      {error && <p className="ltk-form-error">{error}</p>}

      <div className="ltk-entry-form__actions">
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="ltk-button--accent" disabled={submitting}>
          Record
        </button>
      </div>
    </form>
  );
}

export class TransactionEntryModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private moneyService: MoneyService,
    private accounts: Account[],
    private onSaved: () => void,
    private pluginSettingsStore?: PluginSettingsStore,
    private featureFlags?: FeatureFlags
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Add transaction');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <TransactionForm
          app={this.app}
          moneyService={this.moneyService}
          accounts={this.accounts}
          pluginSettingsStore={this.pluginSettingsStore}
          featureFlags={this.featureFlags}
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