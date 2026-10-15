// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp, ACTION } from '../src/app.js';
import { SCENE_TRIGGER_KEYS, ALMOST_READY_MINUTES } from '../src/triggers.js';
import { FINAL_STATES } from '../src/cook.js';
import { WIDGET_KEYS } from '../src/widgets.js';
import { DEFAULT_CONFIG, LANGUAGES, COOK_REFRESH_OPTIONS } from '../src/config.js';
import { createMemoryStore, createRecorder } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const CAPABILITY_FIELDS = ['scene_triggers', 'scene_actions', 'widgets'];
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Minimum version of the manifest `gladys_version` range, e.g. [5, 1, 0].
function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

/** The handlers the app registers, read from a fake Gladys. */
function registeredHandlers() {
  const gladys = createFakeGladys();
  const keys = { actions: [], widgets: [] };
  const onAction = gladys.onAction.bind(gladys);
  const onWidgetGet = gladys.onWidgetGet.bind(gladys);
  gladys.onAction = (key, cb) => (keys.actions.push(key), onAction(key, cb));
  gladys.onWidgetGet = (key, cb) => (keys.widgets.push(key), onWidgetGet(key, cb));
  createApp({ gladys, store: createMemoryStore(), logger: createRecorder(), timers: false });
  return keys;
}

test('the store identity: name, image, categories, transports', () => {
  assert.equal(manifest.name, 'MEATER');
  assert.equal(manifest.type, 'device');
  assert.deepEqual(manifest.categories, ['appliances']);
  assert.deepEqual(manifest.transports, ['cloud'], 'the MEATER Cloud API only');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-meater:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-meater/main/cover.png',
  );
});

test('every manifest action has a handler, and vice versa', () => {
  const { actions } = registeredHandlers();
  assert.deepEqual(keysOf(manifest.actions).sort(), actions.sort());
  assert.deepEqual(actions, Object.values(ACTION));
  // An action applies no default and cannot fill a secret (Gladys#3154, #3155): none here.
  for (const action of manifest.actions) {
    assert.deepEqual(action.fields ?? [], [], `${action.key} needs no field`);
  }
});

test('every widgets key has an onWidgetGet handler, and vice versa', () => {
  const { widgets } = registeredHandlers();
  assert.deepEqual(keysOf(manifest.widgets).sort(), [...WIDGET_KEYS].sort());
  assert.deepEqual(widgets.sort(), [...WIDGET_KEYS].sort());
});

test('every scene trigger the code fires is declared in scene_triggers, and vice versa', () => {
  // An undeclared key is a 404 on publishSceneEvent; a declared key nobody
  // fires is a dead card in the scene editor.
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), [...SCENE_TRIGGER_KEYS].sort());
  assert.equal(manifest.scene_actions, undefined, 'read-only: no scene action');
});

test('the trigger filters match what the events carry', () => {
  const almost = manifest.scene_triggers.find((trigger) => trigger.key === 'cook_almost_ready');
  const minutes = almost.fields.find((field) => field.key === 'minutes');
  assert.deepEqual(
    minutes.options.map((option) => option.value),
    ALMOST_READY_MINUTES.map(String),
  );
  assert.equal(
    minutes.required,
    true,
    'without a threshold, a scene would run four times per cook',
  );
  const done = manifest.scene_triggers.find((trigger) => trigger.key === 'resting_done');
  const result = done.fields.find((field) => field.key === 'result');
  assert.deepEqual(result.options.map((option) => option.value).sort(), [...FINAL_STATES].sort());
  for (const trigger of manifest.scene_triggers) {
    const device = trigger.fields.find((field) => field.key === 'device');
    assert.equal(device?.source, 'devices', `${trigger.key}: filter on the probe`);
    for (const field of trigger.fields) {
      assert.notEqual(field.type, 'boolean', `${trigger.key}.${field.key}: no boolean filter`);
      assert.notEqual(field.type, 'secret');
    }
  }
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(minGladysVersion(), [4, 86, 0]));
});

test('declaring scene triggers or widgets requires Gladys >= 5.1.0', () => {
  const declared = CAPABILITY_FIELDS.filter((field) => manifest[field] !== undefined);
  assert.ok(declared.length > 0);
  assert.ok(
    isAtLeast(minGladysVersion(), [5, 1, 0]),
    `${declared.join(', ')} requires gladys_version >= 5.1.0, got "${manifest.gladys_version}"`,
  );
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  const stored = manifest.config_schema.filter((field) => field.type !== 'section');
  assert.deepEqual(keysOf(stored).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const field of stored) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
  const language = manifest.config_schema.find((field) => field.key === 'language');
  assert.deepEqual(
    language.options.map((option) => option.value),
    LANGUAGES,
  );
  const refresh = manifest.config_schema.find((field) => field.key === 'cook_refresh');
  assert.deepEqual(
    refresh.options.map((option) => option.value),
    COOK_REFRESH_OPTIONS,
  );
  assert.equal(manifest.config_schema.find((field) => field.key === 'password').type, 'secret');
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(section.placeholder, undefined, `section "${section.key}" placeholder`);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamicSelects = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamicSelects.length > 0);
  for (const field of dynamicSelects) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
    assert.equal(field.default, undefined, `field "${field.key}": no default with a source`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by hand.
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the name holds 3 to 30 characters, the catalog description 10 to 100 per language', () => {
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('field placeholders are multi-language objects', () => {
  const withPlaceholder = allFields.filter((f) => f.placeholder !== undefined);
  assert.ok(withPlaceholder.length > 0);
  for (const field of withPlaceholder) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en, `field "${field.key}": placeholder needs an English text`);
  }
});
