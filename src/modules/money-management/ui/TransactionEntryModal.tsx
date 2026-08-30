// The consolidated expense/income/transfer/adjustment entry form
// (REQ-M005) — one form, a type selector switches the visible fields.
// For expense, also offers "add to a shopping list instead of logging
// it now" right in this same flow.
//
// This pass adds two things, both scoped to expense transactions only
// (the two only make sense for spending):
//  - Budget check: if the chosen category has a monthly budget
//    configured, submitting an amount that would push this month's
//    spend over that limit pops a warning (via confirmAsync) before
//    the transaction is actually recorded — the user can still
//    proceed, this never silently blocks anything.
//  - Essential (required) + Judgment (required, only when not
//    essential) capture, via the shared EssentialJudgmentFields.

import React, { useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { confirmAsync } from '../../../shared/ui-kit/ConfirmModal';
import { MoneyService } from '../application/moneyService';
import { Account, ShoppingList, TransactionJudgment, TransactionType } from '../domain/types';
import { CategoryNode } from '../domain/categoryTree';
import { getTodayLocal } from '../../../core/date';
import { EssentialJudgmentFields, essentialJudgmentValid } from './EssentialJudgmentFields';

const NEW_OPTION = '__new__';

function nowHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** -5/+5 stepper with the number still directly editable. */
function AmountStepper({
  value,
  onChange,
  step = 5,
  placeholder,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  step?: number;
  placeholder?: string;
  required?: boolean;
}) {
  const adjust = (delta: number) => {
    const current = Number(value) || 0;
    const next = Math.round((current + delta) * 100) / 100;
    onChange(String(next));
  };

  return (
    <div className="ltk-numeric-stepper">
      <button type="button" onClick={() => adjust(-step)} aria-label="Decrease amount">
        −
      </button>
      <input
        type="number"
        step="any"
        className="ltk-numeric-stepper__value"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
      <button type="button" onClick={() => adjust(step)} aria-label="Increase amount">
        +
      </button>
    </div>
  );
}

interface TransactionFormProps {
  app: App;
  moneyService: MoneyService;
  accounts: Account[];
  onCancel: () => void;
  onSaved: () => void;
}

function TransactionForm({ app, moneyService, accounts, onCancel, onSaved }: TransactionFormProps) {
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
  const [essential, setEssential] = useState<boolean | undefined>(undefined);
  const [judgment, setJudgment] = useState<TransactionJudgment | undefined>(undefined);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState('');

  const [addToShoppingList, setAddToShoppingList] = useState(false);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [shoppingListId, setShoppingListId] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');

  useEffect(() => {
    if (type === 'expense' || type === 'income') {
      moneyService.getCategoryTree(type).then(setCategoryTree);
    }
    setShowNewCategory(false);
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
    } else {
      setShowNewList(false);
    }
  }, [addToShoppingList, moneyService]);

  const handleCategorySelect = (value: string) => {
    if (value === NEW_OPTION) {
      setShowNewCategory(true);
      return;
    }
    setCategoryId(value);
  };

  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const kind = type === 'income' ? 'income' : 'expense';
    const created = await moneyService.createCategory({
      kind,
      name: trimmed,
      parentId: newCategoryParentId || undefined,
    });
    const tree = await moneyService.getCategoryTree(kind);
    setCategoryTree(tree);
    setCategoryId(created.id);
    setShowNewCategory(false);
    setNewCategoryName('');
    setNewCategoryParentId('');
  };

  const handleShoppingListSelect = (value: string) => {
    if (value === NEW_OPTION) {
      setShowNewList(true);
      return;
    }
    setShoppingListId(value);
  };

  const handleCreateList = async () => {
    const trimmed = newListName.trim();
    if (!trimmed) return;
    const created = await moneyService.createShoppingList(trimmed);
    const lists = await moneyService.getShoppingLists();
    setShoppingLists(lists);
    setShoppingListId(created.id);
    setShowNewList(false);
    setNewListName('');
  };

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

    if (type === 'expense' && !essentialJudgmentValid(essential, judgment)) {
      setError(essential === undefined ? 'Choose whether this was essential.' : 'Choose a judgment rating.');
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
      } else if (type === 'expense') {
        // Budget check happens right before recording, using the
        // freshest possible spend figure — purely informational, never
        // blocks on its own; the user decides via the confirm dialog.
        const budgetCheck = await moneyService.checkBudget(categoryId || undefined, Math.abs(parsedAmount), date);
        if (budgetCheck?.exceeded) {
          const proceed = await confirmAsync(
            app,
            'Budget exceeded',
            `This category's budget is ${budgetCheck.monthlyLimit.toFixed(2)}/month. You've already spent ${budgetCheck.currentSpend.toFixed(2)} this month — this transaction would bring it to ${budgetCheck.projectedSpend.toFixed(2)}. Record it anyway?`
          );
          if (!proceed) {
            setSubmitting(false);
            return;
          }
        }
        await moneyService.recordTransaction({
          date,
          time,
          accountId,
          type,
          categoryId: categoryId || undefined,
          amount: -Math.abs(parsedAmount),
          quantity: quantity ? Number(quantity) : undefined,
          name: name || undefined,
          note: note || undefined,
          essential,
          judgment: essential === false ? judgment : undefined,
        });
      } else {
        const signedAmount = type === 'income' ? Math.abs(parsedAmount) : parsedAmount;
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
            <select value={showNewList ? NEW_OPTION : shoppingListId} onChange={(e) => handleShoppingListSelect(e.target.value)}>
              {shoppingLists.length === 0 && !showNewList && <option value="">No lists yet</option>}
              {shoppingLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value={NEW_OPTION}>+ New list…</option>
            </select>
          </label>
          {showNewList && (
            <div className="ltk-inline-create">
              <input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="e.g. Groceries"
                autoFocus
              />
              <button type="button" onClick={handleCreateList}>
                Add
              </button>
              <button type="button" onClick={() => setShowNewList(false)}>
                Cancel
              </button>
            </div>
          )}
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
        <>
          <label>
            Category
            <select value={showNewCategory ? NEW_OPTION : categoryId} onChange={(e) => handleCategorySelect(e.target.value)}>
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
              <option value={NEW_OPTION}>+ New category / subcategory…</option>
            </select>
          </label>
          {showNewCategory && (
            <div className="ltk-inline-create">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New category name"
                autoFocus
              />
              <select value={newCategoryParentId} onChange={(e) => setNewCategoryParentId(e.target.value)}>
                <option value="">As a main category</option>
                {categoryTree.map((node) => (
                  <option key={node.category.id} value={node.category.id}>
                    Sub of: {node.category.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={handleCreateCategory}>
                Add
              </button>
              <button type="button" onClick={() => setShowNewCategory(false)}>
                Cancel
              </button>
            </div>
          )}
        </>
      )}

      <label>
        {type === 'adjustment'
          ? 'Signed amount (+/-)'
          : addToShoppingList && type === 'expense'
            ? 'Estimated price (optional — can decide when buying)'
            : 'Amount'}
        <AmountStepper
          value={amount}
          onChange={setAmount}
          placeholder="0.00"
          required={!(addToShoppingList && type === 'expense')}
        />
      </label>

      {type === 'expense' && !addToShoppingList && (
        <EssentialJudgmentFields
          essential={essential}
          onEssentialChange={(v) => {
            setEssential(v);
            if (v) setJudgment(undefined);
          }}
          judgment={judgment}
          onJudgmentChange={setJudgment}
        />
      )}

      {addToShoppingList && type === 'expense' && (
        <label>
          Due date (optional)
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      )}

      {(type === 'expense' || type === 'income') && !addToShoppingList && (
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
          app={this.app}
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
