# Running the Joystick foundation

This slice adds real email-and-passkey accounts, private persistent chat, a WebSocket connection, and a Claude Managed Agents integration. Open `/chat.html` for the real account flow. The original mission experience at `/` remains a demo; quest execution, independent reviews, and payments are not connected to the backend yet.

## Environment files

`.env.local` is intended for Git and contains only non-secret local settings. It points to a disposable PostgreSQL database on loopback port 55439. It does not contain an Anthropic key or enable live agent responses.

`/Users/gooi/joystick/.env.production` is the private configuration file prepared for this workspace. It is ignored by Git. Enter the real key after `ANTHROPIC_API_KEY=` in that file, not in chat, source code, or `.env.local`. The production database and HTTPS origin must be configured before production startup; the presence of this file does not deploy the app.

Use `JOYSTICK_ENV_FILE` with an absolute path to select a private configuration file. With no override, development loads `.env.local` and production loads `.env.production` when present. Fly instead injects runtime settings, including `DIRECT_DATABASE_URL`, without an environment file. Existing process environment values take precedence. Keep production credentials separate from local tests. See [deploying on Fly and Vercel](deploying.md).

## Local app

Use a supported Node.js runtime with native environment-file loading; this slice was verified on Node 24. Install dependencies, start an isolated local PostgreSQL instance matching `.env.local`, and run:

```sh
npm install
npm run db:migrate
npm run api:dev
```

In another terminal, start the web app:

```sh
npm run dev
```

Open `http://localhost:5173/chat.html`. Keep the browser origin as `localhost:5173` for the default passkey relying-party configuration. The development proxy sends API and WebSocket traffic to port 3001. Passkeys require a supported browser and a secure context; localhost supports local development.

Without agent credentials, messages still save correctly and the interface states that the agent is not connected. It never substitutes scripted replies into the real chat.

## Hosted agent setup

After entering the key into the ignored production file, run from this checkout:

```sh
JOYSTICK_ENV_FILE=/Users/gooi/joystick/.env.production npm run agent:setup
```

The command creates an Anthropic-hosted environment and conversational agent, records their IDs in the same private file, and does not start a session. Existing IDs are reused. A key that is not scoped to a workspace also needs `ANTHROPIC_WORKSPACE_ID`; the Default Workspace is included in API workspace listings only with `include_default=true`. The initial model defaults to `claude-haiku-5-5` to keep pilot testing costs low; `ANTHROPIC_MODEL` overrides it when creating an agent. Changing that setting does not modify an already-created agent. If creation has an unknown outcome, reconcile the resource in Anthropic Console before trying again; the command stops rather than risking duplicate resources.

The initial agent has no Joystick business tools. It can discuss plans and draft text; it cannot claim quests, approve evidence, or spend mission funds. After the backend database, origin, and credentials are configured for the selected environment, run the API and `npm run worker:start` against that same environment file. The worker handles managed session dispatch and imports assistant messages. This pilot supports one worker process with bounded concurrent rooms.

## Verification

Run the backend tests against a disposable database with migrations applied:

```sh
TEST_DATABASE_URL=postgresql://gooi@127.0.0.1:55439/joystick_foundation_test npm run test:server
npm run typecheck
npm run build
```

The backend test suite requires `TEST_DATABASE_URL` explicitly and fails if it is absent. The browser suite is `tests/live.e2e.spec.mjs` and uses a Chromium virtual passkey authenticator. It requires the API and web app to be running, and a configured Playwright Chromium installation or local Chrome channel. Its accounts and data are synthetic. Provider failure-path tests use a fake client and do not contact Anthropic.

On 29 October 2026, the PostgreSQL-backed backend suite passed 6 tests and the local browser suite passed 2 tests. TypeScript checks and both builds passed. The dependency audit reported zero vulnerabilities before deployment work; that work added no dependencies. Browser checks covered passkey signup/login, persisted messages, account isolation, reconnect after a temporary history failure, one-use WebSocket tickets, and long Unicode messages with the mobile composer still visible.

The deployed Vercel/Fly flow also passed a browser smoke test: a synthetic virtual-passkey account sent exactly one prompt, received a live Haiku reply, and retained it after reload and passkey sign-in. The test provider session was closed afterward. Public DNS resolved the backend, but this computer's resolver still cached an earlier lookup failure, so Chromium used a hostname-specific mapping to Fly's verified shared IPv4 address; TLS verification remained enabled. Physical passkey devices and an ordinary local DNS lookup remain unverified.

## Authentication scope

Email is an unverified account identifier. Passkey possession authenticates the account. There are no passwords, verification emails, magic links, or email-only recovery. Registering the same email cannot replace an existing account's passkey. Lost-passkey recovery and account credential management remain future work.
