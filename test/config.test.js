import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, isConfigured, cookRefreshMs, DEFAULT_CONFIG } from '../src/config.js';

test('defaults fill what the user left empty', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig({ email: ' cook@example.com ', password: ' p ' }), {
    ...DEFAULT_CONFIG,
    email: 'cook@example.com',
    password: ' p ',
  });
});

test('unknown values fall back to the defaults', () => {
  const config = normalizeConfig({ language: 'it', cook_refresh: '5' });
  assert.equal(config.language, 'fr');
  assert.equal(config.cook_refresh, '30');
  assert.equal(normalizeConfig({ cook_refresh: 15 }).cook_refresh, '15', 'a number from a form');
});

test('the account is needed, the pace is in milliseconds', () => {
  assert.equal(isConfigured(normalizeConfig({ email: 'a@b.c' })), false);
  assert.equal(isConfigured(normalizeConfig({ email: 'a@b.c', password: 'x' })), true);
  assert.equal(cookRefreshMs(normalizeConfig()), 30000);
  assert.equal(cookRefreshMs(normalizeConfig({ cook_refresh: '60' })), 60000);
});
