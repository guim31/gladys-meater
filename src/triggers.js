// -----------------------------------------------------------------------------
// Scene triggers: the moments of a cook worth acting on.
//
// - cook_almost_ready: the estimated remaining time went under 5, 10, 15 or
//   30 minutes (the scene picks one) — time to set the table, warm the plates.
// - remove_from_heat: the cook reached "Ready For Resting", the moment the
//   MEATER app rings.
// - resting_done: the rest is over, the app gives its verdict (done, slightly
//   under- or overdone, overcooked).
//
// The device features carry the states; these events say "it happened, now",
// once per cook: Gladys has no "state changed to" trigger on a text feature,
// and none at all on a time estimate crossing a threshold. The cook memory
// (which cook, its last state, the events already fired) is kept in /data,
// so a restart in the middle of a cook fires nothing twice.
// -----------------------------------------------------------------------------

import { cookStateKey, remainingMinutes, FINAL_STATES, NO_COOK } from './cook.js';
import { stateLabel } from './i18n.js';

export const TRIGGER = {
  ALMOST_READY: 'cook_almost_ready',
  REMOVE_FROM_HEAT: 'remove_from_heat',
  RESTING_DONE: 'resting_done',
};

/** Every trigger key the code fires (test/manifest.test.js ties it to the manifest). */
export const SCENE_TRIGGER_KEYS = Object.values(TRIGGER);

/** The thresholds offered by cook_almost_ready, in minutes (the manifest options). */
export const ALMOST_READY_MINUTES = [5, 10, 15, 30];

/**
 * Compare a reading with the cook memory of its probe.
 * @param {object} options
 * @param {{ id: string | null, state: string, fired: string[] } | null} options.memory null: nothing known (first time ever)
 * @param {ReturnType<import('./meater.js').parseDevice>} options.probe a visible probe
 * @param {string} options.deviceExternalId
 * @param {string} options.language texts of the event variables
 * @returns {{ events: { key: string, data: object }[], memory: object }}
 */
export function cookTransitions({ memory, probe, deviceExternalId, language }) {
  const { cook } = probe;
  if (!cook) {
    return { events: [], memory: { id: null, state: NO_COOK, fired: [] } };
  }
  const cookId = cook.id ?? 'unknown';
  const key = cookStateKey(cook);
  const sameCook = memory !== null && memory.id === cookId;
  // Another cook remembered: this one starts from nothing. No memory at all
  // (first run, lost file): the previous state is unknown.
  const previous = sameCook ? memory.state : memory === null ? undefined : NO_COOK;
  const fired = sameCook ? [...memory.fired] : [];
  const minutes = remainingMinutes(cook);

  const events = [];
  const fire = (triggerKey, extra = {}) => {
    events.push({
      key: triggerKey,
      data: {
        device: deviceExternalId,
        cook_name: cook.name || null,
        cook_state: stateLabel(key, language, cook.state),
        internal_temperature: probe.internal,
        target_temperature: cook.target,
        remaining_minutes: minutes,
        ...extra,
      },
    });
  };

  if (key === 'started' && minutes !== null) {
    for (const threshold of ALMOST_READY_MINUTES) {
      const mark = `${TRIGGER.ALMOST_READY}:${threshold}`;
      if (minutes <= threshold && !fired.includes(mark)) {
        fired.push(mark);
        fire(TRIGGER.ALMOST_READY, { minutes: threshold });
      }
    }
  }

  // Seen for the first time in this state, even without memory: the food is
  // on the heat right now, the user wants to know.
  if (key === 'ready_for_resting' && !fired.includes(TRIGGER.REMOVE_FROM_HEAT)) {
    fired.push(TRIGGER.REMOVE_FROM_HEAT);
    if (previous !== 'ready_for_resting') {
      fire(TRIGGER.REMOVE_FROM_HEAT);
    }
  }

  // Only a transition seen within the same cook: a verdict found at startup
  // may be hours old.
  if (
    FINAL_STATES.includes(key) &&
    !fired.includes(TRIGGER.RESTING_DONE) &&
    sameCook &&
    previous !== undefined &&
    !FINAL_STATES.includes(previous)
  ) {
    fired.push(TRIGGER.RESTING_DONE);
    fire(TRIGGER.RESTING_DONE, { result: key });
  }

  return { events, memory: { id: cookId, state: key, fired } };
}

/** Two memories say the same thing (nothing to save). */
export function sameMemory(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
