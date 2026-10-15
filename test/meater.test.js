// -----------------------------------------------------------------------------
// The MEATER Cloud client, against a fake fetch answering with the fixtures
// (the shapes of the official documentation). No network.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMeaterClient,
  parseDevice,
  MeaterError,
  API_BASE,
  MIN_REQUEST_GAP_MS,
} from '../src/meater.js';
import { createCloud, fixture, SECRETS, PROBE_A, PROBE_B } from './helpers/world.js';

const quickClient = (cloud, options = {}) =>
  createMeaterClient({ fetch: cloud.fetch, sleep: async () => {}, ...options });

test('login posts the account as JSON and resolves the token', async () => {
  const cloud = createCloud();
  const token = await quickClient(cloud).login(SECRETS.email, SECRETS.password);
  assert.equal(token, fixture('login.json').data.token);
  const [request] = cloud.requests;
  assert.equal(request.method, 'POST');
  assert.equal(request.path, '/login');
  assert.equal(request.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.body), { email: SECRETS.email, password: SECRETS.password });
});

test('the devices are read with the token and the language of the cut names', async () => {
  const cloud = createCloud();
  const client = quickClient(cloud);
  const probes = await client.getDevices(cloud.token, 'fr');
  const request = cloud.requests.at(-1);
  assert.equal(request.headers.Authorization, `Bearer ${cloud.token}`);
  assert.equal(request.headers['Accept-Language'], 'fr');
  assert.deepEqual(
    probes.map((probe) => probe.id),
    [PROBE_A, PROBE_B],
  );
  assert.deepEqual(probes[0], {
    id: PROBE_A,
    internal: 26,
    ambient: 28,
    updatedAt: 1760536431,
    cook: {
      id: '123123',
      name: 'Whole chicken',
      state: 'Started',
      target: 74,
      peak: 27,
      elapsed: 2580,
      remaining: 1260,
    },
  });
  assert.equal(probes[1].cook, null);
});

test('the endpoint is the official one', () => {
  assert.equal(API_BASE, 'https://public-api.cloud.meater.com/v1');
});

test('a remaining time still being estimated (-1) is null, never a negative time', () => {
  const raw = fixture('devices-cooking.json').data.devices[0];
  raw.cook.time.remaining = -1;
  assert.equal(parseDevice(raw).cook.remaining, null);
});

test('incomplete probes are read safely, a probe without id is dropped', () => {
  assert.equal(parseDevice({ temperature: { internal: 20 } }), null);
  assert.equal(parseDevice(null), null);
  assert.deepEqual(parseDevice({ id: 'abc', temperature: {}, cook: { state: 'Started' } }), {
    id: 'abc',
    internal: null,
    ambient: null,
    updatedAt: null,
    cook: {
      id: null,
      name: '',
      state: 'Started',
      target: null,
      peak: null,
      elapsed: null,
      remaining: null,
    },
  });
  // Numbers sent as strings are still numbers.
  assert.equal(parseDevice({ id: 'abc', temperature: { internal: '21.5' } }).internal, 21.5);
});

test('every failure has a kind, and no message carries a secret', async () => {
  const cases = [
    { setup: (cloud) => (cloud.loginStatus = 401), kind: 'auth', call: 'login' },
    { setup: (cloud) => (cloud.loginStatus = 429), kind: 'rate_limit', call: 'login' },
    { setup: (cloud) => (cloud.devicesStatus = 500), kind: 'unavailable', call: 'devices' },
    { setup: (cloud) => (cloud.devicesStatus = 503), kind: 'unavailable', call: 'devices' },
    { setup: (cloud) => (cloud.devicesStatus = 404), kind: 'protocol', call: 'devices' },
    { setup: (cloud) => cloud.revokeToken(), kind: 'auth', call: 'devices' },
    { setup: (cloud) => (cloud.down = true), kind: 'unavailable', call: 'devices' },
  ];
  for (const { setup, kind, call } of cases) {
    const cloud = createCloud();
    const token = cloud.token;
    setup(cloud);
    const client = quickClient(cloud);
    const run =
      call === 'login' ? client.login(SECRETS.email, SECRETS.password) : client.getDevices(token);
    const err = await run.catch((error) => error);
    assert.ok(err instanceof MeaterError, `${kind}: ${err}`);
    assert.equal(err.kind, kind);
    for (const secret of [SECRETS.email, SECRETS.password, token]) {
      assert.ok(!err.message.includes(secret), `${kind}: "${err.message}" leaks a secret`);
    }
  }
});

test('an unreadable answer is a protocol error', async () => {
  const fetch = async () => new Response('<html>maintenance</html>', { status: 200 });
  const err = await createMeaterClient({ fetch })
    .getDevices('t')
    .catch((error) => error);
  assert.equal(err.kind, 'protocol');
  const noList = async () => new Response(JSON.stringify({ data: {} }), { status: 200 });
  assert.equal(
    (
      await createMeaterClient({ fetch: noList })
        .getDevices('t')
        .catch((e) => e)
    ).kind,
    'protocol',
  );
  const noToken = async () => new Response(JSON.stringify({ data: {} }), { status: 200 });
  assert.equal(
    (
      await createMeaterClient({ fetch: noToken })
        .login('a', 'b')
        .catch((e) => e)
    ).kind,
    'protocol',
  );
});

test('a timeout is reported as the cloud being unavailable', async () => {
  const fetch = (url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    });
  // AbortSignal.timeout does not hold the event loop (a real socket does).
  const hold = setTimeout(() => {}, 5000);
  const err = await createMeaterClient({ fetch, timeoutMs: 20 })
    .getDevices('t')
    .catch((error) => error)
    .finally(() => clearTimeout(hold));
  assert.equal(err.kind, 'unavailable');
  assert.match(err.message, /timeout/);
});

test('two requests are never sent less than 2 s apart, whoever asks', async () => {
  const cloud = createCloud();
  let clock = 1_000_000;
  const sentAt = [];
  const waits = [];
  const client = createMeaterClient({
    fetch: (url, init) => {
      sentAt.push(clock);
      return cloud.fetch(url, init);
    },
    now: () => clock,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
  });
  // Three callers at the same instant: the login, then two readings.
  await Promise.all([
    client.login(SECRETS.email, SECRETS.password),
    client.getDevices(cloud.token),
    client.getDevices(cloud.token),
  ]);
  assert.equal(MIN_REQUEST_GAP_MS, 2000);
  assert.deepEqual(waits, [2000, 2000]);
  for (let i = 1; i < sentAt.length; i += 1) {
    assert.ok(sentAt[i] - sentAt[i - 1] >= 2000, `requests ${i - 1} and ${i} too close`);
  }
  // A failed request does not block the queue.
  cloud.down = true;
  await client.getDevices(cloud.token).catch(() => {});
  cloud.down = false;
  assert.equal((await client.getDevices(cloud.token)).length, 2);
});
