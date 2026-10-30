import { ROLES, missions } from "../data/content.js";
import { homeDeck } from "../screens/home.js";
import { SHAPES, bot, esc, fmt, glyph, mono } from "../ui/helpers.js";
import "./onboarding.css";

let originalLanding;
export function landingView() {
  originalLanding ||= homeDeck()
    .replace('data-a="ob-next"', 'data-entry="signup"')
    .replace('data-a="returning"', 'data-entry="login"')
    .replace('<a class="linkbtn" href="/chat.html">Sign in &amp; chat</a>', '');
  return originalLanding;
}

const dots = step => `<div class="dots" aria-label="Step ${step} of 4">${[1, 2, 3, 4].map(i => `<i class="${i <= step ? "on" : ""}"></i>`).join("")}</div>`;
const action = (label, name, disabled = false) => `<button type="button" class="btn red block" data-live="${name}" ${disabled ? "disabled" : ""}>${label}</button>`;
const footer = (step, label, name, disabled = false) => `<div class="sticky-cta">${dots(step)}${action(label, name, disabled)}${step > 2 ? '<div class="onboard-options"><button type="button" class="linkbtn" data-live="onboard-prev">Back</button></div>' : ""}</div>`;

function roleStep(o) {
  const roles = Object.entries(ROLES).filter(([, r]) => !r.auto);
  return `<div class="onboard live-onboard">
    <div><h1 class="display">What are you great at?</h1><div class="eyebrow">Pick up to three</div></div>
    <div class="role-grid ${o.roles.length >= 3 ? "full" : ""}">${roles.map(([id, role]) => `<button type="button" class="role" data-live="onboard-role" data-id="${id}" aria-pressed="${o.roles.includes(id)}">${mono(id, 44)}<span><b>${esc(role.name)}</b><span class="muted">${esc(role.does)}</span></span></button>`).join("")}</div>
    ${footer(2, o.roles.length ? `That's me · ${o.roles.length}/3` : "Tap 1 to 3", "onboard-next", !o.roles.length)}
  </div>`;
}

function agentStep(o, name) {
  const shape = SHAPES[o.botShape] || SHAPES.blob;
  return `<div class="onboard meet live-onboard">
    <h1 class="display">Meet your agent.</h1>
    <div class="meet-stage"><div class="say">Hi! I'm <b data-botname>${esc(o.agentName)}</b>. ${esc(shape.line)}. You call the shots, I do the legwork.</div><div class="meet-pod"><span class="av bounce meet-bot">${bot(o.botShape, true)}</span><div class="podium"></div></div></div>
    <div class="field nameplate"><label for="onboard-agent-name">Name it</label><input class="inp" id="onboard-agent-name" name="agentName" value="${esc(o.agentName)}" maxlength="60" autocomplete="off"></div>
    <div class="chips wrap">${["Pip", "Bolt", "Sprout", "Mochi", "Rex"].map(n => `<button type="button" class="chip" data-live="onboard-name" data-id="${n}" aria-pressed="${o.agentName === n}">${n}</button>`).join("")}</div>
    <div class="field"><label>Pick a look</label><div class="shapes">${Object.entries(SHAPES).map(([id, sh]) => `<button type="button" class="shape-pick" data-live="onboard-shape" data-id="${id}" aria-pressed="${o.botShape === id}" aria-label="${esc(sh.name)}: ${esc(sh.line)}"><span class="av">${bot(id)}</span><b>${esc(sh.name)}</b></button>`).join("")}</div></div>
    <div class="perks">${[["⚙", "Does the legwork", "Research, code, outreach"], ["✎", "Learns your calls", "Asks you on the big ones"], ["✓", "Works for you", "Ships under your name"]].map(([icon, title, detail]) => `<div class="perk"><span class="perk-i">${icon}</span><b>${title}</b><span>${detail}</span></div>`).join("")}</div>
    <p class="small muted">${esc(name || "You")} and ${esc(o.agentName)} can change these choices later.</p>
    ${footer(3, `Team up with <span data-botname>${esc(o.agentName)}</span>`, "onboard-next")}
  </div>`;
}

function missionStep(o, catalog) {
  const available = catalog || missions;
  const topics = ["All", ...new Set(available.map(m => m.tag))];
  const topic = o.topic || "All";
  const fit = m => (m.quests || []).filter(q => q.state === "open" && q.role && (o.roles.includes(q.role) || ROLES[q.role]?.auto)).length;
  const shown = available.filter(m => topic === "All" || m.tag === topic).sort((a, b) => fit(b) - fit(a));
  return `<div class="onboard live-onboard">
    <div><h1 class="display">What do you care about?</h1><div class="eyebrow">Pick as many as you like</div></div>
    <div class="chips ob-topics">${topics.map(t => `<button type="button" class="chip" data-live="onboard-topic" data-id="${esc(t)}" aria-pressed="${topic === t}">${esc(t)}</button>`).join("")}</div>
    <div class="list">${shown.map(m => `<button type="button" class="card pickm" data-live="onboard-pick" data-id="${esc(m.id)}" aria-pressed="${o.picks.includes(m.id)}"><span class="band" style="background:${esc(m.color)}">${glyph(m)}<b>${esc(m.title)}</b></span><span class="pick-body"><span class="small"><b>$${fmt(m.bounty || 0)}</b> bounty · ${Number(m.players || 0).toLocaleString()} playing</span>${fit(m) ? `<span class="fit">${fit(m)} task${fit(m) === 1 ? "" : "s"} fit your style</span>` : ""}<span class="pick-tick">${o.picks.includes(m.id) ? "✓ Joined" : "+ Join"}</span></span></button>`).join("")}</div>
    ${footer(4, o.picks.length ? "Let's play" : "Pick one", "onboard-finish", !o.picks.length)}
  </div>`;
}

export function onboardingView(o, name, catalog) {
  return o.step === 1 ? agentStep(o, name) : o.step === 2 ? missionStep(o, catalog) : roleStep(o);
}
