// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code and the documentation. German says "du", never the polite "Sie";
// Spanish says "usted", never "tú".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import { NAMES, DEVICE_NAME, STATE_LABELS, TEXT, TEST_OK, WIDGET_TEXT } from '../src/i18n.js';
import { FEATURE } from '../src/probe.js';
import { COOK_STATES, NO_COOK } from '../src/cook.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;
const FAMILIAR_SPANISH = /(?<!\p{L})(tú|tu|tus|puedes|tienes|quieres|elige|añade)(?!\p{L})/iu;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  section: 1000,
  message: 200,
  short: 24,
  featureName: 40,
  deviceName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  if (lang === 'es' && FAMILIAR_SPANISH.test(text)) {
    found.push(`${path} uses the familiar form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key, parent) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key, parent));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      let max = MAX[key] ?? MAX.label;
      if (path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)) {
        max = MAX.catalog;
      } else if (/^manifest\.widgets\[\d+\]\.label$/.test(path)) {
        max = MAX.widgetLabel;
      } else if (key === 'description' && parent?.type === 'section') {
        max = MAX.section;
      }
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child, value);
    }
  };
  walk(root, 'manifest', null, null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max, render = (value) => value) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(render(value), `${name}.${lang}.${key}`, lang, max));
    }
  }
  return found;
}

test('the configuration offers the four languages, French by default', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  const language = manifest.config_schema.find((field) => field.key === 'language');
  assert.equal(language.default, 'fr');
});

test('the name of the integration is the same in every language', () => {
  assert.equal(typeof manifest.name, 'string', 'a brand: one plain name');
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 55, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the catalog description holds 10 characters at least in every language', () => {
  for (const lang of LANGS) {
    assert.ok(manifest.description[lang].length >= 10, `description.${lang} is too short`);
  }
});

test('the feature names exist in every language, for every feature', () => {
  assert.deepEqual(tableProblems(NAMES, 'NAMES', MAX.featureName), []);
  assert.deepEqual(sorted(Object.keys(NAMES.en)), sorted(Object.values(FEATURE)));
  const longId = 'f'.repeat(8);
  assert.deepEqual(
    tableProblems(
      Object.fromEntries(LANGS.map((lang) => [lang, { name: DEVICE_NAME[lang] }])),
      'DEVICE_NAME',
      MAX.deviceName,
      (render) => render(longId),
    ),
    [],
  );
});

test('the cook states exist in every language, for every state of the API', () => {
  assert.deepEqual(tableProblems(STATE_LABELS, 'STATE_LABELS', MAX.featureName), []);
  assert.deepEqual(
    sorted(Object.keys(STATE_LABELS.en)),
    sorted([...Object.values(COOK_STATES), NO_COOK, 'unknown']),
  );
});

test('every message of the code has the four languages', () => {
  const found = [
    ...Object.entries(TEXT).flatMap(([key, value]) => problems(value, `TEXT.${key}`, MAX.message)),
    ...tableProblems(
      Object.fromEntries(LANGS.map((lang) => [lang, { ok: TEST_OK[lang] }])),
      'TEST_OK',
      MAX.message,
      (render) => render(12),
    ),
    ...Object.entries(WIDGET_TEXT).flatMap(([key, value]) =>
      problems(
        value,
        `WIDGET_TEXT.${key}`,
        ['noProbe', 'notConfigured', 'waiting'].includes(key) ? 300 : MAX.short,
      ),
    ),
  ];
  assert.deepEqual(found, []);
});

// --- The documentation ---------------------------------------------------------

const docs = Object.fromEntries(
  await Promise.all(
    LANGS.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

const SECTIONS = {
  en: [
    'Overview',
    'Requirements',
    'Configuration',
    'Devices',
    'Dashboard widget',
    'Scene triggers',
    'Action',
    'Scene examples',
    'Refresh and quotas',
    'Troubleshooting',
    'Limitations',
  ],
  fr: [
    'Présentation',
    'Prérequis',
    'Configuration',
    'Appareils',
    'Widget de tableau de bord',
    'Déclencheurs de scène',
    'Action',
    'Exemples de scènes',
    'Rafraîchissement et quotas',
    'Dépannage',
    'Limites',
  ],
  de: [
    'Überblick',
    'Voraussetzungen',
    'Konfiguration',
    'Geräte',
    'Dashboard-Widget',
    'Szenen-Auslöser',
    'Aktion',
    'Szenenbeispiele',
    'Aktualisierung und Kontingente',
    'Fehlerbehebung',
    'Einschränkungen',
  ],
  es: [
    'Presentación',
    'Requisitos',
    'Configuración',
    'Dispositivos',
    'Widget del panel',
    'Activadores de escena',
    'Acción',
    'Ejemplos de escenas',
    'Actualización y cuotas',
    'Solución de problemas',
    'Limitaciones',
  ],
};

const headings = (markdown) =>
  markdown
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim());

test('the four documentations have the same sections, in the same order', () => {
  for (const lang of LANGS) {
    assert.deepEqual(headings(docs[lang]), SECTIONS[lang], `docs/${lang}.md`);
  }
});

test('the four documentations describe the same things', () => {
  const count = (markdown, pattern) => (markdown.match(pattern) ?? []).length;
  for (const lang of LANGS) {
    const markdown = docs[lang];
    assert.ok(markdown.length >= 300, `docs/${lang}.md is too short for the store`);
    // Same tables (configuration, features, triggers), same rows.
    assert.equal(count(markdown, /^\|/gm), count(docs.en, /^\|/gm), `docs/${lang}.md table rows`);
    // Same lists.
    assert.equal(count(markdown, /^- /gm), count(docs.en, /^- /gm), `docs/${lang}.md list items`);
    assert.match(markdown, /Apption Labs/, `docs/${lang}.md: the non-affiliation notice`);
    for (const name of Object.values(NAMES[lang])) {
      assert.ok(markdown.includes(name), `docs/${lang}.md does not name the feature "${name}"`);
    }
    for (const trigger of manifest.scene_triggers) {
      assert.ok(
        markdown.includes(trigger.label[lang]),
        `docs/${lang}.md misses the trigger "${trigger.label[lang]}"`,
      );
    }
  }
  assert.ok(!POLITE_GERMAN.test(docs.de), 'docs/de.md uses the polite form');
  assert.ok(!FAMILIAR_SPANISH.test(docs.es), 'docs/es.md uses the familiar form');
});

test('the guard catches a missing language, an empty text and the wrong form of address', () => {
  assert.equal(problems({ en: 'Probe', fr: 'Sonde', de: 'Fühler' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'Probe', fr: 'Sonde', de: '', es: 'Sonda' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of [
    'Wählen Sie',
    'Ihr Fühler',
    'Ihre Sonde',
    'mit Ihrem',
    'Ihren',
    'Ihrer',
    'Ihres',
  ]) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'Elige tu sonda' }, 'x', 60).length, 1);
  // Words that only contain the letters stay allowed.
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'Tubo, tutorial' }, 'x', 60),
    [],
  );
  // A manifest text forgotten in German is found.
  const forgotten = structuredClone(manifest);
  delete forgotten.config_schema[1].placeholder.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.config_schema[1].placeholder has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});
