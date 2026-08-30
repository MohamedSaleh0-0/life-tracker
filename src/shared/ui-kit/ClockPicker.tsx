// A circular clock-face time picker — 12-hour analog face with an
// explicit AM/PM toggle per handle (see the header comment further
// down for why AM/PM is explicit rather than inferred from the dial).
//
// Update (mobile drag bug fix): dragging previously tracked "am I
// dragging, and which handle" in React state, with a `useEffect` that
// added/removed `pointermove`/`pointerup` LISTENERS ON `window`
// whenever that state (or a `useCallback` derived from unstable
// parent-supplied `onChange` props) changed identity — which happened
// on every single value update *during* the drag itself, since each
// update re-rendered the component with new props. On desktop this
// mostly worked by luck; on mobile it meant the effect's
// listener-teardown/re-add cycle raced against the touch never having
// pointer capture set at all, so once the finger moved even slightly,
// the browser's default touch-scroll handling could take over and no
// further `pointermove` events reached us — "only the first touch is
// effective" is exactly that symptom.
//
// Fixed by using the browser's own pointer-capture mechanism instead
// of window listeners: `pointerdown` on the SVG calls
// `setPointerCapture`, which guarantees every subsequent
// `pointermove`/`pointerup` for that exact touch/pointer keeps firing
// on the SVG element itself — regardless of where the finger actually
// is on screen or whether it would otherwise trigger a scroll — until
// `pointerup`/`pointercancel`. Drag state lives in a plain ref, not
// React state, so there's no render-triggered listener churn at all.
//
// Why explicit AM/PM instead of inferring it from the dial: a 24-hour
// wrap (e.g. sleep 10:40 PM -> 6:05 AM) needs the actual minute-of-day
// (0-1439) to compute correctly via computeDurationMinutes — a
// 12-hour face alone can't tell 10:40 AM from 10:40 PM by angle, since
// both land on the same spot on the dial. Each handle gets its own
// small AM/PM toggle instead. Dragging only ever changes the
// hour/minute position within the handle's CURRENT half of the day;
// the toggle is the only thing that flips halves. The underlying value
// is still stored as a plain 24-hour HH:MM string, so
// computeDurationMinutes' wrap-past-midnight logic is untouched.
//
// Two modes:
//  - "single": one draggable handle -> one HH:MM value (time-of-day).
//  - "range": two draggable handles (start/end) with a shaded arc
//    between them -> duration data points.

import React, { useCallback, useRef } from 'react';

const HALF_DAY = 720; // minutes in 12 hours

function clampMinutes(m: number): number {
  return ((m % 1440) + 1440) % 1440;
}

function parseHHMM(v: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

function formatHHMM(minutes: number): string {
  const m = clampMinutes(Math.round(minutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function meridiemOf(minutes: number): 'AM' | 'PM' {
  return clampMinutes(minutes) < HALF_DAY ? 'AM' : 'PM';
}

function halfDayMinutesOf(minutes: number): number {
  return clampMinutes(minutes) % HALF_DAY;
}

function withMeridiem(halfDayMinutes: number, meridiem: 'AM' | 'PM'): number {
  return clampMinutes(halfDayMinutes) + (meridiem === 'PM' ? HALF_DAY : 0);
}

function angleForHalfDayMinutes(halfDayMinutes: number): number {
  return (halfDayMinutes / HALF_DAY) * 2 * Math.PI;
}

function pointForHalfDayMinutes(halfDayMinutes: number, radius: number, center: number): { x: number; y: number } {
  const angle = angleForHalfDayMinutes(halfDayMinutes);
  return {
    x: center + radius * Math.sin(angle),
    y: center - radius * Math.cos(angle),
  };
}

/** Converts a pointer position (relative to the SVG's top-left) into half-day minutes (0-719), snapped to 5-minute steps. */
function halfDayMinutesFromPointer(clientX: number, clientY: number, svg: SVGSVGElement, center: number): number {
  const rect = svg.getBoundingClientRect();
  const scaleX = rect.width > 0 ? (center * 2) / rect.width : 1;
  const scaleY = rect.height > 0 ? (center * 2) / rect.height : 1;
  const x = (clientX - rect.left) * scaleX - center;
  const y = (clientY - rect.top) * scaleY - center;
  let angle = Math.atan2(x, -y); // 0 at top, clockwise positive
  if (angle < 0) angle += 2 * Math.PI;
  const raw = (angle / (2 * Math.PI)) * HALF_DAY;
  return (((Math.round(raw / 5) * 5) % HALF_DAY) + HALF_DAY) % HALF_DAY;
}

function arcPath(startMin: number, endMin: number, radius: number, center: number): string {
  const startHalf = halfDayMinutesOf(startMin);
  const endHalf = halfDayMinutesOf(endMin);
  const span = ((endHalf - startHalf) % HALF_DAY + HALF_DAY) % HALF_DAY;
  const effectiveEnd = startHalf + (span === 0 ? HALF_DAY - 1 : span);
  const start = pointForHalfDayMinutes(startHalf, radius, center);
  const end = pointForHalfDayMinutes(effectiveEnd % HALF_DAY, radius, center);
  const largeArc = span > HALF_DAY / 2 ? 1 : 0;
  return `M ${center} ${center} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function Handle({
  minutes,
  radius,
  center,
  color,
  label,
}: {
  minutes: number;
  radius: number;
  center: number;
  color: string;
  label: string;
}) {
  const { x, y } = pointForHalfDayMinutes(halfDayMinutesOf(minutes), radius, center);
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={x} cy={y} r={11} fill={color} stroke="var(--background-primary)" strokeWidth={2} />
      <title>{label}</title>
    </g>
  );
}

function MeridiemToggle({ value, onChange }: { value: 'AM' | 'PM'; onChange: (v: 'AM' | 'PM') => void }) {
  return (
    <div className="ltk-clock-picker__meridiem">
      <button type="button" className={value === 'AM' ? 'is-active' : ''} onClick={() => onChange('AM')}>
        AM
      </button>
      <button type="button" className={value === 'PM' ? 'is-active' : ''} onClick={() => onChange('PM')}>
        PM
      </button>
    </div>
  );
}

export interface ClockPickerSingleProps {
  mode: 'single';
  value: string; // HH:MM (24h internal)
  onChange: (value: string) => void;
  size?: number;
}

export interface ClockPickerRangeProps {
  mode: 'range';
  startValue: string; // HH:MM (24h internal)
  endValue: string; // HH:MM (24h internal)
  onChange: (startValue: string, endValue: string) => void;
  size?: number;
}

export type ClockPickerProps = ClockPickerSingleProps | ClockPickerRangeProps;

export function ClockPicker(props: ClockPickerProps) {
  const size = props.size ?? 180;
  const center = size / 2;
  const radius = center - 16;
  const svgRef = useRef<SVGSVGElement>(null);
  /** Plain refs, not React state — pointer handlers must never depend on a render cycle to keep working mid-drag. */
  const draggingRef = useRef<'single' | 'start' | 'end' | null>(null);
  const meridiemRef = useRef<'AM' | 'PM'>('AM');
  const activePointerIdRef = useRef<number | null>(null);

  const singleMinutes = props.mode === 'single' ? (parseHHMM(props.value) ?? 0) : 0;
  const startMinutes = props.mode === 'range' ? (parseHHMM(props.startValue) ?? 0) : 0;
  const endMinutes = props.mode === 'range' ? (parseHHMM(props.endValue) ?? 0) : 0;

  const applyMinutes = useCallback(
    (which: 'single' | 'start' | 'end', minutes: number) => {
      if (props.mode === 'single') {
        props.onChange(formatHHMM(minutes));
      } else if (which === 'start') {
        props.onChange(formatHHMM(minutes), formatHHMM(endMinutes));
      } else if (which === 'end') {
        props.onChange(formatHHMM(startMinutes), formatHHMM(minutes));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.mode, props.mode === 'range' ? props.onChange : (props as ClockPickerSingleProps).onChange, startMinutes, endMinutes]
  );

  const pickNearestHandle = (halfDayMin: number): 'start' | 'end' => {
    const startHalf = halfDayMinutesOf(startMinutes);
    const endHalf = halfDayMinutesOf(endMinutes);
    const distStart = Math.min(Math.abs(halfDayMin - startHalf), HALF_DAY - Math.abs(halfDayMin - startHalf));
    const distEnd = Math.min(Math.abs(halfDayMin - endHalf), HALF_DAY - Math.abs(halfDayMin - endHalf));
    return distStart <= distEnd ? 'start' : 'end';
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;

    const halfDayMin = halfDayMinutesFromPointer(e.clientX, e.clientY, svg, center);
    const which = props.mode === 'single' ? 'single' : pickNearestHandle(halfDayMin);
    const currentMinutes = which === 'single' ? singleMinutes : which === 'start' ? startMinutes : endMinutes;

    draggingRef.current = which;
    meridiemRef.current = meridiemOf(currentMinutes);
    applyMinutes(which, withMeridiem(halfDayMin, meridiemRef.current));
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const which = draggingRef.current;
    if (!which || activePointerIdRef.current !== e.pointerId) return;
    const svg = svgRef.current;
    if (!svg) return;
    e.preventDefault();
    const halfDayMin = halfDayMinutesFromPointer(e.clientX, e.clientY, svg, center);
    applyMinutes(which, withMeridiem(halfDayMin, meridiemRef.current));
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    draggingRef.current = null;
    activePointerIdRef.current = null;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released, e.g. after pointercancel — safe to ignore */
    }
  };

  const hourTicks = Array.from({ length: 12 }, (_, i) => i * 60);
  const hourLabel = (m: number) => (m === 0 ? 12 : m / 60);

  return (
    <div className="ltk-clock-picker">
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="ltk-clock-picker__face"
        style={{ touchAction: 'none' }}
      >
        <circle cx={center} cy={center} r={radius} fill="var(--background-primary)" stroke="var(--background-modifier-border)" strokeWidth={2} />
        {props.mode === 'range' && (
          <path d={arcPath(startMinutes, endMinutes, radius, center)} fill="var(--interactive-accent)" opacity={0.25} />
        )}
        {hourTicks.map((m) => {
          const outer = pointForHalfDayMinutes(m, radius, center);
          const inner = pointForHalfDayMinutes(m, radius - 8, center);
          const textPos = pointForHalfDayMinutes(m, radius - 20, center);
          return (
            <g key={m}>
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="var(--text-faint)" strokeWidth={1} />
              <text
                x={textPos.x}
                y={textPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--text-faint)"
              >
                {hourLabel(m)}
              </text>
            </g>
          );
        })}
        {props.mode === 'single' ? (
          <>
            <line
              x1={center}
              y1={center}
              x2={pointForHalfDayMinutes(halfDayMinutesOf(singleMinutes), radius, center).x}
              y2={pointForHalfDayMinutes(halfDayMinutesOf(singleMinutes), radius, center).y}
              stroke="var(--interactive-accent)"
              strokeWidth={2}
              style={{ pointerEvents: 'none' }}
            />
            <Handle
              minutes={singleMinutes}
              radius={radius}
              center={center}
              color="var(--interactive-accent)"
              label={formatHHMM(singleMinutes)}
            />
          </>
        ) : (
          <>
            <Handle
              minutes={startMinutes}
              radius={radius}
              center={center}
              color="var(--color-green, #22c55e)"
              label={`Start: ${formatHHMM(startMinutes)}`}
            />
            <Handle
              minutes={endMinutes}
              radius={radius}
              center={center}
              color="var(--text-error)"
              label={`End: ${formatHHMM(endMinutes)}`}
            />
          </>
        )}
      </svg>

      {props.mode === 'single' ? (
        <div className="ltk-clock-picker__manual">
          <MeridiemToggle
            value={meridiemOf(singleMinutes)}
            onChange={(m) => applyMinutes('single', withMeridiem(halfDayMinutesOf(singleMinutes), m))}
          />
          <label>
            Time
            <input
              type="time"
              value={formatHHMM(singleMinutes)}
              onChange={(e) => {
                const parsed = parseHHMM(e.target.value);
                if (parsed !== null) applyMinutes('single', parsed);
              }}
            />
          </label>
        </div>
      ) : (
        <div className="ltk-clock-picker__manual-row">
          <div className="ltk-clock-picker__manual">
            <MeridiemToggle
              value={meridiemOf(startMinutes)}
              onChange={(m) => applyMinutes('start', withMeridiem(halfDayMinutesOf(startMinutes), m))}
            />
            <label>
              Start
              <input
                type="time"
                value={formatHHMM(startMinutes)}
                onChange={(e) => {
                  const parsed = parseHHMM(e.target.value);
                  if (parsed !== null) applyMinutes('start', parsed);
                }}
              />
            </label>
          </div>
          <div className="ltk-clock-picker__manual">
            <MeridiemToggle
              value={meridiemOf(endMinutes)}
              onChange={(m) => applyMinutes('end', withMeridiem(halfDayMinutesOf(endMinutes), m))}
            />
            <label>
              End
              <input
                type="time"
                value={formatHHMM(endMinutes)}
                onChange={(e) => {
                  const parsed = parseHHMM(e.target.value);
                  if (parsed !== null) applyMinutes('end', parsed);
                }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
