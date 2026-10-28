import "./design/tokens.css";
import "./design/base.css";
import "./design/components.css";
import "./styles/screens.css";
import { ROLES, roleColor } from "./data/content.js";
import { Button, Chip, CloseButton, DetailGroup, DetailRow, Eyebrow, Meter, Stats, Tabs, Tick, drill, openSheet } from "./design/components.js";
import { allTokens } from "./design/tokens.js";
import { botAv, mono, youAv } from "./ui/helpers.js";

// Living style guide: renders the real tokens and components, so it can't drift from the app.

const tokens = allTokens();
const isColor = v => /^#|^var\(--|^rgba?\(/.test(v) && !/solid|px/.test(v);
const section = (title, body) => `<section class="card g-sec"><h2 class="sec-title">${title}</h2>${body}</section>`;

const swatches = tokens.filter(([, v]) => isColor(v)).map(([k]) =>
  `<div class="g-sw"><span style="background:var(${k})"></span><b>${k}</b><code>${getComputedStyle(document.documentElement).getPropertyValue(k).trim()}</code></div>`).join("");

const fonts = tokens.filter(([k]) => ["--display", "--body", "--sign"].includes(k)).map(([k]) =>
  `<div class="g-row"><code>${k}</code><span style="font-family:var(${k});font-size:24px;color:var(--navy)">Cure Glioblastoma</span></div>`).join("");

const lines = tokens.filter(([k]) => /^--(line|pop|wob|r-)/.test(k)).map(([k, v]) => {
  const css = k.startsWith("--line") ? `border:var(${k})` : k.startsWith("--pop") ? `border:var(--line-2);box-shadow:var(${k})` : `border:var(--line-2);border-radius:var(${k})`;
  return `<div class="g-row"><span class="g-box" style="${css}"></span><code>${k}</code><span class="small muted">${v}</span></div>`;
}).join("");

const ui = [
  [Eyebrow("Buttons"), `<div class="row wrap">${Button("Join mission", { variant: "red" })}${Button("Play #simulate", { variant: "blue" })}${Button("Back it", { variant: "gold" })}${Button("Details")}</div>
    <div class="row wrap">${Button("+ New", { size: "sm" })}${Button("Start", { variant: "red", size: "sm" })}${Button("Disabled", { variant: "red", disabled: true })}</div>`],
  [Eyebrow("Chips"), `<div class="row wrap">${Chip("Planet")}${Chip("2 quests fit you", { tone: "fitchip" })}${Chip("All", { action: "x", pressed: true })}${Chip("Science", { action: "x", pressed: false })}<span class="chip" style="background:var(--navy);color:var(--white)">$GLIO ×1.5</span></div>`],
  [Eyebrow("Tabs"), Tabs([["map", "Map"], ["s", "Strategies"], ["t", "Treasury"], ["b", "Brief"]], "map", "x")],
  [Eyebrow("Stats"), Stats([["$250k", "bounty"], ["3/5", "milestone"], ["1.3k", "playing"]])],
  [Eyebrow("Meter"), Meter(64)],
  [Eyebrow("Avatars + roles"), `<div class="row wrap">${youAv()}${botAv()}${["implementer", "critic", "strategist", "connector"].map(k => mono(k, 32)).join("")}${["implementer", "critic"].map(k => `<span class="rtag" style="background:${roleColor(k)}">${ROLES[k].name}</span>`).join("")}</div>`],
  [Eyebrow("Detail rows"), DetailGroup([DetailRow(Tick(1), "Dr. Amara Osei", "Neuro-oncologist · verified by ORCID"), DetailRow(Tick(0, "✓", "!"), "Identity", "Needed once before your first withdrawal", Button("Verify", { size: "sm" })), DetailRow("$", "GPU rental · shards A–B", "Fold Gang · 2h ago", "<b>$1.2k</b>")])],
  [Eyebrow("Value tags"), `<div class="row wrap">${Chip("Holistic", { tone: "vtag mine" })}${Chip("Open science", { tone: "vtag" })}${Chip("✓ Escrow · verified", { tone: "trust", action: "x" })}</div>`],
  [Eyebrow("Match estimate"), `<div class="estimate"><span>$10 now</span><b>→ about $43 with match</b></div>`],
  [Eyebrow("Sheets"), `<div class="row wrap">${Button("Open a sheet", { variant: "blue", "data-demo": "sheet" })}${Button("Open a drill-down", { "data-demo": "drill" })}</div>`],
];

document.getElementById("guide").innerHTML = `
  <header class="g-head"><div class="logo">Joystick</div><p class="muted">Design system. Edit <code>src/design/tokens.css</code> and every screen updates.</p></header>
  ${section("Colour", `<div class="g-grid">${swatches}</div>`)}
  ${section("Type", fonts)}
  ${section("Lines, shadows, shape", lines)}
  ${section("Components", ui.map(([h, b]) => `<div class="g-ui">${h}${b}</div>`).join(""))}
`;
document.addEventListener("click", e => {
  if (e.target.closest("[data-demo=drill]")) return drill("Can I trust it?", DetailGroup([DetailRow(Tick(1), "$250k in escrow", "Locked before launch. Paid out only as milestones clear."), DetailRow("★", "Track record", "2 missions run · 1 won")]), "Drill-downs hold real-world detail");
  if (e.target.closest("[data-a=dclose]")) return document.querySelectorAll(".dd").forEach(x => x.remove());
  if (!e.target.closest("[data-demo=sheet]")) return;
  openSheet({ label: "Demo", render: () => `<div class="grab"></div><div class="row"><h2 class="display" style="font-size:22px">A bottom sheet</h2><span class="spacer"></span>${CloseButton()}</div><p>Tap outside or ✕ to close.</p>${Button("Done", { variant: "red", block: true, "data-close": true })}` });
});

const style = document.createElement("style");
style.textContent = `
  .guide { overflow-y: auto; height: auto; min-height: 100%; }
  #guide { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; display: flex; flex-direction: column; gap: 18px; }
  .g-head { display: flex; flex-direction: column; gap: 8px; }
  .g-sec { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .g-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  .g-sw { display: grid; grid-template-columns: 34px 1fr; gap: 0 8px; align-items: center; font-size: 12px; }
  .g-sw span { grid-row: span 2; width: 34px; height: 34px; border-radius: 10px; border: var(--line-1); }
  .g-sw code { color: var(--ink-2); font-size: 11px; }
  .g-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .g-box { width: 56px; height: 34px; background: var(--card); display: inline-block; }
  .g-ui { display: flex; flex-direction: column; gap: 8px; }
`;
document.head.appendChild(style);
