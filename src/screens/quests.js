import { GLYPHS, Q, ROLES, SIZE, award, roleColor } from "../data/content.js";
import { CloseButton, Stats, openSheet } from "../design/components.js";
import { color } from "../design/tokens.js";
import { FUELS, askOf, contribute, fuelIcon, fuelNum, fuelOf, fundPct, mult, myVotes, questFuel, tok, tokFor, votePower, votesLeft } from "../game/economy.js";
import { questScore, questWhy, stratScore, stratWhy, why } from "../game/personalise.js";
import { gateOf, leaderOf, playable, stratOf, strats } from "../game/strategies.js";
import { lastLine, msgHTML } from "./comms.js";
import { contractSheet } from "./contract.js";
import { S, TEAMMATES } from "../state.js";
import { go, render, renderHud } from "../ui/chrome.js";
import { $, backBtn, bot, botAv, duoName, esc, face, findQuest, fmt, gain, glyph, learn, mission, mono, thread, titleCard, toast, youAv } from "../ui/helpers.js";

// ===================== Stage → strategies → quests (rooms) =====================
export const chName = m => "#" + m.stages[m.current].name.toLowerCase().replace(/\s+/g, "-");
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
  g8: { task: "Find out which of 40 approved drugs can cross the blood–brain barrier well enough to reach the tumour.", done: ["A BBB score for all 40 drugs", "Weak crossers marked, not dropped", "Shortlist handed to the Wet Lab milestone"], inputs: ["fda-approved-40.csv", "cns-permeability-db · via Moss"] },
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
    <div class="row wrap small" style="gap:6px"><span class="rtag" style="background:${roleColor(q.role)}">${ROLES[q.role].name}</span><span class="size">${SIZE[q.size].label}</span><span class="muted">${isMulti(q) ? "Squad" : "Solo"} · edited by ${esc(q.editedBy || s.lead)}</span></div>
    <h3>The task</h3><p>${esc(b.task || q.title + ".")}</p>
    <h3>Why it matters</h3><p>${esc(s.bet)} ${q.gain ? `Moves the gate: “${esc(st.goal)}”.` : `Unblocks the rest of the strategy.`}</p>
    <h3>Done when</h3><ul class="checks">${done.map(d => `<li class="${q.done ? "on" : ""}">${esc(d)}</li>`).join("")}</ul>
    ${b.inputs ? `<h3>Inputs</h3>${b.inputs.map(f => `<div class="filechip">${FILE_ICON}${esc(f)}</div>`).join("")}` : ""}
    ${q.out ? `<h3>Ships</h3><div class="filechip">${FILE_ICON}${esc(q.out)}</div>` : ""}
    ${notes.length ? `<h3>Decisions so far</h3><ul class="notes">${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    <h3>Who's on it</h3>
    <div class="row wrap" style="gap:8px">${crew.map(x => `<span class="who-chip">${crewAv(x)}${esc(x.who)}</span>`).join("")}<span class="who-chip">${youAv()}${esc(S.name || "You")} & ${esc(S.agentName)}</span>${q.needs ? `<span class="small" style="color:var(--red);font-weight:700">${Math.max(0, q.needs - crew.length - 1)} slots open</span>` : ""}</div>
  </article>`;
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
  if (q.state === "call") return `<span class="qstat call">Your call</span>`;
  if (q.state === "review") return `<span class="qstat review">In review</span>`;
  if (q.state) return `<span class="qstat live">Playing</span>`;
  const crew = crewOf(q);
  return crew.length ? `<span class="stack">${crew.slice(0, 3).map(crewAv).join("")}</span>` : `<span class="qstat">Open</span>`;
}
export function gateBar(m, h = 16) {
  const g = gateOf(m);
  return `<div class="gate stacked" style="height:${h}px">${strats(m).map(s => `<i style="width:${Math.min(100, s.score / g.need * 100)}%;background:${s.color}"></i>`).join("")}</div>`;
}
export function questItem(q, m) {
  const parts = q.parts ? q.parts.map(id => m.quests.find(x => x.id === id)) : [];
  const row = (x, cls = "") => `<button class="card qitem ${cls} ${x.size === "Boss" ? "boss" : ""} ${x.done ? "done" : ""}" ${x.parts ? "disabled" : `data-a="quest" data-x="${x.id}"`}>
      ${mono(x.role, 36)}
      <span style="min-width:0"><b class="qt">${x.size === "Boss" ? "★ " : ""}${esc(x.title)}</b>
        <span class="small muted" style="display:block">${x.parts ? `Split into ${parts.length} parts` : `${SIZE[x.size].label} · +${x.xp} XP${x.gain ? ` · <b style="color:var(--navy)">+${x.gain} ${x.gain === 1 ? m.unit.replace(/s$/, "") : m.unit}</b>` : ""}`}${S.roles.includes(x.role) && !x.done && !x.parts ? ` · <b style="color:var(--green-d)">2×</b>` : ""}</span></span>
      ${questStatus(x)}${!x.done && !x.parts && cls !== "part" ? `<span class="why-row">${why(questWhy(x, m))}</span>` : ""}</button>`;
  return q.parts ? `<div class="qtree">${row(q, "parent")}<div class="parts">${parts.map(p => row(p, "part")).join("")}</div></div>` : row(q);
}
export function fundingRound(m) {
  const pool = Math.round(fuelOf(m).money[0] * .5), left = votesLeft(m), locked = S.locked[m.id], open = S.showAll["f-" + m.id];
  return `<div class="card fround">
    <button class="fhead" data-a="showall" data-x="f-${m.id}" aria-expanded="${!!open}"><b class="display" style="font-size:17px;color:var(--navy)">Funding round</b><span class="small"><b>$${fmt(pool)}</b> · ${locked ? "locked" : `${left} votes left`}</span><span class="spacer"></span><span class="chip" style="background:var(--red);color:var(--white)">${locked ? "Locked" : "2d"}</span><span class="chev">${open ? "▴" : "▾"}</span></button>
    ${open ? `${locked ? "" : `<p class="small muted">Each vote moves ${votePower(m)} ${tok(m)}.</p>`}
    ${[...strats(m)].sort((a, b) => stratScore(b, m) - stratScore(a, m)).map(s => `<div class="vrow">
      <span class="vdot" style="background:${s.color}"></span><span class="vname">${esc(s.name)}</span>
      ${locked ? "" : `<button class="vbtn" data-a="vote" data-x="${s.id}" data-d="-1" ${myVotes(m)[s.id] ? "" : "disabled"} aria-label="Remove vote">−</button><b class="vn">${myVotes(m)[s.id] || 0}</b><button class="vbtn" data-a="vote" data-x="${s.id}" data-d="1" ${left ? "" : "disabled"} aria-label="Add vote">+</button>`}
      <span class="vpct">${fundPct(m, s)}%</span></div>`).join("")}
    ${locked ? "" : `<button class="btn blue sm block" data-a="lockvotes" ${left < 5 ? "" : "disabled"}>Lock my votes</button>`}` : ""}
  </div>`;
}
export function stageScreen() {
  const m = mission();
  m.unread = 0;
  m.sessions = m.sessions || [];
  const g = gateOf(m), lead = leaderOf(m);
  const card = s => {
    const open = m.quests.filter(q => q.strat === s.id && playable(q)).length;
    const mine = S.backed?.[m.id] === s.id;
    const ask = askOf(s), funded = Math.round(fundPct(m, s) / 100 * fuelOf(m).money[1]);
    const tags = [s === lead && s.score ? `<span class="chip" style="background:var(--navy);color:var(--white)">Leading</span>` : "", mine ? `<span class="chip" style="background:var(--gold)">Backed</span>` : ""].join("");
    const reason = stratWhy(s, m).filter(([, t]) => !/backed|leading/i.test(t));
    return `<button class="card strat" data-a="strategy" data-x="${s.id}">
      ${stratBadge(s)}
      <span style="min-width:0"><span class="sname">${esc(s.name)}</span>
        <span class="small muted" style="display:block">${esc(s.squad)} · led by ${esc(s.lead)}</span>
        ${tags || reason.length ? `<span class="row wrap" style="gap:6px;margin-top:6px">${tags}${why(reason)}</span>` : ""}
        <span class="sbet">${esc(s.bet)}</span>
        <span class="budget"><span class="meter"><i style="width:${Math.min(100, funded / ask.money * 100)}%;background:var(--gold)"></i></span><span class="small"><b>$${fmt(Math.min(funded, ask.money))}</b> of $${fmt(ask.money)} · <b style="color:${s.color === "var(--gold)" ? "var(--ink)" : s.color}">+${s.score}</b> ${s.score === 1 ? m.unit.replace(/s$/, "") : m.unit} · ${open} open</span></span></span>
    </button>`;
  };
  return `<div class="chat">
    <div class="chat-head">${backBtn("back", "", "Back")}${chanIcon(m)}
      <div style="min-width:0;flex:1"><div class="display chan-name">${chName(m)}</div><div class="small muted ellip">${esc(m.title)} · milestone ${m.current + 1}/${m.stages.length}</div></div></div>
    <div class="stage-list">
      <div class="card milestone">
        <div class="eyebrow">Milestone ${m.current + 1} gate</div>
        <div class="mgoal">${esc(m.stages[m.current].goal)}</div>
        ${gateBar(m)}
        <div class="row small"><b>${g.have}/${g.need} ${g.unit}</b><span class="spacer"></span><span class="muted">${strats(m).length} strategies racing</span></div>
      </div>
      ${(() => {
        const all = [...strats(m)].sort((a, b) => stratScore(b, m) - stratScore(a, m));
        const picks = all.filter(x => stratScore(x, m) > 0).slice(0, 2);
        const top = picks.length ? picks : all.slice(0, 2);
        const rest = all.filter(x => !top.includes(x)), more = fuelOf(m).more[0];
        const open = S.showAll["s-" + m.id];
        return `<div class="row"><div class="eyebrow">For you</div><span class="spacer"></span><button class="btn sm" data-a="propose">+ Propose one</button></div>
          <div class="list">${top.map(card).join("")}</div>
          <button class="seeall" data-a="showall" data-x="s-${m.id}">${open ? "Hide" : "See all"} ${all.length + more} strategies</button>
          ${open ? `<div class="list">${rest.map(card).join("")}</div><div class="small muted" style="text-align:center">+ ${more} smaller strategies</div>` : ""}`;
      })()}
      ${S.joined[m.id] ? fundingRound(m) : ""}
      ${m.sessions.length ? `<div class="eyebrow">Chats</div><div class="list">${m.sessions.map(c => `
        <button class="card thread-row" data-a="session" data-x="${c.id}">${botAv("av")}<span style="min-width:0"><span class="t" style="display:block">${esc(c.title)}</span><span class="last" style="display:block">${esc(lastLine(c.msgs))}</span></span><span class="small muted">chat</span></button>`).join("")}</div>` : ""}
    </div>
    <form class="composer" id="stageBar"><input id="stagesay" placeholder="Ask ${esc(S.agentName)} or start a chat…" autocomplete="off"><button class="btn sm red" type="submit">Start</button></form>
  </div>`;
}
export function strategyScreen() {
  const m = mission(), s = strats(m).find(x => x.id === S.stratId);
  const qs = m.quests.filter(q => q.strat === s.id && !q.parent);
  const backed = S.backed?.[m.id] === s.id;
  const you = S.contrib?.[s.id] || 0;
  return `<div class="chat">
    <div class="chat-head">${backBtn("go", "stage", "Back to strategies")}${stratBadge(s)}
      <div style="min-width:0;flex:1"><div class="room-title">${esc(s.name)}</div><div class="small muted ellip">${esc(s.squad)} · ${chName(m)}</div></div></div>
    <div class="stage-list">
      <div class="card milestone">
        <div class="eyebrow">The bet</div>
        <p style="font-weight:600">${esc(s.bet)}</p>
        ${Stats([[`+${s.score}`, m.unit], [you ? "+" + you : "—", "from you"], [s.backers + (backed ? 1 : 0), "backers"]])}
        ${(() => { const a = askOf(s), f = fundPct(m, s) / 100; return `<div class="eyebrow">Budget · ${fundPct(m, s)}% of this round</div><div class="asks">${[["money", a.money], ["time", a.time], ["compute", a.compute]].map(([k, v]) => `<div class="ask"><span class="row" style="gap:5px"><span class="fi" style="background:${FUELS[k].color};width:22px;height:22px;border-radius:6px">${fuelIcon(k, 12)}</span><span class="fname">${FUELS[k].name}</span></span><span class="meter"><i style="width:${Math.min(100, f * 140)}%;background:${FUELS[k].color}"></i></span><span class="fnum">${fuelNum(k, Math.round(v * Math.min(1, f * 1.4)))} / ${fuelNum(k, v)}</span></div>`).join("")}</div>`; })()}
        <button class="btn ${backed ? "gold" : "red"} block" data-a="backit" data-x="${s.id}">${backed ? "✓ Backed" : "Back this strategy"}</button>
        <div class="small muted" style="text-align:center;margin-top:-2px">+$100 if it leads at the gate</div>
      </div>
      ${(() => {
        const ranked = [...qs].sort((a, b) => (b.done ? -9 : questScore(b, m)) - (a.done ? -9 : questScore(a, m)));
        const top = ranked.filter(q => !q.done && questScore(q, m) > 1).slice(0, 3), rest = ranked.filter(q => !top.includes(q));
        const open = S.showAll["q-" + s.id];
        return `${top.length ? `<div class="eyebrow">For you</div><div class="list">${top.map(q => questItem(q, m)).join("")}</div>` : ""}
          <button class="seeall" data-a="showall" data-x="q-${s.id}">${open ? "Hide" : "See all"} ${qs.length} quests in this strategy</button>
          ${open || !top.length ? `<div class="list">${rest.map(q => questItem(q, m)).join("")}</div>` : ""}`;
      })()}
    </div>
    <form class="composer" id="stratBar"><input id="stratsay" placeholder="Talk strategy with ${esc(S.agentName)}…" autocomplete="off"><button class="btn sm red" type="submit">Start</button></form>
  </div>`;
}
// One room layout for quests and chat sessions
export function roomScreen() {
  const m = mission();
  if (S.screen === "session") {
    const c = m.sessions.find(x => x.id === S.sessionId);
    return `<div class="chat">
      <div class="chat-head">${backBtn("go", "stage", "Back to strategies")}${botAv("av big")}<div style="min-width:0"><div class="display chan-name">${esc(c.title)}</div><div class="small muted">${chName(m)} · chat</div></div></div>
      <div class="msgs" id="msgs">${c.msgs.map(msgHTML).join("")}</div>
      ${quickBar([`@${S.agentName} what's next?`, `@${S.agentName} sum up`, "Need a Critic"])}
      <form class="composer" id="roomComposer"><input id="roomsay" placeholder="${c.proposing ? "Or type your own strategy…" : "Message"}" autocomplete="off"><button class="btn sm red" type="submit">Send</button></form>
    </div>`;
  }
  const [q] = findQuest(S.questId);
  const s = stratOf(q);
  const crew = crewOf(q);
  const tm = mission();
  const canSolo = S.sync >= SIZE[q.size].need;
  const canSplit = q.size === "M" && !q.parent;
  const multi = isMulti(q), tab = S.roomTab || "chat";
  const actions = q.done ? `<div class="room-bar done">✓ Cleared by ${esc(q.by || duoName())}${q.picked ? ` · “${esc(q.picked)}”` : ""}</div>`
    : q.state ? "" : `<div class="room-bar ${canSplit ? "three" : ""}">
        <button class="btn ${q.size === "Boss" ? "red" : "blue"}" data-a="play" data-x="${q.id}" data-mode="together">Play with ${esc(S.agentName)}</button>
        <button class="btn" data-a="play" data-x="${q.id}" data-mode="solo" ${canSolo ? "" : "disabled"}>${canSolo ? `Send ${esc(S.agentName)}` : `Sync ${SIZE[q.size].need}%`}</button>
        ${canSplit ? `<button class="btn" data-a="split" data-x="${q.id}" title="Break it into smaller parts">Split</button>` : ""}</div>`;
  return `<div class="chat">
    <div class="chat-head">${backBtn("go", "strategy", "Back to strategy")}${mono(q.role, 40)}
      <div style="min-width:0;flex:1"><div class="room-title">${esc(q.title)}</div>
        <div class="row small muted" style="gap:6px">${multi ? `<span class="mode multi">Squad</span>${crew.length ? `<span class="stack">${crew.slice(0, 4).map(crewAv).join("")}</span> ${crew.length}` : ""}` : `<span class="mode">Solo</span>`}<span class="rewardline">$${q.coins} · +${fmt(tokFor(tm, questFuel(q)))} ${tok(tm)}</span></div></div></div>
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
export function playQuest(id, mode) {
  const [q, m] = findQuest(id);
  if (!S.joined[m.id]) { S.pendingQuest = { id, mode }; return contractSheet(m.id); }
  if (q.state || q.done || q.parts) return go("quest", { missionId: m.id, questId: id, stratId: q.strat });
  S.roomTab = "chat"; q.unreadChat = 0;
  if (!(S.screen === "quest" && S.questId === id)) go("quest", { missionId: m.id, questId: id, stratId: q.strat });
  q.state = "run"; q.mode = mode;
  postQ(q, m, { me: true, text: mode === "together" ? `@${S.agentName} let's do this together` : `@${S.agentName} take this one for me` });
  const run = { agent: true, text: mode === "together" ? "On it. I'll need you for one call." : "On it.", run: q.id, phase: 1, p: 0 };
  postQ(q, m, run);
  const dur = q.size === "Boss" ? 2400 : 1600;
  if (mode === "together") {
    return animate(run, 0, 1, dur, q.log.slice(0, 2), () => { q.state = "call"; postQ(q, m, { agent: true, call: q.id, text: q.call.q }); });
  }
  // Solo: the agent guesses the call from what it has learned of you
  const guess = q.call.opts[S.learned.length % q.call.opts.length];
  q.picked = guess + " (guessed)";
  animate(run, 0, 1, dur * 1.6, [q.log[0], q.log[1], `going with “${guess}”`, q.log[2]], () => submitQuest(q, m));
}
export function pickCall(id, i) {
  const [q, m] = findQuest(id);
  if (q.state !== "call") return;
  q.picked = q.call.opts[i];
  learn(`${q.call.q.replace(/\?$/, "")} → “${q.picked}”`);
  q.state = "run";
  q.feed.forEach(x => { if (x.call === id) x.answered = q.picked; });
  postQ(q, m, { me: true, text: q.picked });
  toast(`${esc(S.agentName)} learned that`);
  const run = { agent: true, text: "Got it.", run: q.id, phase: 2, p: 0 };
  postQ(q, m, run);
  animate(run, 0, 1, q.size === "Boss" ? 2000 : 1300, [`on it: “${q.picked}”`, q.log[2]], () => submitQuest(q, m));
}
// Work counts only once a Critic has checked it
export function submitQuest(q, m) {
  q.state = "review";
  postQ(q, m, { agent: true, text: "Done. Submitted for review:", file: q.out || `${short(q.title)} · notes.md` });
  const reviewer = q.role === "critic" ? ["Ade", "var(--leaf)"] : ["Rosa", "var(--pink)"];
  setTimeout(() => postQ(q, m, { who: reviewer[0], color: reviewer[1], text: q.role === "critic" ? "Spot-checked 5 of them. Agree. Approved ✓" : "Re-ran it on my side. Reproduces. Approved ✓" }), 1100);
  setTimeout(() => approveQuest(q, m), 1700);
}
export function approveQuest(q, m) {
  q.done = true; q.state = null;
  const s = stratOf(q);
  const together = q.mode === "together";
  const mult = (S.roles.includes(q.role) ? 2 : 1) * (together ? 1.5 : 1);
  const xp = Math.round(q.xp * mult);
  together ? S.together++ : S.solo++;
  s.score += q.gain || 0;
  S.contrib = S.contrib || {};
  S.contrib[s.id] = (S.contrib[s.id] || 0) + (q.gain || 0);
  gain(xp, q.coins, together ? 6 : 1);
  const qf = questFuel(q), shares = contribute(m, qf);
  S.wallet.timeCredits += qf.time; S.wallet.insights += qf.know + (together ? 1 : 0);
  award("spark");
  if (S.together === 3) award("sync");
  if (S.sync >= 70) award("proxy");
  if (!together) award("mind");
  m.news = [`${duoName()} cleared “${q.title}”${q.gain ? ` · +${q.gain} ${m.unit}` : ""}`, ...(m.news || [])];
  postQ(q, m, { sys: `✓ Approved · +${xp} XP · +$${q.coins} · +${qf.time}h credit · +${shares} ${tok(m)}${q.gain ? ` · ${s.name} +${q.gain} ${m.unit}` : ""}`, win: true });
  S.raid++;
  if (S.raid === 3) { S.coins += 50; award("raider"); setTimeout(() => titleCard("Daily raid", "RAID CLEARED!", "+$50 · crate unlocked", null, 1600), 80); }
  // A finished part may finish its parent
  let boss = null;
  if (q.parent) {
    const p = m.quests.find(x => x.id === q.parent);
    if (p.parts.every(id => m.quests.find(x => x.id === id).done)) { p.done = true; p.by = "the squad"; if (p.size === "Boss") boss = p; }
  }
  const g = gateOf(m), cleared = g.have >= g.need;
  const crew = crewOf(q).filter(x => !x.bot);
  const [n, c] = crew.length ? [crew[0].who, crew[0].color] : TEAMMATES[q.id.length % TEAMMATES.length];
  if (!cleared) setTimeout(() => postQ(q, m, { who: n, color: c, text: [`Nice. Gate's at ${g.have}/${g.need}.`, "Huge. Keep going.", "Clean work, you two."][S.together % 3] }), 900);
  const next = () => (cleared ? stageCleared(m) : null);
  if (boss) { award("slayer"); titleCard("Boss down", "KNOCKOUT!", esc(boss.title), next, 1600); }
  else if (cleared) setTimeout(next, 600);
}
// Break a big quest into parts anyone can pick up
export function splitQuest(id) {
  const [q, m] = findQuest(id);
  postQ(q, m, { me: true, text: `@${S.agentName} this is too big. Split it?` });
  setTimeout(() => postQ(q, m, { agent: true, text: "Here's how I'd split it:", split: id }), 600);
}
export function doSplit(id) {
  const [q, m] = findQuest(id);
  const t = short(q.title), xp = Math.round(q.xp / 3), coins = Math.round(q.coins / 3);
  const mk = (suffix, title, role, gain, out, call) => Q(`${id}-${suffix}`, title, role, "S", xp, coins, ["reading the brief…", "halfway", "done ✓"], call, { strat: q.strat, parent: id, gain, out });
  const parts = [
    mk("a", `Scope it: ${t}`, "strategist", 0, "scope.md", { q: "How narrow should we go?", opts: ["Smallest useful version", "Cover the edge cases"] }),
    mk("b", `Do it: ${t}`, q.role, q.gain, q.out, q.call),
    mk("c", `Check it: ${t}`, "critic", 0, "review.md", { q: "One result looks off. What now?", opts: ["Send it back", "Note it and approve"] }),
  ];
  m.quests.push(...parts);
  q.parts = parts.map(p => p.id); q.gain = 0;
  q.feed.forEach(x => { if (x.split === id) x.splitDone = true; });
  toast("Split into 3 parts");
  go("strategy", { stratId: q.strat });
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
    { me: true, text: `@${S.agentName} I want to try another way to hit this milestone` },
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
    return q ? { agent: true, text: "This one fits you:", quest: q.id } : { agent: true, text: "Nothing open. Gate's close." };
  }
  if (low.includes("brief") && S.questId) {
    const [q] = findQuest(S.questId);
    const b = BRIEF[q.id];
    return { agent: true, text: `Read it. ${b ? b.done.length + " things to finish" : "Ship the result and get it reviewed"}${q.notes?.length ? `, and I'll follow: ${q.notes[q.notes.length - 1]}` : ""}. Ready when you are.` };
  }
  if (low.includes("sum")) {
    const g = gateOf(m), l = leaderOf(m);
    return { agent: true, text: `Gate at ${g.have}/${g.need} ${g.unit}. ${l.name} leads with +${l.score}. ${g.need - g.have} to go.` };
  }
  learn(`You said: “${text.replace(/@\S+\s*/, "")}”`);
  gain(0, 0, 1);
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
    postQ(q, m, { who: x.who, owner: x.owner, bot: x.bot, color: x.color, text: x.bot ? "Noted. Logging it for the squad." : ["On it with my agent.", "Copy. See you at the gate vote.", "Our agents can split the rest."][q.feed.length % 3] });
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
  const share = Math.round(m.bounty * .12 * .02);
  el.innerHTML = `${conf}<div class="top">${esc(m.title)}</div><div class="cup big">GATE<br>OPEN!</div>
    <p style="font-weight:700">${esc(top.name)} led with +${top.score} ${m.unit}. Guardians 9–0.</p>
    <div class="rewards">
      <div class="reward" style="background:${FUELS.money.color}">${fuelIcon("money", 22)}<b>+$${fmt(share)}</b><span>bounty share</span></div>
      <div class="reward" style="background:${FUELS.time.color}">${fuelIcon("time", 22)}<b>${S.wallet.timeCredits}h</b><span>time credits</span></div>
      <div class="reward" style="background:${FUELS.know.color}">${fuelIcon("know", 22)}<b>${S.wallet.insights}</b><span>insights · rep</span></div>
      <div class="reward" style="background:var(--white)">${fuelIcon("compute", 22).replace(FUELS.compute.icon, '<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>')}<b>${fmt(S.wallet.shares[m.id] || 0)}</b><span>${tok(m)} held</span></div>
    </div>
    <div class="row wrap" style="justify-content:center">${called ? `<span class="chip" style="font-size:14px;padding:6px 12px;background:var(--gold)">Called it! +$100</span>` : ""}<button class="chip crate" data-crate style="font-size:14px;padding:6px 12px">? Open crate</button></div>
    <button class="btn gold" data-a="onward">${nextStage ? `On to ${esc(nextStage.name)}` : "Mission won!"}</button>`;
  $("#app").appendChild(el);
  award("gate");
  gain(0, Math.round(share / 20) + (called ? 100 : 0));
  el.querySelector("[data-crate]").addEventListener("click", e => {
    const loot = [["+$40", () => { S.coins += 40; }], ["Night Owl badge", () => award("owl")], ["+5 Sync", () => { S.sync = Math.min(100, S.sync + 5); }]][Math.floor(Math.random() * 3)];
    loot[1](); renderHud();
    e.currentTarget.outerHTML = `<span class="chip" style="font-size:14px;padding:6px 12px;background:var(--gold)">${loot[0]}</span>`;
  }, { once: true });
  el.querySelector("[data-a=onward]").addEventListener("click", () => {
    if (nextStage) m.current++;
    const goal = nextStage ? nextStage.goal : "Celebrate";
    const p = m.id + Date.now();
    m.target = 6; m.unit = "results";
    m.strategies = [
      { id: p + "A", name: "Proven path", squad: "Veterans", lead: "Rosa", color: "var(--green)", score: 0, backers: 40, bet: "Do what worked last milestone, faster." },
      { id: p + "B", name: "Bold bet", squad: "Moonshots", lead: "Kenji", color: "var(--blue)", score: 0, backers: 25, bet: "Try the risky idea everyone kept talking about." },
    ];
    m.quests = [
      Q(p + "a", `Gather everything known about “${goal}”`, "explorer", "S", 180, 15, ["searching 18k sources…", "brief drafted", "brief posted ✓"], { q: "Where should we dig first?", opts: ["Recent papers", "What other squads tried", "Talk to practitioners"] }, { strat: p + "A", gain: 1, out: "research-brief.md" }),
      Q(p + "b", "Build the tooling this milestone needs", "implementer", "M", 320, 30, ["scaffolding…", "tests passing", "deployed ✓"], { q: "Build fast or build solid?", opts: ["Fast — we'll refactor later", "Solid — this will last"] }, { strat: p + "A", gain: 2, out: "tooling · PR" }),
      Q(p + "c", "Prototype the risky idea", "inventor", "M", 300, 30, ["sketching…", "prototype runs", "demo posted ✓"], { q: "It half works. Ship the demo?", opts: ["Ship it", "One more day"] }, { strat: p + "B", gain: 2, out: "prototype · demo" }),
      Q(p + "d", "Stress-test the prototype", "critic", "S", 200, 20, ["running checks…", "2 issues found", "report posted ✓"], { q: "2 issues found. Block it?", opts: ["Block until fixed", "Ship with notes"] }, { strat: p + "B", gain: 1, out: "stress-test.md" }),
    ];
    m.sessions = [];
    el.remove();
    titleCard(`Milestone ${m.current + 1}`, esc(m.stages[m.current].name), "Ready? Go!", () => go("mission", { missionId: m.id, tab: "map" }));
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
