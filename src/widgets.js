// -----------------------------------------------------------------------------
// The "Cook" dashboard widget: one probe at a glance — internal, ambient and
// target temperatures, remaining time, cook state.
//
// Pure builders: they take what the hub last read (no API call per widget,
// the quota is the refresh loop's) and return a content in the core
// vocabulary. The temperatures are live tiles bound to the probe features;
// the remaining time and the state are inline, refreshed by the content TTL
// and by requestWidgetRefresh when they change.
//
// Budget (8 components, 6 tiles, 2 texts, 1 status): 1 heading, 4 tiles,
// 1 status list.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { cookStateKey, isCooking, remainingMinutes, elapsedMinutes, NO_COOK } from './cook.js';
import { localize, stateLabel, formatMinutes, WIDGET_TEXT } from './i18n.js';
import { FEATURE, probeIds } from './probe.js';

export const WIDGET = { COOK: 'cook' };

/** Every widget key with a content handler (test/manifest.test.js ties it to the manifest). */
export const WIDGET_KEYS = Object.values(WIDGET);

const STATE_COLORS = {
  [NO_COOK]: WIDGET_COLORS.NEUTRAL,
  not_started: WIDGET_COLORS.NEUTRAL,
  configured: WIDGET_COLORS.INFO,
  started: WIDGET_COLORS.PRIMARY,
  ready_for_resting: WIDGET_COLORS.WARNING,
  resting: WIDGET_COLORS.INFO,
  slightly_underdone: WIDGET_COLORS.WARNING,
  finished: WIDGET_COLORS.SUCCESS,
  slightly_overdone: WIDGET_COLORS.WARNING,
  overcooked: WIDGET_COLORS.DANGER,
  unknown: WIDGET_COLORS.NEUTRAL,
};

/** A content made of one sentence (not configured, nothing to show yet). */
export function messageContent(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: localize(text, language) }],
  };
}

/**
 * @param {object} gladys
 * @param {object} options
 * @param {string} options.probeId
 * @param {string} options.deviceName the name of the device in Gladys
 * @param {ReturnType<import('./meater.js').parseDevice> | null} options.probe the last reading, null when not visible
 * @param {string} options.language
 */
export function buildCookContent(gladys, { probeId, deviceName, probe, language }) {
  const ids = probeIds(gladys, probeId);
  const cook = probe?.cook ?? null;
  const key = cookStateKey(cook);
  const minutes = remainingMinutes(cook);
  const t = (text) => localize(text, language);

  let remaining = '—';
  if (cook && isCooking(key)) {
    remaining = minutes === null ? t(WIDGET_TEXT.estimating) : formatMinutes(minutes);
  }

  return {
    // Fast while something moves, slow otherwise (the tiles are live anyway).
    ttl_seconds: cook ? 30 : 300,
    components: [
      { type: 'text', variant: 'heading', text: (cook?.name || deviceName).slice(0, 40) },
      {
        type: 'value',
        label: t(WIDGET_TEXT.internal),
        icon: 'thermometer',
        device_feature: ids.feature(FEATURE.INTERNAL),
      },
      {
        type: 'value',
        label: t(WIDGET_TEXT.target),
        icon: 'target',
        device_feature: ids.feature(FEATURE.TARGET),
      },
      {
        type: 'value',
        label: t(WIDGET_TEXT.ambient),
        icon: 'wind',
        device_feature: ids.feature(FEATURE.AMBIENT),
      },
      { type: 'value', label: t(WIDGET_TEXT.remaining), icon: 'clock', value: remaining },
      {
        type: 'status',
        items: [
          {
            label: t(WIDGET_TEXT.state),
            value: stateLabel(key, language, cook?.state),
            color: probe ? STATE_COLORS[key] : WIDGET_COLORS.NEUTRAL,
          },
          {
            label: t(WIDGET_TEXT.elapsed),
            value: cook ? formatMinutes(elapsedMinutes(cook)) : '—',
          },
          {
            label: t(WIDGET_TEXT.probe),
            value: t(probe ? WIDGET_TEXT.connected : WIDGET_TEXT.notSeen),
            color: probe ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
          },
        ],
      },
    ],
  };
}

/**
 * The probe a widget shows: the one picked in its settings, else the one
 * cooking, else the first added.
 * @param {object[]} devices the probe devices added to Gladys, with their probeId
 * @param {string | undefined} picked the external id of the settings
 * @param {(probeId: string) => object | null} readingOf
 */
export function pickProbe(devices, picked, readingOf) {
  const chosen = devices.find((device) => device.external_id === picked);
  if (chosen) {
    return chosen;
  }
  return (
    devices.find((device) => isCooking(cookStateKey(readingOf(device.probeId)?.cook ?? null))) ??
    devices.find((device) => readingOf(device.probeId)?.cook) ??
    devices[0] ??
    null
  );
}
