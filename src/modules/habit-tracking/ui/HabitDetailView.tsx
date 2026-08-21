// Streak numbers, calendar heatmap, and the per-habit trend-visibility
// toggle. See design-habit-tracking.md §Key Flows (Streaks & Heatmap),
// REQ-H009-H013, REQ-H015-H016.

import React, { useEffect, useState } from 'react';
import { App } from 'obsidian';
import { CalendarHeatmap, HeatmapDay } from '../../../shared/ui-kit/CalendarHeatmap';
import { HabitService, DeleteRequiresConfirmationError } from '../application/habitService';
import { HabitDefinition, HabitHistoryResult, WeekStartsOn } from '../domain/types';
import { getTodayLocal, addDaysLocal } from '../../../core/date';
import { HabitDeleteConfirmModal } from './HabitDeleteConfirmModal';

export interface HabitDetailViewProps {
  app: App; // needed to open HabitDeleteConfirmModal
  habit: HabitDefinition;
  habitService: HabitService;
  /**
   * Sourced from a placeholder constant until the cross-cutting settings
   * shell exists (see tasks-habit-tracking.md Notes) — wire this to the
   * real global "week starts on" setting once that shell is built.
   */
  weekStartsOn: WeekStartsOn;
  onToggleTrendVisible: (visible: boolean) => void;
  /** Called after either an immediate delete or a confirmed delete completes. */
  onDeleted: () => void;
  /** Called after archiving; the caller typically navigates away, same as onDeleted. */
  onArchived: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  done: 'var(--color-green, #22c55e)',
  missed: 'var(--color-red, #ef4444)',
  'not-scheduled': 'var(--background-modifier-border)',
};

export function HabitDetailView({
  app,
  habit,
  habitService,
  weekStartsOn,
  onToggleTrendVisible,
  onDeleted,
  onArchived,
}: HabitDetailViewProps) {
  const [history, setHistory] = useState<HabitHistoryResult | null>(null);
  const [rangeStart] = useState(() => addDaysLocal(getTodayLocal(), -90));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await habitService.getHabitHistory(habit.id, rangeStart, weekStartsOn);
      if (!cancelled) setHistory(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [habit.id, rangeStart, weekStartsOn, habitService]);

  const heatmapDays: HeatmapDay[] = (history?.days ?? []).map((d) => ({
    date: d.date,
    status: d.status,
  }));

  const handleDeleteClick = async () => {
    try {
      // Try an unconfirmed delete first — if there's no history, this
      // succeeds immediately (REQ-H015: confirmation is only required
      // "if the user attempts to delete a habit that has existing
      // completion history").
      await habitService.deleteHabit(habit.id);
      onDeleted();
    } catch (err) {
      if (err instanceof DeleteRequiresConfirmationError) {
        new HabitDeleteConfirmModal(app, habitService, habit, onDeleted).open();
      } else {
        throw err;
      }
    }
  };

  const handleArchiveClick = async () => {
    await habitService.archiveHabit(habit.id);
    onArchived();
  };

  return (
    <div className="ltk-habit-detail">
      <header className="ltk-habit-detail__header">
        <span className="ltk-habit-detail__icon">{habit.icon}</span>
        <h2>{habit.name}</h2>
      </header>

      {history && (
        <div className="ltk-habit-detail__stats">
          <div className="ltk-stat">
            <span className="ltk-stat__value">{history.currentStreak}</span>
            <span className="ltk-stat__label">Current streak</span>
          </div>
          <div className="ltk-stat">
            <span className="ltk-stat__value">{history.longestStreak}</span>
            <span className="ltk-stat__label">Longest streak</span>
          </div>
          <div className="ltk-stat">
            <span className="ltk-stat__value">{Math.round(history.completionRate * 100)}%</span>
            <span className="ltk-stat__label">Completion rate</span>
          </div>
        </div>
      )}

      <label className="ltk-habit-detail__trend-toggle">
        <input
          type="checkbox"
          checked={habit.trendVisible}
          onChange={(e) => onToggleTrendVisible(e.target.checked)}
        />
        Show trend
      </label>

      {habit.trendVisible && heatmapDays.length > 0 && (
        <CalendarHeatmap days={heatmapDays} statusColors={STATUS_COLORS} weekStartsOn={weekStartsOn} />
      )}

      <div className="ltk-habit-detail__lifecycle-actions">
        <button type="button" onClick={handleArchiveClick}>
          Archive
        </button>
        <button type="button" className="mod-warning" onClick={handleDeleteClick}>
          Delete
        </button>
      </div>
    </div>
  );
}
