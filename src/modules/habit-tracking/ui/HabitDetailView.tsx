// Streak numbers, calendar heatmap, and the per-habit trend-visibility
// toggle. See design-habit-tracking.md §Key Flows (Streaks & Heatmap),
// REQ-H009-H013, REQ-H014-H016.
//
// Numeric habits ("drink water: 5 cups") render a violet intensity
// spectrum on the heatmap (light = low value, deep = high value,
// relative to target or the max observed) instead of the boolean
// done/missed/not-scheduled palette, plus a trend line chart and
// average/best insights.
//
// Update: passes `statusLabels` through to CalendarHeatmap so hovering
// a boolean-habit day shows "Done"/"Missed"/"Not scheduled" in the
// tooltip — previously boolean days carried no `label` at all, so the
// (now-fixed) hover tooltip fell back to showing only the bare date
// with no indication of what happened that day.
//
// Update: Gated by FeatureFlags (REQ-C006) — the commitment phase
// actions render only when habitCommitmentPhase is enabled.

import React, { useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, TooltipProps } from 'recharts';
import { CalendarHeatmap, HeatmapDay } from '../../../shared/ui-kit/CalendarHeatmap';
import { HabitService, DeleteRequiresConfirmationError } from '../application/habitService';
import { HabitDefinition, HabitHistoryResult, WeekStartsOn } from '../domain/types';
import { getTodayLocal, addDaysLocal } from '../../../core/date';
import { HabitDeleteConfirmModal } from './HabitDeleteConfirmModal';
import { HabitWizardModal } from './HabitWizardModal';
import { PluginSettingsStore } from '../../../core/pluginSettingsStore';
import { FeatureFlags, DEFAULT_FEATURE_FLAGS } from '../../../core/featureFlags';

export interface HabitDetailViewProps {
  app: App; // needed to open HabitDeleteConfirmModal / HabitWizardModal
  habit: HabitDefinition;
  habitService: HabitService;
  /**
   * Sourced from a placeholder constant until the cross-cutting settings
   * shell exists (see tasks-habit-tracking.md Notes) — wire this to the
   * real global "week starts on" setting once that shell is built.
   */
  weekStartsOn: WeekStartsOn;
  pluginSettingsStore?: PluginSettingsStore;
  featureFlags?: FeatureFlags;
  onToggleTrendVisible: (visible: boolean) => void;
  /** Plain "go back to the list" with no side effect — the missing piece before this fix: previously the only way out of detail view was edit/archive/delete. */
  onBack: () => void;
  /** Called after a successful edit via the wizard (REQ-H014). */
  onEdited: () => void;
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

const STATUS_LABELS: Record<string, string> = {
  done: 'Done',
  missed: 'Missed',
  'not-scheduled': 'Not scheduled',
};

// Violet spectrum for numeric habit intensity — deliberately distinct
// from the green/red/grey boolean palette above, since a numeric value
// isn't a pass/fail bit. Light lavender = low relative to target/max,
// deep violet = at or above it.
function numericIntensityColor(value: number, denom: number): string {
  const safeDenom = denom > 0 ? denom : 1;
  const ratio = Math.max(0, Math.min(1, value / safeDenom));
  const lightness = 86 - ratio * 56; // 86% (pale) down to 30% (deep)
  const saturation = 45 + ratio * 35; // 45% up to 80%
  return `hsl(262, ${saturation}%, ${lightness}%)`;
}

function TrendTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload as { date: string; value: number };
  return (
    <div className="ltk-chart-tooltip">
      <div>{point.date}</div>
      <strong>{point.value}</strong>
    </div>
  );
}

export function HabitDetailView({
  app,
  habit,
  habitService,
  weekStartsOn,
  pluginSettingsStore,
  featureFlags,
  onToggleTrendVisible,
  onBack,
  onEdited,
  onDeleted,
  onArchived,
}: HabitDetailViewProps) {
  const flags = featureFlags ?? DEFAULT_FEATURE_FLAGS;
  const [history, setHistory] = useState<HabitHistoryResult | null>(null);
  const [rangeStart, setRangeStart] = useState<string>(() => addDaysLocal(getTodayLocal(), -90));

  useEffect(() => {
    let cancelled = false;
    if (pluginSettingsStore) {
      pluginSettingsStore.getTrendWindowDays().then((days) => {
        if (!cancelled) {
          setRangeStart(addDaysLocal(getTodayLocal(), -days));
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [pluginSettingsStore]);

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

  const isNumeric = habit.type === 'numeric';
  const isLevels = habit.type === 'levels';

  const numericValues = (history?.days ?? [])
    .map((d) => d.value)
    .filter((v): v is number => typeof v === 'number');
  const maxObserved = numericValues.length > 0 ? Math.max(...numericValues) : 0;
  const intensityDenom = habit.target?.value ?? maxObserved;

  const levelIndexById = new Map((habit.levels ?? []).map((l, i) => [l.id, i]));
  const levelCount = habit.levels?.length ?? 0;

  const heatmapDays: HeatmapDay[] = (history?.days ?? []).map((d) => {
    // Color by "was a value logged", not "status === done" — a
    // below-target day is now classified 'missed' for streak purposes
    // but should still show its magnitude on the spectrum, not vanish.
    if (isNumeric && typeof d.value === 'number') {
      const unit = habit.target?.unit ? ` ${habit.target.unit}` : '';
      const metTarget = habit.target ? d.value >= habit.target.value : true;
      return {
        date: d.date,
        status: d.status,
        color: numericIntensityColor(d.value, intensityDenom),
        label: `${d.date}: ${d.value}${unit}${habit.target ? (metTarget ? ' ✓' : ' (below target)') : ''}`,
      };
    }
    if (isLevels && typeof d.value === 'string') {
      const idx = levelIndexById.get(d.value);
      const label = habit.levels?.find((l) => l.id === d.value)?.label ?? d.value;
      const color = idx !== undefined ? numericIntensityColor(idx, Math.max(levelCount - 1, 1)) : undefined;
      return { date: d.date, status: d.status, color, label: `${d.date}: ${label}` };
    }
    return { date: d.date, status: d.status };
  });

  const trendData = (history?.days ?? [])
    .filter((d): d is typeof d & { value: number } => typeof d.value === 'number')
    .map((d) => ({ date: d.date, value: d.value }));

  const average =
    numericValues.length > 0 ? numericValues.reduce((sum, v) => sum + v, 0) / numericValues.length : 0;
  const best = numericValues.length > 0 ? Math.max(...numericValues) : 0;

  const handleEditClick = () => {
    new HabitWizardModal(app, habitService, weekStartsOn, habit, onEdited, flags).open();
  };

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

  const handleStartNewCommitmentPhase = async () => {
    const confirmed = await new Promise<boolean>((resolve) => {
      const modal = new (class extends Modal {
        onOpen() {
          const { contentEl } = this;
          contentEl.createEl('h2', { text: 'Start new commitment phase?' });
          contentEl.createEl('p', { text: 'Your streak count will restart from today. Nothing is deleted.' });

          const buttonContainer = contentEl.createEl('div', { cls: 'ltk-modal-buttons' });
          buttonContainer.createEl('button', { text: 'Cancel' }).onclick = () => {
            resolve(false);
            this.close();
          };
          buttonContainer.createEl('button', { text: 'Start', cls: 'mod-cta' }).onclick = () => {
            resolve(true);
            this.close();
          };
        }
      })(app);
      modal.open();
    });

    if (confirmed) {
      await habitService.startNewCommitmentPhase(habit.id);
      onEdited();
    }
  };

  return (
    <div className="ltk-habit-detail">
      <button type="button" className="ltk-back-button" onClick={onBack}>
        ← Back
      </button>
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
          {isNumeric && (
            <>
              <div className="ltk-stat">
                <span className="ltk-stat__value">
                  {average % 1 === 0 ? average : average.toFixed(1)}
                  {habit.target?.unit ? <span className="ltk-stat__unit"> {habit.target.unit}</span> : null}
                </span>
                <span className="ltk-stat__label">Average logged</span>
              </div>
              <div className="ltk-stat">
                <span className="ltk-stat__value">
                  {best}
                  {habit.target?.unit ? <span className="ltk-stat__unit"> {habit.target.unit}</span> : null}
                </span>
                <span className="ltk-stat__label">Best day</span>
              </div>
            </>
          )}
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
        <>
          <CalendarHeatmap
            days={heatmapDays}
            statusColors={STATUS_COLORS}
            statusLabels={STATUS_LABELS}
            weekStartsOn={weekStartsOn}
          />
          {isNumeric ? (
            <div className="ltk-heatmap-legend">
              <span>Low</span>
              <span
                className="ltk-heatmap-legend__swatch"
                style={{
                  background: `linear-gradient(90deg, ${numericIntensityColor(0.05 * intensityDenom, intensityDenom)}, ${numericIntensityColor(intensityDenom, intensityDenom)})`,
                }}
              />
              <span>High{habit.target ? ` (target: ${habit.target.value}${habit.target.unit ? ' ' + habit.target.unit : ''})` : ''}</span>
            </div>
          ) : isLevels ? (
            <div className="ltk-heatmap-legend">
              {(habit.levels ?? []).map((level, i) => (
                <span key={level.id} className="ltk-heatmap-legend__level">
                  <span
                    className="ltk-heatmap-legend__dot"
                    style={{ background: numericIntensityColor(i, Math.max(levelCount - 1, 1)) }}
                  />
                  {level.label}
                </span>
              ))}
            </div>
          ) : (
            <div className="ltk-heatmap-legend">
              <span className="ltk-heatmap-legend__dot" style={{ background: STATUS_COLORS.done }} /> Done
              <span className="ltk-heatmap-legend__dot" style={{ background: STATUS_COLORS.missed }} /> Missed
              <span className="ltk-heatmap-legend__dot" style={{ background: STATUS_COLORS['not-scheduled'] }} /> Not scheduled
            </div>
          )}
        </>
      )}

      {habit.trendVisible && isNumeric && trendData.length > 1 && (
        <div className="ltk-habit-detail__chart">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={32} />
              <Tooltip content={<TrendTooltip />} />
              <Line type="monotone" dataKey="value" stroke="hsl(262, 70%, 55%)" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="ltk-habit-detail__lifecycle-actions">
        <button type="button" onClick={handleEditClick}>
          Edit
        </button>
        {flags.habitCommitmentPhase && (
          <button type="button" onClick={handleStartNewCommitmentPhase}>
            Start new commitment phase
          </button>
        )}
        {flags.habitCommitmentPhase && habit.commitmentStartDate && (
          <button
            type="button"
            onClick={async () => {
              await habitService.clearCommitmentPhase(habit.id);
              onEdited();
            }}
          >
            Clear phase start
          </button>
        )}
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