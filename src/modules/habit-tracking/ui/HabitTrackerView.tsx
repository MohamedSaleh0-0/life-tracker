// Obsidian ItemView hosting Habit Tracking's dashboard. Previously
// HabitDashboardList/HabitDetailView existed but nothing registered a
// place for them to live — only the settings tab and command palette
// could reach the wizard, with no way to see today's pending/completed
// habits or drill into a habit's history. This closes that gap.
//
// The full cross-cutting "Today" view spanning all three modules
// (REQ-C001) is still not designed — this is Habit Tracking's own
// per-module view (REQ-C002 style: "dedicated per-module views...
// reachable via navigation, separate from the Today view").

import React, { useState } from 'react';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ErrorBoundary } from '../../../shared/ui-kit/ErrorBoundary';
import { HabitDashboardList } from './HabitDashboardList';
import { HabitDetailView } from './HabitDetailView';
import { HabitWizardModal } from './HabitWizardModal';
import { HabitService } from '../application/habitService';
import { HabitDefinition, WeekStartsOn } from '../domain/types';

export const VIEW_TYPE_HABIT_TRACKER = 'life-tracker-habits';

interface HabitTrackerRootProps {
  view: HabitTrackerView;
  habitService: HabitService;
  weekStartsOn: WeekStartsOn;
}

function HabitTrackerRoot({ view, habitService, weekStartsOn }: HabitTrackerRootProps) {
  const [selected, setSelected] = useState<HabitDefinition | null>(null);
  // Bumped whenever a habit is created/updated/archived/deleted so the
  // dashboard list re-fetches — HabitDashboardList fetches once on
  // mount, so remounting it (via `key`) is the cheapest way to refresh.
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  if (selected) {
    return (
      <HabitDetailView
        app={view.app}
        habit={selected}
        habitService={habitService}
        weekStartsOn={weekStartsOn}
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
      <HabitDashboardList key={refreshKey} habitService={habitService} onOpenDetail={setSelected} />
    </div>
  );
}

export class HabitTrackerView extends ItemView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private habitService: HabitService,
    private weekStartsOn: WeekStartsOn
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

  async onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
    this.root.render(
      <ErrorBoundary>
        <HabitTrackerRoot view={this} habitService={this.habitService} weekStartsOn={this.weekStartsOn} />
      </ErrorBoundary>
    );
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }
}
