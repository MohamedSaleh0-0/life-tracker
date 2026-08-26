// Pure domain logic: whether a logged value counts as "done" for a
// habit. No I/O.
//
// Explicit reversal of design-habit-tracking.md's earlier resolved
// Edge Case ("logging any value — including below target — counts as
// 'done'; the target is informational/for progress display only").
// Per direct user steer, a numeric habit with a target no longer
// counts as done until the logged value actually reaches it — the
// target is now a real completion gate, not just a progress label.
// Boolean habits, and numeric habits with no target configured, are
// unaffected: logging anything still counts as done for them.

import { HabitDefinition, HabitLogValue } from './types';

export function meetsCompletion(habit: HabitDefinition, value: HabitLogValue | undefined): boolean {
  if (value === undefined) return false;
  if (habit.type === 'numeric' && habit.target) {
    return typeof value === 'number' && value >= habit.target.value;
  }
  return true;
}
