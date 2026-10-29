import { TRUST } from "../data/world.js";
import { GLYPHS, Q, ROLES, SPLIT, award, missions, roleColor } from "../data/content.js";
import { color } from "../design/tokens.js";
import { msgHTML } from "./comms.js";
import { lobby } from "./missions.js";
import { S } from "../state.js";
import { go, render } from "../ui/chrome.js";
import { backBtn, botAv, esc, fmt, gain, glyph, mission, titleCard } from "../ui/helpers.js";

// ===================== Forge: create a mission by chatting =====================
export const FORGE_PRESETS = {
  "Build a product": { title: "Open-source note app for doctors", pitch: "A fast, private note app that doctors actually prefer over their hospital system.", stages: ["Interview users", "Prototype", "Private beta", "1,000 doctors"], rules: ["1,000 doctors use it weekly", "Passes a security audit", "Code is open source", "Net Promoter Score above 50"], roles: ["shaper", "explorer", "artisan", "implementer", "critic", "campaigner"] },
  "Solve a science problem": { title: "Make insulin cost $5", pitch: "An open recipe and process to make insulin for $5 a vial.", stages: ["Literature map", "Process design", "Lab batch", "Regulatory path"], rules: ["Lab batch matches reference insulin", "Cost model under $5 per vial", "Protocol published openly", "Reproduced by 2 labs"], roles: ["explorer", "investigator", "technician", "critic", "patron"] },
  "Help a community": { title: "Every food bank in Lagos online", pitch: "Food banks can list stock and families can find food in under a minute.", stages: ["Map food banks", "Simple app", "Pilot 10 banks", "Citywide"], rules: ["100 food banks listed", "Families find food in under 60 seconds", "Works on feature phones"], roles: ["explorer", "artisan", "implementer", "connector"] },
  "Fix something for the planet": { title: "Find every methane leak in Texas", pitch: "Spot methane leaks from satellite data and get them fixed.", stages: ["Data", "Leak model", "Field checks", "Leaks fixed"], rules: ["Model finds 80% of known leaks", "50 leaks confirmed in the field", "Open public map"], roles: ["investigator", "implementer", "technician", "campaigner"] },
};
export function forgeStart() {
  S.forge = { step: 0, title: "", pitch: "", stages: [], rules: [], ruleOpts: [], roles: [], bounty: 5000, msgs: [
    { agent: true, text: `What do you want to change?`, form: "kind" },
  ]};
  go("forge");
}
export function forgeScreen() {
  const f = S.forge;
  return `<div class="chat">
    <div class="chat-head">${backBtn("back", "", "Leave the forge")}${botAv("av")}<div><div class="display" style="font-size:15px">New mission</div><div class="typed small muted">with ${esc(S.agentName)}</div></div></div>
    <div class="msgs" id="msgs">${f.msgs.map(msgHTML).join("")}</div>
    ${f.step === 0 && !f.msgs.some(x => x.typing) ? `<div class="quick wrap">${Object.keys(FORGE_PRESETS).map(k => `<button class="chip" data-a="f-kind" data-x="${k}">${k}</button>`).join("")}</div>` : ""}
    <form class="composer" id="forgeComposer"><input id="fsay" placeholder="${["Or say it in your words…", "New name…", "Add a stage…", "Add a rule…", "Anything else?", "Anything else?"][f.step]}" autocomplete="off"><button class="btn sm red" type="submit">Send</button></form>
  </div>`;
}
export function forgeCard(kind) {
  const f = S.forge;
  const live = { kind: 0, name: 1, stages: 2, rules: 3, team: 4, launch: 5 }[kind] === f.step;
  const dis = live ? "" : "disabled";
  if (kind === "kind") return "";
  if (kind === "name") return `<div class="form-card">
      <div class="field"><label for="ftitle">Mission name</label><input class="inp" id="ftitle" value="${esc(f.title)}" ${dis}></div>
      <div class="field"><label for="fpitch">The win</label><textarea class="inp" id="fpitch" ${dis}>${esc(f.pitch)}</textarea></div>
      ${live ? `<button class="btn sm red" data-a="f-next">Looks good</button>` : ""}</div>`;
  if (kind === "stages") return `<div class="form-card">
      ${f.stages.map((s, i) => `<div class="ed"><span class="num" style="width:26px;height:26px;font-size:11px">${i === f.stages.length - 1 ? "★" : i + 1}</span><input id="fs${i}" data-fs="${i}" value="${esc(s)}" ${dis} aria-label="Stage ${i + 1}">${live && f.stages.length > 2 ? `<button class="x" data-a="f-delstage" data-x="${i}" aria-label="Remove stage">✕</button>` : ""}</div>`).join("")}
      ${live ? `<div class="row"><button class="btn sm" data-a="f-addstage">+ Stage</button><span class="spacer"></span><button class="btn sm red" data-a="f-next">Lock them</button></div>` : ""}</div>`;
  if (kind === "rules") return `<div class="form-card"><div class="mini-roles">${f.ruleOpts.map((r, i) => `<button data-a="f-rule" data-x="${i}" aria-pressed="${f.rules.includes(r)}" ${dis}>${esc(r)}</button>`).join("")}</div>
      ${live ? `<button class="btn sm red" data-a="f-next" ${f.rules.length ? "" : "disabled"}>These are the rules</button>` : ""}</div>`;
  if (kind === "team") return `<div class="form-card"><div class="eyebrow">Roles</div>
      <div class="mini-roles">${Object.entries(ROLES).map(([k, r]) => `<button data-a="f-role" data-x="${k}" aria-pressed="${f.roles.includes(k)}" ${dis}>${r.name}</button>`).join("")}</div>
      <div class="eyebrow">Bounty</div>
      <div class="amounts">${[1000, 5000, 25000, 100000].map(a => `<button data-a="f-amt" data-x="${a}" aria-pressed="${f.bounty === a}" ${dis}>$${fmt(a)}</button>`).join("")}</div>
      ${live ? `<button class="btn sm red" data-a="f-next">Ready</button>` : ""}</div>`;
  if (kind === "launch") return `<div class="form-card"><div class="card poster" style="box-shadow:2px 2px 0 var(--ink)">
      <div class="band" style="background:var(--pink)"><div class="glyph"><svg viewBox="0 0 32 32">${GLYPHS.star}</svg></div><h3>${esc(f.title)}</h3></div>
      <div class="body"><p class="small">${esc(f.pitch)}</p><div class="eyebrow">${f.stages.length} stages · ${f.rules.length} win rules · $${fmt(f.bounty)} bounty</div>
      <div class="row wrap" style="gap:4px">${f.roles.map(r => `<span class="rtag" style="background:${roleColor(r)}">${ROLES[r].name}</span>`).join("")}</div></div></div>
      <div class="dgroup" style="box-shadow:var(--pop-sm)">
        <div class="drow"><span class="${f.funded ? "ok" : "no"}">${f.funded ? "✓" : "!"}</span><span><b>Escrow</b><span class="small muted" style="display:block">${f.funded ? `$${fmt(f.bounty)} locked. Paid out only as stages clear.` : `Lock $${fmt(f.bounty)} so players know it's real.`}</span></span>${f.funded || !live ? "<span></span>" : `<button class="btn sm gold" data-a="f-fund">Deposit</button>`}</div>
        <div class="drow"><span class="${f.funded ? "ok" : "muted"}">${f.funded ? "✓" : "○"}</span><span><b>Safety check</b><span class="small muted" style="display:block">${f.funded ? "Auto-check passed · no harm or dual-use flags" : "Runs after the deposit"}</span></span><span></span></div>
      </div>
      ${live ? `<button class="btn red block" data-a="f-launch" ${f.funded ? "" : "disabled"}>${f.funded ? "Launch" : "Deposit to launch"}</button>` : ""}</div>`;
  return "";
}
export function forgeSay(text, form, delay = 700) {
  const f = S.forge;
  f.msgs.push({ typing: true }); render();
  setTimeout(() => { f.msgs = f.msgs.filter(m => !m.typing); f.msgs.push({ agent: true, text, form }); render(); }, delay);
}
export function forgeKind(kind, custom) {
  const f = S.forge, p = FORGE_PRESETS[kind] || FORGE_PRESETS["Build a product"];
  f.msgs.push({ me: true, text: custom || kind });
  f.title = custom ? custom.replace(/^(i want to|let's|lets)\s+/i, "").replace(/^./, c => c.toUpperCase()).slice(0, 60) : p.title;
  f.pitch = custom ? `Squads and their agents work together until “${f.title}” is real.` : p.pitch;
  f.stages = [...p.stages]; f.ruleOpts = [...p.rules]; f.rules = p.rules.slice(0, 2); f.roles = [...p.roles];
  f.step = 1;
  forgeSay("First cut. Change anything.", "name");
}
export function forgeNext() {
  const f = S.forge;
  const lines = ["", "Your stages. Last one's the boss.", "How do we know you won?", "Who do you need? What's the bounty?", "Ready."];
  const forms = ["", "stages", "rules", "team", "launch"];
  const i = f.step;
  f.msgs.push({ me: true, text: ["", "Looks good", "Lock them", "These are the rules", "Ready"][i] });
  f.step++;
  forgeSay(lines[i], forms[i]);
}
export function forgeText(text) {
  const f = S.forge;
  if (f.step === 0) return forgeKind(null, text);
  f.msgs.push({ me: true, text });
  if (f.step === 1) { f.title = text.slice(0, 60); return forgeSay(`“${f.title}”. Nice.`); }
  if (f.step === 2) { f.stages.splice(f.stages.length - 1, 0, text.slice(0, 40)); return forgeSay(`Added “${text}”.`); }
  if (f.step === 3) { f.ruleOpts.push(text); f.rules.push(text); return forgeSay(`Added. Referees will check it.`); }
  forgeSay("Got it.");
}
export function forgeLaunch() {
  const f = S.forge, id = "m" + Date.now();
  const stages = f.stages.filter(s => s.trim()).map((s, i, a) => ({ name: s.trim(), goal: s.trim(), finish: i === a.length - 1, tracks: i === a.length - 1 ? ["Launch"] : ["Research", "Build"] }));
  missions.unshift({
    id, title: f.title || "Untitled mission", tag: "Product", glyph: "star", color: "var(--pink)",
    creator: "@" + (S.name || "you"), bounty: f.bounty, players: 1, squads: 1, pitch: f.pitch,
    current: 0, stages, rules: f.rules, split: SPLIT,
    quests: [
      Q(id + "a", "Recruit the first squad", "connector", "S", 150, 10, ["posting to the lobby…", "6 duos interested", "first squad formed ✓"], { q: "Who do we invite first?", opts: ["Implementers", "Investigators", "Anyone keen"] }),
      Q(id + "b", `Split “${stages[0].name}” into quests`, "strategist", "S", 150, 10, ["reading the stage…", "7 quests drafted", "quest board live ✓"], { q: "How big should quests be?", opts: ["Lots of small ones", "A few big ones"] }),
      Q(id + "c", `Kick off ${stages[0].name}`, "explorer", "M", 260, 20, ["researching…", "notes drafted", "posted to HQ ✓"], { q: "Where do we start?", opts: ["What exists already", "Talk to people first"] }),
    ],
  });
  TRUST[id] = { who: "@" + (S.name || "you"), cred: "Mission creator", verified: ["Email"], funders: [["@" + (S.name || "you"), f.bounty]], record: "First mission", safety: "Auto-check passed", deliver: f.rules, fail: "Unspent escrow goes back to you. Approved work stays paid." };
  S.joined[id] = ["shaper", ...S.roles.filter(r => r !== "shaper")].slice(0, 3);
    award("founder");
  gain(200);
  titleCard("A new mission", "IT'S ON!", esc(f.title), () => go("mission", { missionId: id, tab: "map" }), 1700);
  S.forge = null;
}
