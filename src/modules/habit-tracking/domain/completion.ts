// Pure domain logic: whether a logged value counts as "done" for a
// habit. No I/O.
//
// Numeric-with-target: logging below target does NOT count as done —
// the target is a real completion gate (per prior direct user steer).
// Boolean habits, numeric habits with no target, and 'levels' habits
// all complete on ANY valid logged value — for 'levels', the whole
// point is capturing *which* named level was done, not gating
// completion on reaching a specific one (same "any cell counts"
// principle the deferred Elastic Mode concept used).

import { HabitDefinition, HabitLogValue } from './types';

export function meetsCompletion(habit: HabitDefinition, value: HabitLogValue | undefined): boolean {
  if (value === undefined) return false;

  if (habit.type === 'numeric' && habit.target) {
    return typeof value === 'number' && value >= habit.target.value;
  }

  if (habit.type === 'levels') {
    if (typeof value !== 'string') return false;
    return (habit.levels ?? []).some((l) => l.id === value);
  }

  return true;
}
