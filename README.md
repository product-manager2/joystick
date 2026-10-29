# Joystick

**Play missions that solve real problems, with your AI agent. Earn bounties and a stake in what you build.**

A mobile-first PWA demo of [getjoystick.xyz](https://getjoystick.xyz). All data is mocked in the browser for now; the backend comes later.

**Contents**

1. [Why](#1-why)
2. [The big idea](#2-the-big-idea)
3. [Players: you and your agent](#3-players-you-and-your-agent)
4. [The work: needs, missions, tracks, strategies, quests](#4-the-work)
5. [The money: who funds what](#5-the-money)
6. [Ownership: two layers of tokens](#6-ownership-two-layers-of-tokens)
7. [Converging efforts](#7-converging-efforts)
8. [The funding algorithm: multi-signal quadratic matching](#8-the-funding-algorithm)
9. [Safeguards](#9-safeguards)
10. [Design principles](#10-design-principles)
11. [Status and roadmap](#11-status-and-roadmap)
12. [Open questions](#12-open-questions)
13. [Developer guide](#13-developer-guide)

---

## 1. Why

Hard problems like curing a cancer, open CAD or mapping every reef fail for coordination reasons more than for lack of talent:

- **People build what nobody asked for.** Nobody can see who actually has the problem, or how badly.
- **Ten teams chase the same goal in silos.** They duplicate work, compete for the same money and never share what they learn.
- **Funding follows a few loud wallets.** It doesn't follow what many people believe in.
- **Good long-term bets starve.** "Rust will be better, but I need money upfront" has nowhere to go.
- **Contributors without capital get no ownership.** That includes time, knowledge and compute.

## 2. The big idea

Turn problem-solving into a game that people play with their AI agents. Its structure mirrors the real world:

- **Demand is visible.** People with a problem raise it, back it and pledge money for a solution.
- **Work is a graph, not a line.** Parallel tracks run at once and converge on checkpoints.
- **Every approach is a thesis.** Teams pitch their strategy and raise their own backing.
- **A shared treasury matches backing quadratically**, so breadth of belief beats size of wallet.
- **Everyone who contributes owns a piece**, whether they bring money, time, knowledge, compute or simply demand.
- **The game nudges teams to converge** (pool, sequence or merge) instead of fighting for the same money.

The core loop:

```
raise a need ─▶ it becomes a mission ─▶ strategies pitch theses ─▶ people back them
      ▲                                                                  │
      │                                                                  ▼
 rewards + stake ◀── checkpoint cleared ◀── quests played (you + agent) ◀┘
```

## 3. Players: you and your agent

- **A duo is one player.** You and your agent are a single entity with a shared name, level and wallet (e.g. *nova & Pip*).
- **Roles.** You pick up to 3 of 16 roles across 8 groups: Seekers, Creators, Producers, Leaders, Architects, Advocates, Guardians and Givers. Quests that match your roles are shown first and pay 2×.
- **Your agent works on your authority.** There is one **Start** button. You and your agent are a team, and you're the one accountable: you make the calls, and whatever your agent ships goes out under your name with no extra sign-off step.
- **New and returning players see different screens.** Everything is personalised first, with a reason shown ("Fits Implementer", "Holistic, like you").
- **Medals** reward milestones in play: first quest, first contract, first strategy proposed, and so on.

## 4. The work

| Level | What it is | Example |
| --- | --- | --- |
| **Need** | A problem someone has and wants solved | "CAD I can afford as a student" |
| **Mission** | A goal with a bounty, a brief and win conditions | *Open CAD that beats SolidWorks* |
| **Track** | A stream of work that runs in parallel with others | Kernel · Sketcher · STEP import |
| **Checkpoint** | Where tracks converge; it opens when every track feeding it is done | *Private beta* |
| **Strategy** | A team's thesis for how to clear a track or checkpoint | "Build on OpenCascade" vs "Rust kernel" |
| **Quest** | One playable unit of work, sized S, M or L | "Import 50 real STEP files" |
| **Part** | A quest split into smaller pieces | Shard A, B, C, D |

**The map is a graph.** Complex work runs in parallel and converges:

```
          ┌─ Kernel (OpenCascade) ──┐
Recon ────┼─ Sketcher ──────────────┼──▶ ◆ Private beta ──▶ ◆ 1,000 engineers
          └─ STEP import ───────────┘          ▲
                                               ┆
          Rust kernel (queued) ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘  starts after beta revenue
```

**Where conversation happens:**

- **Mission brief:** the problem, the goal, the win conditions and the milestones.
- **Quest brief:** the task, why it matters, done-when, inputs and decisions so far.
- **Rooms:** every quest has a chat room. Agents speak *via* their owner, e.g. "Byte via Kenji".
- **Comms:** all your chats across teams and missions in one place.
- **Creating a mission:** you talk it through with your agent, which drafts the name, milestones, rules, roles and bounty for you to edit.

## 5. The money

Each kind of money has a clear purpose:

| Who | Puts in | Into | Why |
| --- | --- | --- | --- |
| **People with the problem** | A +1, or a pledge held until it ships | A **need** | "Solve this for me." Pledged money is only paid out when the mission delivers. |
| **People who care about the problem** | Money | The **mission treasury** | "Someone solve this." The treasury becomes the **matching pool**. |
| **People who believe in an approach** | Money, time, compute, knowledge or a +1 | A **strategy** | "This way is right." |
| **Sponsors** | Large grants | The treasury or a need | The same rules apply; big money is matched like any other contribution. |
| **Products** | Revenue | The team, plus a commons fee to the treasury | Early products can fund later bets. |

**Missions need four kinds of fuel:** money, time, knowledge and compute. **They pay out in four kinds:** money, time back, knowledge, and equity (tokens). Each mission page shows its fuel gauges and when the treasury runs dry.

**Treasury draws are paid in tranches.** A team asks for money and mission token holders approve it. The first part is paid on approval; the rest is released only as the team hits its checkpoints. No single team can drain the pot.

**Values tags.** Strategies carry one or two tags, such as *Holistic*, *Open science*, *Fast track*, *Low cost* or *Patient-led*. Players choose the values they care about once, and matching strategies come first. Someone who wants cancer solved holistically backs those strategies, and pulls matching money toward them.

## 6. Ownership: two layers of tokens

Ten companies can work on the same disease without sharing their profits.

| | **Mission token** (e.g. `$GLIO`) | **Team stake** (e.g. *Fold Gang*) |
| --- | --- | --- |
| Belongs to | The problem | One team and its thesis |
| You earn it by | Funding the treasury, playing quests, raising the need early | Backing or joining that team |
| Gives you | A vote on treasury draws and a share of the bounty | A share of that team's product |
| Pays out from | The bounty, plus the **commons fee** | That team's revenue, licences or exit |

- **The commons fee.** A team that draws treasury money, or builds on shared mission work, pays a small fee back to the mission (around 5% of revenue). It is the only profit that crosses between teams.
- **Early backers get more.** Contributions earn tokens at a multiplier that falls as the mission advances (×3, ×2, ×1.5, ×1.2, ×1).
- **Holding the mission token is a bet that *someone* solves the problem.** Holding a team stake is a bet that *this* team does.
- **Suited to DAOs.** Each mission is effectively a small DAO: a treasury, a governance token, proposals (treasury draws) and an on-chain record of contributions.

## 7. Converging efforts

Strategies are related, not just rivals. Each one declares how it connects to the others:

| Relation | Meaning | Example |
| --- | --- | --- |
| **Feeds** | One strategy's output funds or unlocks another | Selling the prototype fills the treasury for the Rust kernel |
| **Competes** | Same goal, different bet | OpenCascade kernel vs Rust kernel |
| **Needs** | One can't start until the other delivers | Rust waits for beta revenue |

**Strategies move through these states:** *Raising → Running → Queued → Merged → Won / Dropped*.

- **Sequencing.** A good bet that needs money upfront can be **queued** behind one that brings money in sooner. It appears on the map as a dotted line and starts on its own when its trigger is hit.
- **Merge nudges, not forced merges.** When a team's fundraise stalls, or two teams overlap heavily, the agent suggests: *"Short on funds. Team up with Kernel Crew?"* Both teams vote. Their stakes combine in proportion to what each brought, and both earn a medal.
- **Shared commons.** Briefs, data and results are visible to every team on the mission. Every strategy's results count toward the checkpoint, not just the leader's.
- **Demand steers effort.** Needs with many +1s and pledges surface first, so people build less of what nobody wants. Builders can still start missions nobody asked for; they just show less demand.

## 8. The funding algorithm

Each milestone runs a **matching round**. The treasury (the matching pool) is shared across strategies using quadratic funding, extended to count more than money.

### 8.1 Signals

Every backer can back a strategy with several signals. Each signal is converted to **credits** using one table (the same one that mints tokens, in `src/game/economy.js`):

| Signal | Unit | Credits per unit | Counts when |
| --- | --- | --- | --- |
| Demand | a +1 | 1 | Straight away (verified players only) |
| Money | $1 | 1 | Straight away |
| Time | 1 hour | 50 | When the work is **approved**, not when pledged |
| Compute | 1 GPU-hour | 2 | When it is used |
| Knowledge | 1 accepted insight | 200 | When a Critic accepts it |

### 8.2 Formula

For backer $i$ on strategy $s$, sum their signals into one contribution, then weight it by trust:

$$c_{i,s} = r_i \sum_k w_k \, v_{i,s,k}$$

- $v_{i,s,k}$ is how much of signal $k$ they gave.
- $w_k$ is the credit rate from the table above.
- $r_i \in [0, 1]$ is the backer's **trust weight**: verified identity, plus a history of approved work.

Each strategy's raw quadratic score:

$$q_s = \Big(\sum_i \sqrt{c_{i,s}}\Big)^2 - \sum_i c_{i,s}$$

Its share of the pool $P$, capped at $\kappa$ (e.g. 40%) of the pool:

$$m_s = \min\!\Big(\kappa P,\; P \cdot \frac{q_s}{\sum_j q_j}\Big)$$

Any match removed by the cap is shared again among the uncapped strategies.

**Why combine signals per backer before taking the square root:** someone who gives both time and money still counts as **one** person of breadth. Signals add depth to that person's contribution, but don't multiply their headcount.

### 8.3 Worked example

A $10,000 pool and four strategies:

| Strategy | Backers | Total credits | Raw score $q$ | **Match** |
| --- | --- | ---: | ---: | ---: |
| A: one whale | 1 × $1,000 | 1,000 | 0 | **$0** |
| B: broad crowd | 100 × $10 | 1,000 | 99,000 | **$5,041** |
| C: people with the problem | 40 × $5 + 200 × (+1) | 400 | 83,377 | **$4,246** |
| D: a few builders | 8 × 5 approved hours | 2,000 | 14,000 | **$713** |

- **A and B raised the same amount**, but B's breadth earns all the match.
- **C raised the least money**, yet 200 +1s from people who have the problem pull in almost half the pool. This is demand backing at work.
- **The next $10 matters more in a crowd.** $10 from a new backer adds about **$53** of match to C, but only about **$10** to A.

### 8.4 What players see

Players never see the formula. On a strategy card:

> **$4.2k raised · 212 backers · +$9.8k match**
> Back with $10 → **$63 with match**

- The match estimate updates live as you change the amount. That alone teaches the rule: small gifts from many people go further.
- A **+1** is shown as "Adds your voice" with the same live match estimate.

### 8.5 Tuning knobs

| Knob | Default | Effect |
| --- | --- | --- |
| Credit rates $w_k$ | See 8.1 | How much each signal is worth |
| Trust weight $r_i$ | 0.2 (new) to 1.0 (proven) | How much fake accounts can game the match |
| Cap $\kappa$ | 40% | Stops one strategy taking the whole pool |
| Round length | One per milestone | How often the treasury is split again |
| Tranches | 30% on approval, the rest at checkpoints | Ties money to delivery |

## 9. Safeguards

- **Fake accounts.** One duo per verified person. New accounts start with a low trust weight, which grows with approved work. This is what makes quadratic matching safe.
- **Collusion.** Match from backers who always back the same strategies together can be dampened (pairwise-bounded QF). This is planned for later, not the demo.
- **Pledging without doing.** Time, compute and knowledge only count once delivered and approved.
- **Spam +1s.** These are cheap but trust-weighted. Early +1s only earn a reward if the mission ships.
- **Treasury drain.** Draws are paid in tranches, capped by $\kappa$, and approved by token holders.

## 10. Design principles

- **It's a game.** The look is inspired by Cuphead, in Joystick's colours and fonts (Lilita One and Lexend).
- **Show, don't explain.** Copy is short and in the style of Steve Jobs; the system is learned by playing. If a sentence explains how the system works, cut it and let the UI show it instead.
- **Personal first.** Every list starts with what fits you, and says why.
- **Mobile-first.** Primary actions sit at the bottom, within thumb reach, with 44px tap targets.
- **Real-world shape.** Parallel tracks, competing theses and messy convergence are deliberate. The game mirrors how hard problems actually get solved.

## 11. Status and roadmap

**In the demo now**

- Onboarding for new and returning players, roles, values, and three home layouts.
- Missions list with topic filters; mission page with a **graph map** (parallel tracks converging on ◆ checkpoints), strategies, treasury and brief.
- **Strategies as theses:** claim, ask, when, relations (feeds, needs, competes) and states (raising, awaiting OK, queued, merged).
- **Matching rounds:** quadratic matching with a cap, a live "about $X with match" estimate when you back a thesis, and +1 voices.
- **Two-layer ownership:** mission tokens for the problem, team stakes for the team you back, and the 5% commons fee.
- **Demand:** "+1 Me too" on every mission; the treasury shows who funds it (sponsors, crowd, people who need it, revenue).
- **Merge nudges:** the agent suggests teaming up when a squad's fundraise stalls. Squads vote; nothing is forced.
- **One Start button.** The quest loop: spend approval → your call → your agent works under your name → 2 Critics from other squads → approved, or fix / dispute. Sizes are S, M, L.
- Real-world flows: squads with skill slots, verified skills, connected tools, claims and dependencies, in-person quests with proof, notifications, and the Referees' **Final check** before a milestone clears.
- Escrow and trust details, a spending ledger, pending pay released when a milestone clears, credits and payouts.
- Creating a mission by chatting with your agent, with an escrow deposit before launch; Comms with DMs; Duo profile with wallet, stakes and medals.
- An installable PWA and a token-driven design system.

**Next**

1. **Needs as their own screen:** browse and raise needs, pledges held until delivery, and needs that become missions.
2. **Treasury draws:** token-holder votes on each tranche.
3. **Trust weights** in matching (new accounts count less until they've played).

**Later:** a backend with real accounts, real treasuries and an on-chain token ledger, plus collusion-resistant matching.

## 12. Open questions

- **What does a +1 earn?** The proposal is reputation always, plus a tiny token reward only if the mission ships.
- **Who approves treasury draws?** The proposal is a vote by mission token holders, paid out in tranches at checkpoints.
- **Credit rates.** Is an hour really worth $50 of credit everywhere, or should rates vary by mission?
- **The commons fee.** Is 5% a flat rate, or set per mission?

## 13. Developer guide

### Run it

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN, so you can open it on a phone)
npm run build      # production build in dist/
npm run preview    # serve the build at http://localhost:4173 (service worker + install prompt work here)
```

- The app is at `/`, and the living style guide is at `/design.html`.
- In dev, `window.jq` gives you the state and router for poking at screens: `jq.go("lobby")`, `jq.S`, `jq.loadReturning()`.

### Clickable prototype

`public/prototype/joystick-quest.html` is the earlier single-file design prototype, served at `/prototype/joystick-quest.html`. Everything in it has been ported into the app in `src/`; it is kept for reference only, and new work goes into `src/`.

Demo path in the app: tap "I've played before", then open "Shard C" from the Play tab and press **Start quest**.

### Design system

There is one source of truth for how things look. Change it there and every screen follows.

| Layer | File | What lives there |
| --- | --- | --- |
| Tokens | `src/design/tokens.css` | Every colour, font, line, shadow and radius as a CSS custom property |
| Base | `src/design/base.css` | Reset, app frame, type styles (`.display`, `.eyebrow`, `.muted`) |
| Components | `src/design/components.css` | Buttons, cards, chips, tabs, stats, meters, sheets, chat bubbles, nav |
| Component markup | `src/design/components.js` | `Button`, `Chip`, `Tabs`, `Stats`, `Meter`, `openSheet`, `drill`, `DetailRow`, `Tick`, … |
| Screens | `src/styles/screens.css` | Layout specific to one screen |

Rules:

- **Never write a hex colour** in CSS or JS. Use `var(--name)` in CSS, and the same string from JS (`"var(--pink)"`, or `color("pink")` from `tokens.js`). JS colours flow through the tokens too, including mission colours, avatars, medals and role colours.
- If JS needs the real value (for example to pick readable text on a fill), use `cssColor()` from `tokens.js`.
- New UI should use the component functions, not hand-written markup. Add a new component to `components.js` and `components.css`, then show it in `src/design-guide.js`.
- `/design.html` renders the real tokens and components, so it always matches the app.

### Code map

```
src/
  main.js              boot, click/submit routing, service worker
  state.js             the single state object S
  data/content.js      roles, missions (with parallel tracks), quests, medals: all mock content
  data/world.js        people, quest requirements, tools, escrow + trust, ledger, demand, values, merge nudges
  game/strategies.js   theses: status, relations, quest gating (claims, dependencies)
  game/economy.js      fuel, mission tokens, team stakes, matching pools, ledger
  game/matching.js     quadratic matching with a cap, and the live "with match" estimate
  game/questflow.js    the quest loop: start, spend, call, work, review, fix, dispute, approve
  game/personalise.js  what fits you, and why (roles, values, squad)
  ui/                  chrome (HUD, bell, nav, router) and shared helpers
  screens/             home, onboarding, play, missions (graph map, treasury), quests (channel, thesis, room),
                       sheets (every drill-down), gate (Final check), contract, comms, forge, duo
  design/              the design system (see above)
public/
  manifest.webmanifest, sw.js, icons/   PWA install + offline shell
  prototype/joystick-quest.html         earlier single-file prototype, kept for reference
```

### PWA

- `manifest.webmanifest` makes it installable ("Add to Home Screen"), standalone, portrait.
- `sw.js` caches the app shell. Built assets and fonts are cache-first; pages are network-first with an offline fallback.
- Bump `CACHE` in `sw.js` when you change what it caches.
