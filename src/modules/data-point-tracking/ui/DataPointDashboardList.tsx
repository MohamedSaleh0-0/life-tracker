// All active data points, each showing today's logged entries as a
// list with an "Add" action and per-entry Edit/Delete (REQ-D007,
// REQ-D008/D012). Unlike habits, data points have no schedule, so
// there's no pending/completed split — every active data point is
// always shown.

import React, { useEffect, useState } from 'react';
import { App } from 'obsidian';
import { DataPointService } from '../application/dataPointService';
import { DataPointDefinition, DataPointEntry } from '../domain/types';
import { DataPointEntryModal } from './DataPointEntryModal';
import { computeDurationMinutes, formatDurationMinutes } from '../domain/duration';
import { getTodayLocal } from '../../../core/date';
import { PluginSettingsStore } from '../../../core/pluginSettingsStore';

export interface DataPointDashboardListProps {
  app: App;
  dataPointService: DataPointService;
  onOpenDetail: (dataPoint: DataPointDefinition) => void;
  pluginSettingsStore?: PluginSettingsStore;
}

function nowHHMM(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatEntryValue(definition: DataPointDefinition, entry: DataPointEntry): string {
  if (definition.type === 'binary') return '✓ occurred';
  if (definition.type === 'number') {
    return definition.unit ? `${entry.value} ${definition.unit}` : String(entry.value);
  }
  if (definition.type === 'duration' && typeof entry.value === 'string') {
    const minutes = computeDurationMinutes(entry.time, entry.value);
    return `${entry.time} → ${entry.value} (${formatDurationMinutes(minutes)})`;
  }
  return String(entry.value);
}

export function DataPointDashboardList({
  app,
  dataPointService,
  onOpenDetail,
  pluginSettingsStore,
}: DataPointDashboardListProps) {
  const [dataPoints, setDataPoints] = useState<DataPointDefinition[]>([]);
  const [entriesByDp, setEntriesByDp] = useState<Map<string, DataPointEntry[]>>(new Map());

  const refresh = async () => {
    const [active, todayEntries] = await Promise.all([
      dataPointService.getActiveDataPoints(),
      dataPointService.getEntriesForToday(),
    ]);
    setDataPoints(active);
    setEntriesByDp(todayEntries);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [active, todayEntries] = await Promise.all([
        dataPointService.getActiveDataPoints(),
        dataPointService.getEntriesForToday(),
      ]);
      if (!cancelled) {
        setDataPoints(active);
        setEntriesByDp(todayEntries);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataPointService]);

  const openAdd = (dp: DataPointDefinition) => {
    if (dp.type === 'binary') {
      dataPointService.logOccurrence(dp.id, getTodayLocal(), nowHHMM()).then(refresh);
      return;
    }
    new DataPointEntryModal(app, dataPointService, dp, undefined, refresh, pluginSettingsStore).open();
  };

  const openEdit = (dp: DataPointDefinition, entry: DataPointEntry) => {
    new DataPointEntryModal(app, dataPointService, dp, entry, refresh, pluginSettingsStore).open();
  };

  const handleDelete = async (entry: DataPointEntry) => {
    await dataPointService.deleteEntry(entry.date, entry.id);
    await refresh();
  };

  return (
    <div className="ltk-datapoint-dashboard">
      {dataPoints.length === 0 && (
        <p className="ltk-empty">No data points yet — create one to start tracking.</p>
      )}
      {dataPoints.map((dp) => {
        const entries = entriesByDp.get(dp.id) ?? [];
        return (
          <div key={dp.id} className="ltk-datapoint-card">
            <div className="ltk-datapoint-card__header" onClick={() => onOpenDetail(dp)}>
              <span className="ltk-datapoint-card__name">{dp.name}</span>
              <span className="ltk-datapoint-card__count">{entries.length} today</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openAdd(dp);
                }}
              >
                + Add
              </button>
            </div>
            {entries.length > 0 && (
              <ul className="ltk-datapoint-card__entries">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <span className="ltk-datapoint-entry__time">{entry.time}</span>
                    <span className="ltk-datapoint-entry__value">{formatEntryValue(dp, entry)}</span>
                    <button type="button" onClick={() => openEdit(dp, entry)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(entry)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}