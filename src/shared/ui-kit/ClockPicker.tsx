// Interactive circular clock picker supporting both single-time selection (time-of-day)
// and range selection (duration/sleep spans that can cross midnight).
// Maintains drag-snap precision via snapMinutes.

import React, { useRef, useState } from 'react';

export interface ClockPickerSingleProps {
  mode: 'single';
  value: string; // HH:MM (24-hour)
  onChange: (value: string) => void;
  snapMinutes?: number;
}

export interface ClockPickerRangeProps {
  mode: 'range';
  startValue: string; // HH:MM
  endValue: string; // HH:MM
  onChange: (start: string, end: string) => void;
  snapMinutes?: number;
}

export type ClockPickerProps = ClockPickerSingleProps | ClockPickerRangeProps;

const HALF_DAY = 720; // 12 hours in minutes

function parseMinutes(hhmm: string): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatMinutes(totalMinutes: number): string {
  const normalized = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const h = String(Math.floor(normalized / 60)).padStart(2, '0');
  const m = String(normalized % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function ClockPicker(props: ClockPickerProps) {
  const snapMinutes = props.snapMinutes ?? 5;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<'single' | 'start' | 'end' | null>(null);

  // Single mode meridiem toggle state
  const isSingle = props.mode === 'single';
  const currentMinutes = isSingle ? parseMinutes(props.value) : 0;
  const isPM = currentMinutes >= 720;

  const halfDayMinutesFromPointer = (e: React.PointerEvent<SVGElement>, snap: number): number => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const x = e.clientX - cx;
    const y = e.clientY - cy;

    // Angle in degrees from 12 o'clock clockwise (0 to 360)
    let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;

    // Convert 360 deg -> 720 minutes (12h face)
    const raw = (angle / 360) * HALF_DAY;
    return (((Math.round(raw / snap) * snap) % HALF_DAY) + HALF_DAY) % HALF_DAY;
  };

  const handlePointerDown = (handle: 'single' | 'start' | 'end', e: React.PointerEvent<SVGElement>) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDraggingHandle(handle);

    const halfDayMins = halfDayMinutesFromPointer(e, snapMinutes);
    if (props.mode === 'single') {
      const newTotal = halfDayMins + (isPM ? 720 : 0);
      props.onChange(formatMinutes(newTotal));
    } else if (handle === 'start') {
      const currentEnd = parseMinutes(props.endValue);
      props.onChange(formatMinutes(halfDayMins), formatMinutes(currentEnd));
    } else {
      const currentStart = parseMinutes(props.startValue);
      props.onChange(formatMinutes(currentStart), formatMinutes(halfDayMins));
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGElement>) => {
    if (!draggingHandle) return;
    const halfDayMins = halfDayMinutesFromPointer(e, snapMinutes);

    if (props.mode === 'single') {
      const newTotal = halfDayMins + (isPM ? 720 : 0);
      props.onChange(formatMinutes(newTotal));
    } else if (draggingHandle === 'start') {
      const currentEnd = parseMinutes(props.endValue);
      props.onChange(formatMinutes(halfDayMins), formatMinutes(currentEnd));
    } else if (draggingHandle === 'end') {
      const currentStart = parseMinutes(props.startValue);
      props.onChange(formatMinutes(currentStart), formatMinutes(halfDayMins));
    }
  };

  const handlePointerUp = () => {
    if (draggingHandle) {
      setDraggingHandle(null);
    }
  };

  const toggleMeridiem = (pm: boolean) => {
    if (!isSingle) return;
    const currentHalfDay = currentMinutes % 720;
    const newTotal = currentHalfDay + (pm ? 720 : 0);
    props.onChange(formatMinutes(newTotal));
  };

  // Clock geometry
  const center = 100;
  const radius = 80;
  const angleToCoord = (deg: number, r: number) => {
    const rad = (deg - 90) * (Math.PI / 180);
    return { x: center + r * Math.cos(rad), y: center + r * Math.sin(rad) };
  };

  const singleAngle = ((currentMinutes % 720) / 720) * 360;
  const singleCoord = angleToCoord(singleAngle, radius - 15);

  const startMins = !isSingle ? parseMinutes(props.startValue) % 720 : 0;
  const endMins = !isSingle ? parseMinutes(props.endValue) % 720 : 0;
  const startAngle = (startMins / 720) * 360;
  const endAngle = (endMins / 720) * 360;
  const startCoord = angleToCoord(startAngle, radius - 15);
  const endCoord = angleToCoord(endAngle, radius - 15);

  // SVG Arc calculation for range mode
  let arcD = '';
  if (!isSingle) {
    let diff = endAngle - startAngle;
    if (diff < 0) diff += 360;
    const largeArc = diff > 180 ? 1 : 0;
    const p1 = angleToCoord(startAngle, radius - 15);
    const p2 = angleToCoord(endAngle, radius - 15);
    arcD = `M ${p1.x} ${p1.y} A ${radius - 15} ${radius - 15} 0 ${largeArc} 1 ${p2.x} ${p2.y}`;
  }

  return (
    <div className="ltk-clock-picker">
      {isSingle && (
        <div className="ltk-clock-picker__meridiem">
          <button
            type="button"
            className={!isPM ? 'is-active' : ''}
            onClick={() => toggleMeridiem(false)}
          >
            AM
          </button>
          <button
            type="button"
            className={isPM ? 'is-active' : ''}
            onClick={() => toggleMeridiem(true)}
          >
            PM
          </button>
        </div>
      )}

      <svg
        ref={svgRef}
        className="ltk-clock-picker__face"
        width={200}
        height={200}
        viewBox="0 0 200 200"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Face Background */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="var(--background-secondary)"
          stroke="var(--background-modifier-border)"
        />

        {/* 12-Hour markers */}
        {Array.from({ length: 12 }, (_, i) => {
          const num = i === 0 ? 12 : i;
          const pos = angleToCoord(i * 30, radius - 26);
          return (
            <text
              key={num}
              x={pos.x}
              y={pos.y}
              fontSize="10"
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--text-faint)"
            >
              {num}
            </text>
          );
        })}

        {isSingle ? (
          <>
            {/* Hand Line & Pointer */}
            <line
              x1={center}
              y1={center}
              x2={singleCoord.x}
              y2={singleCoord.y}
              stroke="var(--interactive-accent)"
              strokeWidth={2}
            />
            <circle
              cx={singleCoord.x}
              cy={singleCoord.y}
              r={12}
              fill="var(--interactive-accent)"
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => handlePointerDown('single', e)}
            />
          </>
        ) : (
          <>
            {/* Range Arc */}
            <path d={arcD} fill="none" stroke="var(--interactive-accent)" strokeWidth={4} opacity={0.6} />
            {/* Start Handle */}
            <circle
              cx={startCoord.x}
              cy={startCoord.y}
              r={10}
              fill="var(--color-green, #22c55e)"
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => handlePointerDown('start', e)}
            />
            {/* End Handle */}
            <circle
              cx={endCoord.x}
              cy={endCoord.y}
              r={10}
              fill="var(--interactive-accent)"
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => handlePointerDown('end', e)}
            />
          </>
        )}
      </svg>

      {/* Manual input fallback / mirror */}
      {isSingle ? (
        <div className="ltk-clock-picker__manual">
          <input
            type="time"
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
          />
        </div>
      ) : (
        <div className="ltk-clock-picker__manual-row">
          <div className="ltk-clock-picker__manual">
            <label>Start</label>
            <input
              type="time"
              value={props.startValue}
              onChange={(e) => props.onChange(e.target.value, props.endValue)}
            />
          </div>
          <div className="ltk-clock-picker__manual">
            <label>End</label>
            <input
              type="time"
              value={props.endValue}
              onChange={(e) => props.onChange(props.startValue, e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}