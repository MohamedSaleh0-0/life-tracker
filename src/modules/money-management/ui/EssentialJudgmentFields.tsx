// Shared "Essential?" + "Judgment" capture, used identically by the
// manual transaction entry form and the shopping-item Buy flow (both
// are places a real expense transaction gets created). Essential is
// required for an expense; Judgment only appears (and is only
// required) once Essential is answered "No" — picking "Yes" clears
// any previously-chosen judgment, since the two are mutually exclusive
// by definition.

import React from 'react';
import { TransactionJudgment, JUDGMENT_OPTIONS } from '../domain/types';

export interface EssentialJudgmentFieldsProps {
  essential: boolean | undefined;
  onEssentialChange: (value: boolean) => void;
  judgment: TransactionJudgment | undefined;
  onJudgmentChange: (value: TransactionJudgment) => void;
}

export function EssentialJudgmentFields({
  essential,
  onEssentialChange,
  judgment,
  onJudgmentChange,
}: EssentialJudgmentFieldsProps) {
  return (
    <div className="ltk-essential-judgment">
      <label className="ltk-essential-judgment__label">Essential?</label>
      <div className="ltk-essential-judgment__toggle">
        <button type="button" className={essential === true ? 'is-active' : ''} onClick={() => onEssentialChange(true)}>
          Yes
        </button>
        <button type="button" className={essential === false ? 'is-active' : ''} onClick={() => onEssentialChange(false)}>
          No
        </button>
      </div>
      {essential === false && (
        <label>
          Judgment
          <select value={judgment ?? ''} onChange={(e) => onJudgmentChange(e.target.value as TransactionJudgment)}>
            <option value="" disabled>
              Choose one…
            </option>
            {JUDGMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** Validates the Essential/Judgment pair for submission — Essential must be chosen; Judgment must be chosen too, but only when Essential is "No". */
export function essentialJudgmentValid(essential: boolean | undefined, judgment: TransactionJudgment | undefined): boolean {
  if (essential === undefined) return false;
  if (essential === false && !judgment) return false;
  return true;
}
