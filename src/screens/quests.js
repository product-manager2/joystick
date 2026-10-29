import { GLYPHS, Q, ROLES, SIZE, award, roleColor } from "../data/content.js";
import { PEOPLE } from "../data/world.js";
import { Button, CloseButton, openSheet } from "../design/components.js";
import { FUELS, askOf, contribute, fuelIcon, fuelOf, ownPct, stakeOf } from "../game/economy.js";
import { backersOf, matchGain, matchOf, raisedOf, voiceGain } from "../game/matching.js";
import { hasSkill, questScore, questWhy, stratScore, stratWhy, why } from "../game/personalise.js";
import { needsYou } from "../game/questflow.js";
import { STATUS, gateOf, shown, waitWhy, leaderOf, lockedBy, playable, stratLive, stratOf, strats } from "../game/strategies.js";
import { msgHTML } from "./comms.js";
import { threads } from "../state.js";
import { S } from "../state.js";
import { go, render } from "../ui/chrome.js";
import { $, backBtn, bot, botAv, duoName, esc, face, findQuest, fmt, gain, glyph, learn, mission, mono, titleCard, toast, youAv } from "../ui/helpers.js";

// ===================== Stage → strategies → quests (rooms) =====================
// Missions are named by what they are and what they're doing now, never by an internal step name
const SHORT = { glio: "Glioblastoma", cad: "Open CAD", reef: "Reef Map", tutor: "AI Tutor" };
// Every screen inside a mission says what it is and where it sits: Mission › Stage › Plan › Quest
export const where = (kind, crumbs = []) => `<div class="where"><span class="kind kind-${kind === "plan" ? "strategy" : kind}">${kind}</span>${crumbs.length ? `<span class="crumbs ellip">${crumbs.map(esc).join(" › ")}</span>` : ""}</div>`;
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
  const done = b.done || [`Ship: ${q.out || "the result"}`, "2 players check it"];
  const notes = [...(q.notes || []), ...(q.picked ? [`${q.call.q} → ${q.picked}`] : [])];
  return `<article class="card doc">
    <div class="crumbs">${parent ? `Part of ${esc(short(parent.title))}` : esc(s.name)}</div>
    <h1 class="doc-title">${esc(q.title)}</h1>
    <div class="loot"><span><b>+${q.xp}</b>XP</span><span><b>$${q.coins}</b>bounty</span>${q.gain ? `<span><b>+${q.gain}</b>${q.gain === 1 ? m.unit.replace(/s$/, "") : m.unit}</span>` : ""}</div>
    <div class="small muted">Pays when 2 players check it and the stage is cleared</div>
    <div class="row wrap small" style="gap:6px"><span class="rtag" style="background:${roleColor(q.role)}">${ROLES[q.role].name}</span><span class="size">${SIZE[q.size].label}</span><span class="muted">${isMulti(q) ? "Squad" : "Solo"} · <button class="info" data-a="history" data-x="${q.id}">edited by ${esc(q.editedBy || s.lead)}</button></span></div>
    ${q.mine && !q.done ? `<div class="small"><b>Claimed by you</b> · 3 days to finish, then it reopens</div>` : q.claimed ? `<div class="small"><b>Claimed by ${esc(q.claimed[0])}</b> · ${q.claimed[1]} left</div>` : ""}
    <h3>Needs</h3>${needsLine(q)}
    <h3>The task</h3><p>${esc(b.task || q.title + ".")}</p>
    <h3>Why it matters</h3><p>${esc(s.bet)} ${q.gain ? `Counts toward the goal: “${esc(st.goal)}”.` : `Unblocks the rest of the plan.`}</p>
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
    const adds = q.gain ? ` · Adds ${q.gain} ${q.gain === 1 ? m.unit.replace(/s$/, "") : m.unit}` : "";
    q.feed = [{ sys: `${SIZE[q.size].label} · $${q.coins}${adds}` }];
    q.feed.push(...(CREW[q.id] || []).map(x => ({ ...x })));
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
        <span class="small muted" style="display:block">${x.parts ? `Split into ${parts.length} parts` : `${x.human ? "✋ · " : ""}${SIZE[x.size].label} · $${x.coins}${x.gain ? ` · <b style="color:var(--navy)">+${x.gain} ${x.gain === 1 ? m.unit.replace(/s$/, "") : m.unit}</b>` : ""}`}${S.roles.includes(x.role) && !x.done && !x.parts ? ` · <b style="color:var(--green-d)">2×</b>` : ""}</span></span>
      ${questStatus(x)}${!x.done && !x.parts && cls !== "part" && (playable(x) || x.state) ? `<span class="why-row">${why(questWhy(x, m))}</span>` : ""}</button>`;
  return q.parts ? `<div class="qtree">${row(q, "parent")}<div class="parts">${parts.map(p => row(p, "part")).join("")}</div></div>` : row(q);
}
// Plan tags: Waiting with its reason, or Leading, plus whether you back it
const stratTags = (m, s) => {
  const lead = leaderOf(m);
  return [
    s.status ? `<span class="chip" style="background:var(--cream)">${STATUS[s.status](s)}</span>` : "",
    !s.status && s === lead && s.score ? `<span class="chip" style="background:var(--navy);color:var(--white)">Leading</span>` : "",
    stakeOf(s) ? `<span class="chip" style="background:var(--gold)">You back it</span>` : "",
  ].join("");
};
export function stageScreen() {
  const m = mission();
  m.unread = 0;
  const g = gateOf(m), live = shown(m);
  const card = s => {
    const open = m.quests.filter(q => q.strat === s.id && playable(q)).length;
    const reason = stratWhy(s, m).filter(([, t]) => !/backed|leading/i.test(t));
    return `<button class="card strat" data-a="strategy" data-x="${s.id}">
      ${stratBadge(s)}
      <span style="min-width:0"><span class="sname">${esc(s.name)}</span>
        <span class="small muted" style="display:block">${esc(s.squad)} · led by ${esc(s.lead)}</span>
        <span class="row wrap" style="gap:6px;margin-top:6px">${stratTags(m, s)}${why(reason)}</span>
        <span class="sbet">${esc(s.bet)}</span>
        <span class="money"><b>$${fmt(raisedOf(s) + matchOf(m, s))}</b> from <b>${backersOf(s)}</b> backers</span>
        <span class="small muted">+${s.score} ${s.score === 1 ? m.unit.replace(/s$/, "") : m.unit} · ${open} quests open</span></span>
    </button>`;
  };
  return `<div class="chat">
    <div class="chat-head">${backBtn("back", "", "Back")}${chanIcon(m)}
      <div style="min-width:0;flex:1">${where("stage", [chName(m)])}<div class="display chan-name">Stage ${m.current + 1} of ${m.stages.length} · ${esc(m.stages[m.current].name)}</div></div></div>
    <div class="stage-list">
      <button class="card milestone" data-a="stagebrief" data-x="${m.id}" style="text-align:left;width:100%">
        <div class="eyebrow">Stage ${m.current + 1} goal</div>
        <div class="mgoal">${esc(m.stages[m.current].goal)}</div>
        ${gateBar(m)}
        <div class="row small"><b>${g.have}/${g.need} ${g.unit}</b><span class="spacer"></span><span class="muted">${live.length} plans racing</span></div>
        <div class="small" style="color:var(--blue);font-weight:700;margin-top:6px">What does this mean? →</div>
      </button>
      ${(() => {
        const all = [...live].sort((a, b) => stratScore(b, m) - stratScore(a, m));
        return `<div class="row"><div class="eyebrow">Pick a plan to play</div><span class="spacer"></span><button class="btn sm" data-a="propose">+ Suggest one</button></div>
          <div class="list">${all.map(card).join("")}</div>`;
      })()}
    </div>
    <form class="composer" id="stageBar"><input id="stagesay" placeholder="Ask ${esc(S.agentName)} about this stage…" autocomplete="off"><button class="btn sm red" type="submit">Ask</button></form>
  </div>`;
}
// A plan is one squad's idea for winning the stage: what it is, who runs it, what money it needs
// What a plan still needs in money, after backers and the bonus
export function fundOf(m, s) {
  const need = askOf(s).money, have = raisedOf(s) + matchOf(m, s);
  return { need, have: Math.min(have, need), left: Math.max(0, need - have), pct: Math.min(100, have / need * 100) };
}
// Funding is a quest too: for players who bring money instead of time
export function fundQuest(m, s, cls = "") {
  const f = fundOf(m, s), extra = matchGain(m, s, 10);
  return `<div class="card move ${cls}"><span class="mico" style="background:var(--gold)"><span class="coin" style="width:20px;height:20px"></span></span>
    <div style="min-width:0;flex:1"><b>Fund ${esc(s.squad)}</b><span class="small muted" style="display:block">$${fmt(f.left)} to go${extra > 0 ? ` · your $10 brings about $${fmt(10 + extra)}` : ""}</span>
      <span class="meter" style="margin-top:6px"><i style="width:${f.pct}%;background:var(--gold)"></i></span></div>
    ${Button(stakeOf(s) ? "Add more" : "Fund", { size: "sm", variant: "gold", action: "backsheet", value: s.id })}</div>`;
}
export function strategyScreen() {
  const m = mission(), s = strats(m).find(x => x.id === S.stratId);
  const qs = m.quests.filter(q => q.strat === s.id && !q.parent);
  const f = fundOf(m, s);
  const isLocked = q => !q.done && !q.state && !q.parts && !playable(q);
  const done = qs.filter(q => q.done), locked = qs.filter(isLocked), open = qs.filter(q => !q.done && !isLocked(q));
  const rank = list => [...list].sort((x, y) => questScore(y, m) - questScore(x, m));
  // Your move: one quest that fits you, funding, and a free back. Waiting plans lead with backing.
  const best = rank(open.filter(q => playable(q)))[0];
  const questMove = best ? `<button class="card move" data-a="quest" data-x="${best.id}"><span class="mico">${mono(best.role, 40)}</span>
      <span style="min-width:0;flex:1"><b>${esc(best.title)}</b><span class="small muted" style="display:block">${SIZE[best.size].label} · $${best.coins}${best.gain ? ` · +${best.gain} ${best.gain === 1 ? m.unit.replace(/s$/, "") : m.unit}` : ""}</span>${why(questWhy(best, m))}</span>
      <span class="btn sm blue">Play</span></button>` : "";
  const fundMove = f.left > 0 && s.status !== "review" ? fundQuest(m, s) : "";
  const freeMove = `<button class="card move" data-a="backsheet" data-x="${s.id}"><span class="mico" style="background:var(--pink)">♥</span>
      <span style="min-width:0;flex:1"><b>Cheer it on</b><span class="small muted" style="display:block">Free. More backers means more money for the squad.</span></span><span class="btn sm">Back</span></button>`;
  const moves = s.status ? [fundMove, freeMove, questMove] : S.coins > 200 && !best ? [fundMove, questMove, freeMove] : [questMove, fundMove, freeMove];
  return `<div class="chat">
    <div class="chat-head">${backBtn("back", "stage", "Back")}${stratBadge(s)}
      <div style="min-width:0;flex:1">${where("plan", [chName(m), `Stage ${m.current + 1}`])}<div class="room-title">${esc(s.name)}</div></div></div>
    <div class="stage-list">
      <p class="claim" style="margin:0">${esc(s.bet)}</p>
      <div class="eyebrow">How you can help</div>
      <div class="list">${moves.filter(Boolean).join("")}</div>
      <div class="card milestone">
        <div class="row"><div class="eyebrow">How it's going</div><span class="spacer"></span><span class="chip" style="${s.status ? "background:var(--cream)" : "background:var(--navy);color:var(--white)"}">${s.status ? `Waiting · ${esc(waitWhy(s))}` : "Racing"}</span></div>
        <div class="kvrow"><span>Goal</span><b>${s.score ? `+${s.score} of ${m.target} ${esc(m.unit)}` : `0 of ${m.target} ${esc(m.unit)} yet`}</b></div>
        <div class="kvrow"><span>Quests</span><b>${done.length} done · ${open.length} open · ${locked.length} locked</b></div>
        <div class="kvrow"><span>Money</span><b>$${fmt(f.have)} of $${fmt(f.need)}</b></div>
        <div class="kvrow"><span>Squad</span><b>${esc(s.squad)} · ${PEOPLE[s.lead] ? `<button class="info" data-a="person" data-x="${esc(s.lead)}">${esc(s.lead)}</button>` : esc(s.lead)}</b></div>
      </div>
      ${open.length > (best ? 1 : 0) ? `<div class="eyebrow">${best ? "More open quests" : "Open quests"}</div><div class="list">${rank(open).filter(q => q !== best).map(q => questItem(q, m)).join("")}</div>` : ""}
      ${locked.length ? `<div class="eyebrow">Locked · ${locked.length}</div><div class="list">${locked.map(q => questItem(q, m)).join("")}</div>` : ""}
      ${done.length ? `<div class="eyebrow">Done · ${done.length}</div><div class="list">${done.map(q => questItem(q, m)).join("")}</div>` : ""}
    </div>
    <form class="composer" id="stratBar"><input id="stratsay" placeholder="Ask ${esc(S.agentName)} about this plan…" autocomplete="off"><button class="btn sm red" type="submit">Ask</button></form>
  </div>`;
}
// Back a plan with money or for free. The live estimate shows what your money brings.
export function backSheet(sid) {
  const m = mission(), s = strats(m).find(x => x.id === sid);
  let amt = 10;
  const amounts = [5, 10, 25, 100];
  openSheet({ label: `Back ${s.name}`, render: () => {
    const extra = amt ? matchGain(m, s, amt) : voiceGain(m, s);
    return `<div class="grab"></div>
    <div class="row">${stratBadge(s, 36)}<div style="flex:1;min-width:0"><h2 class="display" style="font-size:20px;color:var(--navy)">Back ${esc(s.name)}</h2><div class="small muted ellip">${esc(s.squad)} · ${backersOf(s)} backers</div></div>${CloseButton()}</div>
    <div class="amounts">${amounts.map(a => `<button data-b="amt" data-v="${a}" aria-pressed="${amt === a}">$${a}</button>`).join("")}</div>
    <div class="estimate">${amt ? `<span>Your $${amt}</span><b>${extra > 0 ? `brings the squad about $${fmt(amt + extra)}` : `goes straight to the squad`}</b>` : `<span>Free</span><b>More backers means more money for the squad</b>`}</div>
    ${Button(amt ? `Back with $${amt}` : "Back it for free", { variant: "red", block: true, "data-b": "go" })}
    ${amt ? `<button class="linkbtn" data-b="amt" data-v="0" style="align-self:center">No money? <b>Back it for free</b></button>` : `<button class="linkbtn" data-b="amt" data-v="10" style="align-self:center">Back it with money instead</button>`}`;
  }, onClick: (e, close, draw) => {
    const b = e.target.closest("[data-b]");
    if (!b) return;
    if (b.dataset.b === "amt") { amt = +b.dataset.v; return draw(); }
    const first = !stakeOf(s) && amt;
    if (amt) { S.stakes[s.id] = stakeOf(s) + amt; S.coins = Math.max(0, S.coins - amt); S.backed = { ...(S.backed || {}), [m.id]: s.id }; contribute(m, { money: amt }); }
    else s.voices = (s.voices || 0) + 1;
    if (first || (!amt && s.status === "proposed")) s.backers++;
    close();
    if (s.status === "proposed" && s.backers >= s.need) { s.status = null; titleCard("Your backing tipped it", "IT'S ON!", esc(s.name), null, 1300); }
    else toast(`${amt ? `Backed ${esc(s.name)} with $${amt}` : `Backed ${esc(s.name)} for free`} ✓`);
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
      ${quickBar([`@${S.agentName} what's next?`, `@${S.agentName} sum up`, "Can someone check this?"])}
      <form class="composer" id="roomComposer"><input id="roomsay" placeholder="${c.proposing ? "Or type your own plan…" : "Message"}" autocomplete="off"><button class="btn sm red" type="submit">Send</button></form>
    </div>`;
  }
  const [q] = findQuest(S.questId);
  const crew = crewOf(q);
  const multi = isMulti(q), tab = S.roomTab || "chat";
  const label = q.verified && !hasSkill(q.skills[0]) ? "Verify to play" : q.human ? "Start · ✋ in person" : "Start quest";
  const actions = q.done ? `<div class="room-bar done">✓ Cleared by ${esc(q.by || duoName())}${q.picked ? ` · “${esc(q.picked)}”` : ""}</div>`
    : q.state ? "" : blockBar(q) || `<div class="room-bar one">${Button(label, { variant: "blue", action: "play", value: q.id })}</div>`;
  return `<div class="chat">
    <div class="chat-head">${backBtn("back", "strategy", "Back")}
      <div style="min-width:0;flex:1"><div class="room-title">${esc(q.title)}</div><div class="small muted">${esc(chName(m))} · <b class="rewardline">$${q.coins}</b></div></div>
      ${multi && crew.length ? `<button class="avbtn" data-a="squad" data-x="${q.id}" aria-label="Squad · ${crew.length}"><span class="stack">${crew.slice(0, 3).map(crewAv).join("")}</span></button>` : ""}</div>
    <div class="roomtabs" role="tablist">
      <button role="tab" data-a="rtab" data-x="chat" aria-selected="${tab === "chat"}">Chat${q.unreadChat ? ` <span class="unread">${q.unreadChat}</span>` : ""}</button>
      <button role="tab" data-a="rtab" data-x="brief" aria-selected="${tab === "brief"}">Brief</button>
    </div>
    ${tab === "brief" ? `<div class="stage-list">${briefDoc(q, m)}</div>` : `<div class="msgs" id="msgs">${q.feed.map(msgHTML).join("")}</div>`}
    ${actions}
    ${tab === "chat" ? `${q.state || q.done ? quickBar([`@${S.agentName} sum up`, "Nice work all", "Can someone check this?"]) : ""}
    <form class="composer" id="roomComposer"><input id="roomsay" placeholder="${multi ? "Message the squad…" : "Message " + esc(S.agentName) + "…"}" autocomplete="off"><button class="btn sm red" type="submit">Send</button></form>` : ""}
  </div>`;
}
// Why a quest can't be played right now, as a one-line bar
function blockBar(q) {
  const dep = lockedBy(q), s = stratOf(q);
  const bar = (txt, btn) => `<div class="room-bar note"><span class="small">${txt}</span>${btn}</div>`;
  if (s && s.status) return bar(`Plan is waiting · ${esc(waitWhy(s))}`, Button("View", { size: "sm", action: "strategy", value: s.id }));
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
// Suggesting a plan and asking about a stage both happen in the one chat with your agent
const pipThread = () => threads.find(x => x.id === "partner");
export function proposeStrategy() {
  const m = mission();
  m.sessions = m.sessions || [];
  const t = pipThread();
  t.msgs.push({ me: true, text: `I want to try another way to win stage ${m.current + 1} of ${chName(m)}` },
    { agent: true, text: `Goal: ${m.stages[m.current].goal}. A few ideas nobody's trying yet. Tap one to start it as a plan:`, ideas: IDEAS[m.id] || ["A smaller first step", "Partner with experts", "Crowdsource it"] });
  go("thread", { thread: "partner" });
}
export function launchStrategy(name) {
  const m = mission();
  const id = "you-" + Date.now();
  const s = { id, name, squad: `${S.name || "Your"}'s squad`, lead: S.name || "you", color: "var(--gold)", score: 0, backers: 1, bet: `${name}. Proposed by ${duoName()}.` };
  strats(m).push(s);
  m.quests.push(
    Q(id + "a", `Write the brief: ${short(name)}`, "strategist", "S", 160, 15, ["outlining the bet…", "risks listed", "brief posted ✓"], { q: "What's the first thing to test?", opts: ["Cheapest test", "Fastest test"] }, { strat: id, gain: 0, out: "strategy-brief.md" }),
    Q(id + "b", `Run a small test of the idea`, "implementer", "M", 300, 30, ["setting up the test…", "first results in", "results posted ✓"], { q: "Results are mixed. Keep going?", opts: ["Double down", "Tweak and re-run"] }, { strat: id, gain: 1, out: "test-results.csv" }),
    Q(id + "c", `Recruit 2 players to the plan`, "connector", "S", 150, 10, ["posting to the channel…", "4 interested", "2 joined ✓"], { q: "Who do we take?", opts: ["Specialists", "Fast movers"] }, { strat: id, gain: 0, out: "2 players joined" }),
  );
  S.backed = { ...(S.backed || {}), [m.id]: id };
  award("trail");
  titleCard("New plan", "IT'S A RACE!", esc(name), () => go("strategy", { stratId: id }), 1500);
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
export function startSession(text) {
  const m = mission(), t = pipThread();
  t.msgs.push({ me: true, text }, { typing: true });
  go("thread", { thread: "partner" });
  setTimeout(() => { t.msgs = t.msgs.filter(x => !x.typing); t.msgs.push(stageAgentReply(m, text)); if (S.screen === "thread") render(); }, 800);
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
      ${ownPct(m) ? `<div class="reward" style="background:var(--white)">${fuelIcon("compute", 22).replace(FUELS.compute.icon, '<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>')}<b>${ownPct(m).toFixed(2)}%</b><span>of ${esc(chName(m))} is yours</span></div>` : ""}
    </div>
    ${called ? `<div class="row wrap" style="justify-content:center"><span class="chip" style="font-size:14px;padding:6px 12px;background:var(--gold)">Called it! +$100</span></div>` : ""}
    <button class="btn gold" data-a="onward">${nextStage ? `On to ${esc(nextStage.name)}` : "Mission won!"}</button>`;
  $("#app").appendChild(el);
  award("gate");
  gain(0, released + bonus + (called ? 100 : 0));
  el.querySelector("[data-a=onward]").addEventListener("click", () => {
    if (nextStage) m.current++;
    const goal = nextStage ? nextStage.goal : "Celebrate";
    const p = m.id + Date.now();
    m.target = 6; m.unit = "results";
    m.strategies = [
      { id: p + "A", name: "Proven path", squad: "Veterans", lead: "Rosa", color: "var(--green)", score: 0, backers: 40, raised: 900, bet: "Do what worked last stage, faster." },
      { id: p + "B", name: "Bold bet", squad: "Moonshots", lead: "Kenji", color: "var(--blue)", score: 0, backers: 25, need: 26, status: "proposed", raised: 400, bet: "Try the risky idea everyone kept talking about." },
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
    titleCard(`Stage ${m.current + 1}`, esc(m.stages[m.current].name), "Pick a plan to back", () => go("stage", { missionId: m.id }));
  });
}

// The one way to put money in: back a plan. Opens your plan if you have one, otherwise the list of plans.
export function fuelSheet(mid) {
  const m = mission(mid), mine = S.backed?.[m.id] && shown(m).find(s => s.id === S.backed[m.id]);
  if (mine && S.missionId === m.id) return backSheet(mine.id);
  go("mission", { missionId: m.id, tab: "squads" });
}
