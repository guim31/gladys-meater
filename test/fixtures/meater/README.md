# MEATER Cloud fixtures

Answers of the MEATER Cloud REST API, in the exact shape of the official
documentation ([apption-labs/meater-cloud-public-rest-api](https://github.com/apption-labs/meater-cloud-public-rest-api)).
The values of the cooking probe come from the Home Assistant `meater` tests
(Apache-2.0: "Whole chicken", "Started", internal 26 °C, ambient 28 °C), with
a realistic target and times. The probe ids, token and user id are invented.

- `login.json`: `POST /login`, 200.
- `devices-cooking.json`: `GET /devices`, one probe cooking, one probe out of
  its charger without a cook.
- `devices-empty.json`: `GET /devices`, no probe visible (no cook in progress).
- `error-401.json`, `error-429.json`: the documented error body.
