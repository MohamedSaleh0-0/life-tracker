// Generic step-indicator + validation-per-step + review wizard shell.
// Not habit-specific — the Data Point wizard (REQ-D003, "same
// step-indicator pattern as the habit creation wizard") reuses this
// directly rather than duplicating the pattern.
// See design-habit-tracking.md §Architecture Overview.

import React, { useState } from 'react';

export interface WizardStep {
  id: string;
  title: string;
  render: (props: { onValidChange: (valid: boolean) => void }) => React.ReactNode;
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
        {current.render({
          onValidChange: (valid) => setValidByStep((prev) => ({ ...prev, [current.id]: valid })),
        })}
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
