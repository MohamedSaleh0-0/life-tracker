// Pending/completed split for today, with one-tap boolean completion
// and numeric quick entry. See design-habit-tracking.md §Key Flows
// (Daily Check-In), REQ-H006-H008.

import React, { useEffect, useState } from 'react';
import { HabitService, CompletedHabitEntry } from '../application/habitService';
import { HabitDefinition, HabitLogValue } from '../domain/types';

export interface HabitDashboardListProps {
  habitService: HabitService;
  onOpenDetail: (habit: HabitDefinition) => void;
}

function formatValue(habit: HabitDefinition, value: HabitLogValue): string {
  if (typeof value === 'boolean') return value ? '✓' : '—';
  const unit = habit.target?.unit;
  return unit ? `${value} ${unit}` : String(value);
}

function NumericQuickEntry({
  habit,
  initialValue,
  onSubmit,
}: {
  habit: HabitDefinition;
  initialValue?: number;
  onSubmit: (value: number) => void;
}) {
  const [value, setValue] = useState(initialValue !== undefined ? String(initialValue) : '');
  const placeholder = habit.target ? `${habit.target.value} ${habit.target.unit}` : 'Enter value';

  return (
    <form
      className="ltk-numeric-quick-entry"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = Number(value);
        if (!Number.isNaN(parsed) && value.trim() !== '') onSubmit(parsed);
      }}
    >
      <input
        type="number"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      />
      <button type="submit">✓</button>
    </form>
  );
}

export function HabitDashboardList({ habitService, onOpenDetail }: HabitDashboardListProps) {
  const [pending, setPending] = useState<HabitDefinition[]>([]);
  const [completed, setCompleted] = useState<CompletedHabitEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = async () => {
    setPending(await habitService.getPendingForToday());
    setCompleted(await habitService.getCompletedForToday());
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBooleanComplete = async (habit: HabitDefinition) => {
    await habitService.editTodayLog(habit.id, true);
    setEditingId(null);
    await refresh();
  };

  const handleNumericSubmit = async (habit: HabitDefinition, value: number) => {
    await habitService.editTodayLog(habit.id, value);
    setEditingId(null);
    await refresh();
  };

  return (
    <div className="ltk-habit-dashboard">
      <section className="ltk-habit-dashboard__pending">
        <h3>Pending</h3>
        {pending.length === 0 && <p className="ltk-empty">Nothing pending — nice work.</p>}
        {pending.map((habit) => (
          <div key={habit.id} className="ltk-habit-row" onClick={() => onOpenDetail(habit)}>
            <span className="ltk-habit-row__icon">{habit.icon}</span>
            <span className="ltk-habit-row__name">{habit.name}</span>
            {habit.type === 'boolean' ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleBooleanComplete(habit);
                }}
              >
                Done
              </button>
            ) : (
              <NumericQuickEntry habit={habit} onSubmit={(value) => handleNumericSubmit(habit, value)} />
            )}
          </div>
        ))}
      </section>

      <section className="ltk-habit-dashboard__completed">
        <h3>Completed</h3>
        {completed.map(({ habit, value }) => (
          <div key={habit.id} className="ltk-habit-row ltk-habit-row--done" onClick={() => onOpenDetail(habit)}>
            <span className="ltk-habit-row__icon">{habit.icon}</span>
            <span className="ltk-habit-row__name">{habit.name}</span>
            <span className="ltk-habit-row__value">{formatValue(habit, value)}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditingId(editingId === habit.id ? null : habit.id);
              }}
            >
              Edit
            </button>
            {editingId === habit.id && habit.type === 'numeric' && (
              <NumericQuickEntry
                habit={habit}
                initialValue={typeof value === 'number' ? value : undefined}
                onSubmit={(v) => handleNumericSubmit(habit, v)}
              />
            )}
            {editingId === habit.id && habit.type === 'boolean' && (
              <button type="button" onClick={() => handleBooleanComplete(habit)}>
                Confirm
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
