import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DataPointSettingsStore } from '../dataPointSettingsStore';
import { FakeSettingsAdapter } from '../../../../core/ports/__tests__/fakeSettingsAdapter';
import { DataPointDefinition } from '../../domain/types';

function makeDataPoint(overrides: Partial<DataPointDefinition> = {}): DataPointDefinition {
  return {
    id: 'd1',
    name: 'Weight',
    type: 'number',
    unit: 'kg',
    archived: false,
    createdAt: '2026-08-01',
    order: 0,
    ...overrides,
  };
}

describe('DataPointSettingsStore CRUD', () => {
  test('create then getAll/get returns the data point', async () => {
    const store = new DataPointSettingsStore(new FakeSettingsAdapter());
    const dp = makeDataPoint();
    await store.create(dp);

    const all = await store.getAll();
    assert.equal(all.length, 1);
    assert.deepEqual(all[0], dp);
    assert.deepEqual(await store.get('d1'), dp);
  });

  test('update patches only the given fields and preserves id', async () => {
    const store = new DataPointSettingsStore(new FakeSettingsAdapter());
    await store.create(makeDataPoint());

    const updated = await store.update('d1', { name: 'Body weight' });
    assert.equal(updated.id, 'd1');
    assert.equal(updated.name, 'Body weight');
    assert.equal(updated.unit, 'kg');
  });

  test('archive is just update({ archived: true })', async () => {
    const store = new DataPointSettingsStore(new FakeSettingsAdapter());
    await store.create(makeDataPoint({ archived: false }));
    await store.update('d1', { archived: true });
    assert.equal((await store.get('d1'))?.archived, true);
  });

  test('delete removes the data point; others unaffected', async () => {
    const store = new DataPointSettingsStore(new FakeSettingsAdapter());
    await store.create(makeDataPoint({ id: 'd1' }));
    await store.create(makeDataPoint({ id: 'd2', name: 'Sleep' }));
    await store.delete('d1');
    const all = await store.getAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, 'd2');
  });

  test('updating a non-existent data point throws', async () => {
    const store = new DataPointSettingsStore(new FakeSettingsAdapter());
    await assert.rejects(() => store.update('nope', { name: 'x' }));
  });

  test('does not clobber the habits key already present in the shared blob', async () => {
    const adapter = new FakeSettingsAdapter();
    await adapter.save({ habits: [{ id: 'h1' }] });
    const store = new DataPointSettingsStore(adapter);
    await store.create(makeDataPoint());

    const raw = await adapter.load();
    assert.deepEqual(raw?.habits, [{ id: 'h1' }]);
    assert.equal((raw?.dataPoints as DataPointDefinition[]).length, 1);
  });
});
