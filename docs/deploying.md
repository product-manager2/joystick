# Deploying Joystick on Fly and Vercel

The foundation deploys the static frontend to Vercel and two backend processes to Fly: the API/WebSocket gateway and the Managed Agents integration worker. This is the account-and-chat pilot; the mission screens remain a demo.

On 29 October 2026, the frontend was deployed to `https://joystick-indol.vercel.app` and the backend app `joystick-api` to `https://joystick-api.fly.dev`. The database is `joystick-db`, Fly Managed Postgres Basic with 10 GB storage in Singapore (`sin`). One API Machine and one worker Machine run in the same region; migrations and health checks passed. The Vercel production deployment is `dpl_FQDwQypSN8hxnbeVUR1Ew6tCvQpQ`, published through the authenticated CLI using a prebuilt artifact.

A production browser smoke test confirmed virtual-passkey signup, a single live Haiku reply, persisted history, and passkey sign-in. Public DNS resolved through Google DNS, but the local resolver retained an earlier lookup failure. The browser used a hostname-specific mapping to Fly's verified shared IPv4 address without disabling TLS verification. See [verification details](running-the-foundation.md#verification).

## Domains and login

The chosen deployment retains the existing Vercel production domain and uses a Fly backend hostname. Vercel proxies `/api` HTTP requests to Fly. The browser therefore stores its host-only, Secure, HttpOnly, SameSite=Lax session cookie on the frontend hostname. No third-party cookie is needed.

WebSockets connect directly to Fly. Before each connection, the frontend obtains a 30-second, single-use ticket through authenticated `POST /api/v1/ws-ticket`. It sends the ticket in the first WebSocket frame, never in the URL. The server stores only the ticket hash, consumes it atomically, and ties the connection to the existing session. Session validity is checked throughout the connection, so logging out also revokes socket access.

Set `WEB_ORIGIN` to the exact frontend origin, without a trailing slash. Set `RP_ID` to the frontend hostname, without a scheme or port, before creating production passkeys. An explicitly chosen parent domain also works when it is a valid relying-party domain. Changing the relying-party domain later invalidates the existing registration relationship. The API hostname is not the relying-party domain.

The relying-party ID must be the exact stable Vercel hostname, not the shared `vercel.app` suffix. Preview builds must not silently connect to the production API; the production backend accepts only the configured production frontend Origin.

## PostgreSQL

Place the database near the Fly Machines. Set the Fly secret `DIRECT_DATABASE_URL` to a direct PostgreSQL connection URL. Production requires that setting and uses it for API queries, LISTEN notifications, migrations, and the worker singleton lock. A normal `DATABASE_URL` is sufficient locally.

Fly Managed Postgres attachment normally sets a pooled `DATABASE_URL`. Obtain the **direct** URL from its Connect panel and configure `DIRECT_DATABASE_URL`; do not assume the attached URL is direct. Fly explicitly recommends a direct connection for migrations, LISTEN/NOTIFY, and advisory locks. See [Fly's client configuration guide](https://flyio-landing.fly.dev/docs/mpg/client-configuration/).

If choosing Fly Managed Postgres, the Basic plan currently starts at $38/month plus storage, in addition to application Machines and Claude usage. Recheck [Fly pricing](https://fly.io/pricing/) when provisioning. Backups and restore procedures depend on the selected database service.

## Fly runtime configuration

The Docker image contains the backend and migrations. Environment files, Git metadata, frontend artifacts, and local test data are excluded from the build context. Production accepts environment variables injected by Fly without requiring a local `.env.production` file.

Set these runtime values through Fly secrets or its environment configuration:

| Setting | Value |
| --- | --- |
| `DIRECT_DATABASE_URL` | Private direct PostgreSQL URL |
| `WEB_ORIGIN` | `https://joystick-indol.vercel.app` |
| `RP_ID` | `joystick-indol.vercel.app` |
| `COOKIE_SECURE` | `true` |
| `ANTHROPIC_API_KEY` | Private Claude API key |
| `ANTHROPIC_WORKSPACE_ID` | Required for a key that is not workspace-scoped |
| `ANTHROPIC_AGENT_ID` | Agent created by `npm run agent:setup` |
| `ANTHROPIC_ENVIRONMENT_ID` | Managed environment created by setup |

The private `/Users/gooi/joystick/.env.production` is a local source for these settings, not a file to upload with the image. Do not copy it into Git, Vercel, or Docker build arguments. Do not copy `JOYSTICK_ENV_FILE`, which is a local path, to Fly. The tracked `.env.local` has only development settings and empty credential fields.

Authenticate with `fly auth login`. Create/select the intended app and region, set its secrets, and configure the API domain's Fly certificate and DNS before opening signup. Deploy using the repository's `fly.toml`, passing the selected app name explicitly if it is not recorded there. The release command runs SQL migrations before starting the new release. A failed release migration blocks deployment.

Keep **one API Machine and one worker Machine** for this pilot. Disable automatic extra Machines on first deploy and verify the counts afterward. The API stays running for low-latency WebSockets. The worker acquires an exclusive database lock before recovering interrupted dispatches; a second worker cannot process jobs. Use an immediate deployment strategy to avoid an old worker blocking the replacement; users may briefly disconnect and recover saved messages on reconnect. Horizontal API fan-out and multiple active workers require further implementation.

`HTTP_PROXY_MODE=vercel` accounts for HTTP traffic arriving through Vercel's shared egress: authentication has a shared proxy quota of 300 requests per five minutes plus a 20-per-email quota. This is a pilot limit, not individual client IP attribution through Vercel. The backend does not trust arbitrary forwarded IP headers.

## Vercel

Use the repository root with the Vite preset, `npm run build`, and output directory `dist`; `vercel.json` records these settings. Use Node 24. Leave `VITE_API_ORIGIN` unset so HTTP requests stay same-origin. Set the public build variable `VITE_WS_ORIGIN` to the exact HTTPS Fly API origin; the browser derives the WSS URL. Rebuild after changing it. It is an address, not a secret. Do not place database or Anthropic credentials in any `VITE_` setting.

For the selected deployment, use `VITE_WS_ORIGIN=https://joystick-api.fly.dev` and leave `VITE_API_ORIGIN` unset.

The real account flow is at `/chat.html`; `/` retains the mission demo with a sign-in link. The `/api/:path*` external rewrite in `vercel.json` targets the Fly backend. Verify that the proxy preserves request Origin, response Set-Cookie, and subsequent request cookies. Direct WSS authenticates through tickets rather than cookies on the Fly domain. See [Vercel's rewrite documentation](https://vercel.com/docs/routing/rewrites).

## Verification after deployment

Confirm the Fly health check passes, the migration completes, and exactly one API and one worker are running. Verify certificate and DNS readiness for both hostnames. In the browser, create a passkey account, send a message, observe one saved message and one live agent response, reload, sign out, and sign back in. Verify another account cannot read the first account's room. Test a worker restart and a WebSocket reconnect without duplicate sends.

Local integration tests and virtual-passkey browser checks are described in [running the foundation](running-the-foundation.md). They do not prove production DNS, certificates, real-device passkeys, or live provider behavior.
