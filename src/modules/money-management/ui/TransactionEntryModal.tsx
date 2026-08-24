// The consolidated expense/income/transfer/adjustment entry form
// (REQ-M005) — one form, a type selector switches the visible fields,
// rather than four separate forms. For expense, also offers "add to a
// shopping list instead of logging it now" right in this same flow
// (per the user's explicit ask — not a separate command).

import React, { useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { MoneyService } from '../application/moneyService';
import { Account, ShoppingList, TransactionType } from '../domain/types';
import { CategoryNode } from '../domain/categoryTree';
import { getTodayLocal } from '../../../core/date';

function nowHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

interface TransactionFormProps {
  moneyService: MoneyService;
  accounts: Account[];
  onCancel: () => void;
  onSaved: () => void;
}

function TransactionForm({ moneyService, accounts, onCancel, onSaved }: TransactionFormProps) {
  const [date, setDate] = useState(getTodayLocal());
  const [time, setTime] = useState(nowHHMM());
  const [type, setType] = useState<TransactionType>('expense');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // "Add to a shopping list instead" — only offered for expenses, per
  // the request that this live inside the transaction flow rather than
  // a separate command.
  const [addToShoppingList, setAddToShoppingList] = useState(false);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [shoppingListId, setShoppingListId] = useState('');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    if (type === 'expense' || type === 'income') {
      moneyService.getCategoryTree(type).then(setCategoryTree);
    }
  }, [type, moneyService]);

  useEffect(() => {
    moneyService.getRecentNames().then(setRecentNames);
  }, [moneyService]);

  useEffect(() => {
    if (addToShoppingList) {
      moneyService.getShoppingLists().then((lists) => {
        setShoppingLists(lists);
        setShoppingListId((prev) => prev || lists[0]?.id || '');
      });
    }
  }, [addToShoppingList, moneyService]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (type === 'expense' && addToShoppingList) {
      if (!shoppingListId) {
        setError('Choose a shopping list.');
        return;
      }
      if (name.trim() === '') {
        setError('Enter an item name.');
        return;
      }
      setSubmitting(true);
      try {
        await moneyService.addShoppingItem({
          listId: shoppingListId,
          name: name.trim(),
          categoryId: categoryId || undefined,
          quantity: quantity ? Number(quantity) : undefined,
          estimatedPrice: amount.trim() !== '' ? Number(amount) : undefined,
          note: note || undefined,
          dueDate: dueDate || undefined,
        });
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const parsedAmount = Number(amount);
    if (amount.trim() === '' || Number.isNaN(parsedAmount)) {
      setError('Enter a valid amount.');
      return;
    }
    setSubmitting(true);
    try {
      if (type === 'transfer') {
        if (accountId === toAccountId) {
          setError('Choose two different accounts.');
          setSubmitting(false);
          return;
        }
        await moneyService.recordTransfer({
          date,
          time,
          fromAccountId: accountId,
          toAccountId,
          amount: Math.abs(parsedAmount),
          note: note || undefined,
        });
      } else {
        const signedAmount =
          type === 'expense' ? -Math.abs(parsedAmount) : type === 'income' ? Math.abs(parsedAmount) : parsedAmount;
        await moneyService.recordTransaction({
          date,
          time,
          accountId,
          type,
          categoryId: categoryId || undefined,
          amount: signedAmount,
          quantity: quantity ? Number(quantity) : undefined,
          name: name || undefined,
          note: note || undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  if (accounts.length === 0) {
    return <p className="ltk-empty">Create an account first (Settings → Life Tracker → Money Management).</p>;
  }

  return (
    <form className="ltk-entry-form" onSubmit={handleSubmit}>
      <label>
        Type
        <select value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
          <option value="adjustment">Adjustment</option>
        </select>
      </label>

      {type === 'expense' && (
        <label className="ltk-entry-form__checkbox">
          <input
            type="checkbox"
            checked={addToShoppingList}
            onChange={(e) => setAddToShoppingList(e.target.checked)}
          />
          Add to a shopping list instead of logging it now
        </label>
      )}

      <div className="ltk-entry-form__row">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        {!(type === 'expense' && addToShoppingList) && (
          <label>
            Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
        )}
      </div>

      {addToShoppingList && type === 'expense' ? (
        <>
          <label>
            Shopping list
            <select value={shoppingListId} onChange={(e) => setShoppingListId(e.target.value)}>
              {shoppingLists.length === 0 && <option value="">No lists yet — create one first</option>}
              {shoppingLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Item name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Milk" />
          </label>
        </>
      ) : (
        <label>
          {type === 'transfer' ? 'From account' : 'Account'}
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </label>
      )}

      {type === 'transfer' && (
        <label>
          To account
          <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </label>
      )}

      {(type === 'expense' || type === 'income') && (
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
      )}

      <label>
        {type === 'adjustment'
          ? 'Signed amount (+/-)'
          : addToShoppingList && type === 'expense'
            ? 'Estimated price (optional — can decide when buying)'
            : 'Amount'}
        <input
          type="number"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          required={!(addToShoppingList && type === 'expense')}
        />
      </label>

      {addToShoppingList && type === 'expense' && (
        <label>
          Due date (optional)
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      )}

      {(type === 'expense' || type === 'income') && !addToShoppingList && (
        <>
          <label>
            Name (optional)
            <input
              list="ltk-recent-names"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Coffee"
            />
            <datalist id="ltk-recent-names">
              {recentNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
        </>
      )}

      {(type === 'expense' || type === 'income' || addToShoppingList) && (
        <label>
          Quantity (optional)
          <input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
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
          {addToShoppingList && type === 'expense' ? 'Add to list' : 'Add'}
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
    private onSaved: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Add transaction');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <TransactionForm
          moneyService={this.moneyService}
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
