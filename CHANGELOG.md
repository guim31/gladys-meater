# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- MEATER wireless meat thermometers in Gladys, through the official MEATER
  Cloud API (e-mail and password of the MEATER Cloud account).
- One device per probe: internal, ambient, target and peak temperatures,
  remaining and elapsed time, cook state, cook name, cook in progress, probe
  connected. Read only.
- Probes seen once stay in the Discovery tab between cooks; a probe that
  disappears shows as disconnected at once, and its cook is reset after 30
  minutes.
- Scene triggers "Cook almost ready" (5, 10, 15 or 30 minutes left), "Remove
  from heat" and "Resting done", each fired once per cook, even across a
  restart.
- Dashboard widget "MEATER cook": temperatures, remaining time and state of
  one cook.
- "Test the connection" button in the Configuration screen.
- Refresh every 30 s during a cook (15 s, 30 s or 60 s, configurable) and
  every minute otherwise, within the MEATER Cloud quotas.
- English, French, German and Spanish everywhere, documentation included.

[Unreleased]: https://github.com/guim31/gladys-meater/commits/main
