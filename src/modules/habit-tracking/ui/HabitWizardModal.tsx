// 4-step creation/edit wizard (name/look → type → schedule → review),
// wrapped as an Obsidian Modal. See design-habit-tracking.md §Key Flows
// (Create Habit), REQ-H001-H005, REQ-H014.

import React, { useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { StepWizard, WizardStep } from '../../../shared/ui-kit/StepWizard';
import { HabitService, NewHabitInput } from '../application/habitService';
import { HabitDefinition, HabitSchedule, WeekStartsOn } from '../domain/types';

interface HabitWizardFormProps {
  habitService: HabitService;
  existingHabit?: HabitDefinition; // present when editing, REQ-H014
  weekStartsOn: WeekStartsOn; // see tasks.md Notes — sourced from a placeholder until the cross-cutting shell exists
  onDone: () => void;
}

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
  const rotation = weekStartsOn === 'monday' ? 0 : 6; // Sunday is internal index 6
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

function HabitWizardForm({ habitService, existingHabit, weekStartsOn, onDone }: HabitWizardFormProps) {
  const [name, setName] = useState(existingHabit?.name ?? '');
  const [icon, setIcon] = useState(existingHabit?.icon ?? '✅');
  const [color, setColor] = useState(existingHabit?.color ?? '#3b82f6');
  const [type, setType] = useState<HabitDefinition['type']>(existingHabit?.type ?? 'boolean');
  const [targetValue, setTargetValue] = useState<string>(
    existingHabit?.target ? String(existingHabit.target.value) : ''
  );
  const [targetUnit, setTargetUnit] = useState(existingHabit?.target?.unit ?? '');
  const [schedule, setSchedule] = useState<HabitSchedule>(existingHabit?.schedule ?? { mode: 'daily' });

  const steps: WizardStep[] = [
    {
      id: 'name',
      title: 'Name & look',
      render: ({ onValidChange }) => {
        onValidChange(name.trim().length > 0);
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
      },
    },
    {
      id: 'type',
      title: 'Type',
      render: ({ onValidChange }) => {
        onValidChange(true); // target/unit are optional even for numeric — always valid
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
      },
    },
    {
      id: 'schedule',
      title: 'Schedule',
      render: ({ onValidChange }) => {
        onValidChange(schedule.mode !== 'weekdays' || schedule.days.length > 0);
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
      },
    },
    {
      id: 'review',
      title: 'Review',
      render: ({ onValidChange }) => {
        onValidChange(true);
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
      },
    },
  ];

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
    onDone();
  };

  return (
    <StepWizard
      steps={steps}
      onComplete={handleComplete}
      onCancel={onDone}
      completeLabel={existingHabit ? 'Save' : 'Create'}
    />
  );
}

/** Obsidian Modal wrapper — mounts the React form above. REQ-H004/H005. */
export class HabitWizardModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private habitService: HabitService,
    private weekStartsOn: WeekStartsOn,
    private existingHabit?: HabitDefinition
  ) {
    super(app);
  }

  onOpen(): void {
    this.root = createRoot(this.contentEl);
    this.root.render(
      <HabitWizardForm
        habitService={this.habitService}
        existingHabit={this.existingHabit}
        weekStartsOn={this.weekStartsOn}
        onDone={() => this.close()}
      />
    );
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
  }
}
