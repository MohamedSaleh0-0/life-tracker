// Generic calendar-day heatmap grid. Module-agnostic — takes a
// caller-defined `status` string per day and a status->color map.
//
// Update: hovering a day now shows a proper floating tooltip (date +
// status/value) instead of relying on the browser's native SVG
// <title> tooltip, which renders inconsistently (slow to appear, no
// theme styling, sometimes doesn't show at all in Obsidian's Electron
// shell). The <title> element is kept as a fallback for
// touch/accessibility, but the visible hover UI is now a themed div
// matching the rest of the plugin's tooltips (e.g. chart tooltips).
//
// Per-day `color` override remains: some data isn't well modeled as a
// fixed set of statuses with one color each (e.g. a numeric habit's
// logged value, which wants a continuous intensity spectrum rather
// than a flat "done" green). When `color` is present on a day, it
// wins over the statusColors lookup for that cell only.

import React, { useState } from 'react';

export interface HeatmapDay {
  date: string;
  status: string;
  label?: string;
  /** Overrides statusColors[status] for this specific day, e.g. a value-intensity color. */
  color?: string;
}

export interface CalendarHeatmapProps {
  days: HeatmapDay[];
  statusColors: Record<string, string>;
  weekStartsOn: 'monday' | 'sunday' | 'saturday';
  cellSize?: number;
  emptyColor?: string;
  /** Human-readable label per status, used to build a default hover tooltip when a day has no explicit `label` (e.g. "Done", "Missed", "Not scheduled"). */
  statusLabels?: Record<string, string>;
}

interface HoverState {
  day: HeatmapDay;
  x: number;
  y: number;
}

export function CalendarHeatmap({
  days,
  statusColors,
  weekStartsOn,
  cellSize = 12,
  emptyColor = 'var(--background-modifier-border)',
  statusLabels,
}: CalendarHeatmapProps) {
  const [hover, setHover] = useState<HoverState | null>(null);

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
  const width = weeks.length * step;
  const height = 7 * step;

  const tooltipLabel = (day: HeatmapDay): string => {
    if (day.label) return day.label;
    const statusText = statusLabels?.[day.status] ?? day.status;
    return `${day.date}: ${statusText}`;
  };

  return (
    <div className="ltk-calendar-heatmap-wrap" style={{ position: 'relative', width, height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Calendar heatmap"
        className="ltk-calendar-heatmap"
      >
        {weeks.map((week, weekIdx) =>
          week.map((date, dayIdx) => {
            if (!date) return null;
            const entry = byDate.get(date);
            const color = entry ? entry.color ?? statusColors[entry.status] ?? emptyColor : emptyColor;
            return (
              <rect
                key={date}
                x={weekIdx * step}
                y={dayIdx * step}
                width={cellSize}
                height={cellSize}
                rx={2}
                fill={color}
                onMouseEnter={(e) => {
                  if (!entry) return;
                  const rect = (e.target as SVGRectElement).getBoundingClientRect();
                  setHover({ day: entry, x: rect.left + rect.width / 2, y: rect.top });
                }}
                onMouseLeave={() => setHover(null)}
              >
                <title>{entry ? tooltipLabel(entry) : date}</title>
              </rect>
            );
          })
        )}
      </svg>
      {hover && (
        <div
          className="ltk-chart-tooltip ltk-calendar-heatmap__tooltip"
          style={{
            position: 'fixed',
            left: hover.x,
            top: hover.y,
            transform: 'translate(-50%, calc(-100% - 8px))',
            pointerEvents: 'none',
            zIndex: 100,
          }}
        >
          {tooltipLabel(hover.day)}
        </div>
      )}
    </div>
  );
}
