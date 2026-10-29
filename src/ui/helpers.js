import { GLYPHS, ROLES, missions, roleColor } from "../data/content.js";
import { color, cssColor } from "../design/tokens.js";
import { seedRoom } from "../screens/quests.js";
import { S, threads } from "../state.js";
import { go, renderHud } from "./chrome.js";

// ===================== Helpers =====================
export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = n => n >= 1000 ? (n >= 100000 ? Math.round(n / 1000) + "k" : (n / 1000).toFixed(n % 1000 ? 1 : 0) + "k") : String(n);
export const mission = (id = S.missionId) => missions.find(m => m.id === id);
export const findQuest = id => { for (const m of missions) { const q = m.quests.find(x => x.id === id); if (q) return [q, m]; } return []; };
export const duoName = () => `${S.name || "You"} & ${S.agentName}`;
export const thread = id => threads.find(t => t.id === id);

export function pie(cx, cy) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="2.9" ry="4.4" fill="var(--ink)"/><path d="M${cx} ${cy - .6} L${cx + 3} ${cy - 3.2} L${cx + 3} ${cy - .2} Z" fill="var(--white)"/>`;
}
// Rubber-hose face for people
export function face(color, i = 0) {
  const hair = ['<path d="M8 10c3-6 17-6 20 0" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>',
                '<path d="M18 4c-2 3 1 4 0 7" stroke="var(--ink)" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
                '<path d="M9 12c2-7 16-8 19-1-5-2-12-2-19 1z" fill="var(--ink)"/>'][i % 3];
  return `<svg viewBox="0 0 36 36"><circle cx="18" cy="19" r="14" fill="${color}" stroke="var(--ink)" stroke-width="2.6"/>${hair}${pie(13.5, 18)}${pie(22.5, 18)}<path d="M11 24c4 5 10 5 14 0" stroke="var(--ink)" stroke-width="2.4" fill="var(--white)" stroke-linejoin="round"/></svg>`;
}
// Agent companions: flat geometric characters, each with its own shape and colour
const starPts = () => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6.6 : 13.5; return `${(18 + r * Math.cos(a)).toFixed(1)},${(19 + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
export const SHAPES = {
  blob:  { name: "Blob",  line: "Calm and careful",  color: "var(--sky)",   eye: 18,   body: c => `<path d="M18 6c8 0 13 5.5 13 13 0 7-5 11-13 11S5 26 5 19C5 11.5 10 6 18 6z" fill="${c}"/>` },
  cube:  { name: "Cube",  line: "Steady and tidy",   color: "var(--gold)",  eye: 18,   body: c => `<rect x="6" y="8" width="24" height="22" rx="7" fill="${c}"/>` },
  cone:  { name: "Cone",  line: "Sharp and curious", color: "var(--leaf)",  eye: 21,   body: c => `<path d="M18 5c1.4 0 2.4.8 3.2 2.2l9.4 17.6c1.3 2.6-.3 5.2-3.2 5.2H8.6c-2.9 0-4.5-2.6-3.2-5.2l9.4-17.6C15.6 5.8 16.6 5 18 5z" fill="${c}"/>` },
  star:  { name: "Star",  line: "Bright and bold",   color: "var(--pink)",  eye: 18.5, body: c => `<polygon points="${starPts()}" fill="${c}" stroke="${c}" stroke-width="3.5" stroke-linejoin="round"/>` },
  drop:  { name: "Drop",  line: "Quick and clever",  color: "var(--coral)", eye: 21,   body: c => `<path d="M18 4c5 6 12 11 12 17a12 12 0 0 1-24 0C6 15 13 10 18 4z" fill="${c}"/>` },
  pill:  { name: "Pill",  line: "Chill and helpful", color: "var(--lilac)", eye: 15.5, body: c => `<rect x="9" y="4" width="18" height="27" rx="9" fill="${c}"/>` },
};
// Your own agent passes a shape key; other players' agents get a stable shape from whatever identifies them
const shapeKey = k => SHAPES[k] ? k : Object.keys(SHAPES)[[...String(k || "")].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % 6];
export function bot(shape = "blob", big = false) {
  const sh = SHAPES[shapeKey(shape)], y = sh.eye;
  const eye = x => `<ellipse cx="${x}" cy="${y}" rx="1.9" ry="2.5" fill="var(--ink)"/><circle cx="${x + .6}" cy="${y - .9}" r=".6" fill="var(--white)"/>`;
  const cheeks = big ? `<ellipse cx="11.5" cy="${y + 3.2}" rx="1.8" ry="1.1" fill="var(--white)" opacity=".45"/><ellipse cx="24.5" cy="${y + 3.2}" rx="1.8" ry="1.1" fill="var(--white)" opacity=".45"/>` : "";
  return `<svg viewBox="0 0 36 36"><ellipse cx="18" cy="34" rx="9" ry="1.6" fill="var(--ink)" opacity=".14"/>${sh.body(sh.color)}<ellipse cx="12.5" cy="${y - 6}" rx="3" ry="1.8" fill="var(--white)" opacity=".4" transform="rotate(-25 12.5 ${y - 6})"/>${cheeks}${eye(14.5)}${eye(21.5)}<path d="M16 ${y + 4}q2 1.6 4 0" stroke="var(--ink)" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
}
export const youColor = "var(--gold)";
export const youAv = (cls = "av") => `<span class="${cls}">${face(youColor, 2)}</span>`;
export const botAv = (cls = "av", big = false) => `<span class="${cls}">${bot(S.botShape, big)}</span>`;
// Ink or white, whichever reads better on a fill
export const textOn = color => {
  const hex = cssColor(color);
  const L = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((a, c, i) => a + c * [.2126, .7152, .0722][i], 0);
  return 1.05 / (L + .05) >= (L + .05) / .0605 ? "var(--white)" : "var(--ink)";
};
export const glyph = m => `<div class="glyph"><svg viewBox="0 0 32 32">${GLYPHS[m.glyph]}</svg></div>`;
export const pips = m => `<div class="pips">${m.stages.map((_, i) => `<i class="${i < m.current ? "done" : i === m.current ? "now" : ""}"></i>`).join("")}</div>`;
export const mono = (k, size = 30) => `<span class="mono" style="background:${roleColor(k)};width:${size}px;height:${size}px" title="${ROLES[k].name}"><svg viewBox="0 0 24 24" width="${Math.round(size * .6)}" height="${Math.round(size * .6)}" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ROLES[k].icon}</svg></span>`;
export const backBtn = (a, x = "", label = "Back") => `<button class="back" data-a="${a}" data-x="${x}" aria-label="${label}"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3 5 9l6 6"/></svg></button>`;

export function toast(html) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "toast"; t.innerHTML = html;
  $("#app").appendChild(t);
  setTimeout(() => t.remove(), 2300);
}
export const cardQ = [];
export function titleCard(top, big, sub, then, ms = 1500, art = "") {
  cardQ.push({ top, big, sub, then, ms, art });
  if (cardQ.length === 1) showCard();
}
export function showCard() {
  const c = cardQ[0];
  if (!c) return;
  const el = document.createElement("div");
  el.className = "titlecard";
  el.innerHTML = `${c.top ? `<div class="top">${c.top}</div>` : ""}${c.art || ""}<div class="cup big" style="${c.art ? "font-size:44px" : ""}">${c.big}</div>${c.sub ? `<div class="sub">${c.sub}</div>` : ""}<div class="tap">tap to continue</div>`;
  $("#app").appendChild(el);
  let done = false;
  const close = () => { if (done) return; done = true; el.remove(); cardQ.shift(); c.then && c.then(); showCard(); };
  el.addEventListener("click", close);
  setTimeout(close, c.ms);
}
export function gain(xp, coins = 0) {
  S.xp += xp; S.coins += coins;
  // Defer so a quest's own moment (KNOCKOUT, etc.) plays first
  while (S.xp >= S.xpMax) { S.xp -= S.xpMax; S.level++; S.xpMax = Math.round(S.xpMax * 1.25); const lv = S.level; setTimeout(() => titleCard("Level up", `LV ${lv}!`, esc(duoName()), null, 1400), 50); }
  renderHud();
}
export function learn(text) {
  if (!S.learned.includes(text)) S.learned.unshift(text);
  if (S.learned.length > 8) S.learned.pop();
}

// A returning player, for demoing the "already playing" experience
export function loadReturning() {
  Object.assign(S, { name: "nova", agentName: "Pip", roles: ["builder", "checker", "planner"], level: 9, xp: 1450, xpMax: 2600, coins: 1240, together: 14, shipped: 9, botShape: "cube", lobbyTab: "mine" });
  S.badges = ["spark", "squad", "sync", "slayer", "gate"];
  S.wallet = { shares: { glio: 1240, cad: 410 }, timeCredits: 46, insights: 18, pending: 90 };
  S.stakes = { "glio-dock": 100 };
  S.values = ["Open science", "Holistic"];
  S.squad = "Fold Gang";
  S.skills = [["Python", "verified · GitHub"], ["Docking (Vina)", "verified · 4 quests"], ["Statistics", "self-reported"]];
  S.tools = { "GitHub": true, "Shared drive": true, "GPU pool": true, "ORCID": false };
  S.credits = [{ m: "glio", what: "Curate a 1M compound library", out: "zinc-1m.sdf" }, { m: "glio", what: "Verify docking results · batch 2", out: "review-batch-2.md" }, { m: "cad", what: "Fix tolerance on sketch arcs", out: "PR #61" }];
  S.notifs = [
    { text: "Pip needs your call: recruit a medicinal chemist", q: "g4", when: "6h ago" },
    { text: "Mo claimed “Train a generator on known EGFR inhibitors”", q: "g9", when: "9h ago" },
    { text: "Your review of “Verify docking · batch 2” was upheld", when: "1d ago", read: true },
    { text: "Bonus round ends in 2 days", when: "1d ago", read: true },
  ];
  S.backed = { glio: "glio-dock" }; S.contrib = { "glio-dock": 2 };
  S.learned = ["Prefers open-source tools", "Docking engine → “Run both and compare”", "Likes plain, factual progress posts"];
  S.joined = { glio: ["builder", "checker"], cad: ["builder", "planner"] };
  missions[0].unread = 4; missions[1].unread = 2;
  // Pip ran a quest overnight and is waiting on one call
  const [q, m] = findQuest("g4");
  seedRoom(q).push({ me: true, text: "@Pip let's go" }, { agent: true, text: "I'll do the prep. The real-world part is yours.", run: "g4", phase: 1, p: 1, log: q.log[1] }, { agent: true, call: "g4", text: q.call.q });
  q.state = "call"; q.mode = "together";
  threads.splice(1, 0, { id: "sq-glio", kind: "squad", mission: "glio", title: "Your squad · Cure Glioblastoma", unread: 2, msgs: [{ who: "Rosa", color: "var(--pink)", text: "Part 3 tonight? Kenji's in." }, { who: "Dot", owner: "Rosa", color: "var(--pink)", bot: true, text: "GPUs reserved for 9pm." }] });
  go("lobby");
}

// Add or remove k from a list, capped at max
export const toggle = (arr, k, max = 99) => arr.includes(k) ? arr.filter(x => x !== k) : arr.length >= max ? arr : [...arr, k];
