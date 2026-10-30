# Joystick

**Change the world. Multiplayer.** Pick a mission, join a squad, and work with people and AI on a real-world problem.

Joystick is a mobile-first, installable web app. Missions move through stages; squads propose plans; people claim tasks, submit work, and review one another's contributions. The current release is a pilot: accounts and work are persisted, while credits, mission tokens, funding, and payout records are in-app simulations. They do not represent cash, legal ownership, or a claim on future revenue.

## What works today

- **Accounts and onboarding:** Create an account with a username and passkey, choose up to five roles, name your agent, and pick missions. Sign in with a passkey; manage additional passkeys and one-use recovery codes from your account. No email verification or password flow is required for normal sign-in.
- **Squad-first missions:** Explore the seeded mission catalog or create a mission. The map lets you pick or switch squads; opening a mission takes you to your squad's work. Plans can target later checkpoints, and the map shows the stages they aim to skip. Seeded missions include problem context, stages, plans, tasks, and sample conversation content. Sample people and outcomes are distinct from registered players and recorded work.
- **Make and do work:** Create missions, plans, and tasks through editable agent-assisted drafts or app forms. Tasks can have roles, dependencies, decisions, rewards, and a plan. Claim a task, run the agent on it, respond when it needs a decision, edit the resulting artifact, and submit it. Agent runs and submitted text artifacts are saved.
- **Check and review:** The worker runs an instant first-pass check on submitted work when a review provider is configured. A clear pass shows provisional mission tokens; a request for improvement lets the submitter revise. An unavailable check does not block member review. Two distinct registered mission members other than the submitter must approve the same artifact version before task approval; the mission owner closes an eligible stage.
- **Credits and mission tokens:** The pilot has a test-credit balance and journal. Credits can be reserved for missions or plans and used for task rewards. Each mission has its own token symbol and balance. Credit backing and approved tasks can earn mission tokens; tokens shown after an instant pass stay provisional until member approval. A recorded payout is a simulation.
- **People and chat:** Mission, stage, plan, task, direct-message, and private agent conversations persist with access checks. Pip can read authorized app state and, through the same game-action rules as the UI, carry out requested commands. Agent availability depends on configured provider credentials. Optional Web Push alerts can be enabled on supported installed apps.
- **Recommendations:** With a server-side AI Gateway key, Jev scores eligible missions, plans, and tasks against stated roles and skills and topics from joined missions. Scores are cached, while current work and squad membership retain their place in the ordering. Without Jev, the app uses its local fit rules. Lists start with four items and reveal eight more per **Show more**; a late score does not reorder a view after the person interacts with it. The submission-check pipeline attempts Jev first, then the configured Anthropic review model when needed.

## Product direction (proposed)

The larger goal is to coordinate difficult, open-ended work: make the need visible, let squads try different plans, preserve what each team learns, and reward useful contributions. The original [single-file prototype](public/prototype/joystick-quest.html) explores this direction. The following economics and governance are **proposals**, not pilot rules or promises:

- Sponsors could fund mission prizes and stage budgets; backers could support a plan with money or a free signal of demand. Promises from people who need an outcome and revenue from early products were also proposed as funding sources.
- A stage bonus could favor breadth of support over one large contribution, with trust weighting and a per-plan cap. Proposed signals include demand, money, approved time, and delivered compute. The prototype illustrates quadratic matching; the current app does not distribute money or calculate this bonus.
- Contributors could share in mission ownership, with larger early-stage weights. The prototype's illustrative prize split was 70% players, 15% referees, 10% mission creator, and 5% community fund. There is no legal ownership or prize distribution in the pilot.
- Independent critics and referees, verified identity and skills, anti-collusion checks, spending approval, and owner votes would need explicit policies and implementation before real funds or ownership could exist. Today's review rule is the two-member rule above, with owner-attested stage closure.

The proposed uncapped matching score for a plan $s$ was $q_s = (\sum_i \sqrt{c_{i,s}})^2 - \sum_i c_{i,s}$, where $c_{i,s}$ combines one backer's signals after any trust weighting. The prototype proposed allocating a bonus pool by each plan's share of these scores, then applying a cap and redistributing the excess. Its illustrative rates were one credit per unit of demand or money, 50 credits per approved hour, and two credits per delivered GPU-hour. Those numbers are design inputs to revisit, not configured rates in the app.

## Run locally

Use **Node.js 22 or later**, npm, PostgreSQL, and a browser with passkey support. `localhost` is a secure context for local WebAuthn. Start from a disposable local database and keep credentials out of Git.

```sh
npm install
# Set DATABASE_URL in the tracked .env.local to your local PostgreSQL database.
npm run db:migrate
```

Run these in separate terminals:

```sh
npm run api:dev
npm run worker:dev
npm run dev
```

Open `http://localhost:5173/` for the game, `/chat.html` for the separate private chat view, or `/design.html` for the living style guide. Vite proxies `/api` and local WebSockets to the API on port 3001. Keep `WEB_ORIGIN=http://localhost:5173` and `RP_ID=localhost` for the default local setup. The worker handles agent jobs, instant submission checks, and push delivery; the API and web app can still run without optional provider keys. Without an agent provider, chat messages persist but the agent cannot respond. Without a review provider, member review remains available.

`.env.example` documents the configuration. The tracked `.env.local` has local, non-secret defaults; development loads it by default. Production loads the ignored, private `.env.production` when present or uses injected environment variables. `JOYSTICK_ENV_FILE` can select another **absolute** private file, and existing process environment variables take precedence. Keep provider keys in a private file or process environment, never in the tracked `.env.local`. For local live-provider work, select a private environment file that points to a **local disposable database**, not production data. `ANTHROPIC_API_KEY` and the agent IDs enable hosted chat and work runs; `npm run agent:setup` provisions the hosted agents for the selected environment. `AI_GATEWAY_API_KEY` enables Jev through Vercel AI Gateway. `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` enable Web Push. Keep all server keys out of `VITE_` variables. See the [foundation setup notes](docs/running-the-foundation.md) for the original account/chat slice, [Pip's current command catalog](docs/agent-commands.md), and the [deployment guide](docs/deploying.md) for production configuration.

## Verify

```sh
npm run typecheck
npm run build
npm run test:unit
TEST_DATABASE_URL=postgres://user@localhost:5432/joystick_test npm run test:server
npx playwright install chromium
CI=true HTTP_PROXY_MODE=vercel GAME_TEST_CREDITS=true npm run test:e2e
```

Use a disposable, migrated database for `TEST_DATABASE_URL`. The server suite requires that variable explicitly. For the full browser suite, point `DATABASE_URL` to a local disposable database and stop any API or Vite server already using ports 3001 or 5173. `CI=true` makes Playwright start fresh servers instead of reusing one with stale settings; `HTTP_PROXY_MODE=vercel` and `GAME_TEST_CREDITS=true` match the [GitHub verification workflow](.github/workflows/verify-and-deploy.yml) and avoid the local auth quota that can cause 429s across the suite. Playwright uses virtual passkeys. Keep `AI_GATEWAY_API_KEY` and `ANTHROPIC_API_KEY` blank or unset for normal tests: an inherited key can make an unmocked recommendation request call the live provider. Run a live provider probe only as an explicit, separate opt-in step. `npm run preview` serves the production build locally after `npm run build`.

## Code map

The browser is vanilla JavaScript built with Vite; the API and worker use TypeScript and Fastify with PostgreSQL. Live chat uses WebSockets, optional alerts use Web Push, hosted agent runs use Claude Managed Agents through the Anthropic SDK, and optional Jev judgments go through Vercel AI Gateway.

| Path | Purpose |
| --- | --- |
| `src/main.js`, `src/live/` | Browser entry point, authenticated game UI, onboarding, creation, chat, recommendations, and push controls |
| `src/design/`, `src/styles/` | Shared tokens, components, and layouts; `/design.html` shows the design system |
| `server/app.ts`, `server/auth.ts`, `server/game/` | Fastify API, passkey authentication, game actions, snapshots, recommendations, and submission checks |
| `server/agent-runs/`, `server/agent-commands.ts`, `server/worker.ts` | Agent work runs, Pip command bridge, and background processing |
| `db/migrations/`, `db/seed/` | PostgreSQL schema and seeded mission catalog |
| `public/manifest.webmanifest`, `public/sw.js` | Installable PWA and service worker |
| `tests/` | Unit, PostgreSQL-backed server, and Playwright browser tests |

The static frontend is configured for **Vercel**; the API/WebSocket gateway and singleton worker are configured for **Fly**, backed by PostgreSQL. Production uses `DIRECT_DATABASE_URL`, separate from local `DATABASE_URL`. Deployment configuration and release checks are in [docs/deploying.md](docs/deploying.md).

## More detail

- [Game actions and review rules](docs/game-actions.md)
- [Pip's app commands](docs/agent-commands.md)
- [Account and recovery rules](docs/account-access.md)
- [Technical architecture](docs/technical-architecture.md)
- [Prototype parity and known gaps](docs/prototype-parity.md)
- [TypeSafe integration guidance](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md) for future Jev question design (development guidance, not app code)
- [Initial seed workbook reference](https://github.com/product-manager2/joystick/commit/c6ad2446fad8b605dbff843264d9fe9e5c2754a1) for the original mission and squad design baseline
