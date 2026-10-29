# Account access in the pilot

Passkeys remain the only normal sign-in method. There is no email verification, password, magic link, or support override. Every account must keep at least one passkey.

## Manage signed-in passkeys

All paths below are under `/api/v1/auth`. Every POST requires the configured `Origin` and a cookie session, except recovery. Responses use `Cache-Control: no-store`.

| Endpoint | Body | Result |
| --- | --- | --- |
| `GET /passkeys` | — | `{passkeys:[{id,deviceType,backedUp,createdAt}],manageUntil}` |
| `POST /reauth/options` | `{}` | `{options}` for WebAuthn authentication |
| `POST /reauth/verify` | `{response}` | `{manageUntil}`; starts a five-minute grant tied to this session |
| `POST /passkeys/options` | `{}` | `{options}` for a new WebAuthn passkey; requires grant |
| `POST /passkeys/verify` | `{response}` | `{passkeys}`; requires grant |
| `POST /passkeys/:id/remove` | `{}` | `{passkeys}`; requires grant and at least one key remaining |
| `POST /recovery-codes` | `{}` | `{codes}`; 10 new single-use codes shown once; requires grant |

The browser should use `startAuthentication({optionsJSON: options})` for reauth and `startRegistration({optionsJSON: options})` for adding a passkey. Regenerating recovery codes invalidates every previous code and pending recovery challenge. Only hashes are stored.

## Replace lost passkeys

| Endpoint | Body | Result |
| --- | --- | --- |
| `POST /recovery/options` | `{email,code}` | `{options}` for a five-minute registration challenge; consumes the code atomically |
| `POST /recovery/verify` | `{response}` | `{user}` and a fresh session cookie |

A completed recovery registers a new passkey, removes every old passkey, revokes every old session, and deletes the remaining recovery codes. The browser must tell the user to generate fresh codes after signing in. Invalid email/code combinations return the same error. Recovery does not establish email ownership; possession of a saved recovery code is the recovery factor.
