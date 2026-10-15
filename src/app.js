// -----------------------------------------------------------------------------
// The integration, wired to a Gladys client: every handler, registered before
// connect(). index.js gives it the real SDK client; the tests give it the
// SDK's fake Gladys, a fake MEATER Cloud and a temporary data directory.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, isConfigured } from './config.js';
import { createMeaterClient } from './meater.js';
import { createStore } from './store.js';
import { createHub } from './hub.js';
import { TEXT, TEST_OK, WIDGET_TEXT, allLanguages, errorText, localize } from './i18n.js';
import { WIDGET, buildCookContent, messageContent, pickProbe } from './widgets.js';

export const ACTION = { TEST_CONNECTION: 'test_connection' };

/**
 * @param {object} options
 * @param {object} options.gladys GladysIntegration, or createFakeGladys()
 * @param {ReturnType<typeof createMeaterClient>} [options.client]
 * @param {ReturnType<typeof createStore>} [options.store]
 * @param {object} [options.logger]
 * @param {() => number} [options.now]
 * @param {boolean} [options.timers]
 */
export function createApp({
  gladys,
  client = createMeaterClient(),
  logger = createLogger({ name: 'meater' }),
  store = createStore({ dir: process.env.MEATER_DATA_DIR, logger }),
  now,
  timers = true,
}) {
  let config = normalizeConfig(gladys.config ?? {});
  const hub = createHub({ gladys, client, store, logger, getConfig: () => config, now, timers });

  // --- Discovery: the probes seen so far ----------------------------------
  gladys.onScanRequest(async () => {
    logger.info('Search requested: reading MEATER Cloud');
    await hub.refresh();
    await hub.publishDiscovered();
  });

  // --- Refresh: the container's timer does it, the core's poll is a fallback
  gladys.onPoll(() => hub.pollFromCore());

  // A probe added to Gladys: its states now, not at the next refresh.
  gladys.onDeviceCreated((device) => hub.deviceAdded(device));
  gladys.onDeviceUpdated((device) => hub.deviceAdded(device));

  // Read-only probes: no command reaches them.
  gladys.onSetValue(async () => {
    throw new Error('MEATER probes are read-only');
  });

  // --- Configuration screen ------------------------------------------------
  gladys.onAction(ACTION.TEST_CONNECTION, async () => {
    if (!isConfigured(config)) {
      logger.info('Connection test: not configured');
      throw new Error(localize(TEXT.notConfigured, config.language));
    }
    const result = await hub.testConnection();
    if (!result.ok) {
      logger.info(`Connection test failed (${result.kind})`);
      throw new Error(localize(errorText(result.kind), config.language));
    }
    logger.info(`Connection test: ${result.count} probe(s) visible`);
    return result.count === 0 ? TEXT.testNoProbe : allLanguages(TEST_OK, result.count);
  });

  // --- Dashboard widget ------------------------------------------------------
  gladys.onWidgetGet(WIDGET.COOK, async ({ settings = {}, language = 'en' } = {}) => {
    if (!isConfigured(config)) {
      return messageContent(WIDGET_TEXT.notConfigured, language);
    }
    const devices = hub.probeDevices();
    if (devices.length === 0) {
      return messageContent(WIDGET_TEXT.noProbe, language);
    }
    if (!hub.hasRead()) {
      return messageContent(WIDGET_TEXT.waiting, language);
    }
    const device = pickProbe(devices, settings.probe, hub.reading);
    return buildCookContent(gladys, {
      probeId: device.probeId,
      deviceName: device.name ?? device.probeId,
      probe: hub.reading(device.probeId),
      language,
    });
  });

  gladys.onConfigUpdated(async (newConfig) => {
    const previous = config;
    config = normalizeConfig(newConfig);
    logger.info('New configuration received');
    await hub.start({
      accountChanged: previous.email !== config.email || previous.password !== config.password,
    });
  });

  // --- Connection life cycle -------------------------------------------------
  // The SDK logs the WebSocket life cycle itself; this only (re)starts the
  // integration's own work with the configuration Gladys holds.
  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      await hub.start();
    } catch (err) {
      logger.error(`Start after connection failed (${err.message})`);
      await gladys.setConnectionStatus(false, TEXT.initFailed).catch(() => {});
    }
  });

  return {
    hub,
    getConfig: () => config,
    stop: () => hub.stop(),
  };
}
