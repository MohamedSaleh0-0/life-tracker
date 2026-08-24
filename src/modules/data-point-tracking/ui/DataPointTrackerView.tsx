// ItemView hosting Data Point Tracking's dashboard — mirrors
// HabitTrackerView's structure exactly (see that file's header comment
// for the rationale: a real navigable home per module, REQ-C002).

import React, { useState } from 'react';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { DataPointDashboardList } from './DataPointDashboardList';
import { DataPointDetailView } from './DataPointDetailView';
import { DataPointWizardModal } from './DataPointWizardModal';
import { DataPointService } from '../application/dataPointService';
import { DataPointDefinition } from '../domain/types';

export const VIEW_TYPE_DATA_POINT_TRACKER = 'life-tracker-data-points';

interface DataPointTrackerRootProps {
  view: DataPointTrackerView;
  dataPointService: DataPointService;
}

function DataPointTrackerRoot({ view, dataPointService }: DataPointTrackerRootProps) {
  const [selected, setSelected] = useState<DataPointDefinition | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  if (selected) {
    return (
      <DataPointDetailView
        app={view.app}
        dataPoint={selected}
        dataPointService={dataPointService}
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
        <button
          type="button"
          className="ltk-button ltk-button--accent"
          onClick={() => new DataPointWizardModal(view.app, dataPointService, undefined, refresh).open()}
        >
          + New data point
        </button>
      </div>
      <DataPointDashboardList
        key={refreshKey}
        app={view.app}
        dataPointService={dataPointService}
        onOpenDetail={setSelected}
      />
    </div>
  );
}

export class DataPointTrackerView extends ItemView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private dataPointService: DataPointService
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

  async onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <DataPointTrackerRoot view={this} dataPointService={this.dataPointService} />
      </ErrorBoundary>
    );
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }
}
