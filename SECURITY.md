# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the e-mail address and the password of the MEATER Cloud
  account live in the Gladys configuration (the password as a `secret`
  field). The integration sends them to MEATER Cloud only, over HTTPS, to
  sign in, and never writes them to a log or to `/data`.
- **`/data`**: `token.json` holds the MEATER Cloud token (a JWT that does not
  expire) with a SHA-256 fingerprint of the account, never the address;
  `probes.json` holds the ids of the probes seen and the memory of their
  current cook. Both files are readable by their owner only.
- **Network**: outgoing HTTPS requests to `public-api.cloud.meater.com` only.
  The integration listens on no port.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
MEATER Cloud, the MEATER app and the probes.
