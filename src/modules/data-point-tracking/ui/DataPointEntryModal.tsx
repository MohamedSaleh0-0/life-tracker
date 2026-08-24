// Single-entry logging/editing form (REQ-D006/D008) — much lighter
// than the definition wizard, since logging a value isn't a multi-step
// flow. Same safety pattern as everything else built after the
// StepWizard incident: no render-phase state tricks, ErrorBoundary
// wraps the mount.

import React, { useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { DataPointService } from '../application/dataPointService';
import { DataPointDefinition, DataPointEntry } from '../domain/types';
import { getTodayLocal } from '../../../core/date';

function nowHHMM(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

interface EntryFormProps {
  definition: DataPointDefinition;
  dataPointService: DataPointService;
  existingEntry?: DataPointEntry;
  onCancel: () => void;
  onSaved: () => void;
}

function EntryForm({ definition, dataPointService, existingEntry, onCancel, onSaved }: EntryFormProps) {
  const [time, setTime] = useState(existingEntry?.time ?? nowHHMM());
  const [value, setValue] = useState(existingEntry ? String(existingEntry.value) : '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const date = existingEntry?.date ?? getTodayLocal();
      if (existingEntry) {
        await dataPointService.editEntry(existingEntry.id, definition.id, date, time, value);
      } else {
        await dataPointService.logEntry(definition.id, date, time, value);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="ltk-entry-form" onSubmit={handleSubmit}>
      <label>
        Time
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
      </label>
      <label>
        Value
        {definition.type === 'text' ? (
          <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="What's up?" />
        ) : definition.type === 'time' ? (
          <input type="time" value={value} onChange={(e) => setValue(e.target.value)} />
        ) : (
          <input
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={definition.unit ? `e.g. 70 (${definition.unit})` : 'Enter a value'}
          />
        )}
      </label>
      {error && <p className="ltk-form-error">{error}</p>}
      <div className="ltk-entry-form__actions">
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="ltk-button--accent" disabled={submitting}>
          {existingEntry ? 'Save' : 'Add'}
        </button>
      </div>
    </form>
  );
}

export class DataPointEntryModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private dataPointService: DataPointService,
    private definition: DataPointDefinition,
    private existingEntry: DataPointEntry | undefined,
    private onSaved: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.existingEntry ? `Edit ${this.definition.name}` : `Log ${this.definition.name}`);
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <EntryForm
          definition={this.definition}
          dataPointService={this.dataPointService}
          existingEntry={this.existingEntry}
          onCancel={() => this.close()}
          onSaved={() => {
            this.onSaved();
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
