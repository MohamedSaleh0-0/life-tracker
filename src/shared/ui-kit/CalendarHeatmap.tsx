// Generic calendar-day heatmap grid. Module-agnostic — takes a
// caller-defined `status` string per day and a status->color map.

import React from 'react';

export interface HeatmapDay {
  date: string;
  status: string;
  label?: string;
}

export interface CalendarHeatmapProps {
  days: HeatmapDay[];
  statusColors: Record<string, string>;
  weekStartsOn: 'monday' | 'sunday' | 'saturday';
  cellSize?: number;
  emptyColor?: string;
}

export function CalendarHeatmap({
  days,
  statusColors,
  weekStartsOn,
  cellSize = 12,
  emptyColor = 'var(--background-modifier-border)',
}: CalendarHeatmapProps) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const sortedDates = [...byDate.keys()].sort();
  if (sortedDates.length === 0) return null;

  const first = sortedDates[0];
  const last = sortedDates[sortedDates.length - 1];

  const allDates: string[] = [];
  const cursor = new Date(first + 'T00:00:00');
  const end = new Date(last + 'T00:00:00');
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    allDates.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  const weeks: string[][] = [];
  let currentWeek: string[] = [];
  for (const date of allDates) {
    const jsDay = new Date(date + 'T00:00:00').getDay();
    const rowIndex =
      weekStartsOn === 'monday'
        ? (jsDay + 6) % 7
        : weekStartsOn === 'saturday'
        ? (jsDay + 1) % 7
        : jsDay;

    if (currentWeek.length === 0 && rowIndex !== 0) {
      currentWeek = new Array(rowIndex).fill('');
    }
    currentWeek.push(date);
    if (rowIndex === 6) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const gap = 2;
  const step = cellSize + gap;

  return (
    <svg
      className="ltk-calendar-heatmap"
      width={weeks.length * step}
      height={7 * step}
      role="img"
      aria-label="Calendar heatmap"
    >
      {weeks.map((week, weekIdx) =>
        week.map((date, dayIdx) => {
          if (!date) return null;
          const entry = byDate.get(date);
          const color = entry ? (statusColors[entry.status] ?? emptyColor) : emptyColor;
          return (
            <rect
              key={date}
              x={weekIdx * step}
              y={dayIdx * step}
              width={cellSize}
              height={cellSize}
              rx={2}
              fill={color}
            >
              <title>{entry?.label ?? date}</title>
            </rect>
          );
        })
      )}
    </svg>
  );
}