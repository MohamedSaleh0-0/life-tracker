// Pure domain logic: when is a recurring entry next due, and is it due
// right now (REQ-M019/M020). No I/O.

import { RecurringEntry } from './types';
import { addDaysLocal, addMonthsLocal } from '../../../core/date';

export function calculateNextDueDate(
  entry: Pick<RecurringEntry, 'frequency' | 'dayOfMonth' | 'lastHandledDate' | 'createdAt'>
): string {
  const base = entry.lastHandledDate ?? entry.createdAt;
  switch (entry.frequency) {
    case 'weekly':
      return addDaysLocal(base, 7);
    case 'biweekly':
      return addDaysLocal(base, 14);
    case 'monthly':
      return addMonthsLocal(base, 1, entry.dayOfMonth);
    case 'yearly':
      return addMonthsLocal(base, 12, entry.dayOfMonth);
  }
}

export function isRecurringEntryDue(
  entry: Pick<RecurringEntry, 'frequency' | 'dayOfMonth' | 'lastHandledDate' | 'createdAt'>,
  today: string
): boolean {
  return calculateNextDueDate(entry) <= today;
}
