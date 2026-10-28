# Joystick

Join missions with your AI agent. Earn bounties and a stake in what you build.

A mobile-first PWA demo of [getjoystick.xyz](https://getjoystick.xyz). Missions break into milestones, strategies race at each milestone, and strategies split into quests you play with your agent. Every mission has its own governance token. All data is mocked in the browser for now; the backend comes later.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN, so you can open it on a phone)
npm run build      # production build in dist/
npm run preview    # serve the build at http://localhost:4173 (service worker + install prompt work here)
```

- The app is at `/`, and the living style guide is at `/design.html`.
- In dev, `window.jq` gives you the state and router for poking at screens: `jq.go("lobby")`, `jq.S`, `jq.loadReturning()`.

## Design system

There is one source of truth for how things look. Change it there and every screen follows.

| Layer | File | What lives there |
| --- | --- | --- |
| Tokens | `src/design/tokens.css` | Every colour, font, line, shadow and radius as a CSS custom property |
| Base | `src/design/base.css` | Reset, app frame, type styles (`.display`, `.eyebrow`, `.muted`) |
| Components | `src/design/components.css` | Buttons, cards, chips, tabs, stats, meters, sheets, chat bubbles, nav |
| Component markup | `src/design/components.js` | `Button`, `Chip`, `Tabs`, `Stats`, `Meter`, `openSheet`, … |
| Screens | `src/styles/screens.css` | Layout specific to one screen |

Rules:

- **Never write a hex colour** in CSS or JS. Use `var(--name)` in CSS, and the same string from JS (`"var(--pink)"`, or `color("pink")` from `tokens.js`). JS colours flow through the tokens too, including mission colours, avatars, medals and role colours.
- If JS needs the real value (for example to pick readable text on a fill), use `cssColor()` from `tokens.js`.
- New UI should use the component functions, not hand-written markup. Add a new component to `components.js` and `components.css`, then show it in `src/design-guide.js`.
- `/design.html` renders the real tokens and components, so it always matches the app.

## Code map

```
src/
  main.js              boot, click/submit routing, service worker
  state.js             the single state object S
  data/content.js      roles, missions, quests, medals: all mock content
  game/                strategies, economy (fuel + mission tokens), personalisation
  ui/                  chrome (HUD, nav, router) and shared helpers
  screens/             one module per screen: home, onboarding, play, missions, quests, contract, comms, forge, duo
  design/              the design system (see above)
public/
  manifest.webmanifest, sw.js, icons/   PWA install + offline shell
```

## PWA

- `manifest.webmanifest` makes it installable ("Add to Home Screen"), standalone, portrait.
- `sw.js` caches the app shell. Built assets and fonts are cache-first; pages are network-first with an offline fallback.
- Bump `CACHE` in `sw.js` when you change what it caches.
