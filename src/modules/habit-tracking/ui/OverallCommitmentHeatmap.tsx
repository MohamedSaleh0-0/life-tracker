// Daily aggregate-commitment heatmap for the main Habits view — shows
// how consistently ALL habits together were kept, not any single
// habit's own history (that's HabitDetailView's job). One cell per
// day; color intensity reflects what fraction of that day's scheduled
// habits were actually completed:
//   - all of them done            -> brightest
//   - at or below the dim threshold (default 50%, configurable in
//     Settings → Habit Tracking) but at least one done -> dimmest
//     colored shade
//   - literally zero done         -> uncolored (grey), same as a day
//     with no habits scheduled at all
// A teal/cyan hue is used deliberately, distinct from the violet
// spectrum HabitDetailView uses for one numeric habit's intensity and
// from the boolean green/red palette — this is a different kind of
// thing (an aggregate across habits) and shouldn't look like either.

import React, { useEffect, useState } from 'react';
import { CalendarHeatmap, HeatmapDay } from '../../../shared/ui-kit/CalendarHeatmap';
import { HabitService } from '../application/habitService';
import { WeekStartsOn } from '../domain/types';
import { getTodayLocal, addDaysLocal } from '../../../core/date';

export interface OverallCommitmentHeatmapProps {
  habitService: HabitService;
  weekStartsOn: WeekStartsOn;
  dimThresholdPercent: number;
  /** Bumped by the parent to force a re-fetch (e.g. the Refresh button, or after logging a habit). */
  refreshKey: number;
}

const NEUTRAL_COLOR = 'var(--background-modifier-border)';

/** ratio is 0-1 (doneCount/scheduledCount), already known to be > 0. */
function commitmentColorByRatio(ratio: number, thresholdPercent: number): string {
  const thresholdRatio = Math.min(Math.max(thresholdPercent / 100, 0), 0.999);
  const clamped = Math.max(ratio, thresholdRatio);
  const intensity = (clamped - thresholdRatio) / (1 - thresholdRatio);
  const lightness = 82 - intensity * 52; // pale (82%) at the threshold, deep (30%) at 100%
  const saturation = 38 + intensity * 42;
  return `hsl(190, ${saturation}%, ${lightness}%)`;
}

function commitmentColor(doneCount: number, scheduledCount: number, thresholdPercent: number): string {
  if (scheduledCount === 0 || doneCount === 0) return NEUTRAL_COLOR;
  return commitmentColorByRatio(doneCount / scheduledCount, thresholdPercent);
}

export function OverallCommitmentHeatmap({
  habitService,
  weekStartsOn,
  dimThresholdPercent,
  refreshKey,
}: OverallCommitmentHeatmapProps) {
  const [days, setDays] = useState<{ date: string; doneCount: number; scheduledCount: number }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const rangeStart = addDaysLocal(getTodayLocal(), -90);
    habitService.getOverallCommitmentHistory(rangeStart).then((result) => {
      if (!cancelled) setDays(result);
    });
    return () => {
      cancelled = true;
    };
  }, [habitService, refreshKey]);

  if (!days) return null;
  if (days.every((d) => d.scheduledCount === 0)) {
    return <p className="ltk-empty">No scheduled habits yet — this fills in once you have at least one.</p>;
  }

  const heatmapDays: HeatmapDay[] = days.map((d) => {
    if (d.scheduledCount === 0) {
      return { date: d.date, status: 'not-scheduled', color: NEUTRAL_COLOR, label: `${d.date}: no habits scheduled` };
    }
    const pct = Math.round((d.doneCount / d.scheduledCount) * 100);
    return {
      date: d.date,
      status: d.doneCount === 0 ? 'none' : 'some',
      color: commitmentColor(d.doneCount, d.scheduledCount, dimThresholdPercent),
      label: `${d.date}: ${d.doneCount}/${d.scheduledCount} habits (${pct}%)`,
    };
  });

  return (
    <div className="ltk-commitment-heatmap">
      <h3>Overall commitment</h3>
      <CalendarHeatmap days={heatmapDays} statusColors={{}} weekStartsOn={weekStartsOn} />
      <div className="ltk-heatmap-legend">
        <span>{dimThresholdPercent}% or below</span>
        <span
          className="ltk-heatmap-legend__swatch"
          style={{
            background: `linear-gradient(90deg, ${commitmentColorByRatio(dimThresholdPercent / 100, dimThresholdPercent)}, ${commitmentColorByRatio(1, dimThresholdPercent)})`,
          }}
        />
        <span>100% done</span>
        <span className="ltk-heatmap-legend__dot" style={{ background: NEUTRAL_COLOR }} /> 0% / none scheduled
      </div>
    </div>
  );
}
