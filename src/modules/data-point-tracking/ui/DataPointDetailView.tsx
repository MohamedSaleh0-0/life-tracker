// Trend chart (Recharts) for number/time-of-day/duration data points,
// or a recent-entries list for text data points (REQ-D010/D011) — the
// type determines which is shown. Plus edit/archive/delete lifecycle
// actions, mirroring HabitDetailView.

import React, { useEffect, useState } from 'react';
import { App } from 'obsidian';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, TooltipProps } from 'recharts';
import { DataPointService, DeleteRequiresConfirmationError } from '../application/dataPointService';
import { DataPointDefinition, DataPointEntry, TrendPoint } from '../domain/types';
import { getTodayLocal, addDaysLocal } from '../../../core/date';
import { DataPointWizardModal } from './DataPointWizardModal';
import { ConfirmModal } from '../../../shared/ui-kit/ConfirmModal';
import { formatDurationMinutes } from '../domain/duration';

export interface DataPointDetailViewProps {
  app: App;
  dataPoint: DataPointDefinition;
  dataPointService: DataPointService;
  onBack: () => void;
  onEdited: () => void;
  onDeleted: () => void;
  onArchived: () => void;
}

function minutesToHHMM(mins: number): string {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, '0');
  const m = Math.floor(mins % 60)
    .toString()
    .padStart(2, '0');
  return `${h}:${m}`;
}

function TrendTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload as TrendPoint;
  return (
    <div className="ltk-chart-tooltip">
      <div>
        {point.date} {point.time}
      </div>
      <strong>{point.label}</strong>
    </div>
  );
}

export function DataPointDetailView({
  app,
  dataPoint,
  dataPointService,
  onBack,
  onEdited,
  onDeleted,
  onArchived,
}: DataPointDetailViewProps) {
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [textEntries, setTextEntries] = useState<DataPointEntry[] | null>(null);
  const [rangeStart] = useState(() => addDaysLocal(getTodayLocal(), -90));

  const isChartType = dataPoint.type !== 'text';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = getTodayLocal();
      if (!isChartType) {
        const entries = await dataPointService.getEntriesInRange(dataPoint.id, rangeStart, today);
        if (!cancelled) setTextEntries(entries.slice().reverse());
      } else {
        const points = await dataPointService.getTrend(dataPoint.id, rangeStart, today);
        if (!cancelled) setTrend(points);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataPoint.id, dataPoint.type, isChartType, rangeStart, dataPointService]);

  const handleEditClick = () => {
    new DataPointWizardModal(app, dataPointService, dataPoint, onEdited).open();
  };

  const handleDeleteClick = async () => {
    try {
      // Unconfirmed delete first — succeeds immediately if there's no
      // history, same pattern as Habit Tracking's REQ-H015 handling.
      await dataPointService.deleteDataPoint(dataPoint.id);
      onDeleted();
    } catch (err) {
      if (err instanceof DeleteRequiresConfirmationError) {
        new ConfirmModal(
          app,
          `Delete "${dataPoint.name}"?`,
          'This data point has logged history. Deleting it removes the definition — historical entries are left in place, unlinked, rather than rewritten out of your markdown files.',
          async () => {
            await dataPointService.deleteDataPoint(dataPoint.id, true);
            onDeleted();
          }
        ).open();
      } else {
        throw err;
      }
    }
  };

  const handleArchiveClick = async () => {
    await dataPointService.archiveDataPoint(dataPoint.id);
    onArchived();
  };

  return (
    <div className="ltk-datapoint-detail">
      <button type="button" className="ltk-back-button" onClick={onBack}>
        ← Back
      </button>
      <header className="ltk-datapoint-detail__header">
        <h2>{dataPoint.name}</h2>
      </header>

      {!isChartType ? (
        <ul className="ltk-datapoint-detail__text-list">
          {textEntries === null && <li className="ltk-empty">Loading…</li>}
          {textEntries?.length === 0 && <li className="ltk-empty">No entries yet.</li>}
          {textEntries?.map((entry) => (
            <li key={entry.id}>
              <span className="ltk-datapoint-entry__time">
                {entry.date} {entry.time}
              </span>
              <span className="ltk-datapoint-entry__value">{String(entry.value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ltk-datapoint-detail__chart">
          {trend && trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={
                    dataPoint.type === 'time'
                      ? (v: number) => minutesToHHMM(v)
                      : dataPoint.type === 'duration'
                        ? (v: number) => formatDurationMinutes(v)
                        : undefined
                  }
                  width={dataPoint.type === 'time' || dataPoint.type === 'duration' ? 48 : 32}
                />
                <Tooltip content={<TrendTooltip />} />
                <Line type="monotone" dataKey="value" stroke="var(--interactive-accent)" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            trend && <p className="ltk-empty">No entries yet in the last 90 days.</p>
          )}
        </div>
      )}

      <div className="ltk-habit-detail__lifecycle-actions">
        <button type="button" onClick={handleEditClick}>
          Edit
        </button>
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
