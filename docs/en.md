# MEATER

Follow your MEATER wireless meat thermometers in Gladys: internal and ambient
temperatures, target, remaining time and state of the cook, and scenes that
start at the right moment of the cook.

> Not affiliated with Apption Labs / MEATER. MEATER is a trademark of Apption
> Labs. **Developed without the hardware: feedback welcome**, on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-meater/issues).

## Overview

The integration reads your probes through the **official MEATER Cloud API**,
with the account of the MEATER app. Each probe becomes a Gladys device, with
its temperatures and its cook. Three scene triggers mark the moments of a cook
(almost ready, remove from heat, resting done), and a dashboard widget shows
one cook at a glance.

Everything is **read only**: Gladys never starts, changes or stops a cook.
The cook is set up in the MEATER app, as usual.

## Requirements

- Gladys **5.1.0** or later, with Internet access.
- A MEATER probe: MEATER, MEATER+, MEATER 2 Plus, MEATER Pro, MEATER Pro XL,
  or a MEATER Block.
- A **MEATER Cloud** account, signed in in the MEATER app.
- During the cook, the MEATER app (phone or tablet) or the Block must stay
  connected to the probe (Bluetooth) **and** to the Internet: MEATER Cloud
  only knows what the app or the Block relays.

## Configuration

In Gladys, open **Integrations**, then **MEATER**, tab **Configuration**:

| Field                 | What to enter                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| E-mail address        | The e-mail address of your MEATER Cloud account.                                                                 |
| Password              | Its password.                                                                                                    |
| Language              | Language of the feature names, of the cook states and of the cut names sent by MEATER Cloud (French by default). |
| Refresh during a cook | Every 15 s, 30 s (recommended) or 60 s while a cook is in progress. Every minute otherwise.                      |

Save, then click **Test the connection**: the message says how many probes
MEATER Cloud sees right now.

Then add the probes:

1. Start a cook in the MEATER app (a probe only shows in MEATER Cloud during
   a cook).
2. In the **Discovery** tab, click the search button, then **Add to Gladys**
   on each probe.

A probe seen once stays in the Discovery tab, even between cooks.

## Devices

One device per probe, named "MEATER probe" followed by the 8 first characters
of its identifier (rename it in Gladys). Every feature is read only.

| Feature              | Content                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Internal temperature | Temperature at the tip of the probe, in the meat (°C).                                                                      |
| Ambient temperature  | Temperature around the meat, in the oven or on the grill (°C).                                                              |
| Target temperature   | The target set in the app for the cook (°C).                                                                                |
| Peak temperature     | The highest internal temperature reached during the cook (°C).                                                              |
| Remaining time       | The time left estimated by MEATER (minutes). Kept at its last value while MEATER is still estimating.                       |
| Elapsed time         | Time since the start of the cook (minutes).                                                                                 |
| Cook state           | No cook, Not started, Set up, Cooking, Remove from heat, Resting, Done, Slightly underdone, Slightly overdone, Overcooked!. |
| Cook                 | The name of the cut or the name given to the cook in the app.                                                               |
| Cook in progress     | 1 from the start of the cook to the end of the rest, 0 otherwise.                                                           |
| Probe connected      | 1 while MEATER Cloud sees the probe, 0 otherwise.                                                                           |

When a probe is no longer seen (cook over, probe back in its charger, phone
out of range), "Probe connected" goes to 0 at once and the last readings stay.
After 30 minutes without news, the cook is considered over: "Cook in
progress" goes back to 0 and "Cook state" to "No cook".

## Dashboard widget

**MEATER cook** shows one probe: the name of the cook, the internal, target
and ambient temperatures (live), the remaining time, the state of the cook,
the elapsed time and whether the probe is connected.

In its settings, pick a probe, or leave it empty: the widget then shows the
probe that is cooking.

## Scene triggers

In a scene, **Add trigger**, then pick one of the MEATER triggers. Each one
fires **once per cook**, even if Gladys restarts in the middle of it.

| Trigger           | When                                                                                        | Filters                                 | Information passed on to the scene                                         |
| ----------------- | ------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| Cook almost ready | The remaining time estimated by MEATER goes under 5, 10, 15 or 30 minutes, meat on the heat | Probe (optional), threshold (mandatory) | Cook, remaining time, threshold, internal and target temperatures          |
| Remove from heat  | MEATER says to take the meat off the heat and let it rest                                   | Probe (optional)                        | Cook, internal and target temperatures                                     |
| Resting done      | The rest is over and MEATER gives its verdict                                               | Probe, result (both optional)           | Cook, result (Done, Slightly underdone…), internal and target temperatures |

The texts passed on (cook state, result) follow the language of the
configuration.

## Action

**Test the connection** (Configuration tab) signs in to MEATER Cloud and
tells how many probes it sees right now, or what is wrong (refused password,
service unreachable, too many requests). After a refused password, it is
also the way to try again without saving the configuration.

## Scene examples

The words in brackets are information of the trigger, inserted in the text
with the variable picker of the scene editor.

- **Set the table**: trigger "Cook almost ready" with the threshold
  "10 minutes", action "Send Message": "[Cook] is ready in 10 minutes, time
  to set the table."
- **Off the heat**: trigger "Remove from heat", actions "Make the Lights
  blink" in the kitchen and "Talk on a speaker": "Take [Cook] off the heat, it
  is at [Internal temperature] °C."
- **Dinner is served**: trigger "Resting done" with the result "Done", action
  "Send Message" to the whole family: "Dinner is served!"
- **Grill too hot**: trigger "Device state change" on the "Ambient
  temperature" of the probe, above 300 °C: a message to check the grill.

## Refresh and quotas

MEATER Cloud allows **60 requests per minute at most, and recommends 2**. The
integration reads the account:

- at the pace chosen in the configuration while a cook is set up or in
  progress (every 30 s by default);
- every minute otherwise, as the API documentation advises;
- never twice within 2 seconds;
- after a failure, after 1, 2, 4… minutes, up to 10 minutes (5 minutes at
  least when MEATER Cloud asks to slow down).

One request answers for every probe of the account. The integration only
sends Gladys the values that changed (and every value at least every 6 hours,
so none looks stale), and it does its own refresh: it does not depend on the
Gladys scheduler.

What is stored in the integration's data volume: the MEATER Cloud token
(it does not expire) with a fingerprint of the account, and the list of the
probes seen with the memory of their current cook. Neither the e-mail
address nor the password is written there; the password stays in the Gladys
configuration.

## Troubleshooting

- **"MEATER Cloud refused the e-mail address or the password"**: use the
  address and the password of the MEATER app, then save the configuration
  again. The integration does not retry by itself, so as not to lock the
  account.
- **No probe in the Discovery tab**: a probe only shows during a cook, while
  the MEATER app or the Block is connected to it and to the Internet. Start a
  cook, click **Test the connection**, then search again.
- **The values no longer move**: the phone running the MEATER app is out of
  Bluetooth range, asleep, or offline. "Probe connected" tells whether MEATER
  Cloud still sees the probe.
- **"MEATER Cloud asks to slow down"**: another program reads the same
  account too often. Choose a slower refresh during a cook.
- **More details**: the integration logs (Supervision tab). Set the
  environment variable `LOG_LEVEL=debug` to see every refresh.

## Limitations

- Cloud only: Gladys does not talk to the probe over Bluetooth. The data
  arrives with the delay of the MEATER app, of MEATER Cloud and of the
  refresh pace (30 s by default).
- The MEATER Cloud API is in beta: MEATER may change it.
- The API gives one name per cook (the cut, or the name you typed): there is
  no separate recipe name.
- The remaining time is MEATER's estimate; it is unknown at the start of the
  cook.
- The temperatures come in degrees Celsius.
- Read only: no cook setup, no alarm from Gladys.
- Developed without the hardware nor an account: the behaviour was written
  from the official API documentation and from the Home Assistant
  integration. Feedback welcome.
