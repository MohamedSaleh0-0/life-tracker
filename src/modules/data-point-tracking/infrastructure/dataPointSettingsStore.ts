// CRUD for DataPointDefinition[] against the plugin's settings blob
// (REQ-C008), under its own `dataPoints` key — same data.json,
// separate key from Habit Tracking's `habits`. Mirrors
// habitSettingsStore.ts's structure.

import { DataPointDefinition } from '../domain/types';
import { SettingsAdapter } from '../../../core/ports/settingsAdapter';

interface LifeTrackerData {
  dataPoints?: DataPointDefinition[];
  [key: string]: unknown;
}

export class DataPointSettingsStore {
  constructor(private adapter: SettingsAdapter) {}

  async getAll(): Promise<DataPointDefinition[]> {
    const data = (await this.adapter.load()) as LifeTrackerData | null;
    return data?.dataPoints ?? [];
  }

  async get(id: string): Promise<DataPointDefinition | undefined> {
    const all = await this.getAll();
    return all.find((d) => d.id === id);
  }

  private async saveAll(dataPoints: DataPointDefinition[]): Promise<void> {
    const data = ((await this.adapter.load()) as LifeTrackerData | null) ?? {};
    data.dataPoints = dataPoints;
    await this.adapter.save(data);
  }

  async create(dataPoint: DataPointDefinition): Promise<DataPointDefinition> {
    const all = await this.getAll();
    all.push(dataPoint);
    await this.saveAll(all);
    return dataPoint;
  }

  async update(id: string, patch: Partial<DataPointDefinition>): Promise<DataPointDefinition> {
    const all = await this.getAll();
    const idx = all.findIndex((d) => d.id === id);
    if (idx === -1) throw new Error(`Data point not found: ${id}`);
    const updated: DataPointDefinition = { ...all[idx], ...patch, id: all[idx].id };
    all[idx] = updated;
    await this.saveAll(all);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const all = await this.getAll();
    await this.saveAll(all.filter((d) => d.id !== id));
  }
}
