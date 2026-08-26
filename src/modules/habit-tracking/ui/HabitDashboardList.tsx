// Pending/completed split for today, with one-tap boolean completion
// and numeric quick entry. REQ-H006-H008.
//
// Every interactive control inside a row must stop click propagation —
// each row itself navigates to the habit's detail view on click
// (onOpenDetail), so any inner button that forgets stopPropagation()
// will both perform its own action AND bubble into an unwanted
// navigation. Found the hard way: the "Confirm" button below was
// missing it, so re-confirming a habit silently punted you into its
// detail page with no way back (see HabitDetailView's new onBack).
//
// Update: a numeric habit with a target now stays in "Pending" until
// the logged value actually reaches target (domain/completion.ts) —
// previously any log at all moved it to Completed. The pending
// stepper now seeds from today's actual partial progress (via
// getTodayLog) instead of always starting at 0, and shows a
// "current/target unit" hint, so continuing to log toward the target
// doesn't feel like it's throwing away what was already entered.

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

/**
 * +/- stepper for numeric habits (e.g. glasses of water, cigarettes
 * avoided) — replaces a typed number input as the primary interaction.
 * Each tap commits immediately via onSubmit, same as a boolean tap.
 * stopPropagation lives on each button directly (not just the wrapper)
 * so it's unambiguous this row can never accidentally navigate.
 */
function NumericStepper({
  habit,
  initialValue,
  onSubmit,
}: {
  habit: HabitDefinition;
  initialValue: number;
  onSubmit: (value: number) => void;
}) {
  const [value, setValue] = useState(initialValue);
  // Separate text-editing state from the committed numeric value, so a
  // user typing "10" toward "10000" doesn't commit "1" then "10" as
  // intermediate log entries — only +/- taps commit immediately;
  // typed entry commits on blur/Enter.
  const [text, setText] = useState(String(initialValue));

  const commitValue = (next: number) => {
    const clamped = Math.max(0, next);
    setValue(clamped);
    setText(String(clamped));
    onSubmit(clamped);
  };

  const step = (e: React.MouseEvent, delta: number) => {
    e.stopPropagation();
    commitValue(value + delta);
  };

  const commitTyped = () => {
    const parsed = Number(text);
    if (!Number.isNaN(parsed) && text.trim() !== '') {
      commitValue(parsed);
    } else {
      setText(String(value)); // invalid typed input — revert display, don't log garbage
    }
  };

  return (
    <div className="ltk-numeric-stepper" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={(e) => step(e, -1)} aria-label={`Decrease ${habit.name}`}>
        −
      </button>
      <input
        type="number"
        className="ltk-numeric-stepper__value"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitTyped}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitTyped();
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label={`${habit.name} value`}
      />
      {habit.target?.unit ? <span className="ltk-numeric-stepper__unit">{habit.target.unit}</span> : null}
      <button type="button" onClick={(e) => step(e, 1)} aria-label={`Increase ${habit.name}`}>
        +
      </button>
    </div>
  );
}

export function HabitDashboardList({ habitService, onOpenDetail }: HabitDashboardListProps) {
  const [pending, setPending] = useState<HabitDefinition[]>([]);
  const [completed, setCompleted] = useState<CompletedHabitEntry[]>([]);
  const [todayLog, setTodayLog] = useState<Map<string, HabitLogValue>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = async () => {
    setPending(await habitService.getPendingForToday());
    setCompleted(await habitService.getCompletedForToday());
    setTodayLog(await habitService.getTodayLog());
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
        {pending.map((habit) => {
          const loggedValue = todayLog.get(habit.id);
          const currentValue = typeof loggedValue === 'number' ? loggedValue : 0;
          return (
            <div key={habit.id} className="ltk-habit-row" onClick={() => onOpenDetail(habit)}>
              <span className="ltk-habit-row__icon">{habit.icon}</span>
              <span className="ltk-habit-row__name">{habit.name}</span>
              {habit.type === 'numeric' && habit.target && (
                <span className="ltk-habit-row__progress">
                  {currentValue}/{habit.target.value}
                  {habit.target.unit ? ` ${habit.target.unit}` : ''}
                </span>
              )}
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
                <NumericStepper
                  habit={habit}
                  initialValue={currentValue}
                  onSubmit={(value) => handleNumericSubmit(habit, value)}
                />
              )}
            </div>
          );
        })}
      </section>

      <section className="ltk-habit-dashboard__completed">
        <h3>Completed</h3>
        {completed.map(({ habit, value }) => (
          <div key={habit.id} className="ltk-habit-row ltk-habit-row--done" onClick={() => onOpenDetail(habit)}>
            <span className="ltk-habit-row__icon">{habit.icon}</span>
            <span className="ltk-habit-row__name">{habit.name}</span>
            {habit.type === 'numeric' ? (
              <NumericStepper
                habit={habit}
                initialValue={typeof value === 'number' ? value : 0}
                onSubmit={(v) => handleNumericSubmit(habit, v)}
              />
            ) : (
              <>
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
                {editingId === habit.id && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBooleanComplete(habit);
                    }}
                  >
                    Confirm
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
