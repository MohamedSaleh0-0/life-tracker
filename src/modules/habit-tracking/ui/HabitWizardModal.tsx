// 4-step creation/edit wizard (name/look → type → schedule → review),
// wrapped as an Obsidian Modal. See design-habit-tracking.md §Key Flows
// (Create Habit), REQ-H001-H005, REQ-H014.
//
// Step components are declared once at module scope and read/write
// shared wizard state via WizardContext, rather than being recreated
// as inline closures on every render (the earlier version's approach —
// harmless functionally, but meant every keystroke created a brand new
// "component", and each step reported validity by calling a setState
// setter directly during another component's render pass instead of
// from an effect). See StepWizard.tsx for the fuller explanation.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { StepWizard, WizardStep, WizardStepProps } from '../../../shared/ui-kit/StepWizard';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { HabitService, NewHabitInput } from '../application/habitService';
import { HabitDefinition, HabitSchedule, WeekStartsOn } from '../domain/types';
import { weekStartInternalIndex } from '../domain/scheduleEvaluator';

function describeSchedule(schedule: HabitSchedule): string {
  switch (schedule.mode) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return schedule.days.length > 0 ? `${schedule.days.length} day(s)/week` : 'No days selected';
    case 'weeklyQuota':
      return `${schedule.timesPerWeek}x per week`;
  }
}

// Fixed internal order (Monday=0..Sunday=6), matching scheduleEvaluator.ts.
const INTERNAL_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function WeekdayPicker({
  selected,
  onChange,
  weekStartsOn,
}: {
  selected: number[];
  onChange: (days: number[]) => void;
  weekStartsOn: WeekStartsOn;
}) {
  // Internal indices are fixed regardless of weekStartsOn — only the
  // *display order* rotates to start from the user's chosen week-start
  // day (REQ-C017's acceptance criterion: "weekday picker order...
  // shift consistently").
  const rotation = weekStartInternalIndex(weekStartsOn);
  const displayOrder = Array.from({ length: 7 }, (_, i) => (i + rotation) % 7);

  const toggle = (idx: number) => {
    onChange(selected.includes(idx) ? selected.filter((d) => d !== idx) : [...selected, idx]);
  };

  return (
    <div className="ltk-weekday-picker">
      {displayOrder.map((idx) => (
        <button
          key={idx}
          type="button"
          className={selected.includes(idx) ? 'is-selected' : ''}
          onClick={() => toggle(idx)}
        >
          {INTERNAL_WEEKDAY_LABELS[idx]}
        </button>
      ))}
    </div>
  );
}

// ---- Shared wizard state ---------------------------------------------
// A small React Context rather than prop-drilling: StepWizard's contract
// fixes each step component's props to just { onValidChange }, so the
// step components pull their shared state from context instead.

interface WizardCtx {
  name: string;
  setName: (v: string) => void;
  icon: string;
  setIcon: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  type: HabitDefinition['type'];
  setType: (v: HabitDefinition['type']) => void;
  targetValue: string;
  setTargetValue: (v: string) => void;
  targetUnit: string;
  setTargetUnit: (v: string) => void;
  schedule: HabitSchedule;
  setSchedule: (v: HabitSchedule) => void;
  weekStartsOn: WeekStartsOn;
}

const WizardContext = createContext<WizardCtx | null>(null);

function useWizardCtx(): WizardCtx {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('Wizard step rendered outside HabitWizardModal\'s WizardContext');
  return ctx;
}

// ---- Steps -------------------------------------------------------------

function NameStep({ onValidChange }: WizardStepProps) {
  const { name, setName, icon, setIcon, color, setColor } = useWizardCtx();

  useEffect(() => {
    onValidChange(name.trim().length > 0);
  }, [name, onValidChange]);

  return (
    <div className="ltk-wizard-step">
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Drink water" />
      </label>
      <label>
        Icon
        <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="✅" />
      </label>
      <label>
        Color
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
    </div>
  );
}

function TypeStep({ onValidChange }: WizardStepProps) {
  const { type, setType, targetValue, setTargetValue, targetUnit, setTargetUnit } = useWizardCtx();

  useEffect(() => {
    onValidChange(true); // target/unit are optional even for numeric — always valid
  }, [onValidChange]);

  return (
    <div className="ltk-wizard-step">
      <label>
        <input type="radio" checked={type === 'boolean'} onChange={() => setType('boolean')} />
        Yes/No
      </label>
      <label>
        <input type="radio" checked={type === 'numeric'} onChange={() => setType('numeric')} />
        Numeric
      </label>
      {type === 'numeric' && (
        <div className="ltk-wizard-step__target">
          <label>
            Target (optional)
            <input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="8000"
            />
          </label>
          <label>
            Unit
            <input value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} placeholder="steps" />
          </label>
        </div>
      )}
    </div>
  );
}

function ScheduleStep({ onValidChange }: WizardStepProps) {
  const { schedule, setSchedule, weekStartsOn } = useWizardCtx();

  useEffect(() => {
    onValidChange(schedule.mode !== 'weekdays' || schedule.days.length > 0);
  }, [schedule, onValidChange]);

  return (
    <div className="ltk-wizard-step">
      <label>
        <input type="radio" checked={schedule.mode === 'daily'} onChange={() => setSchedule({ mode: 'daily' })} />
        Every day
      </label>
      <label>
        <input
          type="radio"
          checked={schedule.mode === 'weekdays'}
          onChange={() => setSchedule({ mode: 'weekdays', days: [] })}
        />
        Specific weekdays
      </label>
      {schedule.mode === 'weekdays' && (
        <WeekdayPicker
          selected={schedule.days}
          onChange={(days) => setSchedule({ mode: 'weekdays', days })}
          weekStartsOn={weekStartsOn}
        />
      )}
      <label>
        <input
          type="radio"
          checked={schedule.mode === 'weeklyQuota'}
          onChange={() => setSchedule({ mode: 'weeklyQuota', timesPerWeek: 3 })}
        />
        X times per week
      </label>
      {schedule.mode === 'weeklyQuota' && (
        <input
          type="number"
          min={1}
          max={7}
          value={schedule.timesPerWeek}
          onChange={(e) => setSchedule({ mode: 'weeklyQuota', timesPerWeek: Number(e.target.value) })}
        />
      )}
    </div>
  );
}

function ReviewStep({ onValidChange }: WizardStepProps) {
  const { icon, name, type, targetValue, targetUnit, schedule } = useWizardCtx();

  useEffect(() => {
    onValidChange(true);
  }, [onValidChange]);

  return (
    <div className="ltk-wizard-step ltk-wizard-step--review">
      <p>
        {icon} <strong>{name}</strong>
      </p>
      <p>Type: {type === 'boolean' ? 'Yes/No' : 'Numeric'}</p>
      {type === 'numeric' && targetValue && (
        <p>
          Target: {targetValue} {targetUnit}
        </p>
      )}
      <p>Schedule: {describeSchedule(schedule)}</p>
    </div>
  );
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'name', title: 'Name & look', component: NameStep },
  { id: 'type', title: 'Type', component: TypeStep },
  { id: 'schedule', title: 'Schedule', component: ScheduleStep },
  { id: 'review', title: 'Review', component: ReviewStep },
];

// ---- Form + Modal --------------------------------------------------------

interface HabitWizardFormProps {
  habitService: HabitService;
  existingHabit?: HabitDefinition; // present when editing, REQ-H014
  weekStartsOn: WeekStartsOn; // see tasks.md Notes — sourced from a placeholder until the cross-cutting shell exists
  /** Backing out via Cancel/Back-at-step-0 — nothing was saved. */
  onCancel: () => void;
  /** A create/update actually completed successfully. */
  onSaved: () => void;
}

function HabitWizardForm({ habitService, existingHabit, weekStartsOn, onCancel, onSaved }: HabitWizardFormProps) {
  const [name, setName] = useState(existingHabit?.name ?? '');
  const [icon, setIcon] = useState(existingHabit?.icon ?? '⭐');
  const [color, setColor] = useState(existingHabit?.color ?? '#3b82f6');
  const [type, setType] = useState<HabitDefinition['type']>(existingHabit?.type ?? 'boolean');
  const [targetValue, setTargetValue] = useState<string>(
    existingHabit?.target ? String(existingHabit.target.value) : ''
  );
  const [targetUnit, setTargetUnit] = useState(existingHabit?.target?.unit ?? '');
  const [schedule, setSchedule] = useState<HabitSchedule>(existingHabit?.schedule ?? { mode: 'daily' });

  const ctx: WizardCtx = {
    name,
    setName,
    icon,
    setIcon,
    color,
    setColor,
    type,
    setType,
    targetValue,
    setTargetValue,
    targetUnit,
    setTargetUnit,
    schedule,
    setSchedule,
    weekStartsOn,
  };

  const handleComplete = async () => {
    const input: NewHabitInput = {
      type,
      name: name.trim(),
      icon,
      color,
      schedule,
      target: type === 'numeric' && targetValue ? { value: Number(targetValue), unit: targetUnit } : undefined,
    };

    if (existingHabit) {
      await habitService.updateHabit(existingHabit.id, input);
    } else {
      await habitService.createHabit(input);
    }
    onSaved();
  };

  return (
    <WizardContext.Provider value={ctx}>
      <StepWizard
        steps={WIZARD_STEPS}
        onComplete={handleComplete}
        onCancel={onCancel}
        completeLabel={existingHabit ? 'Save' : 'Create'}
      />
    </WizardContext.Provider>
  );
}

/** Obsidian Modal wrapper — mounts the React form above. REQ-H004/H005. */
export class HabitWizardModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private habitService: HabitService,
    private weekStartsOn: WeekStartsOn,
    private existingHabit?: HabitDefinition,
    /** Called after a successful create/update, before the modal closes — lets a host view (e.g. the dashboard) refresh. */
    private onSaved?: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    // Was never set before — an omission unrelated to the blank-body
    // bug, but worth fixing while we're in here (empty modal title bar).
    this.titleEl.setText(this.existingHabit ? 'Edit habit' : 'New habit');

    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <HabitWizardForm
          habitService={this.habitService}
          existingHabit={this.existingHabit}
          weekStartsOn={this.weekStartsOn}
          onCancel={() => this.close()}
          onSaved={() => {
            this.onSaved?.();
            this.close();
          }}
        />
      </ErrorBoundary>
    );
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
  }
}
