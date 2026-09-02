// 4-step creation/edit wizard (name/look → type → schedule → review),
// wrapped as an Obsidian Modal. See design-habit-tracking.md §Key Flows
// (Create Habit), REQ-H001-H005, REQ-H014.
//
// Step components are declared once at module scope and read/write
// shared wizard state via WizardContext, rather than being recreated
// as inline closures on every render. See StepWizard.tsx for the
// fuller explanation.
//
// Update: a third habit type, 'levels' — user-defined discrete values
// (e.g. "Routine A" / "Routine B" / "Routine C") instead of yes/no or
// a number. The type step now includes an inline level-list editor
// (add/remove/reorder, at least 2 required) when 'levels' is chosen.
//
// Update: Gated by FeatureFlags (REQ-C006) — the reminder step and
// the 'levels' type option are only included when their respective flags
// are enabled.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { StepWizard, WizardStep, WizardStepProps } from '../../../shared/ui-kit/StepWizard';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { HabitService, NewHabitInput } from '../application/habitService';
import { HabitDefinition, HabitLevel, HabitSchedule, WeekStartsOn, HabitReminder, PrayerName } from '../domain/types';
import { weekStartInternalIndex } from '../domain/scheduleEvaluator';
import { FeatureFlags, DEFAULT_FEATURE_FLAGS } from '../../../core/featureFlags';

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

function makeLevelId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
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

/** Add/remove/reorder editor for a 'levels' habit's discrete values, e.g. "Routine A" / "Routine B" / "Routine C". */
function LevelListEditor({ levels, onChange }: { levels: HabitLevel[]; onChange: (levels: HabitLevel[]) => void }) {
  const updateLabel = (id: string, label: string) => {
    onChange(levels.map((l) => (l.id === id ? { ...l, label } : l)));
  };

  const remove = (id: string) => {
    onChange(levels.filter((l) => l.id !== id).map((l, i) => ({ ...l, order: i })));
  };

  const move = (id: string, delta: number) => {
    const idx = levels.findIndex((l) => l.id === id);
    const target = idx + delta;
    if (target < 0 || target >= levels.length) return;
    const reordered = [...levels];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    onChange(reordered.map((l, i) => ({ ...l, order: i })));
  };

  const add = () => {
    onChange([...levels, { id: makeLevelId(), label: '', order: levels.length }]);
  };

  return (
    <div className="ltk-level-editor">
      {levels.map((level, i) => (
        <div key={level.id} className="ltk-level-editor__row">
          <span className="ltk-level-editor__index">{i + 1}</span>
          <input
            value={level.label}
            onChange={(e) => updateLabel(level.id, e.target.value)}
            placeholder={`Level ${i + 1} name, e.g. "Routine A"`}
          />
          <button type="button" onClick={() => move(level.id, -1)} disabled={i === 0} aria-label="Move up">
            ↑
          </button>
          <button type="button" onClick={() => move(level.id, 1)} disabled={i === levels.length - 1} aria-label="Move down">
            ↓
          </button>
          <button type="button" onClick={() => remove(level.id)} aria-label="Remove level">
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="ltk-level-editor__add" onClick={add}>
        + Add level
      </button>
      {levels.length < 2 && <p className="ltk-empty">At least 2 levels are needed.</p>}
    </div>
  );
}

// ---- Shared wizard state ---------------------------------------------

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
  levels: HabitLevel[];
  setLevels: (v: HabitLevel[]) => void;
  schedule: HabitSchedule;
  setSchedule: (v: HabitSchedule) => void;
  reminder?: HabitReminder;
  setReminder: (v: HabitReminder | undefined) => void;
  weekStartsOn: WeekStartsOn;
  featureFlags: FeatureFlags;
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
  const { type, setType, targetValue, setTargetValue, targetUnit, setTargetUnit, levels, setLevels, featureFlags } = useWizardCtx();

  useEffect(() => {
    if (type === 'levels') {
      onValidChange(levels.length >= 2 && levels.every((l) => l.label.trim().length > 0));
    } else {
      onValidChange(true); // target/unit are optional even for numeric — always valid
    }
  }, [type, levels, onValidChange]);

  const switchToLevels = () => {
    setType('levels');
    if (levels.length === 0) {
      setLevels([
        { id: makeLevelId(), label: '', order: 0 },
        { id: makeLevelId(), label: '', order: 1 },
      ]);
    }
  };

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
      {featureFlags.habitLevelsType && (
        <label>
          <input type="radio" checked={type === 'levels'} onChange={switchToLevels} />
          Custom levels (pick one of several named options each day)
        </label>
      )}
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
      {type === 'levels' && (
        <div className="ltk-wizard-step__target">
          <p className="ltk-empty">
            e.g. "Exercise": Routine A / Routine B / Routine C — logging any one of them counts the day as done;
            which one you picked is what gets tracked.
          </p>
          <LevelListEditor levels={levels} onChange={setLevels} />
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
  const { icon, name, type, targetValue, targetUnit, levels, schedule } = useWizardCtx();

  useEffect(() => {
    onValidChange(true);
  }, [onValidChange]);

  return (
    <div className="ltk-wizard-step ltk-wizard-step--review">
      <p>
        {icon} <strong>{name}</strong>
      </p>
      <p>Type: {type === 'boolean' ? 'Yes/No' : type === 'numeric' ? 'Numeric' : 'Custom levels'}</p>
      {type === 'numeric' && targetValue && (
        <p>
          Target: {targetValue} {targetUnit}
        </p>
      )}
      {type === 'levels' && (
        <p>Levels: {levels.map((l) => l.label).filter(Boolean).join(', ')}</p>
      )}
      <p>Schedule: {describeSchedule(schedule)}</p>
    </div>
  );
}

function ReminderStep({ onValidChange }: WizardStepProps) {
  const { reminder, setReminder } = useWizardCtx();

  useEffect(() => {
    onValidChange(true);
  }, [onValidChange]);

  const PRAYER_NAMES: PrayerName[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const PRAYER_LABELS: Record<PrayerName, string> = {
    fajr: 'Fajr (Dawn)',
    sunrise: 'Sunrise',
    dhuhr: 'Dhuhr (Noon)',
    asr: 'Asr (Afternoon)',
    maghrib: 'Maghrib (Sunset)',
    isha: 'Isha (Night)',
  };

  return (
    <div className="ltk-wizard-step">
      <p className="ltk-empty">Optional: set a reminder notification (fixed time or prayer-relative)</p>

      <label>
        <input
          type="checkbox"
          checked={reminder?.enabled ?? false}
          onChange={(e) => {
            if (e.target.checked) {
              setReminder({ enabled: true, mode: 'fixed', time: '09:00' });
            } else {
              setReminder(undefined);
            }
          }}
        />
        Enable reminder
      </label>

      {reminder?.enabled && (
        <>
          <div className="ltk-wizard-step__reminder-mode">
            <label>
              <input
                type="radio"
                checked={reminder.mode === 'fixed'}
                onChange={() => setReminder({ enabled: true, mode: 'fixed', time: reminder.mode === 'fixed' ? reminder.time : '09:00' })}
              />
              Fixed time
            </label>
            <label>
              <input
                type="radio"
                checked={reminder.mode === 'prayer'}
                onChange={() =>
                  setReminder({
                    enabled: true,
                    mode: 'prayer',
                    prayer: reminder.mode === 'prayer' ? reminder.prayer : 'fajr',
                    offsetMinutes: reminder.mode === 'prayer' ? reminder.offsetMinutes : 0,
                  })
                }
              />
              Prayer time
            </label>
          </div>

          {reminder.mode === 'fixed' && (
            <label>
              Time (HH:MM)
              <input
                type="time"
                value={reminder.time}
                onChange={(e) => setReminder({ enabled: true, mode: 'fixed', time: e.target.value })}
              />
            </label>
          )}

          {reminder.mode === 'prayer' && (
            <>
              <label>
                Prayer
                <select
                  value={reminder.prayer}
                  onChange={(e) =>
                    setReminder({
                      enabled: true,
                      mode: 'prayer',
                      prayer: e.target.value as PrayerName,
                      offsetMinutes: reminder.offsetMinutes,
                    })
                  }
                >
                  {PRAYER_NAMES.map((p) => (
                    <option key={p} value={p}>
                      {PRAYER_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Offset (minutes, negative = before)
                <input
                  type="number"
                  value={reminder.offsetMinutes}
                  onChange={(e) =>
                    setReminder({
                      enabled: true,
                      mode: 'prayer',
                      prayer: reminder.prayer,
                      offsetMinutes: Number(e.target.value),
                    })
                  }
                />
              </label>
            </>
          )}
        </>
      )}
    </div>
  );
}

function buildWizardSteps(flags: FeatureFlags): WizardStep[] {
  const steps: WizardStep[] = [
    { id: 'name', title: 'Name & look', component: NameStep },
    { id: 'type', title: 'Type', component: TypeStep },
    { id: 'schedule', title: 'Schedule', component: ScheduleStep },
  ];
  if (flags.habitReminders) {
    steps.push({ id: 'reminder', title: 'Reminder', component: ReminderStep });
  }
  steps.push({ id: 'review', title: 'Review', component: ReviewStep });
  return steps;
}

// ---- Form + Modal --------------------------------------------------------

interface HabitWizardFormProps {
  habitService: HabitService;
  existingHabit?: HabitDefinition; // present when editing, REQ-H014
  weekStartsOn: WeekStartsOn;
  onCancel: () => void;
  onSaved: () => void;
  featureFlags?: FeatureFlags;
}

function HabitWizardForm({
  habitService,
  existingHabit,
  weekStartsOn,
  onCancel,
  onSaved,
  featureFlags,
}: HabitWizardFormProps) {
  const flags = featureFlags ?? DEFAULT_FEATURE_FLAGS;
  const [name, setName] = useState(existingHabit?.name ?? '');
  const [icon, setIcon] = useState(existingHabit?.icon ?? '⭐');
  const [color, setColor] = useState(existingHabit?.color ?? '#3b82f6');
  const [type, setType] = useState<HabitDefinition['type']>(existingHabit?.type ?? 'boolean');
  const [targetValue, setTargetValue] = useState<string>(
    existingHabit?.target ? String(existingHabit.target.value) : ''
  );
  const [targetUnit, setTargetUnit] = useState(existingHabit?.target?.unit ?? '');
  const [levels, setLevels] = useState<HabitLevel[]>(existingHabit?.levels ?? []);
  const [schedule, setSchedule] = useState<HabitSchedule>(existingHabit?.schedule ?? { mode: 'daily' });
  const [reminder, setReminder] = useState<HabitReminder | undefined>(existingHabit?.reminder);

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
    levels,
    setLevels,
    schedule,
    setSchedule,
    reminder,
    setReminder,
    weekStartsOn,
    featureFlags: flags,
  };

  const handleComplete = async () => {
    const input: NewHabitInput = {
      type,
      name: name.trim(),
      icon,
      color,
      schedule,
      target: type === 'numeric' && targetValue ? { value: Number(targetValue), unit: targetUnit } : undefined,
      levels: type === 'levels' ? levels.map((l, i) => ({ ...l, label: l.label.trim(), order: i })) : undefined,
      reminder: flags.habitReminders ? reminder : undefined,
    };

    if (existingHabit) {
      await habitService.updateHabit(existingHabit.id, input);
    } else {
      await habitService.createHabit(input);
    }
    onSaved();
  };

  const steps = buildWizardSteps(flags);

  return (
    <WizardContext.Provider value={ctx}>
      <StepWizard
        steps={steps}
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
    private onSaved?: () => void,
    private featureFlags?: FeatureFlags
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.existingHabit ? 'Edit habit' : 'New habit');

    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <HabitWizardForm
          habitService={this.habitService}
          existingHabit={this.existingHabit}
          weekStartsOn={this.weekStartsOn}
          featureFlags={this.featureFlags}
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