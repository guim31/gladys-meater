// -----------------------------------------------------------------------------
// The cook transitions behind the scene triggers: once per cook, never on a
// verdict found at startup, nothing twice after a restart.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cookTransitions, TRIGGER, ALMOST_READY_MINUTES } from '../src/triggers.js';
import { parseDevice } from '../src/meater.js';
import { probeA } from './helpers/world.js';

const DEVICE = 'ext:test-integration:probe:abc';

/** Feed the readings one after the other; returns every event and the last memory. */
function run(readings, memory = null, language = 'en') {
  const events = [];
  for (const raw of readings) {
    const result = cookTransitions({
      memory,
      probe: parseDevice(raw),
      deviceExternalId: DEVICE,
      language,
    });
    events.push(...result.events);
    memory = result.memory;
  }
  return { events, memory };
}

const keys = (events) =>
  events.map((event) => (event.data.minutes ? `${event.key}:${event.data.minutes}` : event.key));

test('a whole cook fires each trigger once, at its moment', () => {
  const { events } = run([
    probeA({ state: 'Configured', remaining: -1 }),
    probeA({ state: 'Started', remaining: -1 }),
    probeA({ state: 'Started', remaining: 3600 }),
    probeA({ state: 'Started', remaining: 1700 }),
    probeA({ state: 'Started', remaining: 1700 }),
    probeA({ state: 'Started', remaining: 840 }),
    probeA({ state: 'Started', remaining: 590 }),
    probeA({ state: 'Started', remaining: 250 }),
    probeA({ state: 'Ready For Resting', remaining: 0, internal: 72 }),
    probeA({ state: 'Ready For Resting', remaining: 0, internal: 73 }),
    probeA({ state: 'Resting', remaining: 0, internal: 74 }),
    probeA({ state: 'Finished', remaining: 0, internal: 74 }),
    probeA({ state: 'Finished', remaining: 0, internal: 73 }),
  ]);
  assert.deepEqual(keys(events), [
    'cook_almost_ready:30',
    'cook_almost_ready:15',
    'cook_almost_ready:10',
    'cook_almost_ready:5',
    'remove_from_heat',
    'resting_done',
  ]);
  const removed = events.find((event) => event.key === TRIGGER.REMOVE_FROM_HEAT);
  assert.deepEqual(removed.data, {
    device: DEVICE,
    cook_name: 'Whole chicken',
    cook_state: 'Remove from heat',
    internal_temperature: 72,
    target_temperature: 74,
    remaining_minutes: 0,
  });
  const done = events.find((event) => event.key === TRIGGER.RESTING_DONE);
  assert.equal(done.data.result, 'finished');
  assert.equal(done.data.cook_state, 'Done');
});

test('cook_almost_ready carries the threshold, and fires every threshold crossed at once', () => {
  assert.deepEqual(ALMOST_READY_MINUTES, [5, 10, 15, 30]);
  // The first estimate comes late, 8 minutes before the end.
  const { events } = run([
    probeA({ state: 'Started', remaining: -1 }),
    probeA({ state: 'Started', remaining: 480 }),
  ]);
  assert.deepEqual(keys(events), [
    'cook_almost_ready:10',
    'cook_almost_ready:15',
    'cook_almost_ready:30',
  ]);
  assert.equal(events[0].data.remaining_minutes, 8);
});

test('an estimate going back up does not fire the same threshold twice', () => {
  const { events } = run([
    probeA({ remaining: 550 }),
    probeA({ remaining: 700 }),
    probeA({ remaining: 560 }),
  ]);
  assert.deepEqual(keys(events), [
    'cook_almost_ready:10',
    'cook_almost_ready:15',
    'cook_almost_ready:30',
  ]);
});

test('no "almost ready" while the estimate is unknown or once off the heat', () => {
  assert.deepEqual(run([probeA({ remaining: -1 })]).events, []);
  assert.deepEqual(keys(run([probeA({ state: 'Resting', remaining: 0 })]).events), []);
});

test('a restart in the middle of a cook fires nothing twice (memory from /data)', () => {
  const before = run([
    probeA({ remaining: 590 }),
    probeA({ state: 'Ready For Resting', remaining: 0 }),
  ]);
  assert.equal(before.events.length, 4);
  const saved = JSON.parse(JSON.stringify(before.memory));
  const after = run(
    [probeA({ state: 'Ready For Resting', remaining: 0 }), probeA({ state: 'Resting' })],
    saved,
  );
  assert.deepEqual(after.events, []);
  const end = run([probeA({ state: 'Slightly Overdone' })], after.memory);
  assert.deepEqual(keys(end.events), ['resting_done']);
  assert.equal(end.events[0].data.result, 'slightly_overdone');
});

test('first reading ever: "remove from heat" fires, an old verdict does not', () => {
  assert.deepEqual(keys(run([probeA({ state: 'Ready For Resting', remaining: 0 })]).events), [
    'remove_from_heat',
  ]);
  assert.deepEqual(run([probeA({ state: 'Finished', remaining: 0 })]).events, []);
  // The verdict of a cook never seen before (another cook was remembered): not a transition seen either.
  const memory = { id: 'older-cook', state: 'finished', fired: ['resting_done'] };
  assert.deepEqual(run([probeA({ state: 'OVERCOOK!', cookId: 'new-cook' })], memory).events, []);
});

test('a new cook starts with a clean slate', () => {
  const first = run([
    probeA({ remaining: 200 }),
    probeA({ state: 'Ready For Resting' }),
    probeA({ state: 'Finished' }),
  ]);
  const second = run(
    [
      probeA({ cookId: 'second', remaining: 200 }),
      probeA({ cookId: 'second', state: 'Ready For Resting' }),
    ],
    first.memory,
  );
  assert.deepEqual(keys(second.events), [
    'cook_almost_ready:5',
    'cook_almost_ready:10',
    'cook_almost_ready:15',
    'cook_almost_ready:30',
    'remove_from_heat',
  ]);
});

test('a probe without a cook resets the memory', () => {
  const raw = probeA();
  raw.cook = null;
  const { events, memory } = run([raw], {
    id: '123123',
    state: 'finished',
    fired: ['resting_done'],
  });
  assert.deepEqual(events, []);
  assert.deepEqual(memory, { id: null, state: 'none', fired: [] });
});

test('the event texts follow the configured language', () => {
  const { events } = run([probeA({ state: 'Ready For Resting' })], null, 'de');
  assert.equal(events[0].data.cook_state, 'Vom Feuer nehmen');
});
