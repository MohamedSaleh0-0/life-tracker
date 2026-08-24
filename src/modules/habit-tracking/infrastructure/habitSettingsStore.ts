// CRUD for HabitDefinition[] against the plugin's settings blob.

import { HabitDefinition } from '../domain/types';
import { SettingsAdapter } from './settingsAdapter';

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

  async update(id: string, patch: Partial<HabitDefinition>): Promise<HabitDefinition> {
    const habits = await this.getAll();
    const idx = habits.findIndex((h) => h.id === id);
    if (idx === -1) throw new Error(`Habit not found: ${id}`);
    const updated: HabitDefinition = { ...habits[idx], ...patch, id: habits[idx].id };
    habits[idx] = updated;
    await this.saveAll(habits);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const habits = await this.getAll();
    await this.saveAll(habits.filter((h) => h.id !== id));
  }
}
