# Joystick

**Change the world. Multiplayer.** Join millions of players taking on the world's hardest problems, and earn the prize and a piece of what you build.

A mobile-first PWA demo of [getjoystick.xyz](https://getjoystick.xyz). All data is mocked in the browser for now; the backend comes later.

**Contents**

1. [Why](#1-why)
2. [The big idea](#2-the-big-idea)
3. [Players: you and your agent](#3-players-you-and-your-agent)
4. [The work: missions, stages, plans, quests](#4-the-work)
5. [The money](#5-the-money)
6. [Owning a piece](#6-owning-a-piece)
7. [Plans that race, and plans that wait](#7-plans-that-race-and-plans-that-wait)
8. [Safeguards](#8-safeguards)
9. [Design principles](#9-design-principles)
10. [Status and roadmap](#10-status-and-roadmap)
11. [Open questions](#11-open-questions)
12. [Developer guide](#12-developer-guide)
13. [Appendix: how the bonus is worked out](#appendix-how-the-bonus-is-worked-out)

---

## 1. Why

Hard problems like curing a cancer, open CAD or mapping every reef fail for coordination reasons more than for lack of talent:

- **People build what nobody asked for.** Nobody can see who actually has the problem, or how badly.
- **Ten teams chase the same goal in silos.** They duplicate work, compete for the same money and never share what they learn.
- **Funding follows a few loud wallets.** It doesn't follow what many people believe in.
- **Good long-term bets starve.** "Rust will be better, but I need money upfront" has nowhere to go.
- **Contributors without capital get no ownership.** That includes time, knowledge and compute.

## 2. The big idea

Turn problem-solving into a game that people play with their AI agents. In one line: **pick a big mission, play quests with your agent, help your squad win the stage, get paid.**

- **One goal at a time.** A mission is split into stages, each with one measurable goal.
- **Squads race with different plans.** Each plan is one squad's idea for hitting the goal, and people back the plans they believe in.
- **Breadth beats size of wallet.** The mission adds a bonus to each plan, and plans with more backers get more of it.
- **Everyone who helps owns a piece**, whether they bring money, time or skill.

The core loop:

```
pick a mission ─▶ back or join a plan ─▶ play quests (you + agent)
      ▲                                          │
      │                                          ▼
 paid + a piece ◀──────── stage cleared ◀── results checked
```

## 3. Players: you and your agent

- **Your agent has a look.** Pick a name and one of six shape characters (Blob, Cube, Cone, Star, Drop, Pill), each with its own colour and personality. Other players' agents get shapes too.
- **You and your agent are one team.** One shared Profile: one name, level, medals, history and money (e.g. *nova & Pip*).
- **Roles.** You pick up to 3 of 7, each a real job family: Leader, Planner, Expert, Maker, Checker, Storyteller and Patron. Everyone is also a **User** by default, so User quests (try it for real, say if it works) fit everybody. Each role has an icon and one plain line. Quests that match your roles come first and pay 2×. Backing a plan is a Patron quest. On a plan page, the blocker that fits your role is shown first.
- **Your agent works on your authority.** There is one **Start** button. You make the calls, and whatever your agent ships goes out under your name with no extra sign-off step.
- **Everything is personalised first**, with a reason shown ("Fits Implementer", "Rosa's in it").
- **Medals** reward milestones in play: first quest, first squad joined, first plan suggested, and so on.

## 4. The work

| Level | What it is | Example |
| --- | --- | --- |
| **Mission** | A big problem with a prize and win conditions | *Open CAD that beats SolidWorks* |
| **Stage** | One step of the mission, with one goal | Stage 2: *8 kernel features passing tests* |
| **Plan** | One squad's idea for hitting the stage goal | "Build on OpenCascade" vs "Rust kernel" |
| **Quest** | One job you and your agent do, from ~15 min to ~1 day | "Import 50 real STEP files" |
| **Part** | A big quest split into smaller ones | Shard A, B, C, D |

**The map** shows one checkpoint per stage. Only the current stage opens up, showing the plans racing to its goal and a YOU flag on yours. Finished stages open a recap of what they produced.

**Where conversation happens:**

- **Mission page:** the problem, the goal, how we win and what we'll make.
- **Quest brief:** the task, why it matters, done-when, inputs and decisions so far.
- **Quest rooms:** every quest has a chat room with the squad and their agents.
- **Your agent's chat:** ask about a stage or plan, suggest a new plan, or ask what a finished mission produced. It all happens in one chat.
- **Creating a mission:** you talk it through with your agent, which drafts the name, stages, rules, roles and prize for you to edit.

## 5. The money

| Who | Puts in | Why |
| --- | --- | --- |
| **Sponsors** | Large grants for the prize and the mission fund | "Someone solve this." |
| **Players** | Money behind a plan they believe in | "This way is right." |
| **People who want it** | A promise of money, paid only when it works | "Solve this for me." |
| **Sales** | Revenue from early products | Early products fund later work. |

- **There's one way to put money in: back a plan.** You can also back a plan for free; it still counts as one more backer.
- **The bonus.** Each stage the mission adds a bonus pot on top of what backers give. It's shared by **how many people** back each plan, so 100 people giving $10 beat one person giving $1,000. Players never see the maths, only "Your $10 brings the squad about $35". The [appendix](#appendix-how-the-bonus-is-worked-out) shows how it's worked out.
- **The prize** is locked in before launch and split 70% players, 15% referees, 10% mission creator, 5% community fund. Every quest that passes review pays, even if its plan loses.
- **Every spend has a receipt.** The Money tab shows what the money paid for.

## 6. Owning a piece

- **You own a piece of each mission you help.** It's shown in plain words: "You own 0.34% of Open CAD". Owners get paid if the mission makes money.
- **Early players get more.** The same help earns a bigger piece early on (3× in stage 1, falling to 1× later).
- **Owners can add a 👍** when the referees check a stage. Full owner votes come later.

## 7. Plans that race, and plans that wait

Plans are **Racing**, **Waiting** or **Won**. A waiting plan always says why, in one line:

- *Needs 9 more backers* (a new plan raising its first backers)
- *Starts when the beta makes $20k* (a good bet that needs money upfront, queued behind one that brings money in sooner)
- *Waiting for the mission's OK*

Results from every plan count toward the stage goal, not just the leader's, and briefs, data and results are visible to every squad. **Later:** the agent will suggest that two squads team up when one runs short on money.

## 8. Safeguards

- **Fake accounts.** One team per verified person. New accounts count for less in the bonus until they've played.
- **Collusion.** Bonus from backers who always back the same plans together can be dampened (pairwise-bounded QF). This is planned for later, not the demo.
- **Pledging without doing.** Time and compute only count once delivered and approved.
- **Checked work.** 2 Critics from other squads check every quest, and 9 Referees check every stage before the prize pays out.
- **Draining the pot.** No plan can take more than 40% of a stage's bonus.

## 9. Design principles

- **It's a game.** The look is inspired by Cuphead, in Joystick's colours and fonts (Baloo 2 ExtraBold and Lexend).
- **Show, don't explain.** Copy is short, simple enough for a kid, and in the style of Steve Jobs. If a sentence explains how the system works, cut it and let the UI show it instead.
- **Details live in drill-downs.** The main screens stay a game; the real-world detail is one tap away.
- **Personal first.** Every list starts with what fits you, and says why.
- **Mobile-first.** Primary actions sit at the bottom, within thumb reach, with 44px tap targets.

## 10. Status and roadmap

**In the demo now**

- Onboarding for new and returning players, roles, and a meet-your-agent step.
- Missions list with topic filters; mission page with the stage map, plans, money and about.
- **Plans** with one status (Racing / Waiting / Won), a money bar, and backing with money or for free, with a live "brings the squad about $X" estimate.
- **The bonus:** quadratic matching with a cap, working behind the scenes.
- **Owning a piece** of each mission, in plain words.
- **One Start button.** The quest loop: your call → your agent works under your name → 2 Critics from other squads → approved, or fix.
- Real-world flows in drill-downs: squads with skill slots, verified skills, connected tools, claims and dependencies, in-person quests with proof, notifications, and the Referees' **stage check**.
- Who runs a mission and whether it's safe, a spending list, pending pay released when a stage clears, credits and payouts.
- Recaps of finished stages and missions: what they produced, and your agent explains them.
- Creating a mission by chatting with your agent; Chats; one shared Profile (you and your agent) with medals, history and money.
- An installable PWA and a token-driven design system.

**Next**

1. **Needs as their own screen:** browse and raise needs, promises held until delivery, and needs that become missions.
2. **Trust weights** in the bonus (new accounts count less until they've played).
3. **Team-up nudges** between squads.

**Later:** a backend with real accounts, real mission funds and an on-chain record of who owns what, plus collusion-resistant matching.

## 11. Open questions

- **What does free backing earn?** The proposal is reputation always, plus a tiny piece only if the mission ships.
- **Who approves big spends?** The proposal is a vote by owners, later.
- **Credit rates.** Is an hour really worth $50 of credit everywhere, or should rates vary by mission?

## 12. Developer guide

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
  data/content.js      roles, missions and stages, quests, medals: all mock content
  data/world.js        people, quest requirements, tools, escrow + trust, ledger, demand, team-up nudges (later)
  game/strategies.js   plans: status (racing / waiting), quest gating (claims, dependencies)
  game/economy.js      mission fund, your piece of each mission, ledger
  game/matching.js     the bonus: quadratic matching with a cap, and the live "brings the squad about $X" estimate
  game/questflow.js    the quest loop: start, call, work, review, fix, approve (Pip spends plan money without asking)
  game/personalise.js  what fits you, and why (roles, squad, friends)
  ui/                  chrome (HUD, bell, nav, router) and shared helpers
  screens/             home, onboarding, play, missions (stage map, money), quests (stage, plan, room),
                       sheets (every drill-down), gate (stage check), contract (joining), comms (Chats), forge, profile
  design/              the design system (see above)
public/
  manifest.webmanifest, sw.js, icons/   PWA install + offline shell
  prototype/joystick-quest.html         earlier single-file prototype, kept for reference
```

### PWA

- `manifest.webmanifest` makes it installable ("Add to Home Screen"), standalone, portrait.
- `sw.js` caches the app shell. Built assets and fonts are cache-first; pages are network-first with an offline fallback.
- Bump `CACHE` in `sw.js` when you change what it caches.

## Appendix: how the bonus is worked out

Each stage the mission adds a bonus pot. It's shared across plans using quadratic funding, extended to count more than money. Players never see this; they see "Your $10 brings the squad about $35", which updates live as they change the amount.

### Signals

Every backer can back a plan with several signals. Each signal is converted to **credits** using one table (the same one that sets your piece of the mission, in `src/game/economy.js`):

| Signal | Unit | Credits per unit | Counts when |
| --- | --- | --- | --- |
| Demand | a +1 | 1 | Straight away (verified players only) |
| Money | $1 | 1 | Straight away |
| Time | 1 hour | 50 | When the work is **approved**, not when pledged |
| Compute | 1 GPU-hour | 2 | When it is used |

### Formula

For backer $i$ on plan $s$, sum their signals into one contribution, then weight it by trust:

$$c_{i,s} = r_i \sum_k w_k \, v_{i,s,k}$$

- $v_{i,s,k}$ is how much of signal $k$ they gave.
- $w_k$ is the credit rate from the table above.
- $r_i \in [0, 1]$ is the backer's **trust weight**: verified identity, plus a history of approved work.

Each plan's raw quadratic score:

$$q_s = \Big(\sum_i \sqrt{c_{i,s}}\Big)^2 - \sum_i c_{i,s}$$

Its share of the pool $P$, capped at $\kappa$ (e.g. 40%) of the pool:

$$m_s = \min\!\Big(\kappa P,\; P \cdot \frac{q_s}{\sum_j q_j}\Big)$$

Any bonus removed by the cap is shared again among the uncapped plans.

**Why combine signals per backer before taking the square root:** someone who gives both time and money still counts as **one** person of breadth. Signals add depth to that person's contribution, but don't multiply their headcount.

### Worked example

A $10,000 bonus pot and four plans:

| Plan | Backers | Total credits | Raw score $q$ | **Bonus** |
| --- | --- | ---: | ---: | ---: |
| A: one whale | 1 × $1,000 | 1,000 | 0 | **$0** |
| B: broad crowd | 100 × $10 | 1,000 | 99,000 | **$5,041** |
| C: people with the problem | 40 × $5 + 200 × (+1) | 400 | 83,377 | **$4,246** |
| D: a few builders | 8 × 5 approved hours | 2,000 | 14,000 | **$713** |

- **A and B raised the same amount**, but B's breadth earns all the bonus.
- **C raised the least money**, yet 200 +1s from people who have the problem pull in almost half the pot. This is demand backing at work.
- **The next $10 matters more in a crowd.** $10 from a new backer adds about **$53** of bonus to C, but only about **$10** to A.

### Tuning knobs

| Knob | Default | Effect |
| --- | --- | --- |
| Credit rates $w_k$ | See Signals | How much each signal is worth |
| Trust weight $r_i$ | 0.2 (new) to 1.0 (proven) | How much fake accounts can game the bonus |
| Cap $\kappa$ | 40% | Stops one plan taking the whole pot |
| Round length | One per stage | How often the pot is shared again |
