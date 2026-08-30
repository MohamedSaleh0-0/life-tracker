// Pending/completed split for today, with one-tap boolean completion,
// numeric quick entry, and (new) a level-chip picker for 'levels'
// habits. REQ-H006-H008.
//
// Every interactive control inside a row must stop click propagation —
// each row itself navigates to the habit's detail view on click
// (onOpenDetail), so any inner button that forgets stopPropagation()
// will both perform its own action AND bubble into an unwanted
// navigation.
//
// A numeric habit with a target stays in "Pending" until the logged
// value actually reaches target (domain/completion.ts) — the pending
// stepper seeds from today's actual partial progress. A 'levels'
// habit stays pending until any level is tapped; tapping a chip
// commits immediately (same "one tap, no extra confirm" feel as the
// boolean Done button), and re-tapping a different chip once
// completed just re-logs that level for today.

import React, { useEffect, useState } from 'react';
import { HabitService, CompletedHabitEntry } from '../application/habitService';
import { HabitDefinition, HabitLogValue } from '../domain/types';

export interface HabitDashboardListProps {
  habitService: HabitService;
  onOpenDetail: (habit: HabitDefinition) => void;
}

function levelLabel(habit: HabitDefinition, levelId: string): string {
  return habit.levels?.find((l) => l.id === levelId)?.label ?? levelId;
}

function formatValue(habit: HabitDefinition, value: HabitLogValue): string {
  if (typeof value === 'boolean') return value ? '✓' : '—';
  if (habit.type === 'levels' && typeof value === 'string') return levelLabel(habit, value);
  const unit = habit.target?.unit;
  return unit ? `${value} ${unit}` : String(value);
}

/**
 * +/- stepper for numeric habits (e.g. glasses of water, cigarettes
 * avoided) — replaces a typed number input as the primary interaction.
 * Each tap commits immediately via onSubmit, same as a boolean tap.
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
      setText(String(value));
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

/** Tap-to-log chips for a 'levels' habit — one chip per user-defined level, current selection (if any) highlighted. */
function LevelPicker({
  habit,
  selectedLevelId,
  onSelect,
}: {
  habit: HabitDefinition;
  selectedLevelId: string | undefined;
  onSelect: (levelId: string) => void;
}) {
  return (
    <div className="ltk-level-picker" onClick={(e) => e.stopPropagation()}>
      {(habit.levels ?? []).map((level) => (
        <button
          type="button"
          key={level.id}
          className={level.id === selectedLevelId ? 'is-selected' : ''}
          onClick={() => onSelect(level.id)}
        >
          {level.label}
        </button>
      ))}
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

  const handleLevelSelect = async (habit: HabitDefinition, levelId: string) => {
    await habitService.editTodayLog(habit.id, levelId);
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
          const currentLevelId = typeof loggedValue === 'string' ? loggedValue : undefined;
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
              {habit.type === 'boolean' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBooleanComplete(habit);
                  }}
                >
                  Done
                </button>
              )}
              {habit.type === 'numeric' && (
                <NumericStepper
                  habit={habit}
                  initialValue={currentValue}
                  onSubmit={(value) => handleNumericSubmit(habit, value)}
                />
              )}
              {habit.type === 'levels' && (
                <LevelPicker
                  habit={habit}
                  selectedLevelId={currentLevelId}
                  onSelect={(levelId) => handleLevelSelect(habit, levelId)}
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
            {habit.type === 'numeric' && (
              <NumericStepper
                habit={habit}
                initialValue={typeof value === 'number' ? value : 0}
                onSubmit={(v) => handleNumericSubmit(habit, v)}
              />
            )}
            {habit.type === 'levels' && (
              <LevelPicker
                habit={habit}
                selectedLevelId={typeof value === 'string' ? value : undefined}
                onSelect={(levelId) => handleLevelSelect(habit, levelId)}
              />
            )}
            {habit.type === 'boolean' && (
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
