// CRUD for HabitDefinition[] against the plugin's settings blob
// (REQ-C008). See design-habit-tracking.md §Data Model (Settings store).

import { HabitDefinition } from '../domain/types';
import { SettingsAdapter } from './settingsAdapter';

// The settings blob is shared across the whole plugin — other modules
// will add their own top-level keys (dataPoints, accounts, etc.) here
// later. This store only ever touches the `habits` key.
interface LifeTrackerData {
  habits?: HabitDefinition[];
  [key: string]: unknown;
}

export class HabitSettingsStore {
  constructor(private adapter: SettingsAdapter) {}

  async getAll(): Promise<HabitDefinition[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.habits ?? [];
  }

  async get(id: string): Promise<HabitDefinition | undefined> {
    const habits = await this.getAll();
    return habits.find((h) => h.id === id);
  }

  private async saveAll(habits: HabitDefinition[]): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.habits = habits;
    await this.adapter.save(data);
  }

  async create(habit: HabitDefinition): Promise<HabitDefinition> {
    const habits = await this.getAll();
    habits.push(habit);
    await this.saveAll(habits);
    return habit;
  }

  /** Also used for archive (REQ-H016), which is just `update(id, { archived: true })`. */
  async update(id: string, patch: Partial<HabitDefinition>): Promise<HabitDefinition> {
    const habits = await this.getAll();
    const idx = habits.findIndex((h) => h.id === id);
    if (idx === -1) throw new Error(`Habit not found: ${id}`);
    const updated: HabitDefinition = { ...habits[idx], ...patch, id: habits[idx].id }; // id is immutable
    habits[idx] = updated;
    await this.saveAll(habits);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const habits = await this.getAll();
    await this.saveAll(habits.filter((h) => h.id !== id));
  }
}
