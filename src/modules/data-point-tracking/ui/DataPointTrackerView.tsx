// ItemView hosting Data Point Tracking's dashboard — mirrors
// HabitTrackerView's structure (see that file's header comment for
// the rationale: a real navigable home per module, REQ-C002).
//
// Update: this view previously only ever fetched data once on mount
// (via the key-remount trick on refreshKey after a mutation made
// through it), so entries logged elsewhere, or just switching back to
// an already-open pane, could leave stale "today" data on screen.
// Now mirrors MoneyTrackerView's refresh strategy: re-fetches on
// active-leaf-change, plus a manual "Refresh" button in the header for
// anything that pattern doesn't catch.

import React, { useEffect, useState } from 'react';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { DataPointDashboardList } from './DataPointDashboardList';
import { DataPointDetailView } from './DataPointDetailView';
import { DataPointWizardModal } from './DataPointWizardModal';
import { DataPointService } from '../application/dataPointService';
import { DataPointDefinition } from '../domain/types';
import { PluginSettingsStore } from '../../../core/pluginSettingsStore';

export const VIEW_TYPE_DATA_POINT_TRACKER = 'life-tracker-data-points';

interface DataPointTrackerRootProps {
  view: DataPointTrackerView;
  dataPointService: DataPointService;
  pluginSettingsStore?: PluginSettingsStore;
}

function DataPointTrackerRoot({ view, dataPointService, pluginSettingsStore }: DataPointTrackerRootProps) {
  const [selected, setSelected] = useState<DataPointDefinition | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  // Registers `refresh` with the hosting ItemView so active-leaf-change
  // (see DataPointTrackerView below) can trigger a re-fetch from
  // outside this function component, same pattern as MoneyTrackerView.
  useEffect(() => {
    view.registerRefreshHandler(refresh);
    return () => view.registerRefreshHandler(null);
  }, [view]);

  if (selected) {
    return (
      <DataPointDetailView
        app={view.app}
        dataPoint={selected}
        dataPointService={dataPointService}
        pluginSettingsStore={pluginSettingsStore}
        onBack={() => setSelected(null)}
        onEdited={() => {
          setSelected(null);
          refresh();
        }}
        onDeleted={() => {
          setSelected(null);
          refresh();
        }}
        onArchived={() => {
          setSelected(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="ltk-habit-view">
      <div className="ltk-habit-view__header">
        <h2>Data Points</h2>
        <div className="ltk-habit-view__header-actions">
          <button type="button" className="ltk-icon-button" onClick={refresh} aria-label="Refresh" title="Refresh">
            ⟳
          </button>
          <button
            type="button"
            className="ltk-button ltk-button--accent"
            onClick={() => new DataPointWizardModal(view.app, dataPointService, undefined, refresh).open()}
          >
            + New data point
          </button>
        </div>
      </div>
      <DataPointDashboardList
        key={refreshKey}
        app={view.app}
        dataPointService={dataPointService}
        pluginSettingsStore={pluginSettingsStore}
        onOpenDetail={setSelected}
      />
    </div>
  );
}

export class DataPointTrackerView extends ItemView {
  private root: Root | null = null;
  private refreshHandler: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private dataPointService: DataPointService,
    private pluginSettingsStore?: PluginSettingsStore
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_DATA_POINT_TRACKER;
  }

  getDisplayText(): string {
    return 'Data Points';
  }

  getIcon(): string {
    return 'line-chart';
  }

  registerRefreshHandler(handler: (() => void) | null): void {
    this.refreshHandler = handler;
  }

  async onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <DataPointTrackerRoot
          view={this}
          dataPointService={this.dataPointService}
          pluginSettingsStore={this.pluginSettingsStore}
        />
      </ErrorBoundary>
    );

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        if (leaf === this.leaf) {
          this.refreshHandler?.();
        }
      })
    );
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }
}