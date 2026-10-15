// -----------------------------------------------------------------------------
// The cook states of the MEATER Cloud, and what they mean for Gladys.
//
// The API sends one of nine English strings, never translated:
//   Not Started, Configured, Started, Ready For Resting, Resting,
//   Slightly Underdone, Finished, Slightly Overdone, OVERCOOK!
// The keys below are ours (the ones Home Assistant uses too): they are stored
// in scenes through the trigger filters, so they never change.
// -----------------------------------------------------------------------------

/** Raw API state → stable key. */
export const COOK_STATES = {
  'Not Started': 'not_started',
  Configured: 'configured',
  Started: 'started',
  'Ready For Resting': 'ready_for_resting',
  Resting: 'resting',
  'Slightly Underdone': 'slightly_underdone',
  Finished: 'finished',
  'Slightly Overdone': 'slightly_overdone',
  'OVERCOOK!': 'overcooked',
};

/** The state of a probe without a cook. */
export const NO_COOK = 'none';

/** The cook is over: the rest is done, the app gives its verdict. */
export const FINAL_STATES = ['slightly_underdone', 'finished', 'slightly_overdone', 'overcooked'];

/** Set up in the app, not started yet. */
const WAITING_STATES = ['not_started', 'configured'];

/**
 * The key of a raw API state. An unknown string (a state added by the API
 * later) maps to `unknown`, the cook still counts as in progress.
 * @param {{ state: string } | null} cook
 */
export function cookStateKey(cook) {
  if (!cook) {
    return NO_COOK;
  }
  return COOK_STATES[cook.state] ?? 'unknown';
}

/**
 * Food on the heat or resting: from "Started" to the end of the rest.
 * @param {string} key
 */
export function isCooking(key) {
  return key !== NO_COOK && !WAITING_STATES.includes(key) && !FINAL_STATES.includes(key);
}

/**
 * The refresh goes fast while a cook is set up or in progress, slow otherwise.
 * @param {string} key
 */
export function needsFastRefresh(key) {
  return key !== NO_COOK && !FINAL_STATES.includes(key);
}

/** Remaining time in whole minutes (rounded up: "1 min" until it is done), or null. */
export function remainingMinutes(cook) {
  return cook && cook.remaining !== null ? Math.ceil(cook.remaining / 60) : null;
}

/** Elapsed time in whole minutes. */
export function elapsedMinutes(cook) {
  return cook && cook.elapsed !== null ? Math.floor(Math.max(0, cook.elapsed) / 60) : 0;
}
