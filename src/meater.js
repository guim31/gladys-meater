// -----------------------------------------------------------------------------
// MEATER Cloud REST API client (public-api.cloud.meater.com/v1, in beta).
//
// Two calls: POST /login (e-mail + password → a JWT that does not expire but
// may be reset), and GET /devices (every probe the MEATER app or Block
// currently relays, with its cook). Reference:
// https://github.com/apption-labs/meater-cloud-public-rest-api
//
// Quotas: 60 requests per minute at most, 2 per minute recommended. The
// client never sends two requests less than 2 s apart, whoever asks; the pace
// itself is chosen by the hub (src/hub.js).
//
// Nothing secret ever reaches an error message: no token, no password, no
// e-mail address — the messages end up in the logs and in the Gladys UI.
// -----------------------------------------------------------------------------

export const API_BASE = 'https://public-api.cloud.meater.com/v1';

/** Minimum gap between two requests, in milliseconds (60 requests per minute at most). */
export const MIN_REQUEST_GAP_MS = 2000;

const REQUEST_TIMEOUT_MS = 10000;

/**
 * Kinds of failure, each handled its own way by the hub:
 * - `auth`: wrong credentials (login) or a token the cloud no longer accepts;
 * - `rate_limit`: 429, slow down;
 * - `unavailable`: 5xx, network error, timeout — try again later;
 * - `protocol`: an answer the client cannot read (API change?).
 */
export class MeaterError extends Error {
  /**
   * @param {'auth' | 'rate_limit' | 'unavailable' | 'protocol'} kind
   * @param {string} message
   * @param {number} [status] HTTP status, when there was an answer
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'MeaterError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @param {() => number} [options.now]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {number} [options.minGapMs]
 * @param {number} [options.timeoutMs]
 */
export function createMeaterClient({
  fetch: fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  minGapMs = MIN_REQUEST_GAP_MS,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  // Requests run one after the other, at least minGapMs apart.
  let queue = Promise.resolve();
  let lastRequestAt = -Infinity;

  function schedule(task) {
    const run = queue.then(async () => {
      const wait = lastRequestAt + minGapMs - now();
      if (wait > 0) {
        await sleep(wait);
      }
      lastRequestAt = now();
      return task();
    });
    queue = run.catch(() => {});
    return run;
  }

  async function request(path, { method = 'GET', headers = {}, body } = {}) {
    let response;
    try {
      response = await fetchImpl(`${API_BASE}${path}`, {
        method,
        headers: { Accept: 'application/json', ...headers },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message);
      throw new MeaterError('unavailable', `MEATER Cloud unreachable (${reason})`);
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // An error page or an empty body: the status says enough below.
    }
    if (response.status === 401) {
      throw new MeaterError('auth', 'MEATER Cloud refused the credentials (401)', 401);
    }
    if (response.status === 429) {
      throw new MeaterError('rate_limit', 'MEATER Cloud rate limit reached (429)', 429);
    }
    if (response.status >= 500) {
      throw new MeaterError(
        'unavailable',
        `MEATER Cloud unavailable (${response.status})`,
        response.status,
      );
    }
    if (response.status !== 200) {
      throw new MeaterError(
        'protocol',
        `MEATER Cloud answered ${response.status}`,
        response.status,
      );
    }
    if (!payload || typeof payload !== 'object' || !payload.data) {
      throw new MeaterError('protocol', 'MEATER Cloud sent an unreadable answer', 200);
    }
    return payload.data;
  }

  return {
    /**
     * Sign in. Resolves the JWT; a wrong e-mail or password is an `auth` error.
     * @param {string} email
     * @param {string} password
     * @returns {Promise<string>}
     */
    login(email, password) {
      return schedule(async () => {
        const data = await request('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (typeof data.token !== 'string' || data.token === '') {
          throw new MeaterError('protocol', 'MEATER Cloud sent no token', 200);
        }
        return data.token;
      });
    },

    /**
     * The probes the MEATER Cloud currently sees, parsed (see parseDevice).
     * @param {string} token
     * @param {string} [language] ISO 639-1: the cloud translates the cut names
     * @returns {Promise<ReturnType<typeof parseDevice>[]>}
     */
    getDevices(token, language) {
      return schedule(async () => {
        const headers = { Authorization: `Bearer ${token}` };
        if (language) {
          headers['Accept-Language'] = language;
        }
        const data = await request('/devices', { headers });
        if (!Array.isArray(data.devices)) {
          throw new MeaterError('protocol', 'MEATER Cloud sent no device list', 200);
        }
        return data.devices.map(parseDevice).filter(Boolean);
      });
    },
  };
}

/** A number, or null when the field is missing or not a finite number. */
function finite(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

/**
 * One probe of GET /devices, in the shape the rest of the code reads. A probe
 * without an id is dropped (nothing to key it on). Temperatures are Celsius,
 * times are seconds; `remaining` is null while the cloud is still estimating
 * (the API sends -1).
 * @param {any} raw
 */
export function parseDevice(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || raw.id.trim() === '') {
    return null;
  }
  const cook = raw.cook && typeof raw.cook === 'object' ? raw.cook : null;
  const remaining = finite(cook?.time?.remaining);
  return {
    id: raw.id.trim(),
    internal: finite(raw.temperature?.internal),
    ambient: finite(raw.temperature?.ambient),
    updatedAt: finite(raw.updated_at),
    cook: cook
      ? {
          id: cook.id === undefined || cook.id === null ? null : String(cook.id),
          name: typeof cook.name === 'string' ? cook.name.trim() : '',
          state: typeof cook.state === 'string' ? cook.state.trim() : '',
          target: finite(cook.temperature?.target),
          peak: finite(cook.temperature?.peak),
          elapsed: finite(cook.time?.elapsed),
          remaining: remaining !== null && remaining >= 0 ? remaining : null,
        }
      : null,
  };
}
