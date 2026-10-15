// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake MEATER Cloud answering
// with the fixtures, a recording logger, an in-memory /data and a clock the
// test moves. No network, no timer unless a test asks for one.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { createMeaterClient } from '../../src/meater.js';
import { accountHash } from '../../src/store.js';

export const PROBE_A = '7c1e9a3f5b2d4e6a8c0b1d3f5e7a9c2b4d6f8e0a1c3b5d7f9e2a4c6b8d0f1e3a';
export const PROBE_B = 'd4f2b6a8c0e1f3a5b7c9d2e4f6a8b0c1d3e5f7a9b2c4d6e8f0a1b3c5d7e9f2a4';

export const SECRETS = {
  email: 'cook@example.com',
  password: 's3cret-Pa55word',
};

/** A fixture of test/fixtures/meater, parsed (a fresh copy each time). */
export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/meater/${name}`, import.meta.url), 'utf8'));
}

/** The raw probes of devices-cooking.json: PROBE_A cooking, PROBE_B without a cook. */
export function cookingDevices() {
  return fixture('devices-cooking.json').data.devices;
}

/** A raw probe of PROBE_A in a given cook state. */
export function probeA({
  state = 'Started',
  remaining = 1260,
  internal = 26,
  cookId = '123123',
} = {}) {
  const [probe] = cookingDevices();
  probe.temperature.internal = internal;
  probe.cook.id = cookId;
  probe.cook.state = state;
  probe.cook.time.remaining = remaining;
  return probe;
}

/**
 * A fake MEATER Cloud: a fetch answering /login and /devices like the API.
 * Edit `devices`, `loginStatus`, `devicesStatus` or `down` at any time.
 */
export function createCloud({ devices = cookingDevices() } = {}) {
  const login = fixture('login.json');
  const cloud = {
    devices,
    token: login.data.token,
    loginStatus: 200,
    devicesStatus: 200,
    down: false,
    requests: [],
    /** The JWT is reset on the MEATER side: the old one gets a 401. */
    revokeToken() {
      cloud.token = `${cloud.token}-renewed`;
    },
    count: (path) => cloud.requests.filter((request) => request.path === path).length,
    async fetch(url, init = {}) {
      const path = new URL(url).pathname.replace('/v1', '');
      cloud.requests.push({
        path,
        method: init.method ?? 'GET',
        headers: init.headers ?? {},
        body: init.body,
      });
      if (cloud.down) {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
      }
      const reply = (status, body) => new Response(JSON.stringify(body), { status });
      if (path === '/login') {
        if (cloud.loginStatus !== 200) {
          return reply(
            cloud.loginStatus,
            fixture(cloud.loginStatus === 429 ? 'error-429.json' : 'error-401.json'),
          );
        }
        const body = JSON.parse(init.body);
        if (body.email !== SECRETS.email || body.password !== SECRETS.password) {
          return reply(401, fixture('error-401.json'));
        }
        return reply(200, { ...login, data: { ...login.data, token: cloud.token } });
      }
      if (path === '/devices') {
        if (init.headers?.Authorization !== `Bearer ${cloud.token}`) {
          return reply(401, fixture('error-401.json'));
        }
        if (cloud.devicesStatus !== 200) {
          return reply(cloud.devicesStatus, {
            status: `${cloud.devicesStatus}`,
            statusCode: cloud.devicesStatus,
          });
        }
        return reply(200, {
          status: 'OK',
          statusCode: 200,
          data: { devices: cloud.devices },
          meta: {},
        });
      }
      return reply(404, { status: '404 Not Found', statusCode: 404 });
    },
  };
  return cloud;
}

/** A logger that keeps every line, at every level. */
export function createRecorder() {
  const lines = [];
  const at =
    (level) =>
    (...args) => {
      lines.push({
        level,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
    };
  return {
    lines,
    debug: at('debug'),
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
    child: () => createRecorder(),
    at: (level) => lines.filter((line) => line.level === level).map((line) => line.text),
    clear: () => lines.splice(0),
  };
}

/** The /data store, in memory (same API as src/store.js). */
export function createMemoryStore({ token = null, probes = {} } = {}) {
  const data = { token: token ? { account: accountHash(SECRETS.email), token } : null, probes };
  return {
    data,
    writes: 0,
    async loadToken(email) {
      return data.token?.account === accountHash(email) ? data.token.token : null;
    },
    async saveToken(email, value) {
      this.writes += 1;
      data.token = { account: accountHash(email), token: value };
    },
    async clearToken() {
      this.writes += 1;
      data.token = null;
    },
    async loadProbes() {
      return structuredClone(data.probes);
    },
    async saveProbes(value) {
      this.writes += 1;
      data.probes = structuredClone(value);
    },
  };
}

/**
 * @param {object} [options]
 * @param {object} [options.config] on top of the test account
 * @param {object[]} [options.devices] raw probes the cloud answers with
 * @param {string[]} [options.added] probe ids already added to Gladys
 * @param {object} [options.store]
 * @param {boolean} [options.timers]
 * @param {boolean} [options.connect]
 */
export async function createWorld({
  config = {},
  devices,
  added = [],
  store = createMemoryStore(),
  timers = false,
  connect = true,
} = {}) {
  const clock = {
    t: Date.UTC(2026, 9, 15, 18, 0, 0),
    now: () => clock.t,
    advance(ms) {
      clock.t += ms;
    },
  };
  const cloud = createCloud(devices ? { devices } : undefined);
  const logger = createRecorder();
  const gladys = createFakeGladys({ config: { ...SECRETS, ...config } });
  const client = createMeaterClient({ fetch: cloud.fetch, now: clock.now, sleep: async () => {} });
  const app = createApp({ gladys, client, store, logger, now: clock.now, timers });

  // Probes the user already added: created from what the discovery offers.
  const { buildProbeDevice } = await import('../../src/probe.js');
  gladys.fake.devices = added.map((probeId) =>
    buildProbeDevice(gladys, probeId, config.language ?? 'fr'),
  );

  if (connect) {
    await gladys.connect();
  }

  return {
    gladys,
    cloud,
    app,
    hub: app.hub,
    logger,
    clock,
    store,
    /** The user clicks "Add to Gladys" on a discovered probe. */
    async add(probeId) {
      const ids = gladys.externalIds('probe', probeId);
      const device = gladys.fake.discoveredDevices.find((d) => d.external_id === ids.device);
      if (!device) {
        throw new Error(`probe ${probeId} is not in the Discovery tab`);
      }
      await gladys.fake.deviceCreated(device);
      return device;
    },
    feature: (probeId, key) => gladys.externalIds('probe', probeId).feature(key),
    stop: () => app.stop(),
  };
}
