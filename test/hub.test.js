// -----------------------------------------------------------------------------
// The integration end to end: the SDK's fake Gladys on one side, a fake
// MEATER Cloud on the other (test/helpers/world.js). No network.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld,
  createMemoryStore,
  cookingDevices,
  probeA,
  PROBE_A,
  PROBE_B,
  SECRETS,
} from './helpers/world.js';
import { OFFLINE_COOK_RESET_MS } from '../src/hub.js';
import { TEXT } from '../src/i18n.js';

/** Let the pending promise chains (a timer callback, a refresh) run to the end. */
async function settle() {
  for (let i = 0; i < 50; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('at connection: signs in, reads the probes, offers them in Discovery', async () => {
  const world = await createWorld();
  try {
    assert.equal(world.cloud.count('/login'), 1);
    assert.equal(world.cloud.count('/devices'), 1);
    assert.deepEqual(world.gladys.fake.connectionStatus, { connected: true });
    const names = world.gladys.fake.discoveredDevices.map((device) => device.name);
    assert.deepEqual(names, ['Sonde MEATER 7c1e9a3f', 'Sonde MEATER d4f2b6a8']);
    // The probes are remembered: they stay in Discovery between cooks.
    assert.deepEqual(Object.keys(world.store.data.probes).sort(), [PROBE_A, PROBE_B].sort());
  } finally {
    world.stop();
  }
});

test('states go to the probes added to Gladys only, all of them as soon as one is added', async () => {
  const world = await createWorld();
  try {
    assert.equal(world.gladys.fake.states.length, 0, 'no probe added yet: nothing sent');
    await world.add(PROBE_A);
    const last = (key) => world.gladys.fake.lastState(world.feature(PROBE_A, key));
    assert.equal(last('internal_temperature'), 26);
    assert.equal(last('ambient_temperature'), 28);
    assert.equal(last('target_temperature'), 74);
    assert.equal(last('peak_temperature'), 27);
    assert.equal(last('remaining_time'), 21);
    assert.equal(last('elapsed_time'), 43);
    assert.equal(last('cooking'), 1);
    assert.equal(last('connected'), 1);
    assert.equal(last('cook_state'), 'En cuisson');
    assert.equal(last('cook_name'), 'Whole chicken');
    assert.ok(world.gladys.fake.widgetRefreshes.includes('cook'), 'the widget reloads');
    // Nothing for the probe that was not added.
    assert.ok(
      world.gladys.fake.states.every(
        (state) => !state.device_feature_external_id.includes(PROBE_B),
      ),
    );

    // The probe without a cook.
    await world.add(PROBE_B);
    const lastB = (key) => world.gladys.fake.lastState(world.feature(PROBE_B, key));
    assert.equal(lastB('internal_temperature'), 21.4, 'one decimal');
    assert.equal(lastB('cooking'), 0);
    assert.equal(lastB('cook_state'), 'Aucune cuisson');
    assert.equal(lastB('remaining_time'), 0);
  } finally {
    world.stop();
  }
});

test('the container refreshes the states by itself, without any poll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ added: [PROBE_A], timers: true });
  try {
    const poll = t.mock.method(world.hub, 'pollFromCore');
    const internal = world.feature(PROBE_A, 'internal_temperature');
    assert.equal(world.gladys.fake.lastState(internal), 26);

    // The timers and the clock of the integration move together.
    const wait = async (ms) => {
      world.clock.advance(ms);
      t.mock.timers.tick(ms);
      await settle();
    };
    world.cloud.devices = [probeA({ internal: 41.26 })];
    await wait(29_000);
    assert.equal(world.gladys.fake.lastState(internal), 26, 'not before the 30 s of a cook');

    await wait(1_000);
    assert.equal(world.gladys.fake.lastState(internal), 41.3);

    world.cloud.devices = [probeA({ internal: 55 })];
    await wait(30_000);
    assert.equal(world.gladys.fake.lastState(internal), 55);
    assert.equal(poll.mock.callCount(), 0, 'onPoll never ran');
    assert.equal(world.cloud.count('/devices'), 3);
  } finally {
    world.stop();
  }
});

test('the timer does not send a second request right after a poll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ added: [PROBE_A], timers: true });
  try {
    // Gladys polls 25 s after the start, the timer comes 5 s later.
    world.clock.advance(28_000);
    await world.gladys.fake.poll(world.gladys.fake.devices[0]);
    assert.equal(world.cloud.count('/devices'), 2, 'the poll refreshed');
    world.clock.advance(2_000);
    t.mock.timers.tick(30_000);
    await settle();
    assert.equal(world.cloud.count('/devices'), 2, 'the timer skipped');
    world.clock.advance(30_000);
    t.mock.timers.tick(30_000);
    await settle();
    assert.equal(world.cloud.count('/devices'), 3, 'and refreshes on the next tick');
  } finally {
    world.stop();
  }
});

test('pace: fast during a cook (configurable), every minute otherwise, slower after failures', async () => {
  const world = await createWorld();
  try {
    assert.equal(world.hub.intervalMs(), 30_000, 'a cook in progress, default pace');

    await world.gladys.fake.configUpdated({ ...SECRETS, cook_refresh: '15' });
    assert.equal(world.hub.intervalMs(), 15_000);

    world.cloud.devices = [cookingDevices()[1]];
    await world.hub.refresh();
    assert.equal(world.hub.intervalMs(), 60_000, 'no cook: the pace the API advises');

    world.cloud.devices = [probeA({ state: 'Finished' })];
    await world.hub.refresh();
    assert.equal(world.hub.intervalMs(), 60_000, 'a finished cook is not watched closely');

    world.cloud.down = true;
    await world.hub.refresh();
    assert.equal(world.hub.intervalMs(), 60_000);
    await world.hub.refresh();
    assert.equal(world.hub.intervalMs(), 120_000);
    for (let i = 0; i < 6; i += 1) {
      await world.hub.refresh();
    }
    assert.equal(world.hub.intervalMs(), 600_000, 'ten minutes at most');

    world.cloud.down = false;
    world.cloud.devicesStatus = 429;
    await world.hub.refresh();
    assert.ok(world.hub.intervalMs() >= 300_000, 'five minutes at least after a 429');

    world.cloud.devicesStatus = 200;
    world.cloud.devices = cookingDevices();
    await world.hub.refresh();
    assert.equal(world.hub.intervalMs(), 15_000, 'back to the cook pace');
  } finally {
    world.stop();
  }
});

test('only changed states are sent, with a heartbeat of 12 hours at most', async (t) => {
  const world = await createWorld({ added: [PROBE_A] });
  try {
    const publish = t.mock.method(world.gladys, 'publishChangedStates');
    await world.hub.refresh();
    const [, options] = publish.mock.calls[0].arguments;
    assert.ok(options.heartbeat > 0 && options.heartbeat <= 12 * 3600 * 1000);
    assert.equal(publish.mock.calls[0].result instanceof Promise, true);
    assert.equal((await publish.mock.calls[0].result).count, 0, 'nothing changed: nothing sent');

    const before = world.gladys.fake.states.length;
    world.cloud.devices = [probeA({ internal: 27 }), cookingDevices()[1]];
    await world.hub.refresh();
    const sent = world.gladys.fake.states.slice(before);
    assert.deepEqual(
      sent.map((state) => state.device_feature_external_id),
      [world.feature(PROBE_A, 'internal_temperature')],
    );
  } finally {
    world.stop();
  }
});

test("the core's poll is a fallback: skipped right after a refresh, one refresh for every probe", async () => {
  const world = await createWorld({ added: [PROBE_A, PROBE_B] });
  try {
    const [deviceA, deviceB] = world.gladys.fake.devices;
    assert.deepEqual(await world.gladys.fake.poll(deviceA), { success: true });
    assert.equal(world.cloud.count('/devices'), 1, 'refreshed moments ago: skipped');

    world.clock.advance(30_000);
    world.cloud.devices = [probeA({ internal: 33 }), cookingDevices()[1]];
    await Promise.all([world.gladys.fake.poll(deviceA), world.gladys.fake.poll(deviceB)]);
    assert.equal(world.cloud.count('/devices'), 2, 'two polls, one request');
    assert.equal(world.gladys.fake.lastState(world.feature(PROBE_A, 'internal_temperature')), 33);
  } finally {
    world.stop();
  }
});

test('a probe gone from the cloud: disconnected at once, its cook reset after 30 minutes', async () => {
  const world = await createWorld({ added: [PROBE_A] });
  try {
    const last = (key) => world.gladys.fake.lastState(world.feature(PROBE_A, key));
    world.cloud.devices = [];
    await world.hub.refresh();
    assert.equal(last('connected'), 0);
    assert.equal(last('cooking'), 1, 'maybe just out of Bluetooth range: the cook goes on');
    assert.equal(last('internal_temperature'), 26, 'the last reading stays');
    assert.equal(world.hub.intervalMs(), 60_000);

    world.clock.advance(OFFLINE_COOK_RESET_MS);
    await world.hub.refresh();
    assert.equal(last('cooking'), 0);
    assert.equal(last('cook_state'), 'Aucune cuisson');
    assert.equal(last('remaining_time'), 0);
    assert.equal(world.gladys.fake.discoveredDevices.length, 2, 'still offered in Discovery');

    world.cloud.devices = [probeA({ internal: 40 })];
    await world.hub.refresh();
    assert.equal(last('connected'), 1);
    assert.equal(last('cooking'), 1);
    assert.ok(world.logger.at('info').some((line) => /7c1e9a3f is back/.test(line)));
    assert.ok(world.logger.at('info').some((line) => /7c1e9a3f no longer visible/.test(line)));
  } finally {
    world.stop();
  }
});

test('the probes remembered in /data stay in Discovery after a restart, even with no cook', async () => {
  const store = createMemoryStore();
  const first = await createWorld({ store });
  first.stop();
  const second = await createWorld({ store, devices: [] });
  try {
    assert.equal(second.gladys.fake.discoveredDevices.length, 2);
    await second.add(PROBE_A);
    const last = (key) => second.gladys.fake.lastState(second.feature(PROBE_A, key));
    assert.equal(last('connected'), 0);
    // Seen moments ago by the first run: the cook may still be going on.
    assert.equal(last('cooking'), undefined);
  } finally {
    second.stop();
  }
});

test('the token is kept in /data and reused; a token reset on the MEATER side signs in again once', async () => {
  const store = createMemoryStore();
  const first = await createWorld({ store });
  first.stop();
  assert.equal(store.data.token.token, first.cloud.token);
  assert.ok(!JSON.stringify(store.data).includes(SECRETS.email), 'no e-mail address in /data');
  assert.ok(!JSON.stringify(store.data).includes(SECRETS.password), 'no password in /data');

  const second = await createWorld({ store });
  try {
    assert.equal(second.cloud.count('/login'), 0, 'the saved token is used');
    second.cloud.revokeToken();
    await second.hub.refresh();
    assert.equal(second.cloud.count('/login'), 1);
    assert.equal(store.data.token.token, second.cloud.token);
    assert.deepEqual(second.gladys.fake.connectionStatus, { connected: true });
  } finally {
    second.stop();
  }
});

test('refused credentials: one sign-in, a clear status, nothing more until the configuration changes', async () => {
  const world = await createWorld({ config: { password: 'wrong' } });
  try {
    assert.equal(world.cloud.count('/login'), 1);
    assert.deepEqual(world.gladys.fake.connectionStatus, {
      connected: false,
      message: TEXT.badCredentials,
    });
    for (let i = 0; i < 5; i += 1) {
      world.clock.advance(60_000);
      await world.hub.refresh();
      await world.hub.pollFromCore();
    }
    assert.equal(world.cloud.count('/login'), 1, 'no more attempts: the account could get locked');
    assert.equal(world.logger.at('warn').length, 1, 'said once');

    await world.gladys.fake.configUpdated({ ...SECRETS });
    assert.equal(world.cloud.count('/login'), 2);
    assert.deepEqual(world.gladys.fake.connectionStatus, { connected: true });
  } finally {
    world.stop();
  }
});

test('a cloud outage is said once, its end once', async () => {
  const world = await createWorld();
  try {
    world.logger.clear();
    world.cloud.down = true;
    for (let i = 0; i < 4; i += 1) {
      await world.hub.refresh();
    }
    assert.equal(world.logger.at('warn').length, 1);
    assert.deepEqual(world.gladys.fake.connectionStatus, {
      connected: false,
      message: TEXT.unavailable,
    });
    const statuses = world.gladys.fake.connectionStatuses.length;
    world.cloud.down = false;
    await world.hub.refresh();
    await world.hub.refresh();
    assert.deepEqual(world.logger.at('info'), ['MEATER Cloud answers again']);
    assert.equal(
      world.gladys.fake.connectionStatuses.length,
      statuses + 1,
      'status sent on change only',
    );
  } finally {
    world.stop();
  }
});

test('a normal refresh writes nothing at info level', async () => {
  const world = await createWorld({ added: [PROBE_A, PROBE_B] });
  try {
    world.logger.clear();
    for (let i = 0; i < 5; i += 1) {
      world.clock.advance(30_000);
      world.cloud.devices = [
        probeA({ internal: 30 + i, remaining: 2000 - i * 30 }),
        cookingDevices()[1],
      ];
      await world.hub.refresh();
      await world.gladys.fake.poll(world.gladys.fake.devices[0]);
      await world.gladys.fake.widgetGet('cook', { settings: {}, language: 'fr', units: 'metric' });
    }
    assert.deepEqual(world.logger.at('info'), []);
    assert.deepEqual(world.logger.at('warn'), []);
    assert.ok(world.logger.at('debug').length > 0, 'LOG_LEVEL=debug shows the cycle');
  } finally {
    world.stop();
  }
});

test('no secret of the configuration ever reaches the logs', async () => {
  const world = await createWorld();
  try {
    const token = world.cloud.token;
    world.cloud.revokeToken();
    await world.hub.refresh();
    world.cloud.down = true;
    await world.hub.refresh();
    world.cloud.down = false;
    world.cloud.devicesStatus = 429;
    await world.hub.refresh();
    world.cloud.devicesStatus = 500;
    await world.hub.refresh();
    world.cloud.devicesStatus = 200;
    await world.gladys.fake.configUpdated({ ...SECRETS, password: 'not-the-password-123' });
    await world.gladys.fake.action('test_connection', {});
    await world.gladys.fake.configUpdated({ ...SECRETS });
    await world.gladys.fake.action('test_connection', {});
    await world.gladys.fake.scanRequest();

    const everything = world.logger.lines.map((line) => line.text).join('\n');
    for (const secret of [
      SECRETS.email,
      SECRETS.password,
      'not-the-password-123',
      token,
      world.cloud.token,
    ]) {
      assert.ok(!everything.includes(secret), `a log line contains "${secret}"`);
    }
    assert.ok(world.logger.lines.length > 10, 'the scenario did log');
  } finally {
    world.stop();
  }
});

test('the scene triggers fire during the cook, once, even across a restart', async () => {
  const store = createMemoryStore();
  const first = await createWorld({
    added: [PROBE_A],
    store,
    devices: [probeA({ remaining: 1900 })],
  });
  const keysOf = (world) => world.gladys.fake.sceneEvents.map((event) => event.key);
  try {
    assert.deepEqual(keysOf(first), []);
    first.cloud.devices = [probeA({ remaining: 1700 })];
    await first.hub.refresh();
    assert.deepEqual(first.gladys.fake.sceneEvents, [
      {
        key: 'cook_almost_ready',
        data: {
          device: first.feature(PROBE_A, 'x').replace(/:x$/, ''),
          cook_name: 'Whole chicken',
          cook_state: 'En cuisson',
          internal_temperature: 26,
          target_temperature: 74,
          remaining_minutes: 29,
          minutes: 30,
        },
      },
    ]);
    first.cloud.devices = [probeA({ state: 'Ready For Resting', remaining: 0 })];
    await first.hub.refresh();
    // Off the heat: the thresholds not reached yet are not fired late.
    assert.deepEqual(keysOf(first), ['cook_almost_ready', 'remove_from_heat']);
  } finally {
    first.stop();
  }

  // Gladys restarts the container while the meat rests.
  const second = await createWorld({
    added: [PROBE_A],
    store,
    devices: [probeA({ state: 'Ready For Resting', remaining: 0 })],
  });
  try {
    second.cloud.devices = [probeA({ state: 'Resting', remaining: 0 })];
    await second.hub.refresh();
    second.cloud.devices = [probeA({ state: 'Finished', remaining: 0 })];
    await second.hub.refresh();
    assert.deepEqual(keysOf(second), ['resting_done']);
    assert.equal(second.gladys.fake.sceneEvents[0].data.result, 'finished');
  } finally {
    second.stop();
  }
});

test('/data is written when something changes, not at every refresh', async () => {
  const store = createMemoryStore();
  const world = await createWorld({ store, added: [PROBE_A] });
  try {
    const writes = store.writes;
    for (let i = 0; i < 5; i += 1) {
      world.cloud.devices = [probeA({ internal: 30 + i }), cookingDevices()[1]];
      await world.hub.refresh();
    }
    assert.equal(store.writes, writes);
    world.cloud.devices = [probeA({ state: 'Ready For Resting' }), cookingDevices()[1]];
    await world.hub.refresh();
    assert.equal(store.writes, writes + 1);
  } finally {
    world.stop();
  }
});

test('a new probe appearing later reaches the Discovery tab at once', async () => {
  const world = await createWorld({ devices: [cookingDevices()[0]] });
  try {
    assert.equal(world.gladys.fake.discoveredDevices.length, 1);
    world.cloud.devices = cookingDevices();
    await world.hub.refresh();
    assert.equal(world.gladys.fake.discoveredDevices.length, 2);
    assert.ok(world.logger.at('info').some((line) => /d4f2b6a8 found/.test(line)));
  } finally {
    world.stop();
  }
});

test('a search reads the cloud and publishes the probes', async () => {
  const world = await createWorld({ devices: [] });
  try {
    assert.equal(world.gladys.fake.discoveredDevices.length, 0);
    world.cloud.devices = cookingDevices();
    await world.gladys.fake.scanRequest();
    assert.equal(world.gladys.fake.discoveredDevices.length, 2);
  } finally {
    world.stop();
  }
});

test('not configured: says so, reads nothing', async () => {
  const world = await createWorld({ config: { email: '', password: '' } });
  try {
    assert.equal(world.cloud.requests.length, 0);
    assert.deepEqual(world.gladys.fake.connectionStatus, {
      connected: false,
      message: TEXT.notConfigured,
    });
    const ack = await world.gladys.fake.action('test_connection', {});
    assert.equal(ack.success, false);
    assert.equal(ack.error, TEXT.notConfigured.fr);
  } finally {
    world.stop();
  }
});

test('"Test the connection" reports the probes in sight, or what is wrong', async () => {
  const world = await createWorld();
  try {
    const ok = await world.gladys.fake.action('test_connection', {});
    assert.equal(ok.success, true);
    assert.match(ok.data.message.fr, /2 sonde\(s\)/);

    world.cloud.devices = [];
    const none = await world.gladys.fake.action('test_connection', {});
    assert.deepEqual(none.data.message, TEXT.testNoProbe);

    world.cloud.devicesStatus = 503;
    const down = await world.gladys.fake.action('test_connection', {});
    assert.equal(down.success, false);
    assert.equal(down.error, TEXT.unavailable.fr);

    // A test after refused credentials tries again (the user asked).
    world.cloud.devicesStatus = 200;
    world.cloud.revokeToken();
    world.cloud.loginStatus = 401;
    assert.equal(
      (await world.gladys.fake.action('test_connection', {})).error,
      TEXT.badCredentials.fr,
    );
    world.cloud.loginStatus = 200;
    assert.equal((await world.gladys.fake.action('test_connection', {})).success, true);
    assert.equal(world.logger.at('info').filter((line) => /Connection test/.test(line)).length, 5);
  } finally {
    world.stop();
  }
});

test('another account in the configuration forgets the saved token', async () => {
  const store = createMemoryStore();
  const world = await createWorld({ store });
  try {
    await world.gladys.fake.configUpdated({ ...SECRETS, email: 'other@example.com' });
    assert.equal(world.cloud.count('/login'), 2);
    assert.equal(world.gladys.fake.connectionStatus.connected, false, 'the fake cloud refuses it');
  } finally {
    world.stop();
  }
});

test('the probes are read-only: a command is refused', async () => {
  const world = await createWorld({ added: [PROBE_A] });
  try {
    const [device] = world.gladys.fake.devices;
    const ack = await world.gladys.fake.setValue(device, device.features[0], 1);
    assert.equal(ack.success, false);
  } finally {
    world.stop();
  }
});
