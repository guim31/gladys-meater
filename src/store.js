// -----------------------------------------------------------------------------
// What the integration keeps in /data, the only writable volume.
//
// - token.json: the MEATER Cloud JWT, with a hash of the account e-mail so
//   that a token is never reused for another account. It does not expire;
//   keeping it avoids a login (with the password) at every restart.
// - probes.json: the probes already seen, and the cook memory the scene
//   triggers need. The probes only show in the API during a cook: without
//   this file, a probe would vanish from the Discovery tab between cooks and
//   a restart in the middle of a cook would fire its triggers again.
//
// Written only when something changes (a new probe, a cook state), never at
// every refresh. A file that cannot be read or written is not fatal: the
// integration works from memory, and says so once.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const DEFAULT_DATA_DIR = '/data';

/** A short fingerprint of the account: tells accounts apart, never stores the address. */
export function accountHash(email) {
  return createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * @param {object} [options]
 * @param {string} [options.dir]
 * @param {{ warn: Function }} [options.logger]
 */
export function createStore({ dir = DEFAULT_DATA_DIR, logger } = {}) {
  const warned = new Set();
  const warnOnce = (key, message) => {
    if (!warned.has(key)) {
      warned.add(key);
      logger?.warn(message);
    }
  };

  async function read(name) {
    try {
      return JSON.parse(await readFile(join(dir, name), 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        warnOnce(
          `read:${name}`,
          `Cannot read ${name} in the data volume (${err.code ?? err.name})`,
        );
      }
      return null;
    }
  }

  async function write(name, value) {
    const path = join(dir, name);
    try {
      await mkdir(dir, { recursive: true });
      // Write then rename: a container stopped mid-write leaves the old file.
      await writeFile(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 });
      await rename(`${path}.tmp`, path);
      warned.delete(`write:${name}`);
    } catch (err) {
      warnOnce(
        `write:${name}`,
        `Cannot write ${name} in the data volume (${err.code ?? err.name})`,
      );
    }
  }

  return {
    /** The token saved for this account, or null. */
    async loadToken(email) {
      const saved = await read('token.json');
      return saved?.account === accountHash(email) && typeof saved.token === 'string'
        ? saved.token
        : null;
    },
    saveToken(email, token) {
      return write('token.json', { account: accountHash(email), token });
    },
    clearToken() {
      return write('token.json', {});
    },

    /** @returns {Promise<Record<string, { lastSeen: number | null, cook: object | null }>>} */
    async loadProbes() {
      const saved = await read('probes.json');
      return saved && typeof saved.probes === 'object' && saved.probes !== null ? saved.probes : {};
    },
    saveProbes(probes) {
      return write('probes.json', { probes });
    },
  };
}
