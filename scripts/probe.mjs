#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe the real MEATER Cloud with the integration's own client, read only.
//
//   node scripts/probe.mjs
//       A fake account: checks that the API answers, refuses the sign-in
//       with a 401, and refuses a made-up token on GET /devices. Nothing
//       sensitive is involved.
//
//   MEATER_EMAIL=... MEATER_PASSWORD=... node scripts/probe.mjs
//       A real account: signs in, then reads GET /devices once and prints
//       what the integration would make of it — counts, states and the
//       shape of the fields, never the e-mail, the password, the token nor
//       the probe ids.
//
// Three requests at most, 2 s apart (the client's own spacing). Exit code 0
// when the API behaves as the integration expects. Behind an HTTP proxy,
// Node 24 follows HTTPS_PROXY with NODE_USE_ENV_PROXY=1.
// -----------------------------------------------------------------------------

import { createMeaterClient, API_BASE } from '../src/meater.js';
import { cookStateKey, isCooking } from '../src/cook.js';

const client = createMeaterClient();
const email = process.env.MEATER_EMAIL;
const password = process.env.MEATER_PASSWORD;
let ok = true;

const say = (line) => process.stdout.write(`${line}\n`);
const check = (label, passed, detail) => {
  ok &&= passed;
  say(`${passed ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const failure = (err) => `${err.kind ?? err.name} (${err.status ?? 'no answer'}): ${err.message}`;

say(`MEATER Cloud: ${API_BASE}`);

if (!email || !password) {
  // A syntactically valid address on a reserved domain: no real account.
  const fake = { email: 'gladys-meater-probe@example.invalid', password: 'not-a-real-password' };
  try {
    await client.login(fake.email, fake.password);
    check('POST /login with a fake account is refused', false, 'the API accepted it');
  } catch (err) {
    check('POST /login with a fake account is refused', err.kind === 'auth', failure(err));
  }
  try {
    await client.getDevices('made-up-token', 'fr');
    check('GET /devices with a made-up token is refused', false, 'the API accepted it');
  } catch (err) {
    check('GET /devices with a made-up token is refused', err.kind === 'auth', failure(err));
  }
} else {
  let token = null;
  try {
    token = await client.login(email, password);
    check('POST /login with the account', true, `token received (${token.length} characters)`);
  } catch (err) {
    check('POST /login with the account', false, failure(err));
  }
  if (token) {
    try {
      const probes = await client.getDevices(token, 'fr');
      check('GET /devices', true, `${probes.length} probe(s) visible`);
      probes.forEach((probe, index) => {
        const key = cookStateKey(probe.cook);
        const fields = [
          `internal ${probe.internal === null ? 'missing' : 'ok'}`,
          `ambient ${probe.ambient === null ? 'missing' : 'ok'}`,
          `state "${probe.cook?.state ?? '(no cook)'}" → ${key}${isCooking(key) ? ' (cooking)' : ''}`,
          `target ${probe.cook?.target ?? '-'}`,
          `remaining ${probe.cook ? (probe.cook.remaining ?? 'estimating') : '-'}`,
          `cook id ${probe.cook?.id ? 'present' : 'absent'}`,
        ];
        say(`     probe #${index + 1}: ${fields.join(', ')}`);
        if (key === 'unknown') {
          check(
            `probe #${index + 1}: cook state known to the integration`,
            false,
            probe.cook.state,
          );
        }
      });
    } catch (err) {
      check('GET /devices', false, failure(err));
    }
  }
}

say(ok ? 'The API behaves as the integration expects.' : 'Something differs: see the lines above.');
process.exit(ok ? 0 : 1);
