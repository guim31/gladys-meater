# MEATER for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration for the
**MEATER wireless meat thermometers** (MEATER, MEATER+, MEATER 2 Plus, MEATER
Pro, MEATER Pro XL, MEATER Block), through the official
[MEATER Cloud REST API](https://github.com/apption-labs/meater-cloud-public-rest-api).

> **Not affiliated with Apption Labs / MEATER.** MEATER is a trademark of
> Apption Labs.
>
> **Developed without the hardware: feedback welcome.** Neither a probe nor a
> MEATER Cloud account was available: the integration was written from the
> official API documentation, the Home Assistant integration and its tests,
> and checked against fixtures in the documented shape.

## What it does

- **One Gladys device per probe**: internal temperature, ambient temperature,
  target temperature, peak temperature, remaining time (MEATER's estimate),
  elapsed time, cook state, cook name, cook in progress, probe connected. Read
  only.
- **Three scene triggers**, each fired once per cook: _Cook almost ready_
  (remaining time under 5, 10, 15 or 30 minutes), _Remove from heat_,
  _Resting done_ (with MEATER's verdict).
- **A dashboard widget**, _MEATER cook_: temperatures, remaining time and
  state of one cook.
- **A _Test the connection_ button** in the Configuration screen.
- Probes only show in the API during a cook: the integration remembers them,
  so they stay in the Discovery tab between cooks, and handles their
  disappearance (disconnected at once, cook reset after 30 minutes).

Every text exists in English, French, German and Spanish. The user
documentation is in [`docs/`](docs/en.md) ([fr](docs/fr.md),
[de](docs/de.md), [es](docs/es.md)); Gladys shows it through the
**Documentation** link of the Configuration screen.

## Requirements

- Gladys **5.1.0** or later, with Internet access.
- A MEATER Cloud account, signed in in the MEATER app. During a cook, the app
  (or a MEATER Block) must stay connected to the probe and to the Internet:
  MEATER Cloud only knows what it relays.

## Installation

In Gladys: **Integrations → Install from GitHub**, then
`https://github.com/guim31/gladys-meater`. Once it is published in the store,
it is also found by its name, **MEATER**.

Then, in its **Configuration** tab, enter the e-mail address and the password
of the MEATER Cloud account, start a cook, and add the probes from the
**Discovery** tab.

## Refresh and API quotas

MEATER Cloud allows 60 requests per minute at most and recommends 2. The
integration reads the account every 30 s while a cook is set up or in
progress (15 s, 30 s or 60 s, configurable), every minute otherwise, never
twice within 2 s, and backs off after a failure (1 to 10 minutes, 5 at least
after a `429`). One request answers for every probe. It does its own refresh,
with the core's poll as a fallback (Gladys does not reliably poll external
devices, [GladysAssistant/Gladys#3198](https://github.com/GladysAssistant/Gladys/issues/3198)).
Only changed values are sent to Gladys, plus a 6-hour heartbeat.

## Limitations

- Cloud only: Gladys containers have no Bluetooth, and MEATER has no local
  API. Expect the delay of the app, of MEATER Cloud and of the refresh pace.
- The MEATER Cloud API is in beta and may change.
- One name per cook (the cut or the custom name): the API has no separate
  recipe name.
- Read only: the API has no command, and the integration never drives a cook.
- The remaining time is MEATER's estimate, unknown at the start of a cook.

## Development

Node.js 22+, ESM, no build step; the only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm ci
npm run format:check   # Prettier (Markdown included)
npm run lint           # ESLint
npm test               # node --test, against the SDK's fake Gladys and a fake MEATER Cloud
npx -y github:GladysAssistant/integration-store --skip-image-check .   # store checks
```

```
index.js            SDK wiring only
src/app.js          the handlers (discovery, poll fallback, action, widget, config)
src/hub.js          the account, the refresh loop, states, triggers, discovery
src/meater.js       MEATER Cloud client (login, devices, 2 s spacing, errors)
src/probe.js        the probe device: features, states
src/cook.js         the cook states of the API and what they mean
src/triggers.js     the cook transitions behind the scene triggers
src/widgets.js      the "MEATER cook" widget content
src/store.js        /data: token and known probes
src/i18n.js         every text, in four languages
scripts/probe.mjs   read-only check of the real API (fake account by default)
```

The tests never touch the network. `scripts/probe.mjs` checks the real API:
with no argument, it signs in with a fake account and expects the refusal;
with `MEATER_EMAIL` and `MEATER_PASSWORD`, it reads the account once and
prints what the integration makes of it, without any id, token or address.

```bash
node scripts/probe.mjs
MEATER_EMAIL=... MEATER_PASSWORD=... node scripts/probe.mjs
```

Releases go through **Actions → Release**, which bumps the version, tags,
builds the multi-arch image (`ghcr.io/guim31/gladys-meater`) and publishes the
GitHub Release with the changelog section.

## Credits

- [Apption Labs](https://github.com/apption-labs/meater-cloud-public-rest-api)
  for the public MEATER Cloud API and its documentation.
- [meater-python](https://github.com/Sotolotl/meater-python) by Sotolotl
  (Apache-2.0), the library of the Home Assistant integration: the API
  behaviour (errors, token that does not expire).
- The Home Assistant
  [`meater` integration](https://github.com/home-assistant/core/tree/dev/homeassistant/components/meater)
  (Apache-2.0, @Sotolotl and @emontnemery): the cook states and the values of
  the test fixtures.
- Built from the official
  [JavaScript template](https://github.com/GladysAssistant/integration-template-js).

## License

[Apache-2.0](LICENSE)
