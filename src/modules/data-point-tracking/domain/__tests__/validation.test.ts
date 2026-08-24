import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateEntryValue } from '../validation';

describe('validateEntryValue — number type', () => {
  test('accepts a valid number', () => {
    const result = validateEntryValue('number', '72.5');
    assert.equal(result.valid, true);
    if (result.valid) assert.equal(result.value, 72.5);
  });

  test('rejects non-numeric text', () => {
    const result = validateEntryValue('number', 'abc');
    assert.equal(result.valid, false);
  });

  test('rejects empty input', () => {
    const result = validateEntryValue('number', '   ');
    assert.equal(result.valid, false);
  });
});

describe('validateEntryValue — time type', () => {
  test('accepts a valid HH:MM time', () => {
    const result = validateEntryValue('time', '07:15');
    assert.equal(result.valid, true);
    if (result.valid) assert.equal(result.value, '07:15');
  });

  test('rejects an out-of-range hour', () => {
    assert.equal(validateEntryValue('time', '25:00').valid, false);
  });

  test('rejects an out-of-range minute', () => {
    assert.equal(validateEntryValue('time', '10:61').valid, false);
  });

  test('rejects a non-time string', () => {
    assert.equal(validateEntryValue('time', 'morning').valid, false);
  });
});

describe('validateEntryValue — text type', () => {
  test('accepts any non-empty text', () => {
    const result = validateEntryValue('text', 'Felt great today');
    assert.equal(result.valid, true);
    if (result.valid) assert.equal(result.value, 'Felt great today');
  });

  test('rejects empty text', () => {
    assert.equal(validateEntryValue('text', '').valid, false);
  });
});
