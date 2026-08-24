import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { convertToPrimary } from '../currencyConverter';
import { ExchangeRates } from '../types';

describe('convertToPrimary', () => {
  test('an amount already in the primary currency passes through unchanged', () => {
    const rates: ExchangeRates = { primaryCurrency: 'USD', ratesToPrimary: {} };
    assert.equal(convertToPrimary(100, 'USD', rates), 100);
  });

  test('applies the configured rate for a non-primary currency', () => {
    const rates: ExchangeRates = { primaryCurrency: 'USD', ratesToPrimary: { EGP: 0.02 } };
    assert.equal(convertToPrimary(1000, 'EGP', rates), 20);
  });

  test('returns null (not a silent 1:1 guess) when no rate is configured', () => {
    const rates: ExchangeRates = { primaryCurrency: 'USD', ratesToPrimary: {} };
    assert.equal(convertToPrimary(1000, 'EGP', rates), null);
  });
});
