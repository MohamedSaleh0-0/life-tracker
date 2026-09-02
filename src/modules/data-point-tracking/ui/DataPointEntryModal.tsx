// Single-entry logging/editing form (REQ-D006/D008).
//
// Update: 'time' and 'duration' types now use the ClockPicker (a
// draggable circular clock face) as the primary input, replacing the
// old plain <input type="time"> fields — per the ask for a faster,
// less hand-typing-heavy way to log a time-of-day or a start/end
// span. ClockPicker still keeps a native time input under the face
// for exact manual entry, kept in sync both directions. Duration
// naturally supports a span crossing midnight (e.g. sleep 22:00 ->
// 04:00) since the arc/handles wrap around the face rather than
// needing special-casing here.
//
// - Date field lets an entry be backdated, locked while editing an
//   existing entry.
// - Duration type reuses the existing time/value fields as Start/End
//   time: `time` = activity start, `value` = activity end.

import React, { useEffect, useState } from 'react';
import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { ClockPicker } from '../../../shared/ui-kit/ClockPicker';
import { DataPointService } from '../application/dataPointService';
import { DataPointDefinition, DataPointEntry } from '../domain/types';
import { getTodayLocal } from '../../../core/date';
import { PluginSettingsStore } from '../../../core/pluginSettingsStore';

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
  pluginSettingsStore?: PluginSettingsStore;
}

function EntryForm({
  definition,
  dataPointService,
  existingEntry,
  onCancel,
  onSaved,
  pluginSettingsStore,
}: EntryFormProps) {
  const [date, setDate] = useState(existingEntry?.date ?? getTodayLocal());
  const [time, setTime] = useState(existingEntry?.time ?? nowHHMM());
  const [value, setValue] = useState(existingEntry ? String(existingEntry.value) : '1');
  const [snapMinutes, setSnapMinutes] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (pluginSettingsStore) {
      pluginSettingsStore.getClockSnapMinutes().then(setSnapMinutes);
    }
  }, [pluginSettingsStore]);

  const isDuration = definition.type === 'duration';
  const isTimeOfDay = definition.type === 'time';
  const isBinary = definition.type === 'binary';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (existingEntry) {
        await dataPointService.editEntry(
          existingEntry.id,
          definition.id,
          existingEntry.date,
          time,
          isBinary ? '1' : value
        );
      } else {
        await dataPointService.logEntry(definition.id, date, time, isBinary ? '1' : value);
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
        Date
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={getTodayLocal()}
          disabled={!!existingEntry}
          required
        />
      </label>

      {isDuration ? (
        <div className="ltk-clock-field">
          <ClockPicker
            mode="range"
            startValue={time || '22:00'}
            endValue={value || '06:00'}
            snapMinutes={snapMinutes}
            onChange={(start, end) => {
              setTime(start);
              setValue(end);
            }}
          />
          <p className="ltk-empty">An end time earlier than the start is treated as crossing midnight.</p>
        </div>
      ) : isTimeOfDay ? (
        <>
          <div className="ltk-clock-field">
            <ClockPicker
              mode="single"
              value={value || time || nowHHMM()}
              snapMinutes={snapMinutes}
              onChange={(v) => setValue(v)}
            />
          </div>
          <label>
            Logged at (optional, defaults to now)
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
        </>
      ) : isBinary ? (
        <label>
          Logged at
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
      ) : (
        <>
          <label>
            Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
          <label>
            Value
            {definition.type === 'text' ? (
              <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="What's up?" />
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
        </>
      )}

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
    private onSaved: () => void,
    private pluginSettingsStore?: PluginSettingsStore
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
          pluginSettingsStore={this.pluginSettingsStore}
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