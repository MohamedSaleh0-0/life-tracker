import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HabitSettingsStore } from '../habitSettingsStore';
import { FakeSettingsAdapter } from './fakeSettingsAdapter';
import { HabitDefinition } from '../../domain/types';

function makeHabit(overrides: Partial<HabitDefinition> = {}): HabitDefinition {
  return {
    id: 'h1',
    type: 'boolean',
    name: 'Drink water',
    icon: '💧',
    color: '#3b82f6',
    schedule: { mode: 'daily' },
    trendVisible: true,
    archived: false,
    createdAt: '2026-08-01',
    order: 0,
    ...overrides,
  };
}

describe('HabitSettingsStore CRUD', () => {
  test('create then getAll/get returns the habit', async () => {
    const store = new HabitSettingsStore(new FakeSettingsAdapter());
    const habit = makeHabit();
    await store.create(habit);

    const all = await store.getAll();
    assert.equal(all.length, 1);
    assert.deepEqual(all[0], habit);

    const fetched = await store.get('h1');
    assert.deepEqual(fetched, habit);
  });

  test('update patches only the given fields and preserves id', async () => {
    const store = new HabitSettingsStore(new FakeSettingsAdapter());
    await store.create(makeHabit());

    const updated = await store.update('h1', { name: 'Drink more water', id: 'should-be-ignored' as any });
    assert.equal(updated.id, 'h1'); // id is immutable, patch attempt ignored
    assert.equal(updated.name, 'Drink more water');
    assert.equal(updated.color, '#3b82f6'); // untouched fields preserved
  });

  test('archive is just update({ archived: true })', async () => {
    const store = new HabitSettingsStore(new FakeSettingsAdapter());
    await store.create(makeHabit({ archived: false }));

    await store.update('h1', { archived: true });
    const habit = await store.get('h1');
    assert.equal(habit?.archived, true);
  });

  test('delete removes the habit; other habits are unaffected', async () => {
    const store = new HabitSettingsStore(new FakeSettingsAdapter());
    await store.create(makeHabit({ id: 'h1' }));
    await store.create(makeHabit({ id: 'h2', name: 'Read' }));

    await store.delete('h1');
    const all = await store.getAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, 'h2');
  });

  test('updating a non-existent habit throws', async () => {
    const store = new HabitSettingsStore(new FakeSettingsAdapter());
    await assert.rejects(() => store.update('does-not-exist', { name: 'x' }));
  });

  test('starts empty when no data has ever been saved', async () => {
    const store = new HabitSettingsStore(new FakeSettingsAdapter());
    assert.deepEqual(await store.getAll(), []);
  });
});
