// -----------------------------------------------------------------------------
// One Gladys device per MEATER probe.
//
// The external id is built from the probe id the MEATER Cloud gives (a long
// hexadecimal string): `ext:<selector>:probe:<probe id>`. It never changes, a
// probe keeps its device, history and scenes from one cook to the next.
//
// Every feature is read-only: the API has no command, and a cooking probe is
// not something Gladys should pretend to drive.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORY,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { cookStateKey, isCooking, remainingMinutes, elapsedMinutes, NO_COOK } from './cook.js';
import { NAMES, DEVICE_NAME, STATE_LABELS, stateLabel } from './i18n.js';

export const DEVICE_TYPE = 'probe';

/** Feature keys: part of the external ids, fixed forever. */
export const FEATURE = {
  INTERNAL: 'internal_temperature',
  AMBIENT: 'ambient_temperature',
  TARGET: 'target_temperature',
  PEAK: 'peak_temperature',
  COOKING: 'cooking',
  COOK_NAME: 'cook_name',
  COOK_STATE: 'cook_state',
  ELAPSED: 'elapsed_time',
  REMAINING: 'remaining_time',
  CONNECTED: 'connected',
};

// Display bounds only (the core never enforces them on a state): the tip
// stays around cooking temperatures, the ambient sensor reads several hundred
// degrees on the newer models (a grill). Wide on purpose, so that a frozen
// roast or a hot grill stays inside. Durations: two days, for the longest
// smoke.
const TIP = { min: -20, max: 110 };
const AMBIENT = { min: -20, max: 550 };
const DURATION = { min: 0, max: 2880 };

/** The feature list, in the order Gladys shows it. */
const FEATURES = [
  {
    key: FEATURE.INTERNAL,
    category: CATEGORY.TEMPERATURE_SENSOR,
    type: TYPE.TEMPERATURE_SENSOR.PROBE,
    unit: UNIT.CELSIUS,
    ...TIP,
    keep_history: true,
  },
  {
    key: FEATURE.AMBIENT,
    category: CATEGORY.TEMPERATURE_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.CELSIUS,
    ...AMBIENT,
    keep_history: true,
  },
  {
    key: FEATURE.TARGET,
    category: CATEGORY.TEMPERATURE_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.CELSIUS,
    ...TIP,
    keep_history: true,
  },
  {
    key: FEATURE.PEAK,
    category: CATEGORY.TEMPERATURE_SENSOR,
    type: TYPE.TEMPERATURE_SENSOR.MAX,
    unit: UNIT.CELSIUS,
    ...TIP,
    keep_history: true,
  },
  {
    key: FEATURE.REMAINING,
    category: CATEGORY.DURATION,
    type: TYPE.DURATION.INTEGER,
    unit: UNIT.MINUTES,
    ...DURATION,
    keep_history: true,
  },
  {
    key: FEATURE.ELAPSED,
    category: CATEGORY.DURATION,
    type: TYPE.DURATION.INTEGER,
    unit: UNIT.MINUTES,
    ...DURATION,
    keep_history: true,
  },
  {
    key: FEATURE.COOK_STATE,
    category: CATEGORY.TEXT,
    type: TYPE.TEXT.TEXT,
    min: 0,
    max: 0,
    keep_history: true,
  },
  {
    key: FEATURE.COOK_NAME,
    category: CATEGORY.TEXT,
    type: TYPE.TEXT.TEXT,
    min: 0,
    max: 0,
    keep_history: true,
  },
  // input/binary rather than a sensor couple: Gladys has no "running" or
  // "connectivity" category, and input/binary renders with a label.
  {
    key: FEATURE.COOKING,
    category: CATEGORY.INPUT,
    type: TYPE.INPUT.BINARY,
    min: 0,
    max: 1,
    keep_history: true,
  },
  {
    key: FEATURE.CONNECTED,
    category: CATEGORY.INPUT,
    type: TYPE.INPUT.BINARY,
    min: 0,
    max: 1,
    keep_history: true,
  },
];

/** A probe id as a safe external id part (the cloud sends hexadecimal ids). */
export function platformId(probeId) {
  return String(probeId).replace(/[^A-Za-z0-9_-]/g, '_');
}

/** @param {object} gladys @param {string} probeId */
export function probeIds(gladys, probeId) {
  return gladys.externalIds(DEVICE_TYPE, platformId(probeId));
}

/** The 8 first characters of the id: what tells two probes apart in a name. */
export function shortId(probeId) {
  return platformId(probeId).slice(0, 8);
}

/**
 * The device Gladys shows in its Discovery tab.
 * @param {object} gladys
 * @param {string} probeId
 * @param {string} language feature names language
 */
export function buildProbeDevice(gladys, probeId, language) {
  const ids = probeIds(gladys, probeId);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: (DEVICE_NAME[language] ?? DEVICE_NAME.en)(shortId(probeId)),
    external_id: ids.device,
    // The container refreshes by itself (src/hub.js): the core's poll is a
    // fallback, at the slowest pace it schedules (GladysAssistant/Gladys#3198).
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features: FEATURES.map(({ key, ...feature }) => ({
      name: names[key],
      external_id: ids.feature(key),
      read_only: true,
      has_feedback: false,
      ...feature,
    })),
  };
}

/** One decimal: the cloud sends more than the probe measures. */
const round1 = (value) => Math.round(value * 10) / 10;

/**
 * The states of a probe, as `publishChangedStates` takes them.
 *
 * - Visible probe: every reading. A remaining time the cloud is still
 *   estimating is not published (the last estimate stays, the widget says
 *   "Estimating").
 * - Probe no longer visible, `cookOver` false: only "connected" goes to 0 —
 *   a probe out of Bluetooth range may come back to the same cook.
 * - `cookOver` true (gone for long, or never seen since the start): the cook
 *   is reset too, so that "Cook in progress" does not stay at 1 overnight.
 *   The temperatures keep their last value: nothing new to say about them.
 *
 * @param {object} gladys
 * @param {object} options
 * @param {string} options.probeId
 * @param {ReturnType<import('./meater.js').parseDevice> | null} options.probe the reading, null when not visible
 * @param {boolean} [options.cookOver]
 * @param {string} options.language
 */
export function probeStates(gladys, { probeId, probe, cookOver = false, language }) {
  const ids = probeIds(gladys, probeId);
  const states = [];
  const number = (key, value) => {
    if (value !== null && value !== undefined && Number.isFinite(value)) {
      states.push({ device_feature_external_id: ids.feature(key), state: value });
    }
  };
  const text = (key, value) => {
    // A text state is never empty, or Gladys ignores it.
    states.push({ device_feature_external_id: ids.feature(key), text: value || '—' });
  };
  const labels = STATE_LABELS[language] ?? STATE_LABELS.en;

  if (!probe) {
    number(FEATURE.CONNECTED, 0);
    if (cookOver) {
      number(FEATURE.COOKING, 0);
      text(FEATURE.COOK_STATE, labels[NO_COOK]);
      text(FEATURE.COOK_NAME, labels[NO_COOK]);
      number(FEATURE.REMAINING, 0);
      number(FEATURE.ELAPSED, 0);
    }
    return states;
  }

  const { cook } = probe;
  const key = cookStateKey(cook);
  number(FEATURE.CONNECTED, 1);
  number(FEATURE.INTERNAL, probe.internal === null ? null : round1(probe.internal));
  number(FEATURE.AMBIENT, probe.ambient === null ? null : round1(probe.ambient));
  number(FEATURE.COOKING, isCooking(key) ? 1 : 0);
  text(FEATURE.COOK_STATE, stateLabel(key, language, cook?.state));
  text(FEATURE.COOK_NAME, cook ? cook.name.slice(0, 100) : labels[NO_COOK]);
  if (cook) {
    number(FEATURE.TARGET, cook.target === null ? null : round1(cook.target));
    number(FEATURE.PEAK, cook.peak === null ? null : round1(cook.peak));
    number(FEATURE.ELAPSED, elapsedMinutes(cook));
    number(FEATURE.REMAINING, remainingMinutes(cook));
  } else {
    number(FEATURE.ELAPSED, 0);
    number(FEATURE.REMAINING, 0);
  }
  return states;
}

/**
 * The probe id of one of our devices, or null.
 * @param {object} gladys
 * @param {string} deviceExternalId
 */
export function probeIdOfDevice(gladys, deviceExternalId) {
  const prefix = gladys.externalId(`${DEVICE_TYPE}:`);
  if (typeof deviceExternalId !== 'string' || !deviceExternalId.startsWith(prefix)) {
    return null;
  }
  const rest = deviceExternalId.slice(prefix.length);
  return rest === '' || rest.includes(':') ? null : rest;
}
