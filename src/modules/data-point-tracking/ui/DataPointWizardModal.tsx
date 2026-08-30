// 3-step creation/edit wizard (name → type/unit → review), same
// step-indicator pattern as the habit wizard (REQ-D003), including its
// built-in templates (REQ-D002). Same module-level-component + context
// + useEffect pattern as HabitWizardModal — see that file and
// StepWizard.tsx for why (avoids the render-phase-state bug class
// entirely).
//
// Update: dropped the "Sleep duration" number template — now that the
// dedicated 'duration' type (start -> end, via the clock picker)
// exists and covers sleep tracking properly, a plain hand-typed
// "hours slept" number template was redundant and just invited
// double-tracking the same thing two different ways.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { StepWizard, WizardStep, WizardStepProps } from '../../../shared/ui-kit/StepWizard';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { DataPointService } from '../application/dataPointService';
import { DataPointDefinition, DataPointType } from '../domain/types';

// REQ-D002: at least three built-in templates.
const TEMPLATES: { label: string; name: string; type: DataPointType; unit?: string }[] = [
  { label: '⚖️ Weight', name: 'Weight', type: 'number', unit: 'kg' },
  { label: '⏰ Wake-up time', name: 'Wake-up time', type: 'time' },
  { label: '🛌 Sleep (start → end)', name: 'Sleep', type: 'duration' },
];

interface WizardCtx {
  name: string;
  setName: (v: string) => void;
  type: DataPointType;
  setType: (v: DataPointType) => void;
  unit: string;
  setUnit: (v: string) => void;
}

const WizardContext = createContext<WizardCtx | null>(null);

function useWizardCtx(): WizardCtx {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("Wizard step rendered outside DataPointWizardModal's WizardContext");
  return ctx;
}

function NameStep({ onValidChange }: WizardStepProps) {
  const { name, setName, setType, setUnit } = useWizardCtx();

  useEffect(() => {
    onValidChange(name.trim().length > 0);
  }, [name, onValidChange]);

  return (
    <div className="ltk-wizard-step">
      <div className="ltk-template-row">
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => {
              setName(t.name);
              setType(t.type);
              setUnit(t.unit ?? '');
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mood, Play time" />
      </label>
    </div>
  );
}

function TypeStep({ onValidChange }: WizardStepProps) {
  const { type, setType, unit, setUnit } = useWizardCtx();

  useEffect(() => {
    onValidChange(true);
  }, [onValidChange]);

  return (
    <div className="ltk-wizard-step">
      <label>
        <input type="radio" checked={type === 'number'} onChange={() => setType('number')} />
        Number
      </label>
      <label>
        <input type="radio" checked={type === 'time'} onChange={() => setType('time')} />
        Time of day
      </label>
      <label>
        <input type="radio" checked={type === 'duration'} onChange={() => setType('duration')} />
        Duration (start → end)
      </label>
      <label>
        <input type="radio" checked={type === 'text'} onChange={() => setType('text')} />
        Text
      </label>
      {type === 'number' && (
        <label>
          Unit (optional)
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg, steps, glasses..." />
        </label>
      )}
      {type === 'duration' && (
        <p className="ltk-empty">
          Log a start and end time each entry (e.g. sleep, play time, shopping time) — the duration is calculated
          for you, and an end time earlier than the start is treated as crossing midnight.
        </p>
      )}
    </div>
  );
}

function ReviewStep({ onValidChange }: WizardStepProps) {
  const { name, type, unit } = useWizardCtx();

  useEffect(() => {
    onValidChange(true);
  }, [onValidChange]);

  const typeLabel =
    type === 'number' ? 'Number' : type === 'time' ? 'Time of day' : type === 'duration' ? 'Duration (start → end)' : 'Text';

  return (
    <div className="ltk-wizard-step ltk-wizard-step--review">
      <p>
        <strong>{name}</strong>
      </p>
      <p>
        Type: {typeLabel}
        {type === 'number' && unit ? ` (${unit})` : ''}
      </p>
    </div>
  );
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'name', title: 'Name', component: NameStep },
  { id: 'type', title: 'Type & unit', component: TypeStep },
  { id: 'review', title: 'Review', component: ReviewStep },
];

interface DataPointWizardFormProps {
  dataPointService: DataPointService;
  existingDataPoint?: DataPointDefinition;
  onCancel: () => void;
  onSaved: () => void;
}

function DataPointWizardForm({ dataPointService, existingDataPoint, onCancel, onSaved }: DataPointWizardFormProps) {
  const [name, setName] = useState(existingDataPoint?.name ?? '');
  const [type, setType] = useState<DataPointType>(existingDataPoint?.type ?? 'number');
  const [unit, setUnit] = useState(existingDataPoint?.unit ?? '');

  const ctx: WizardCtx = { name, setName, type, setType, unit, setUnit };

  const handleComplete = async () => {
    const input = { name: name.trim(), type, unit: type === 'number' && unit ? unit : undefined };
    if (existingDataPoint) {
      await dataPointService.updateDataPoint(existingDataPoint.id, input);
    } else {
      await dataPointService.createDataPoint(input);
    }
    onSaved();
  };

  return (
    <WizardContext.Provider value={ctx}>
      <StepWizard
        steps={WIZARD_STEPS}
        onComplete={handleComplete}
        onCancel={onCancel}
        completeLabel={existingDataPoint ? 'Save' : 'Create'}
      />
    </WizardContext.Provider>
  );
}

/** Obsidian Modal wrapper — REQ-D004's two entry points (dashboard + settings tab) both construct this. */
export class DataPointWizardModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private dataPointService: DataPointService,
    private existingDataPoint?: DataPointDefinition,
    private onSaved?: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.existingDataPoint ? 'Edit data point' : 'New data point');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <DataPointWizardForm
          dataPointService={this.dataPointService}
          existingDataPoint={this.existingDataPoint}
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
