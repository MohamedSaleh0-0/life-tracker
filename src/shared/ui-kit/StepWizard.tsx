// Generic step-indicator + validation-per-step + review wizard shell.
// Not habit-specific — the Data Point wizard (REQ-D003, "same
// step-indicator pattern as the habit creation wizard") reuses this
// directly rather than duplicating the pattern.
// See design-habit-tracking.md §Architecture Overview.
//
// Each step is a real React component (not a plain function called
// inline during another component's render). Validity is reported via
// useEffect from inside that step component. An earlier version had
// each step call onValidChange() directly during StepWizard's own
// render pass ("adjust state while rendering") — legal in principle,
// but fragile in practice and the root cause of a silent blank-modal
// bug. Components + useEffect is the boring, hard-to-get-wrong way to
// do this, so that's what we use.

import React, { useState, useCallback } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

export interface WizardStepProps {
  onValidChange: (valid: boolean) => void;
}

export interface WizardStep {
  id: string;
  title: string;
  component: React.ComponentType<WizardStepProps>;
}

export interface StepWizardProps {
  steps: WizardStep[];
  onComplete: () => void | Promise<void>;
  onCancel: () => void;
  completeLabel?: string;
}

export function StepWizard({ steps, onComplete, onCancel, completeLabel = 'Create' }: StepWizardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [validByStep, setValidByStep] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const current = steps[currentIndex];
  const isLastStep = currentIndex === steps.length - 1;
  const canAdvance = validByStep[current.id] ?? false;
  const currentStepId = current.id;

  // Called from the step's useEffect (post-commit), never during
  // render — no bailout gymnastics required, but we still avoid a
  // needless re-render when the value hasn't actually changed.
  const handleValidChange = useCallback((valid: boolean) => {
    setValidByStep((prev) => (prev[currentStepId] === valid ? prev : { ...prev, [currentStepId]: valid }));
  }, [currentStepId]);

  const handleNext = async () => {
    if (!canAdvance || submitting) return;
    if (isLastStep) {
      setSubmitting(true);
      try {
        await onComplete();
      } finally {
        setSubmitting(false);
      }
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handleBack = () => {
    if (currentIndex === 0) {
      onCancel();
    } else {
      setCurrentIndex((i) => i - 1);
    }
  };

  const CurrentStepComponent = current.component;

  return (
    <div className="ltk-step-wizard">
      <div className="ltk-step-wizard__indicator" role="tablist" aria-label="Wizard steps">
        {steps.map((step, i) => (
          <div
            key={step.id}
            role="tab"
            aria-selected={i === currentIndex}
            className={
              'ltk-step-wizard__dot' +
              (i === currentIndex ? ' is-current' : '') +
              (i < currentIndex ? ' is-complete' : '')
            }
          >
            {step.title}
          </div>
        ))}
      </div>

      <div className="ltk-step-wizard__body">
        <ErrorBoundary>
          <CurrentStepComponent onValidChange={handleValidChange} />
        </ErrorBoundary>
      </div>

      <div className="ltk-step-wizard__actions">
        <button type="button" onClick={handleBack} disabled={submitting}>
          {currentIndex === 0 ? 'Cancel' : 'Back'}
        </button>
        <button type="button" onClick={handleNext} disabled={!canAdvance || submitting}>
          {isLastStep ? completeLabel : 'Next'}
        </button>
      </div>
    </div>
  );
}
