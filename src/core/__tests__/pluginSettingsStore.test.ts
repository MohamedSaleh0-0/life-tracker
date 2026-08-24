import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PluginSettingsStore } from '../pluginSettingsStore';
import { FakeSettingsAdapter } from '../../modules/habit-tracking/infrastructure/__tests__/fakeSettingsAdapter';

describe('PluginSettingsStore.weekStartsOn', () => {
  test('defaults to monday when nothing has been saved', async () => {
    const store = new PluginSettingsStore(new FakeSettingsAdapter());
    assert.equal(await store.getWeekStartsOn(), 'monday');
  });

  test('round-trips a saved value', async () => {
    const store = new PluginSettingsStore(new FakeSettingsAdapter());
    await store.setWeekStartsOn('sunday');
    assert.equal(await store.getWeekStartsOn(), 'sunday');
  });

  test('does not clobber other keys already present in the settings blob', async () => {
    const adapter = new FakeSettingsAdapter();
    const store = new PluginSettingsStore(adapter);
    await adapter.save({ habits: [{ id: 'h1' }] });

    await store.setWeekStartsOn('sunday');

    const raw = await adapter.load();
    assert.deepEqual(raw?.habits, [{ id: 'h1' }]);
    assert.equal(raw?.weekStartsOn, 'sunday');
  });
});
