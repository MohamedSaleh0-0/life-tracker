// Generic calendar-day heatmap grid. Deliberately module-agnostic — it
// takes a caller-defined `status` string per day and a status->color
// map, rather than importing habit-tracking's DayStatus type directly,
// so this component stays usable by other modules later without a
// dependency from shared/ui-kit back into a specific module's domain.
// See design-habit-tracking.md §Technology Choices.

import React from 'react';

export interface HeatmapDay {
  date: string; // YYYY-MM-DD
  status: string; // caller-defined status key, looked up in `statusColors`
  label?: string; // optional tooltip text, defaults to the date
}

export interface CalendarHeatmapProps {
  days: HeatmapDay[];
  statusColors: Record<string, string>; // status key -> CSS color (var(...) or hex)
  weekStartsOn: 'monday' | 'sunday';
  cellSize?: number; // px, defaults to 12
  emptyColor?: string; // color for dates with no entry in `days`
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

  // Every date from first to last inclusive, so gaps in `days` render
  // as empty cells rather than silently collapsing the grid.
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

  // Group into week columns; row index within a week respects weekStartsOn.
  const weeks: string[][] = [];
  let currentWeek: string[] = [];
  for (const date of allDates) {
    const jsDay = new Date(date + 'T00:00:00').getDay(); // 0=Sun..6=Sat
    const rowIndex = weekStartsOn === 'monday' ? (jsDay + 6) % 7 : jsDay;
    if (currentWeek.length === 0 && rowIndex !== 0) {
      currentWeek = new Array(rowIndex).fill(''); // pad so rows line up
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
