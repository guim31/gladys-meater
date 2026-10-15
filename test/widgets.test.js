// -----------------------------------------------------------------------------
// The "Cook" widget: a content the core renders as sent (validated by the
// SDK), bound to features the probe device really has, in every language.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { buildCookContent, pickProbe, WIDGET } from '../src/widgets.js';
import { buildProbeDevice } from '../src/probe.js';
import { parseDevice } from '../src/meater.js';
import { formatMinutes, WIDGET_TEXT } from '../src/i18n.js';
import { createWorld, cookingDevices, probeA, PROBE_A, PROBE_B } from './helpers/world.js';

const LANGS = ['en', 'fr', 'de', 'es'];

const readings = {
  cooking: parseDevice(cookingDevices()[0]),
  estimating: parseDevice(probeA({ remaining: -1 })),
  resting: parseDevice(probeA({ state: 'Resting', remaining: 0 })),
  done: parseDevice(probeA({ state: 'Finished', remaining: 0 })),
  idle: parseDevice(cookingDevices()[1]),
  gone: null,
};

test('every content is rendered exactly as sent, and only binds features of the probe', () => {
  const gladys = createFakeGladys();
  const featureIds = new Set(
    buildProbeDevice(gladys, PROBE_A, 'fr').features.map((f) => f.external_id),
  );
  for (const [label, probe] of Object.entries(readings)) {
    for (const language of LANGS) {
      const content = buildCookContent(gladys, {
        probeId: PROBE_A,
        deviceName: 'Sonde MEATER 7c1e9a3f',
        probe,
        language,
      });
      assert.deepEqual(validateWidgetContent(content), [], `${label} / ${language}`);
      for (const component of content.components) {
        if (component.device_feature) {
          assert.ok(
            featureIds.has(component.device_feature),
            `${label}: ${component.device_feature}`,
          );
        }
      }
    }
  }
});

test('the content shows the cook: name, remaining time, state', () => {
  const gladys = createFakeGladys();
  const content = buildCookContent(gladys, {
    probeId: PROBE_A,
    deviceName: 'Sonde',
    probe: readings.cooking,
    language: 'fr',
  });
  assert.equal(content.ttl_seconds, 30);
  assert.equal(content.components[0].text, 'Whole chicken');
  const remaining = content.components.find((c) => c.label === 'Restant');
  assert.equal(remaining.value, '21 min');
  const status = content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['État', 'En cuisson'],
      ['Écoulé', '43 min'],
      ['Sonde', 'Connectée'],
    ],
  );

  const estimating = buildCookContent(gladys, {
    probeId: PROBE_A,
    deviceName: 'x',
    probe: readings.estimating,
    language: 'es',
  });
  assert.equal(estimating.components.find((c) => c.label === 'Restante').value, 'Estimando');

  const gone = buildCookContent(gladys, {
    probeId: PROBE_A,
    deviceName: 'Sonde MEATER 7c1e9a3f',
    probe: null,
    language: 'de',
  });
  assert.equal(gone.ttl_seconds, 300);
  assert.equal(gone.components[0].text, 'Sonde MEATER 7c1e9a3f');
  const goneStatus = gone.components.find((c) => c.type === 'status');
  assert.deepEqual(
    goneStatus.items.map((item) => item.value),
    ['Kein Garvorgang', '—', 'Nicht sichtbar'],
  );
});

test('durations fit a tile', () => {
  assert.equal(formatMinutes(0), '0 min');
  assert.equal(formatMinutes(59), '59 min');
  assert.equal(formatMinutes(65), '1 h 05');
  assert.equal(formatMinutes(1439), '23 h 59');
  assert.ok(formatMinutes(2880).length <= 12);
  for (const lang of LANGS) {
    assert.ok(WIDGET_TEXT.estimating[lang].length <= 12, lang);
  }
});

test('the widget shows the probe picked, else the one cooking, else the first one', () => {
  const devices = [
    { external_id: 'a', probeId: 'A' },
    { external_id: 'b', probeId: 'B' },
  ];
  const cookingB = (id) => (id === 'B' ? readings.cooking : readings.idle);
  assert.equal(pickProbe(devices, 'a', cookingB).probeId, 'A');
  assert.equal(pickProbe(devices, undefined, cookingB).probeId, 'B');
  assert.equal(pickProbe(devices, 'unknown', () => null).probeId, 'A');
  assert.equal(
    pickProbe([], undefined, () => null),
    null,
  );
});

test('the widget handler: configured or not, with or without a probe added', async () => {
  const empty = await createWorld({ config: { email: '' } });
  try {
    const ack = await empty.gladys.fake.widgetGet(WIDGET.COOK, {
      settings: {},
      language: 'en',
      units: 'metric',
    });
    assert.equal(ack.data.content.components[0].text, WIDGET_TEXT.notConfigured.en);
  } finally {
    empty.stop();
  }

  const world = await createWorld();
  try {
    const get = (settings = {}) =>
      world.gladys.fake.widgetGet(WIDGET.COOK, { settings, language: 'fr', units: 'metric' });
    assert.equal((await get()).data.content.components[0].text, WIDGET_TEXT.noProbe.fr);

    await world.add(PROBE_B);
    await world.add(PROBE_A);
    const cooking = (await get()).data.content;
    assert.deepEqual(validateWidgetContent(cooking), []);
    assert.equal(cooking.components[0].text, 'Whole chicken', 'the probe cooking first');

    const idB = world.gladys.externalIds('probe', PROBE_B).device;
    const picked = (await get({ probe: idB })).data.content;
    assert.equal(picked.components[0].text, 'Sonde MEATER d4f2b6a8');
  } finally {
    world.stop();
  }
});

test('the widget reloads when what it shows inline changes, not at every refresh', async () => {
  const world = await createWorld({ added: [PROBE_A] });
  try {
    const count = () => world.gladys.fake.widgetRefreshes.length;
    const before = count();
    world.cloud.devices = [probeA({ internal: 31 }), cookingDevices()[1]];
    await world.hub.refresh();
    assert.equal(count(), before, 'a temperature: the tiles are live');
    world.cloud.devices = [probeA({ remaining: 1000 }), cookingDevices()[1]];
    await world.hub.refresh();
    assert.equal(count(), before + 1);
  } finally {
    world.stop();
  }
});
