// -----------------------------------------------------------------------------
// The hub: one MEATER Cloud account, its probes, and the refresh loop.
//
// One GET /devices answers for every probe of the account, so the refresh is
// account-wide, driven by the container's own timer — the core's poll cannot
// be trusted (GladysAssistant/Gladys#3198) and stays a fallback:
//   - a cook set up or in progress: every 15, 30 (default) or 60 s;
//   - otherwise: every 60 s, the pace the API documentation advises;
//   - after a failure: 1, 2, 4… minutes, up to 10 (5 at least after a 429).
// The client never sends two requests less than 2 s apart (src/meater.js).
//
// The account is read even before a probe is added to Gladys: a probe only
// shows in the API during a cook, and this is how it reaches the Discovery
// tab. States are only sent for the probes added to Gladys (the core drops
// the others), and only when they change (publishChangedStates), with a
// heartbeat every 6 hours.
//
// Logs: info for the life cycle only (sign-in, a probe found, lost or back,
// the cloud lost and back); a normal refresh writes debug lines only. No
// token, password or e-mail address in any line.
// -----------------------------------------------------------------------------

import { isConfigured, cookRefreshMs, IDLE_REFRESH_MS } from './config.js';
import { cookStateKey, needsFastRefresh, remainingMinutes } from './cook.js';
import { MeaterError } from './meater.js';
import { TEXT, errorText } from './i18n.js';
import { createIssueLog } from './issues.js';
import { buildProbeDevice, probeStates, probeIds, probeIdOfDevice, shortId } from './probe.js';
import { cookTransitions, sameMemory } from './triggers.js';
import { WIDGET } from './widgets.js';

/** A probe gone for this long has finished its cook: "Cook in progress" goes back to 0. */
export const OFFLINE_COOK_RESET_MS = 30 * 60 * 1000;

/** Unchanged values are sent again this often, so Gladys never shows them as stale. */
export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;

const MAX_BACKOFF_MS = 10 * 60 * 1000;
const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;

/**
 * @param {object} options
 * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
 * @param {ReturnType<import('./meater.js').createMeaterClient>} options.client
 * @param {ReturnType<import('./store.js').createStore>} options.store
 * @param {{ debug: Function, info: Function, warn: Function, error: Function }} options.logger
 * @param {() => ReturnType<import('./config.js').normalizeConfig>} options.getConfig
 * @param {() => number} [options.now]
 * @param {boolean} [options.timers] run the refresh timer (tests drive refresh() themselves)
 */
export function createHub({
  gladys,
  client,
  store,
  logger,
  getConfig,
  now = () => Date.now(),
  timers = true,
}) {
  const issues = createIssueLog(logger);

  let token = null;
  let tokenLoaded = false;
  /** Wrong credentials: no more sign-in attempt until the configuration changes. */
  let authBlocked = false;
  /** Probes ever seen: probeId → { lastSeen, cook } (persisted in /data). */
  let known = new Map();
  let knownLoaded = false;
  /** The probes visible in the last answer: probeId → reading. */
  let readings = new Map();
  /** Whether at least one answer was read since the start. */
  let hasRead = false;
  let lastRefreshAt = null;
  let failures = 0;
  let lastErrorKind = null;
  let lastStatus = null;
  let widgetSignature = null;
  let inFlight = null;
  let timer = null;
  let stopped = true;

  // --- Gladys side -----------------------------------------------------------

  /** Connection status of the Configuration screen, sent when it changes only. */
  async function setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === lastStatus) {
      return;
    }
    lastStatus = key;
    await gladys.setConnectionStatus(connected, message).catch((err) => {
      lastStatus = null;
      logger.debug(`Connection status not sent (${err.message})`);
    });
  }

  /** The probe devices added to Gladys, with their probe id. */
  function probeDevices() {
    return (gladys.devices ?? [])
      .map((device) => ({ ...device, probeId: probeIdOfDevice(gladys, device.external_id) }))
      .filter((device) => device.probeId !== null);
  }

  function isCookOver(probeId) {
    if (readings.has(probeId)) {
      return false;
    }
    const lastSeen = known.get(probeId)?.lastSeen ?? null;
    return lastSeen === null || now() - lastSeen >= OFFLINE_COOK_RESET_MS;
  }

  function statesOf(probeId) {
    return probeStates(gladys, {
      probeId,
      probe: readings.get(probeId) ?? null,
      cookOver: isCookOver(probeId),
      language: getConfig().language,
    });
  }

  /** Send the changed states of the given probes (all the added ones by default). */
  async function publishStates(probeIdList = probeDevices().map((device) => device.probeId)) {
    const states = probeIdList.flatMap(statesOf);
    if (states.length === 0) {
      return;
    }
    try {
      const { count } = await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      issues.ok('publish', 'Probe states accepted by Gladys again');
      logger.debug(`${count} state(s) sent to Gladys`);
    } catch (err) {
      issues.fail('publish', `Gladys refused the probe states (${err.message})`);
    }
  }

  /** The Discovery tab: every probe ever seen, plus the ones already added. */
  async function publishDiscovered() {
    const ids = new Set([...known.keys(), ...probeDevices().map((device) => device.probeId)]);
    const language = getConfig().language;
    const devices = [...ids].map((probeId) => buildProbeDevice(gladys, probeId, language));
    try {
      await gladys.publishDiscoveredDevices(devices);
      issues.ok('discovery', 'Discovered probes accepted by Gladys again');
      logger.debug(`${devices.length} probe(s) published in the Discovery tab`);
    } catch (err) {
      issues.fail('discovery', `Gladys refused the discovered probes (${err.message})`);
    }
  }

  /** Ask the widget to reload when what it shows inline changed. */
  function refreshWidgetIfChanged() {
    const signature = JSON.stringify(
      [...readings.values()].map((probe) => [
        probe.id,
        cookStateKey(probe.cook),
        remainingMinutes(probe.cook),
        probe.cook?.name ?? null,
      ]),
    );
    if (signature !== widgetSignature) {
      widgetSignature = signature;
      gladys.requestWidgetRefresh(WIDGET.COOK);
    }
  }

  async function fireEvents(events) {
    for (const { key, data } of events) {
      try {
        await gladys.publishSceneEvent(key, data);
        logger.debug(`Scene trigger ${key} fired`);
        issues.ok('scene', 'Scene triggers accepted by Gladys again');
      } catch (err) {
        issues.fail('scene', `Gladys refused the scene trigger ${key} (${err.message})`);
      }
    }
  }

  // --- MEATER side -----------------------------------------------------------

  async function loadKnown() {
    if (knownLoaded) {
      return;
    }
    knownLoaded = true;
    const saved = await store.loadProbes();
    known = new Map(
      Object.entries(saved).map(([probeId, entry]) => [
        probeId,
        {
          lastSeen: Number.isFinite(entry?.lastSeen) ? entry.lastSeen : null,
          cook: entry?.cook && typeof entry.cook === 'object' ? entry.cook : null,
        },
      ]),
    );
  }

  function saveKnown() {
    return store.saveProbes(Object.fromEntries(known));
  }

  async function signIn(config) {
    try {
      token = await client.login(config.email, config.password);
    } catch (err) {
      if (err.kind === 'auth') {
        authBlocked = true;
        logger.warn(
          'MEATER Cloud refused the e-mail address or the password: waiting for a new configuration',
        );
      }
      throw err;
    }
    tokenLoaded = true;
    await store.saveToken(config.email, token);
    logger.info('Signed in to MEATER Cloud');
  }

  async function readProbes(config) {
    if (!tokenLoaded) {
      token = await store.loadToken(config.email);
      tokenLoaded = true;
    }
    if (!token) {
      await signIn(config);
    }
    try {
      return await client.getDevices(token, config.language);
    } catch (err) {
      if (err.kind !== 'auth') {
        throw err;
      }
      // The token was reset on the MEATER side: one new sign-in, then give up.
      logger.info('MEATER Cloud token no longer accepted: signing in again');
      token = null;
      await store.clearToken();
      await signIn(config);
      return client.getDevices(token, config.language);
    }
  }

  async function applyReadings(probes) {
    const config = getConfig();
    const t = now();
    const visible = new Map(probes.map((probe) => [probe.id, probe]));
    const devicesById = new Map(probeDevices().map((device) => [device.probeId, device]));
    let save = false;
    let newProbe = false;
    const events = [];

    for (const probe of visible.values()) {
      let entry = known.get(probe.id);
      if (!entry) {
        entry = { lastSeen: t, cook: null };
        known.set(probe.id, entry);
        newProbe = true;
        logger.info(`MEATER probe ${shortId(probe.id)} found: add it from the Discovery tab`);
      } else if (!readings.has(probe.id) && hasRead) {
        logger.info(`MEATER probe ${shortId(probe.id)} is back`);
      }
      entry.lastSeen = t;
      const deviceExternalId =
        devicesById.get(probe.id)?.external_id ?? probeIds(gladys, probe.id).device;
      const result = cookTransitions({
        memory: entry.cook,
        probe,
        deviceExternalId,
        language: config.language,
      });
      events.push(...result.events);
      if (!sameMemory(entry.cook, result.memory)) {
        entry.cook = result.memory;
        save = true;
      }
    }
    for (const probeId of readings.keys()) {
      if (!visible.has(probeId)) {
        logger.info(
          `MEATER probe ${shortId(probeId)} no longer visible (cook over, probe in its charger, or app out of range)`,
        );
        save = true;
      }
    }
    readings = visible;
    hasRead = true;

    if (save || newProbe) {
      await saveKnown();
    }
    if (newProbe) {
      await publishDiscovered();
    }
    await publishStates();
    await fireEvents(events);
    refreshWidgetIfChanged();
  }

  async function onFailure(err) {
    const kind = err instanceof MeaterError ? err.kind : 'unavailable';
    failures += 1;
    lastErrorKind = kind;
    if (kind === 'auth') {
      // Said once by signIn; the status tells the user what to do.
      await setStatus(false, TEXT.badCredentials);
      return;
    }
    issues.fail('cloud', `MEATER Cloud request failed: ${err.message}`);
    await setStatus(false, errorText(kind));
  }

  async function doRefresh() {
    const config = getConfig();
    if (!isConfigured(config) || authBlocked) {
      return;
    }
    lastRefreshAt = now();
    let probes;
    try {
      probes = await readProbes(config);
    } catch (err) {
      await onFailure(err);
      return;
    }
    failures = 0;
    lastErrorKind = null;
    issues.ok('cloud', 'MEATER Cloud answers again');
    await setStatus(true);
    logger.debug(`${probes.length} probe(s) visible on MEATER Cloud`);
    await applyReadings(probes);
  }

  /** One refresh at a time: a second caller waits for the one in progress. */
  function refresh() {
    if (!inFlight) {
      inFlight = doRefresh().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  /** The delay before the next refresh. */
  function intervalMs() {
    if (failures > 0) {
      const backoff = Math.min(MAX_BACKOFF_MS, IDLE_REFRESH_MS * 2 ** (failures - 1));
      return lastErrorKind === 'rate_limit' ? Math.max(backoff, RATE_LIMIT_BACKOFF_MS) : backoff;
    }
    const fast = [...readings.values()].some((probe) => needsFastRefresh(cookStateKey(probe.cook)));
    return fast ? cookRefreshMs(getConfig()) : IDLE_REFRESH_MS;
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      try {
        // The core's poll (fallback) may have refreshed moments ago: no
        // second request a few seconds later.
        if (lastRefreshAt !== null && now() - lastRefreshAt < intervalMs() * 0.5) {
          logger.debug('Timer refresh skipped: refreshed moments ago');
        } else {
          await refresh();
        }
      } catch (err) {
        logger.error(`Refresh failed (${err.message})`);
      } finally {
        schedule();
      }
    }, intervalMs());
  }

  return {
    /**
     * (Re)start with the current configuration: at connection, and when the
     * user saves the configuration (maybe another account).
     * @param {{ accountChanged?: boolean }} [options]
     */
    async start({ accountChanged = false } = {}) {
      stopped = false;
      authBlocked = false;
      failures = 0;
      lastErrorKind = null;
      if (accountChanged) {
        token = null;
        tokenLoaded = false;
      }
      await loadKnown();
      // A refresh in progress read the previous configuration: let it end,
      // then read again with this one.
      await inFlight?.catch(() => {});
      if (!isConfigured(getConfig())) {
        logger.info('Not configured yet: waiting for the MEATER Cloud e-mail address and password');
        await setStatus(false, TEXT.notConfigured);
      } else {
        await refresh();
      }
      await publishDiscovered();
      schedule();
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },

    refresh,
    intervalMs,
    publishDiscovered,

    /**
     * The core's poll (fallback): refresh unless the timer just did. One
     * refresh answers for every probe, so several polls in a row cost one.
     */
    async pollFromCore() {
      if (lastRefreshAt !== null && now() - lastRefreshAt < intervalMs() * 0.9) {
        logger.debug('Poll from Gladys skipped: refreshed moments ago');
        return;
      }
      await refresh();
    },

    /**
     * A probe was just added (or updated) in Gladys: send its states now
     * (the SDK forgot them, Gladys dropped the earlier ones), then reload
     * the widget, which may now have something to show.
     * @param {{ external_id: string }} device
     */
    async deviceAdded(device) {
      const probeId = probeIdOfDevice(gladys, device.external_id);
      if (probeId === null) {
        return;
      }
      await publishStates([probeId]);
      gladys.requestWidgetRefresh(WIDGET.COOK);
    },

    /**
     * "Test the connection": a refresh now, even after refused credentials.
     * @returns {Promise<{ ok: true, count: number } | { ok: false, kind: string }>}
     */
    async testConnection() {
      authBlocked = false;
      await refresh();
      return lastErrorKind === null && hasRead
        ? { ok: true, count: readings.size }
        : { ok: false, kind: lastErrorKind ?? 'unavailable' };
    },

    /** What the widget shows. */
    probeDevices,
    reading: (probeId) => readings.get(probeId) ?? null,
    hasRead: () => hasRead,
  };
}
