// -----------------------------------------------------------------------------
// /data: the token of one account, the probes seen, written atomically, and a
// volume that cannot be written is not fatal.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore, accountHash } from '../src/store.js';
import { createRecorder } from './helpers/world.js';

async function withDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'gladys-meater-'));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('the token belongs to one account, and the address is never stored', () =>
  withDir(async (dir) => {
    const store = createStore({ dir });
    assert.equal(await store.loadToken('cook@example.com'), null);
    await store.saveToken('cook@example.com', 'jwt-1');
    assert.equal(await store.loadToken(' Cook@Example.com '), 'jwt-1', 'same account');
    assert.equal(await store.loadToken('other@example.com'), null, 'another account');
    const raw = await readFile(join(dir, 'token.json'), 'utf8');
    assert.ok(!raw.includes('cook@example.com'));
    assert.equal(JSON.parse(raw).account, accountHash('cook@example.com'));
    assert.equal(
      (await stat(join(dir, 'token.json'))).mode & 0o077,
      0,
      'readable by its owner only',
    );
    await store.clearToken();
    assert.equal(await store.loadToken('cook@example.com'), null);
    assert.deepEqual(await readdir(dir), ['token.json'], 'no temporary file left');
  }));

test('the probes and their cook memory survive a restart', () =>
  withDir(async (dir) => {
    const probes = {
      abc: { lastSeen: 1, cook: { id: '1', state: 'resting', fired: ['remove_from_heat'] } },
    };
    await createStore({ dir }).saveProbes(probes);
    assert.deepEqual(await createStore({ dir }).loadProbes(), probes);
  }));

test('a broken file or a read-only volume: the integration goes on, and says it once', () =>
  withDir(async (dir) => {
    const logger = createRecorder();
    await writeFile(join(dir, 'probes.json'), '{ not json');
    const store = createStore({ dir, logger });
    assert.deepEqual(await store.loadProbes(), {});
    assert.equal(logger.at('warn').length, 1);

    const readOnly = createStore({ dir: join(dir, 'probes.json', 'below-a-file'), logger });
    await readOnly.saveProbes({});
    await readOnly.saveProbes({});
    assert.equal(logger.at('warn').length, 2, 'one warning per file, not one per write');
  }));
