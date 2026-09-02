// Obsidian ItemView hosting Habit Tracking's dashboard.
//
// This pass adds the overall-commitment heatmap (OverallCommitmentHeatmap)
// to the main dashboard view itself, below Pending/Completed — a
// day-by-day intensity map of how much of ALL your habits together you
// actually kept up with, distinct from any single habit's own detail
// view. Requires the plugin's cross-cutting settings store (for the
// dim-threshold %), so this view now takes that as a constructor param
// too, threaded from main.ts.

import React, { useEffect, useState } from 'react';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { HabitDashboardList } from './HabitDashboardList';
import { HabitDetailView } from './HabitDetailView';
import { HabitWizardModal } from './HabitWizardModal';
import { OverallCommitmentHeatmap } from './OverallCommitmentHeatmap';
import { HabitService } from '../application/habitService';
import { HabitDefinition, WeekStartsOn } from '../domain/types';
import { PluginSettingsStore } from '../../../core/pluginSettingsStore';

export const VIEW_TYPE_HABIT_TRACKER = 'life-tracker-habits';

interface HabitTrackerRootProps {
  view: HabitTrackerView;
  habitService: HabitService;
  weekStartsOn: WeekStartsOn;
  pluginSettingsStore: PluginSettingsStore;
}

function HabitTrackerRoot({ view, habitService, weekStartsOn, pluginSettingsStore }: HabitTrackerRootProps) {
  const [selected, setSelected] = useState<HabitDefinition | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dimThreshold, setDimThreshold] = useState(50);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    view.registerRefreshHandler(refresh);
    return () => view.registerRefreshHandler(null);
  }, [view]);

  useEffect(() => {
    pluginSettingsStore.getHeatmapDimThresholdPercent().then(setDimThreshold);
  }, [pluginSettingsStore, refreshKey]);

  if (selected) {
    return (
      <HabitDetailView
        app={view.app}
        habit={selected}
        habitService={habitService}
        weekStartsOn={weekStartsOn}
        pluginSettingsStore={pluginSettingsStore}
        onToggleTrendVisible={async (visible) => {
          await habitService.updateHabit(selected.id, { trendVisible: visible });
          setSelected({ ...selected, trendVisible: visible });
        }}
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
        <h2>Habits</h2>
        <div className="ltk-habit-view__header-actions">
          <button type="button" className="ltk-icon-button" onClick={refresh} aria-label="Refresh" title="Refresh">
            ⟳
          </button>
          <button
            type="button"
            className="ltk-button ltk-button--accent"
            onClick={() =>
              new HabitWizardModal(view.app, habitService, weekStartsOn, undefined, refresh).open()
            }
          >
            + New habit
          </button>
        </div>
      </div>
      <HabitDashboardList
        key={refreshKey}
        habitService={habitService}
        onOpenDetail={setSelected}
        pluginSettingsStore={pluginSettingsStore}
      />
      <OverallCommitmentHeatmap
        habitService={habitService}
        weekStartsOn={weekStartsOn}
        dimThresholdPercent={dimThreshold}
        refreshKey={refreshKey}
      />
    </div>
  );
}

export class HabitTrackerView extends ItemView {
  private root: Root | null = null;
  private refreshHandler: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private habitService: HabitService,
    private weekStartsOn: WeekStartsOn,
    private pluginSettingsStore: PluginSettingsStore
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_HABIT_TRACKER;
  }

  getDisplayText(): string {
    return 'Habits';
  }

  getIcon(): string {
    return 'check-circle';
  }

  registerRefreshHandler(handler: (() => void) | null): void {
    this.refreshHandler = handler;
  }

  async onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <HabitTrackerRoot
          view={this}
          habitService={this.habitService}
          weekStartsOn={this.weekStartsOn}
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