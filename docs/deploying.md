# Deploying Joystick on Fly and Vercel

## Chat Web Push

Installed iPhone Home Screen apps on iOS 16.4 or later can receive chat alerts after the user turns them on in Profile or Updates and grants the device prompt. Generate one VAPID key pair using the `web-push` library, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` on the Fly API and worker Machines. Use a public HTTPS application URL or a monitored `mailto:` contact for the subject. Keep the private key out of Vercel and Git. Without a complete pair the API reports notifications unavailable and the app keeps chat usable.

Migration `017_web_push.sql` creates session-bound subscriptions and a durable message outbox. Run migrations before starting the new API and worker image. The existing singleton worker sends notifications; it can run with Web Push configuration even if the agent provider is unavailable. A successful push contains only room and message identifiers, and the device shows a generic lock-screen alert. Tapping opens the conversation only after the normal account and room authorization checks. A signed-out, expired, or revoked session cannot receive a newly sent push. Delivery is retried on transient provider failures; a provider's 404 or 410 removes the subscription. Push acceptance can outlive a later account revocation, so alerts already accepted by Apple or another provider cannot be withdrawn.


The first cut uses a static frontend on Vercel and two backend processes on Fly: the API/WebSocket gateway and the Managed Agents integration worker. Missions, tasks, rooms, submissions, reviews, profiles, and test-credit entries are PostgreSQL-backed. Test credits and payout simulations have no cash value. See [game actions](game-actions.md) and [account access](account-access.md).

On 29 October 2026, the frontend was deployed to `https://joystick-indol.vercel.app` and the backend app `joystick-api` to `https://joystick-api.fly.dev`. The database is `joystick-db`, Fly Managed Postgres Basic with 10 GB storage in Singapore (`sin`). One API Machine and one worker Machine run in the same region; migrations and health checks passed. The Vercel production deployment is `dpl_FQDwQypSN8hxnbeVUR1Ew6tCvQpQ`, published through the authenticated CLI using a prebuilt artifact.

That production smoke test covered the earlier account-and-chat foundation. The first cut passed 24 local backend tests and five Chromium browser tests with virtual passkeys. In an isolated local environment, a real Haiku session drafted mission, plan, and task content; a second work session paused for a human decision, saved an artifact, and carried it through preview, edit, and submission. These checks do not establish that the first-cut release works in production. Run the checks below after each production deployment. See [verification details](running-the-foundation.md#verification) for the earlier foundation result.

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
| `ANTHROPIC_WORKFLOW_AGENT_ID` | Work agent created by the current `npm run agent:setup` for mission and task drafting |
| `ANTHROPIC_ENVIRONMENT_ID` | Managed environment created by setup |
| `AI_GATEWAY_API_KEY` | Optional server-only Vercel AI Gateway key for Jev recommendation ordering; set on the Fly backend app, never as a `VITE_` variable or Vercel frontend setting |
| `JEV_MODEL` | Optional decision model override; defaults to `typesafe-ai/jev` |
| `GAME_TEST_CREDITS` | `true` only for the labeled pilot test-credit simulation; no real funding or payout provider is connected |

The private `/Users/gooi/joystick/.env.production` is a local source for these settings, not a file to upload with the image. Do not copy it into Git, Vercel, or Docker build arguments. Do not copy `JOYSTICK_ENV_FILE`, which is a local path, to Fly. The tracked `.env.local` has only development settings and empty credential fields.

The authenticated `POST /api/v1/game/recommendations` endpoint accepts only a list kind and scope IDs. The API loads the user's current profile and eligible mission, plan, or task candidates, sends minimal role, skill, and joined-topic context to Jev through [AI Gateway's Decision API](https://vercel.com/docs/ai-gateway/modalities/decision), and returns normalized scores by entity ID. It caches successful scores for ten minutes by user, scope, profile, and candidate content. If the key is absent, there are no eligible candidates, the user has no matching profile context, the budget is reached, or the provider fails, it returns `source: "fallback"` so the client keeps its local ordering. Recommendation calls are separate from login and the game snapshot. The API limits calls to ten per user per minute and two concurrent calls per user. This uses standard AI Gateway handling; zero data retention is not requested because the current Vercel plan rejected that option. The [TypeSafe integration skill](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md) is installed as Codex guidance for future question design; it is not bundled in the app.

Before enabling a real key, `node --import tsx scripts/jev-smoke.mjs` writes a synthetic payload fixture without calling the provider. Add `--send` only after authorizing a paid probe. The script uses `AI_GATEWAY_API_KEY` from the process environment and writes request and response fixtures to a private temporary directory; it prints only model, source, ordering, and token usage. A private env file can be loaded with Node's `--env-file=/absolute/path` option before `--import tsx`. Test the real provider with synthetic data before using user profiles.

The first-cut deploy adds migrations `004` through `010`. The Fly release command applies unapplied migrations before the API and worker start. Keep a database backup and confirm the release completed before allowing users into the new flow. Migrations are additive; a failed release blocks the new image but does not automatically roll back database changes.

Authenticate with `fly auth login`. Create/select the intended app and region, set its secrets, and configure the API domain's Fly certificate and DNS before opening signup. Deploy using the repository's `fly.toml`, passing the selected app name explicitly if it is not recorded there. The release command runs SQL migrations before starting the new release. A failed release migration blocks deployment.

Keep **one API Machine and one worker Machine** for this pilot. Disable automatic extra Machines on first deploy and verify the counts afterward. The API stays running for low-latency WebSockets. The worker acquires an exclusive database lock before recovering interrupted dispatches; a second worker cannot process jobs. Use an immediate deployment strategy to avoid an old worker blocking the replacement; users may briefly disconnect and recover saved messages on reconnect. Horizontal API fan-out and multiple active workers require further implementation.

`HTTP_PROXY_MODE=vercel` accounts for HTTP traffic arriving through Vercel's shared egress: authentication has a shared proxy quota of 300 requests per five minutes plus a 20-per-email quota. This is a pilot limit, not individual client IP attribution through Vercel. The backend does not trust arbitrary forwarded IP headers.

## Vercel

Use the repository root with the Vite preset, `npm run build`, and output directory `dist`; `vercel.json` records these settings. Use Node 24. Leave `VITE_API_ORIGIN` unset so HTTP requests stay same-origin. Set the public build variable `VITE_WS_ORIGIN` to the exact HTTPS Fly API origin; the browser derives the WSS URL. Rebuild after changing it. It is an address, not a secret. Do not place database or Anthropic credentials in any `VITE_` setting.

For the selected deployment, use `VITE_WS_ORIGIN=https://joystick-api.fly.dev` and leave `VITE_API_ORIGIN` unset.

## Continuous integration and publishing

`.github/workflows/verify-and-deploy.yml` runs for pull requests and pushes to `main`. It starts disposable PostgreSQL 17, applies every migration, checks types and both builds, runs server tests, then runs the Chromium browser tests with virtual passkeys. The browser suite starts local API and Vite processes with `HTTP_PROXY_MODE=vercel`, matching the production shared-proxy limit; it uses no Anthropic credentials or worker process, so these checks make no paid provider calls.

After those checks pass on a push to `main`, the workflow deploys `joystick-api` to Fly with `--ha=false` to retain one Machine per process group. It then verifies exactly one API and one worker Machine are present, starts a stopped expected Machine if needed, and waits up to 60 seconds for both to be started and the API health endpoint to pass. The job fails if that check does not pass; a successful `flyctl deploy` alone is not enough. Main deployment jobs are serialized and cannot cancel a running release. The repository secret `FLY_API_TOKEN` was configured on 29 October 2026 with a 90-day **app-scoped deploy token** for `joystick-api`; rotate it before expiry in late January 2027. The deploy job fails with a clear message if the secret is absent. The token belongs in GitHub Actions secrets, never in source or a `VITE_` variable. Fly runtime secrets above remain configured on the Fly app. The release command migrates the production database as part of that deployment.

The existing Vercel project should publish the frontend from its Git integration on `main`. Confirm its production branch is `main`, root directory is the repository root, and production environment has `VITE_WS_ORIGIN=https://joystick-api.fly.dev`; leave `VITE_API_ORIGIN` unset. Vercel publication is separate from the GitHub Fly job and may finish first. Preview deployments have no matching production RP ID or API Origin and should not be used to create accounts against production.

The account-backed mission flow is at `/`; private agent chat is at `/chat.html`. The `/api/:path*` external rewrite in `vercel.json` targets the Fly backend. Verify that the proxy preserves request Origin, response Set-Cookie, and subsequent request cookies. Direct WSS authenticates through tickets rather than cookies on the Fly domain. See [Vercel's rewrite documentation](https://vercel.com/docs/routing/rewrites).

## Verification after deployment

Confirm the Fly health check passes, migrations complete, and exactly one API and one worker are running. Verify certificate and DNS readiness for both hostnames. Then exercise the production origin in a browser:

1. Create a passkey account; add a second passkey and save recovery codes. Sign out and back in, then test recovery with a saved code.
2. Create a mission, plan, and task manually. Start a managed-agent draft for mission, plan, or task work; inspect its output, answer a decision request, edit a saved artifact, and submit only after the person's confirmation.
3. Exchange messages in private and shared rooms. Reload and reconnect; confirm saved messages appear once, and another account cannot read a room without membership.
4. Have two other registered mission members review the same submitted artifact version. Request a revision and confirm an older review does not approve the new version; then verify the mission owner can advance a completed stage.
5. Reload and confirm XP, journal entries, and test-credit balances persist. Confirm every credit and payout action is labeled as a simulation with no cash value.

Text artifacts, including imported code or Markdown, are stored in PostgreSQL. Binary object storage, real payments, verified identity or skills, and live third-party tool connections are outside this pilot. Disable `GAME_TEST_CREDITS` if the pilot should not expose simulated credit actions.

Local integration tests and virtual-passkey browser checks are described in [running the foundation](running-the-foundation.md). They do not prove production DNS, certificates, real-device passkeys, or live provider behavior.
