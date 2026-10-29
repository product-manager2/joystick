import { GLYPHS, Q, ROLES, SIZE, award, roleColor } from "../data/content.js";
import { MERGE, PEOPLE } from "../data/world.js";
import { Button, CloseButton, Stats, openSheet } from "../design/components.js";
import { FUELS, askOf, contribute, fuelIcon, fuelNum, fuelOf, mult, questFuel, stakeOf, tok, tokFor } from "../game/economy.js";
import { backersOf, matchGain, matchOf, matches, poolOf, raisedOf, voiceGain } from "../game/matching.js";
import { hasSkill, questScore, questWhy, stratScore, stratWhy, why } from "../game/personalise.js";
import { needsYou } from "../game/questflow.js";
import { REL, STATUS, gateOf, leaderOf, lockedBy, playable, stratLive, stratOf, strats } from "../game/strategies.js";
import { lastLine, msgHTML } from "./comms.js";
import { S } from "../state.js";
import { go, render } from "../ui/chrome.js";
import { $, backBtn, bot, botAv, duoName, esc, face, findQuest, fmt, gain, glyph, learn, mission, mono, titleCard, toast, youAv } from "../ui/helpers.js";

// ===================== Stage → strategies → quests (rooms) =====================
// Missions are named by what they are and what they're doing now, never by an internal step name
const SHORT = { glio: "Glioblastoma", cad: "Open CAD", reef: "Reef Map", tutor: "AI Tutor" };
export const chName = m => SHORT[m.id] || m.title;
export const stageLine = m => `Stage ${m.current + 1} of ${m.stages.length} · ${m.stages[m.current].goal}`;
export const short = t => t.length > 26 ? t.slice(0, 24) + "…" : t;
export const AGENT_TAG = '<span class="bot-tag">AGENT</span>';
export const chanIcon = (m, size = 40) => `<span class="glyph" style="width:${size}px;height:${size}px;background:${m.color}"><svg viewBox="0 0 32 32" style="width:${size * .55}px;height:${size * .55}px">${GLYPHS[m.glyph]}</svg></span>`;
export const stratBadge = (s, size = 40) => `<span class="sbadge" style="width:${size}px;height:${size}px;background:${s.color}">${esc(s.name.split(" ").map(w => w[0]).join("").slice(0, 2))}</span>`;
// People (and their agents) already working inside some quests
export const CREW = {
  g1: [{ who: "Priya", color: "var(--red)", text: "Library's done. 1,000,412 molecules." }, { who: "Dock", owner: "Priya", color: "var(--red)", bot: true, text: "Uploaded to the shared drive." }],
  g3: [{ who: "Rosa", color: "var(--pink)", text: "Started on the first 5. Anyone want the rest?" }, { who: "Dot", owner: "Rosa", color: "var(--pink)", bot: true, text: "5 of 20 checked. All match so far." }],
  g6c: [{ who: "Kenji", color: "var(--sky)", text: "Shards A and B are in. 4 hits. C and D left." }, { who: "Byte", owner: "Kenji", color: "var(--sky)", bot: true, text: "GPUs reserved for tonight." }],
  g8: [{ who: "Ade", color: "var(--leaf)", text: "Lab says BBB is the make-or-break for this one." }, { who: "Moss", owner: "Ade", color: "var(--leaf)", bot: true, text: "Pulled CNS data for all 40 drugs." }],
  c2: [{ who: "Kenji", color: "var(--sky)", text: "20 files done. 30 to go." }, { who: "Byte", owner: "Kenji", color: "var(--sky)", bot: true, text: "2 broke on fillets so far." }],
  r3: [{ who: "Ade", color: "var(--leaf)", text: "Most misses look like cloud shadow to me." }],
};
// Quest briefs: the doc that says what a quest is, why it matters and when it's done
export const BRIEF = {
  g6c: { task: "Dock compounds 500,001–750,000 from the ZINC library against the EGFRvIII pocket and report every hit.", done: ["All 250k compounds docked with the shared config", "Hits scored at or below the cutoff", "Hits file uploaded with SMILES and scores", "A Critic re-runs 5 random hits"], inputs: ["zinc-shard-C.sdf · 250k compounds", "egfrviii-pocket.pdb", "docking-config.yaml · from PR #142"] },
  g6d: { task: "Dock compounds 750,001–1,000,000 and report every hit.", done: ["All 250k compounds docked", "Hits scored at or below the cutoff", "A Critic re-runs 5 random hits"], inputs: ["zinc-shard-D.sdf · 250k compounds", "docking-config.yaml"] },
  g3: { task: "Re-run 20 of Fold Gang's docking results on your own machine and confirm the scores match.", done: ["All 20 re-run with the same settings", "Any drift over 1 kcal/mol flagged", "A verdict posted for each result"], inputs: ["fold-gang-results-20.csv", "docking-config.yaml"] },
  g8: { task: "Find out which of 40 approved drugs can cross the blood–brain barrier well enough to reach the tumour.", done: ["A BBB score for all 40 drugs", "Weak crossers marked, not dropped", "Shortlist handed to the Wet Lab stage"], inputs: ["fda-approved-40.csv", "cns-permeability-db · via Moss"] },
  g2: { task: "Set up the shared docking pipeline every Fold Gang shard runs on.", done: ["Pipeline docks a 1,000-compound test set", "Config checked into the repo", "A one-page runbook added to this brief"], inputs: ["egfrviii-pocket.pdb", "GPU credits · $4k from the bounty"] },
  g4: { task: "Bring a medicinal chemist onto Wet Hands to judge which repurposed drugs are realistic.", done: ["2+ chemists contacted", "One signs the mission contract"], inputs: ["chemist-shortlist.csv"] },
  c2: { task: "Import 50 real customer STEP files and log every failure.", done: ["All 50 files attempted", "Every failure has a repro file", "Bug report filed with the Kernel Crew"], inputs: ["step-test-set-50.zip"] },
  c3: { task: "Fix the crash when booleans hit curved (NURBS) faces.", done: ["Crash reproduced in a test", "Fix merged", "Test suite still green"], inputs: ["crash-repro.step", "kernel repo · issue #61"] },
  r3: { task: "Look at the 50 reef patches the model got most wrong and find the pattern.", done: ["All 50 misses labelled with a cause", "Top cause written up with a fix idea"], inputs: ["worst-50-misses.zip", "model v3 · eval report"] },
};
export const MISSION_WHY = {
  glio: "Glioblastoma kills most patients within 15 months, and treatment has barely changed in 20 years.",
  cad: "Pro CAD costs $4k+ a seat each year, which locks out students and small shops.",
  reef: "Half the world's coral is gone, and no one has a live map of what's left.",
  tutor: "Millions of kids have a phone but no maths teacher.",
};
export function isMulti(q) { return !!(CREW[q.id] || SCRIPT[q.id] || q.needs); }
export function briefDoc(q, m) {
  const s = stratOf(q), b = BRIEF[q.id] || {}, st = m.stages[m.current];
  const parent = q.parent && m.quests.find(x => x.id === q.parent);
  const crew = crewOf(q).filter(x => !x.bot);
  const done = b.done || [`Ship: ${q.out || "the result"}`, "A Critic approves it"];
  const notes = [...(q.notes || []), ...(q.picked ? [`${q.call.q} → ${q.picked}`] : [])];
  return `<article class="card doc">
    <div class="crumbs">${parent ? `Part of ${esc(short(parent.title))}` : esc(s.name)}</div>
    <h1 class="doc-title">${esc(q.title)}</h1>
    <div class="loot"><span><b>+${q.xp}</b>XP</span><span><b>$${q.coins}</b>bounty</span><span><b>+${fmt(tokFor(m, questFuel(q)))}</b>${tok(m)}</span>${q.gain ? `<span><b>+${q.gain}</b>${q.gain === 1 ? m.unit.replace(/s$/, "") : m.unit}</span>` : ""}</div>
    <div class="small muted">Pays when 2 Critics approve · released when the stage is cleared</div>
    <div class="row wrap small" style="gap:6px"><span class="rtag" style="background:${roleColor(q.role)}">${ROLES[q.role].name}</span><span class="size">${SIZE[q.size].label}</span><span class="muted">${isMulti(q) ? "Squad" : "Solo"} · <button class="info" data-a="history" data-x="${q.id}">edited by ${esc(q.editedBy || s.lead)}</button></span></div>
    ${q.mine && !q.done ? `<div class="small"><b>Claimed by you</b> · 3 days to finish, then it reopens</div>` : q.claimed ? `<div class="small"><b>Claimed by ${esc(q.claimed[0])}</b> · ${q.claimed[1]} left</div>` : ""}
    <h3>Needs</h3>${needsLine(q)}
    <h3>The task</h3><p>${esc(b.task || q.title + ".")}</p>
    <h3>Why it matters</h3><p>${esc(s.bet)} ${q.gain ? `Counts toward the goal: “${esc(st.goal)}”.` : `Unblocks the rest of the strategy.`}</p>
    <h3>Done when</h3><ul class="checks">${done.map(d => `<li class="${q.done ? "on" : ""}">${esc(d)}</li>`).join("")}</ul>
    ${b.inputs ? `<h3>Inputs</h3>${b.inputs.map(f => `<button class="filechip" data-a="input" data-x="${esc(f)}" style="width:100%;text-align:left">${FILE_ICON}<span style="flex:1">${esc(f)}</span><span class="muted">›</span></button>`).join("")}` : ""}
    ${q.out ? `<h3>Ships</h3><div class="filechip">${FILE_ICON}${esc(q.out)}</div>` : ""}
    ${notes.length ? `<h3>Decisions so far</h3><ul class="notes">${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    <h3>Who's on it</h3>
    <div class="row wrap" style="gap:8px">${crew.map(x => `<button class="who-chip" data-a="person" data-x="${esc(x.who)}">${crewAv(x)}${esc(x.who)}</button>`).join("")}<span class="who-chip">${youAv()}${esc(S.name || "You")} & ${esc(S.agentName)}</span></div>
    <button class="btn sm" data-a="squad" data-x="${q.id}" style="align-self:flex-start">Squad & open slots</button>
  </article>`;
}
// One tappable line of what a quest needs; the full list is a drill-down
export function needsLine(q) {
  const chips = (q.skills || []).map(k => `<span class="chip ${hasSkill(k) ? "have" : ""}">${hasSkill(k) ? "✓ " : ""}${esc(k)}</span>`);
  if (q.human) chips.push(`<span class="chip">✋ In person</span>`);
  if (q.spend) chips.push(`<span class="chip"><span class="coin" style="width:14px;height:14px"></span>~$${q.spend}</span>`);
  if (q.safety) chips.push(`<span class="chip">⚠ Safety check</span>`);
  chips.push(`<span class="chip">⏱ ${esc(q.eta || SIZE[q.size].label)}</span>`);
  return `<button class="needs" data-a="reqs" data-x="${q.id}">${chips.join("")}<span class="info small">Details</span></button>`;
}
export const FILE_ICON = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 2h7l4 4v12H5z"/><path d="M12 2v4h4"/></svg>';
// Live squad talk inside multiplayer quests ({me} is your name)
export const SCRIPT = {
  g6c: [
    { who: "Kenji", color: "var(--sky)", text: "@{me} you taking shard C? I'll start D in parallel." },
    { who: "Byte", owner: "Kenji", color: "var(--sky)", bot: true, text: "Shard D queued. About 40 minutes." },
    { who: "Priya", color: "var(--red)", text: "Heads up: use a −9 kcal/mol cutoff, not −8. Too many weak hits at −8." },
    { who: "Kenji", color: "var(--sky)", text: "Good catch. Putting it in the brief.", note: "Cutoff is −9 kcal/mol (Priya)", edit: "Kenji" },
    { who: "Dock", owner: "Priya", color: "var(--red)", bot: true, text: "Re-scored shard B with −9. Still 2 hits." },
  ],
  g3: [
    { who: "Rosa", color: "var(--pink)", text: "@{me} want results 6–20? I'll keep 1–5." },
    { who: "Dot", owner: "Rosa", color: "var(--pink)", bot: true, text: "Shared all 20 result files in the brief." },
    { who: "Ade", color: "var(--leaf)", text: "Fold Gang used Vina. Re-run with the exact same settings or it won't compare." },
    { who: "Rosa", color: "var(--pink)", text: "Yep. Settings are pinned in the brief.", note: "Re-run with Fold Gang's exact Vina settings (Ade)", edit: "Rosa" },
  ],
  g8: [
    { who: "Ade", color: "var(--leaf)", text: "@{me} can you and your agent take the 40 drugs? Moss pulled the CNS data." },
    { who: "Moss", owner: "Ade", color: "var(--leaf)", bot: true, text: "CNS permeability data attached to the brief." },
    { who: "Dr. Lin", color: "var(--pink)", text: "Don't drop weak crossers. Dosing can sometimes fix it." },
    { who: "Ade", color: "var(--leaf)", text: "Noted. Adding it to Done when.", note: "Keep weak crossers, mark them (Dr. Lin)", edit: "Ade" },
  ],
  c2: [
    { who: "Kenji", color: "var(--sky)", text: "Files 21–50 are yours if you want them @{me}." },
    { who: "Byte", owner: "Kenji", color: "var(--sky)", bot: true, text: "Logged the 2 fillet failures with repro files." },
    { who: "@kitbash", color: "var(--gold)", text: "Fillets are the priority. Engineers hit them daily." },
  ],
  r3: [
    { who: "Ade", color: "var(--leaf)", text: "@{me} I've got misses 1–25. Take 26–50?" },
    { who: "Mo", color: "var(--gold)", text: "Last year's cloud mask might help here." },
  ],
};
export function startScript(q) {
  const lines = SCRIPT[q.id];
  if (!lines || q.scripted) return;
  q.scripted = true;
  const [, m] = findQuest(q.id);
  let i = 0;
  const step = () => {
    if (i >= lines.length) return;
    const line = { ...lines[i++] };
    line.text = line.text.replace("{me}", S.name || "you");
    const typing = { typing: true, who: line.who, color: line.color, bot: line.bot };
    postQ(q, m, typing);
    setTimeout(() => {
      q.feed.splice(q.feed.indexOf(typing), 1);
      if (line.note) { (q.notes = q.notes || []).push(line.note); q.editedBy = line.edit; }
      postQ(q, m, line);
      if (line.note) postQ(q, m, { sys: `${line.edit} updated the brief` });
      setTimeout(step, 1500);
    }, 1100);
  };
  setTimeout(step, 900);
}
export function seedRoom(q) {
  if (!q.feed) {
    const [, m] = findQuest(q.id);
    q.feed = [{ sys: `${ROLES[q.role].name} quest · ${SIZE[q.size].label} · +${q.xp} XP · $${q.coins}` }];
    if (q.out) q.feed.push({ sys: `Ships ${q.out.split(" · ")[0]}${q.gain ? ` · +${q.gain} ${q.gain === 1 ? m.unit.replace(/s$/, "") : m.unit}` : ""} · Critic checks it` });
    q.feed.push(...(CREW[q.id] || []).map(x => ({ ...x })));
    if (q.size !== "S" && !q.parent && !q.done && !q.parts) q.feed.push({ agent: true, text: "This one's big. Want me to split it into parts anyone can pick up?", split: q.id });
  }
  return q.feed;
}
export function crewOf(q) {
  const seen = new Map();
  seedRoom(q).forEach(x => { if (x.who && !seen.has(x.who)) seen.set(x.who, x); });
  return [...seen.values()];
}
export const crewAv = x => `<span class="av">${x.bot ? bot(x.color) : face(x.color, x.who.length)}</span>`;
export function questStatus(q) {
  if (q.done) return `<span class="qstat done">✓ Cleared</span>`;
  if (q.parts) { const [, m] = findQuest(q.id); const d = q.parts.filter(id => m.quests.find(x => x.id === id).done).length; return `<span class="qstat">${d}/${q.parts.length} parts</span>`; }
  if (needsYou(q)) return `<span class="qstat call">${{ call: "Your call", spend: "Approve $", proof: "Add proof", changes: "Fix needed" }[q.state]}</span>`;
  if (q.state === "dispute") return `<span class="qstat review">Disputed</span>`;
  if (q.state === "work") return `<span class="qstat live">Working</span>`;
  if (q.state === "review") return `<span class="qstat review">In review</span>`;
  if (q.state) return `<span class="qstat live">Playing</span>`;
  if (!stratLive(q)) return `<span class="qstat lock">Soon</span>`;
  if (lockedBy(q)) return `<span class="qstat lock">🔒 Locked</span>`;
  if (q.claimed) return `<span class="qstat claim">${esc(q.claimed[0])} · ${q.claimed[1]}</span>`;
  if (q.blocked) return `<span class="qstat wait">⏳ Waiting</span>`;
  const crew = crewOf(q);
  return crew.length ? `<span class="stack">${crew.slice(0, 3).map(crewAv).join("")}</span>` : `<span class="qstat">Open</span>`;
}
export function gateBar(m, h = 16) {
  const g = gateOf(m);
  return `<div class="gate stacked" style="height:${h}px">${strats(m).map(s => `<i style="width:${Math.min(100, s.score / g.need * 100)}%;background:${s.color}"></i>`).join("")}</div>`;
}
export function questItem(q, m) {
  const parts = q.parts ? q.parts.map(id => m.quests.find(x => x.id === id)) : [];
  const row = (x, cls = "") => `<button class="card qitem ${cls} ${x.done ? "done" : ""}" ${x.parts ? "disabled" : `data-a="quest" data-x="${x.id}"`}>
      ${mono(x.role, 36)}
      <span style="min-width:0"><b class="qt">${esc(x.title)}</b>
        <span class="small muted" style="display:block">${x.parts ? `Split into ${parts.length} parts` : `${x.human ? "✋ · " : ""}${SIZE[x.size].label} · +${x.xp} XP${x.gain ? ` · <b style="color:var(--navy)">+${x.gain} ${x.gain === 1 ? m.unit.replace(/s$/, "") : m.unit}</b>` : ""}`}${S.roles.includes(x.role) && !x.done && !x.parts ? ` · <b style="color:var(--green-d)">2×</b>` : ""}</span></span>
      ${questStatus(x)}${!x.done && !x.parts && cls !== "part" ? `<span class="why-row">${why(questWhy(x, m))}</span>` : ""}</button>`;
  return q.parts ? `<div class="qtree">${row(q, "parent")}<div class="parts">${parts.map(p => row(p, "part")).join("")}</div></div>` : row(q);
}
// Strategy tags: status first, then leading / backed, then values
const stratTags = (m, s) => {
  const lead = leaderOf(m);
  return [
    s.status ? `<span class="chip" style="background:var(--cream)">${STATUS[s.status](s)}</span>` : "",
    !s.status && s === lead && s.score ? `<span class="chip" style="background:var(--navy);color:var(--white)">Leading</span>` : "",
    stakeOf(s) ? `<span class="chip" style="background:var(--gold)">Backed</span>` : "",
    ...(s.tags || []).map(t => `<span class="chip vtag ${(S.values || []).includes(t) ? "mine" : ""}">${esc(t)}</span>`),
  ].join("");
};
// How a thesis connects to the others: feeds, needs, competes
export const relLine = (m, s) => (s.rel || []).map(([t, id, note]) => {
  const o = strats(m).find(x => x.id === id);
  return o ? `<span class="rel ${t}"><b>${REL[t]}</b> ${esc(o.name)}${note ? ` · ${esc(note)}` : ""}</span>` : "";
}).join("");
// Matching round: the treasury's pool is shared by quadratic matching. Back a thesis to move it.
export function matchingRound(m) {
  const P = poolOf(m), mt = matches(m);
  const list = [...strats(m)].filter(s => s.status !== "merged").sort((a, b) => (mt[b.id] || 0) - (mt[a.id] || 0));
  return `<div class="card fround">
    <div class="fhead"><b class="display" style="font-size:17px;color:var(--navy)">Matching round</b><span class="small"><b>$${fmt(P)}</b> pool</span><span class="spacer"></span><span class="chip" style="background:var(--red);color:var(--white)">2d</span></div>
    ${list.map(s => `<button class="mrow" data-a="backsheet" data-x="${s.id}"><span class="vdot" style="background:${s.color}"></span><span class="vname">${esc(s.name)}</span><span class="meter"><i style="width:${(mt[s.id] || 0) / P * 100}%;background:${s.color}"></i></span><span class="vpct">+$${fmt(mt[s.id] || 0)}</span></button>`).join("")}
    <div class="small muted">More backers beat bigger cheques</div>
  </div>`;
}
// The game nudges squads to team up when a fundraise stalls; it never forces it
function mergeNudge(m) {
  const g = MERGE[m.id];
  if (!g || S.mergeSeen?.[m.id]) return "";
  const a = strats(m).find(s => s.id === g.from), b = strats(m).find(s => s.id === g.to);
  if (!a || !b || a.status === "merged") return "";
  return `<div class="card nudge">${botAv()}<span style="min-width:0;flex:1"><b>Team up?</b><span class="small" style="display:block">${esc(a.squad)} ${esc(g.why)}. ${esc(g.gain)} with ${esc(b.squad)}.</span>
    <span class="row" style="gap:8px;margin-top:8px">${Button("Suggest it", { variant: "blue", size: "sm", action: "merge", value: m.id })}${Button("Not now", { size: "sm", action: "mergeno", value: m.id })}</span></span></div>`;
}
export function stageScreen() {
  const m = mission();
  m.unread = 0;
  m.sessions = m.sessions || [];
  const g = gateOf(m), mt = matches(m);
  const card = s => {
    const open = m.quests.filter(q => q.strat === s.id && playable(q)).length;
    const reason = stratWhy(s, m).filter(([, t]) => !/backed|leading/i.test(t));
    return `<button class="card strat" data-a="strategy" data-x="${s.id}">
      ${stratBadge(s)}
      <span style="min-width:0"><span class="sname">${esc(s.name)}</span>
        <span class="small muted" style="display:block">${esc(s.squad)} · led by ${esc(s.lead)}</span>
        <span class="row wrap" style="gap:6px;margin-top:6px">${stratTags(m, s)}${why(reason)}</span>
        <span class="sbet">${esc(s.bet)}</span>
        ${relLine(m, s) ? `<span class="rels">${relLine(m, s)}</span>` : ""}
        <span class="money"><b>$${fmt(raisedOf(s))}</b> raised · <b>${backersOf(s)}</b> backers · <b class="match">+$${fmt(mt[s.id] || 0)}</b> match</span>
        <span class="small muted">+${s.score} ${s.score === 1 ? m.unit.replace(/s$/, "") : m.unit} · ${open} quests open</span></span>
    </button>`;
  };
  return `<div class="chat">
    <div class="chat-head">${backBtn("back", "", "Back")}${chanIcon(m)}
      <div style="min-width:0;flex:1"><div class="display chan-name">${esc(m.title)}</div><div class="small muted ellip">Stage ${m.current + 1} of ${m.stages.length} · ${esc(m.stages[m.current].name)}</div></div></div>
    <div class="stage-list">
      <div class="card milestone">
        <div class="eyebrow">Stage ${m.current + 1} goal</div>
        <div class="mgoal">${esc(m.stages[m.current].goal)}</div>
        ${gateBar(m)}
        <div class="row small"><b>${g.have}/${g.need} ${g.unit}</b><span class="spacer"></span><span class="muted">${strats(m).length} strategies racing</span></div>
      </div>
      ${strats(m).some(s => s.status === "proposed") ? `<div class="card banner"><span class="display" style="font-size:22px">✎</span><span class="small"><b>Planning window · 2d left.</b> Back a proposed strategy to launch it, or propose your own.</span></div>` : ""}
      ${mergeNudge(m)}
      ${(() => {
        const all = [...strats(m)].sort((a, b) => stratScore(b, m) - stratScore(a, m));
        const picks = all.filter(x => stratScore(x, m) > 0).slice(0, 2);
        const top = [...(picks.length ? picks : all.slice(0, 2)), ...all.filter(x => x.status === "proposed" && !picks.includes(x))].filter((x, i, a) => a.indexOf(x) === i);
        const rest = all.filter(x => !top.includes(x)), more = fuelOf(m).more[0];
        const open = S.showAll["s-" + m.id];
        return `<div class="row"><div class="eyebrow">Pick a strategy to play</div><span class="spacer"></span><button class="btn sm" data-a="propose">+ Propose one</button></div>
          <div class="list">${top.map(card).join("")}</div>
          ${rest.length ? `<button class="seeall" data-a="showall" data-x="s-${m.id}">${open ? "Hide" : "See all"} ${all.length + more} strategies</button>` : ""}
          ${open ? `<div class="list">${rest.map(card).join("")}</div><div class="small muted" style="text-align:center">+ ${more} smaller strategies</div>` : ""}`;
      })()}
      ${matchingRound(m)}
      ${m.sessions.length ? `<div class="eyebrow">Chats</div><div class="list">${m.sessions.map(c => `
        <button class="card thread-row" data-a="session" data-x="${c.id}">${botAv("av")}<span style="min-width:0"><span class="t" style="display:block">${esc(c.title)}</span><span class="last" style="display:block">${esc(lastLine(c.msgs))}</span></span><span class="small muted">chat</span></button>`).join("")}</div>` : ""}
    </div>
    <form class="composer" id="stageBar"><input id="stagesay" placeholder="Ask ${esc(S.agentName)} about this stage…" autocomplete="off"><button class="btn sm red" type="submit">Ask</button></form>
  </div>`;
}
// A strategy is a thesis: the claim, what it asks for, when, and how it relates to the others
export function strategyScreen() {
  const m = mission(), s = strats(m).find(x => x.id === S.stratId);
  const qs = m.quests.filter(q => q.strat === s.id && !q.parent);
  const a = askOf(s), mt = matchOf(m, s), have = raisedOf(s) + mt, paid = Math.round(mt * .3);
  const backBtnLabel = s.status === "review" ? "" : s.status === "proposed" ? `Back it to launch · ${s.backers}/${s.need}` : stakeOf(s) ? `✓ Backed $${fmt(stakeOf(s))} · add more` : "Back this thesis";
  return `<div class="chat">
    <div class="chat-head">${backBtn("back", "stage", "Back")}${stratBadge(s)}
      <div style="min-width:0;flex:1"><div class="room-title">${esc(s.name)}</div><div class="small muted ellip">${esc(s.squad)} · led by ${esc(s.lead)} · ${chName(m)}</div></div></div>
    <div class="stage-list">
      <div class="card milestone thesis">
        <div class="row wrap" style="gap:6px">${stratTags(m, s)}</div>
        <div class="eyebrow">The thesis</div>
        <p class="claim">${esc(s.bet)}</p>
        ${relLine(m, s) ? `<div class="rels">${relLine(m, s)}</div>` : ""}
        ${s.status === "queued" ? "" : `<div class="kvrow"><span>When</span><b>${s.status === "proposed" ? "As soon as it's backed" : "Now"}</b></div>`}
        ${Stats([[`$${fmt(raisedOf(s))}`, "raised"], [backersOf(s), "backers"], [`+$${fmt(mt)}`, "match"]])}
        <div class="eyebrow">The ask</div>
        <div class="asks">${[["money", a.money, Math.min(a.money, have)], ["time", a.time, Math.round(a.time * Math.min(1, have / a.money))], ["compute", a.compute, Math.round(a.compute * Math.min(1, have / a.money))]].map(([k, v, got]) => `<div class="ask"><span class="row" style="gap:5px"><span class="fi" style="background:${FUELS[k].color};width:22px;height:22px;border-radius:6px">${fuelIcon(k, 12)}</span><span class="fname">${FUELS[k].name}</span></span><span class="meter"><i style="width:${Math.min(100, got / v * 100)}%;background:${FUELS[k].color}"></i></span><span class="fnum">${fuelNum(k, got)} / ${fuelNum(k, v)}</span></div>`).join("")}</div>
        ${mt ? `<div class="kvrow"><span>Treasury draw</span><b>$${fmt(paid)} paid · $${fmt(mt - paid)} at checkpoints</b></div>` : ""}
        ${s.status === "review" ? `<div class="small" style="text-align:center"><b>Waiting for ${esc(m.creator)}'s OK</b> · usually under a day</div>` : Button(backBtnLabel, { variant: stakeOf(s) ? "gold" : "red", block: true, action: "backsheet", value: s.id })}
        ${stakeOf(s) ? `<div class="small muted" style="text-align:center;margin-top:-2px">You hold a $${fmt(stakeOf(s))} stake in ${esc(s.squad)}</div>` : ""}
      </div>
      ${(() => {
        const ranked = [...qs].sort((a, b) => (b.done ? -9 : questScore(b, m)) - (a.done ? -9 : questScore(a, m)));
        const top = ranked.filter(q => !q.done && questScore(q, m) > 1).slice(0, 3), rest = ranked.filter(q => !top.includes(q));
        const open = S.showAll["q-" + s.id];
        return qs.length ? `${top.length ? `<div class="eyebrow">For you</div><div class="list">${top.map(q => questItem(q, m)).join("")}</div>` : ""}
          <button class="seeall" data-a="showall" data-x="q-${s.id}">${open ? "Hide" : "See all"} ${qs.length} quests in this strategy</button>
          ${open || !top.length ? `<div class="list">${rest.map(q => questItem(q, m)).join("")}</div>` : ""}` : "";
      })()}
    </div>
    <form class="composer" id="stratBar"><input id="stratsay" placeholder="Talk strategy with ${esc(S.agentName)}…" autocomplete="off"><button class="btn sm red" type="submit">Start</button></form>
  </div>`;
}
// Back a thesis with money or your voice. The live match estimate teaches the rule.
export function backSheet(sid) {
  const m = mission(), s = strats(m).find(x => x.id === sid);
  let amt = 10;
  const amounts = [5, 10, 25, 100];
  openSheet({ label: `Back ${s.name}`, render: () => {
    const extra = amt ? matchGain(m, s, amt) : voiceGain(m, s);
    return `<div class="grab"></div>
    <div class="row">${stratBadge(s, 36)}<div style="flex:1;min-width:0"><h2 class="display" style="font-size:20px;color:var(--navy)">Back ${esc(s.name)}</h2><div class="small muted ellip">${esc(s.squad)} · ${backersOf(s)} backers</div></div>${CloseButton()}</div>
    <div class="amounts">${amounts.map(a => `<button data-b="amt" data-v="${a}" aria-pressed="${amt === a}">$${a}</button>`).join("")}</div>
    <button class="chip voice" data-b="amt" data-v="0" aria-pressed="${amt === 0}">+1 · Add my voice</button>
    <div class="estimate">${amt ? `<span>$${amt} now</span><b>→ about $${fmt(amt + extra)} with match</b>` : `<span>Free</span><b>→ +$${fmt(extra)} match</b>`}</div>
    <div class="small muted">${amt ? `You get a stake in ${esc(s.squad)}: a share of what it builds.` : "Counts once you've played. Earns a little if it ships."}</div>
    ${Button(amt ? `Back with $${amt}` : "Add my voice", { variant: "red", block: true, "data-b": "go" })}`;
  }, onClick: (e, close, draw) => {
    const b = e.target.closest("[data-b]");
    if (!b) return;
    if (b.dataset.b === "amt") { amt = +b.dataset.v; return draw(); }
    const before = matchOf(m, s), first = !stakeOf(s) && amt;
    if (amt) { S.stakes[s.id] = stakeOf(s) + amt; S.coins = Math.max(0, S.coins - amt); S.backed = { ...(S.backed || {}), [m.id]: s.id }; }
    else s.voices = (s.voices || 0) + 1;
    if (first || (!amt && s.status === "proposed")) s.backers++;
    close();
    if (s.status === "proposed" && s.backers >= s.need) { s.status = null; titleCard("Your backing tipped it", "LAUNCHED!", esc(s.name), null, 1300); }
    else toast(`${amt ? `Backed $${amt}` : "Voice added"} · match <b>+$${fmt(Math.max(0, matchOf(m, s) - before))}</b>`);
    render();
  } });
}
// One room layout for quests and chat sessions
export function roomScreen() {
  const m = mission();
  if (S.screen === "session") {
    const c = m.sessions.find(x => x.id === S.sessionId);
    return `<div class="chat">
      <div class="chat-head">${backBtn("back", "stage", "Back")}${botAv("av big")}<div style="min-width:0"><div class="display chan-name">${esc(c.title)}</div><div class="small muted">${esc(chName(m))} · chat</div></div></div>
      <div class="msgs" id="msgs">${c.msgs.map(msgHTML).join("")}</div>
      ${quickBar([`@${S.agentName} what's next?`, `@${S.agentName} sum up`, "Need a Critic"])}
      <form class="composer" id="roomComposer"><input id="roomsay" placeholder="${c.proposing ? "Or type your own strategy…" : "Message"}" autocomplete="off"><button class="btn sm red" type="submit">Send</button></form>
    </div>`;
  }
  const [q] = findQuest(S.questId);
  const crew = crewOf(q);
  const multi = isMulti(q), tab = S.roomTab || "chat";
  const label = q.verified && !hasSkill(q.skills[0]) ? "Verify to play" : q.human ? "Start · ✋ in person" : "Start quest";
  const actions = q.done ? `<div class="room-bar done">✓ Cleared by ${esc(q.by || duoName())}${q.picked ? ` · “${esc(q.picked)}”` : ""}</div>`
    : q.state ? "" : blockBar(q) || `<div class="room-bar one">${Button(label, { variant: "blue", action: "play", value: q.id })}</div>`;
  return `<div class="chat">
    <div class="chat-head">${backBtn("back", "strategy", "Back")}${mono(q.role, 40)}
      <div style="min-width:0;flex:1"><div class="room-title">${esc(q.title)}</div>
        <div class="row small muted" style="gap:6px"><button class="avbtn row small muted" style="gap:6px" data-a="squad" data-x="${q.id}" aria-label="Squad">${multi ? `<span class="mode multi">Squad</span>${crew.length ? `<span class="stack">${crew.slice(0, 4).map(crewAv).join("")}</span> ${crew.length}` : ""}` : `<span class="mode">Solo</span>`}</button><span class="rewardline">$${q.coins} · +${fmt(tokFor(m, questFuel(q)))} ${tok(m)}</span></div></div></div>
    <div class="roomtabs" role="tablist">
      <button role="tab" data-a="rtab" data-x="chat" aria-selected="${tab === "chat"}">Chat${q.unreadChat ? ` <span class="unread">${q.unreadChat}</span>` : ""}</button>
      <button role="tab" data-a="rtab" data-x="brief" aria-selected="${tab === "brief"}">Brief</button>
    </div>
    ${tab === "brief" ? `<div class="stage-list">${briefDoc(q, m)}</div>` : `<div class="msgs" id="msgs">${q.feed.map(msgHTML).join("")}</div>`}
    ${actions}
    ${tab === "chat" ? `${q.state || q.done ? quickBar([`@${S.agentName} sum up`, "Nice work all", "Need a Critic"]) : ""}
    <form class="composer" id="roomComposer"><input id="roomsay" placeholder="${multi ? "Message the squad…" : "Message " + esc(S.agentName) + "…"}" autocomplete="off"><button class="btn sm red" type="submit">Send</button></form>` : ""}
  </div>`;
}
// Why a quest can't be played right now, as a one-line bar
function blockBar(q) {
  const dep = lockedBy(q), s = stratOf(q);
  const bar = (txt, btn) => `<div class="room-bar note"><span class="small">${txt}</span>${btn}</div>`;
  if (s && s.status) return bar(s.status === "review" ? "Strategy is waiting for the creator's OK" : s.status === "queued" ? `Strategy is queued · ${esc(s.when || "later")}` : `Strategy needs ${s.need - s.backers} more backers to launch`, Button("View", { size: "sm", action: "strategy", value: s.id }));
  if (dep) return bar(`🔒 Unlocks when <b>${esc(short(dep.title))}</b> clears`, Button("Notify me", { size: "sm", action: "watchq" }));
  if (q.claimed) return bar(`Claimed by <button class="info" data-a="person" data-x="${esc(q.claimed[0])}">${esc(q.claimed[0])}</button> · ${q.claimed[1]} left, then it reopens`, Button("Ask to pair", { size: "sm", action: "pair", value: esc(q.claimed[0]) }));
  if (q.blocked) return bar(`⏳ Waiting on ${esc(q.blocked)}`, Button("Nudge", { size: "sm", action: "nudge" }));
  return "";
}
export const quickBar = list => `<div class="quick">${list.map(t => `<button class="chip" data-a="roomquick" data-x="${esc(t)}">${esc(t)}</button>`).join("")}</div>`;
export function postQ(q, m, msg) {
  seedRoom(q).push(msg);
  if (S.screen === "quest" && S.questId === q.id) { if (S.roomTab === "brief" && !msg.typing && !msg.sys) q.unreadChat = (q.unreadChat || 0) + 1; render(); }
  else if (!msg.typing) { q.unread = (q.unread || 0) + 1; m.unread = (m.unread || 0) + 1; }
}
// Progress lives on the message, so a re-render keeps it
export function animate(msg, from, to, dur, logs, cb) {
  const key = `${msg.run}-${msg.phase}`, t0 = performance.now();
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    msg.p = from + (to - from) * k;
    msg.log = logs[Math.min(logs.length - 1, Math.floor(k * logs.length))];
    const bar = document.getElementById("bar-" + key), log = document.getElementById("log-" + key);
    if (bar) bar.style.width = (msg.p * 100) + "%";
    if (log) log.textContent = msg.log;
    if (k < 1) setTimeout(tick, 40); else cb();
  };
  tick();
}
// Propose a new strategy for this milestone
export const IDEAS = {
  glio: ["Partner with a pharma lab", "Use AlphaFold structures", "Crowdsource from biotech students"],
  cad: ["Port FreeCAD to the browser", "Partner with a university lab", "Start with sheet-metal only"],
  reef: ["Drones over shallow reefs", "Partner with dive schools"],
  tutor: ["Parents photograph textbooks", "Partner with education ministries"],
};
export function proposeStrategy() {
  const m = mission();
  m.sessions = m.sessions || [];
  const c = { id: "s" + Date.now(), title: "New strategy", proposing: true, msgs: [
    { me: true, text: `@${S.agentName} I want to try another way to hit this stage` },
    { agent: true, text: `Goal: ${m.stages[m.current].goal}. A few angles nobody's racing yet:`, ideas: IDEAS[m.id] || ["A smaller first step", "Partner with experts", "Crowdsource it"] },
  ] };
  m.sessions.unshift(c);
  go("session", { sessionId: c.id });
}
export function launchStrategy(name) {
  const m = mission();
  const id = "you-" + Date.now();
  const s = { id, name, squad: `${S.name || "Your"}'s squad`, lead: S.name || "you", color: "var(--gold)", score: 0, backers: 1, bet: `${name}. Proposed by ${duoName()}.` };
  strats(m).push(s);
  m.quests.push(
    Q(id + "a", `Write the brief: ${short(name)}`, "strategist", "S", 160, 15, ["outlining the bet…", "risks listed", "brief posted ✓"], { q: "What's the first thing to test?", opts: ["Cheapest test", "Fastest test"] }, { strat: id, gain: 0, out: "strategy-brief.md" }),
    Q(id + "b", `Run a small test of the idea`, "implementer", "M", 300, 30, ["setting up the test…", "first results in", "results posted ✓"], { q: "Results are mixed. Keep going?", opts: ["Double down", "Tweak and re-run"] }, { strat: id, gain: 1, out: "test-results.csv" }),
    Q(id + "c", `Recruit 2 players to the strategy`, "connector", "S", 150, 10, ["posting to the channel…", "4 interested", "2 joined ✓"], { q: "Who do we take?", opts: ["Specialists", "Fast movers"] }, { strat: id, gain: 0, out: "2 players joined" }),
  );
  S.backed = { ...(S.backed || {}), [m.id]: id };
  award("trail");
  titleCard("New strategy", "IT'S A RACE!", esc(name), () => go("strategy", { stratId: id }), 1500);
}
// What your agent says inside a mission (quest rooms and chats)
export function stageAgentReply(m, text) {
  const low = text.toLowerCase();
  if (low.includes("next")) {
    const q = m.quests.find(x => playable(x) && S.roles.includes(x.role)) || m.quests.find(playable);
    return q ? { agent: true, text: "This one fits you:", quest: q.id } : { agent: true, text: "Nothing open. We're close to the goal." };
  }
  if (low.includes("brief") && S.questId) {
    const [q] = findQuest(S.questId);
    const b = BRIEF[q.id];
    return { agent: true, text: `Read it. ${b ? b.done.length + " things to finish" : "Ship the result and get it reviewed"}${q.notes?.length ? `, and I'll follow: ${q.notes[q.notes.length - 1]}` : ""}. Ready when you are.` };
  }
  if (low.includes("sum")) {
    const g = gateOf(m), l = leaderOf(m);
    return { agent: true, text: `Goal: ${g.have}/${g.need} ${g.unit}. ${l.name} leads with +${l.score}. ${g.need - g.have} to go.` };
  }
  learn(`You said: “${text.replace(/@\S+\s*/, "")}”`);
  return { agent: true, text: "Got it. I'll do it your way." };
}
export function startSession(text, title) {
  const m = mission();
  m.sessions = m.sessions || [];
  const c = { id: "s" + Date.now(), title: title || text.replace(/@\S+\s*/, "").slice(0, 36) || "New chat", msgs: [{ me: true, text }, { typing: true }] };
  m.sessions.unshift(c);
  go("session", { sessionId: c.id });
  setTimeout(() => { c.msgs = c.msgs.filter(x => !x.typing); c.msgs.push(stageAgentReply(m, text)); if (S.screen === "session") render(); }, 800);
}
export function sendInRoom(text) {
  const m = mission();
  const mention = text.toLowerCase().includes("@" + S.agentName.toLowerCase());
  if (S.screen === "session") {
    const c = m.sessions.find(x => x.id === S.sessionId);
    if (c.proposing) { c.proposing = false; return launchStrategy(text.slice(0, 40)); }
    c.msgs.push({ me: true, text }, { typing: true }); render();
    return setTimeout(() => { c.msgs = c.msgs.filter(x => !x.typing); c.msgs.push(stageAgentReply(m, text)); if (S.screen === "session") render(); }, 800);
  }
  const [q] = findQuest(S.questId);
  postQ(q, m, { me: true, text });
  const crew = crewOf(q);
  setTimeout(() => {
    if (mention || !crew.length) return postQ(q, m, stageAgentReply(m, text));
    const x = crew[q.feed.length % crew.length];
    postQ(q, m, { who: x.who, owner: x.owner, bot: x.bot, color: x.color, text: x.bot ? "Noted. Logging it for the squad." : ["On it with my agent.", "Copy. See you at the final vote.", "Our agents can split the rest."][q.feed.length % 3] });
  }, 800);
}
export function stageCleared(m) {
  const nextStage = m.stages[m.current + 1];
  const top = leaderOf(m), called = S.backed?.[m.id] === top.id;
  const el = document.createElement("div");
  el.className = "titlecard";
  const colors = ["var(--gold)", "var(--red)", "var(--green)", "var(--pink)", "var(--white)", "var(--navy)"];
  let conf = "";
  for (let i = 0; i < 36; i++) conf += `<i class="confetti" style="left:${Math.random() * 100}%;background:${colors[i % 6]};animation-duration:${1.6 + Math.random() * 1.6}s;animation-delay:${Math.random() * .5}s"></i>`;
  const bonus = Math.round(m.bounty * .12 * .02 / 20), released = S.wallet.pending;
  S.wallet.pending = 0;
  const tally = m.gv ? `${m.gv.yes}–${m.gv.no}` : "9–0";
  el.innerHTML = `${conf}<div class="top">${esc(m.title)}</div><div class="cup big" style="font-size:clamp(40px,13vw,58px)">STAGE<br>CLEAR!</div>
    <p style="font-weight:700">${esc(top.name)} led with +${top.score} ${m.unit}. Referees voted ${tally}.</p>
    <p class="small" style="font-weight:600;margin-top:-6px">Every approved quest paid, win or lose</p>
    <div class="rewards">
      <div class="reward" style="background:${FUELS.money.color}">${fuelIcon("money", 22)}<b>+$${fmt(released + bonus)}</b><span>paid to you</span></div>
      <div class="reward" style="background:${FUELS.time.color}">${fuelIcon("time", 22)}<b>${S.wallet.timeCredits}h</b><span>time credits</span></div>
      <div class="reward" style="background:${FUELS.know.color}">${fuelIcon("know", 22)}<b>${S.wallet.insights}</b><span>insights · rep</span></div>
      <div class="reward" style="background:var(--white)">${fuelIcon("compute", 22).replace(FUELS.compute.icon, '<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>')}<b>${fmt(S.wallet.shares[m.id] || 0)}</b><span>${tok(m)} held</span></div>
    </div>
    <div class="row wrap" style="justify-content:center">${called ? `<span class="chip" style="font-size:14px;padding:6px 12px;background:var(--gold)">Called it! +$100</span>` : ""}<button class="chip crate" data-crate style="font-size:14px;padding:6px 12px">? Open crate</button></div>
    <button class="btn gold" data-a="onward">${nextStage ? `On to ${esc(nextStage.name)}` : "Mission won!"}</button>`;
  $("#app").appendChild(el);
  award("gate");
  gain(0, released + bonus + (called ? 100 : 0));
  el.querySelector("[data-crate]").addEventListener("click", e => {
    const loot = [["+$40", () => { S.coins += 40; }], ["Night Owl badge", () => award("owl")], ["+100 XP", () => gain(100)]][Math.floor(Math.random() * 3)];
    loot[1](); renderHud();
    e.currentTarget.outerHTML = `<span class="chip" style="font-size:14px;padding:6px 12px;background:var(--gold)">${loot[0]}</span>`;
  }, { once: true });
  el.querySelector("[data-a=onward]").addEventListener("click", () => {
    if (nextStage) m.current++;
    const goal = nextStage ? nextStage.goal : "Celebrate";
    const p = m.id + Date.now();
    m.target = 6; m.unit = "results";
    m.strategies = [
      { id: p + "A", name: "Proven path", squad: "Veterans", lead: "Rosa", color: "var(--green)", score: 0, backers: 40, raised: 900, tags: ["Fast track"], bet: "Do what worked last stage, faster." },
      { id: p + "B", name: "Bold bet", squad: "Moonshots", lead: "Kenji", color: "var(--blue)", score: 0, backers: 25, need: 26, status: "proposed", raised: 400, tags: ["Open science"], rel: [["competes", p + "A"]], bet: "Try the risky idea everyone kept talking about." },
    ];
    m.quests = [
      Q(p + "a", `Gather everything known about “${goal}”`, "explorer", "S", 180, 15, ["searching 18k sources…", "brief drafted", "brief posted ✓"], { q: "Where should we dig first?", opts: ["Recent papers", "What other squads tried", "Talk to practitioners"] }, { strat: p + "A", gain: 1, out: "research-brief.md" }),
      Q(p + "b", "Build the tooling this stage needs", "implementer", "M", 320, 30, ["scaffolding…", "tests passing", "deployed ✓"], { q: "Build fast or build solid?", opts: ["Fast — we'll refactor later", "Solid — this will last"] }, { strat: p + "A", gain: 2, out: "tooling · PR" }),
      Q(p + "c", "Prototype the risky idea", "inventor", "M", 300, 30, ["sketching…", "prototype runs", "demo posted ✓"], { q: "It half works. Ship the demo?", opts: ["Ship it", "One more day"] }, { strat: p + "B", gain: 2, out: "prototype · demo" }),
      Q(p + "d", "Stress-test the prototype", "critic", "S", 200, 20, ["running checks…", "2 issues found", "report posted ✓"], { q: "2 issues found. Block it?", opts: ["Block until fixed", "Ship with notes"] }, { strat: p + "B", gain: 1, out: "stress-test.md" }),
    ];
    m.sessions = [];
    m.gv = null;
    if (S.backed) S.backed[m.id] = null;
    el.remove();
    titleCard(`Stage ${m.current + 1}`, esc(m.stages[m.current].name), "Planning window: back a strategy", () => go("stage", { missionId: m.id }));
  });
}

// Add fuel to a mission any time; it mints shares at today's multiplier
export function fuelSheet(mid) {
  const m = mission(mid);
  const opts = [["money", 100, "Back with $100", "from your wallet"], ["time", 5, "+5h this week", "pledge to play quests"], ["compute", 50, "+50 GPU-h", `${S.agentName} works overnight`], ["know", 1, "+1 insight", "share what you know in the brief"]];
  openSheet({ label: "Back this mission", render: () => `
    <div class="grab"></div>
    <div class="row"><h2 class="display" style="font-size:22px;color:var(--navy)">Back ${esc(short(m.title))}</h2><span class="spacer"></span>${CloseButton()}</div>
    <div class="small muted">Early backers get ×${mult(m)} ${tok(m)}</div>
    <div class="list">${opts.map(([k, v, l, d]) => `<button class="card fuelopt" data-f="${k}" data-v="${v}"><span class="fi" style="background:${FUELS[k].color}">${fuelIcon(k, 18)}</span><span style="text-align:left"><b>${l}</b><span class="small muted" style="display:block">${d}</span></span><span class="small" style="white-space:nowrap"><b>+${fmt(tokFor(m, { [k]: v }))}</b> ${tok(m)}</span></button>`).join("")}</div>`,
  onClick: (e, close) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    const k = b.dataset.f, v = +b.dataset.v;
    if (k === "money") S.coins = Math.max(0, S.coins - v);
    if (k === "know") S.wallet.insights++;
    const sh = contribute(m, { [k]: v });
    close(); render();
    toast(`${FUELS[k].name} added · <b>+${fmt(sh)} ${tok(m)}</b>`);
  } });
}
