import { ROLES, SIZE } from "../data/content.js";
import { PEOPLE, TOOLS, TRUST, VERIFY } from "../data/world.js";
import { DetailGroup as Group, DetailRow as Row, Tick, drill } from "../design/components.js";
import { ledgerOf } from "../game/economy.js";
import { hasSkill } from "../game/personalise.js";
import { stratOf, strats } from "../game/strategies.js";
import { chanIcon, crewAv, crewOf, short, stratBadge } from "./quests.js";
import { S, threads } from "../state.js";
import { go, renderHud } from "../ui/chrome.js";
import { botAv, duoName, esc, face, findQuest, fmt, mission, thread, youAv } from "../ui/helpers.js";

// ===================== Drill-downs =====================
// Every real-world detail opens in a sheet over the game, so the main screens stay a game.

export function notifSheet() {
  S.notifs.forEach(n => { n.read = true; });
  renderHud();
  drill("Updates", S.notifs.length ? `<div class="dgroup">${S.notifs.map(n => {
    const [q, m] = n.q ? findQuest(n.q) : [];
    return `<button class="drow" ${q ? `data-a="openq" data-x="${m.id}" data-q="${q.id}"` : ""}>${botAv()}<span style="min-width:0"><b style="font-weight:600">${esc(n.text)}</b><span class="small muted" style="display:block">${esc(n.when || "just now")}</span></span><span class="muted">${q ? "›" : ""}</span></button>`;
  }).join("")}</div>` : `<p class="muted">All caught up.</p>`, `${esc(S.agentName)} pings you here when work finishes or needs you`);
}

export const trustOf = m => TRUST[m.id] || { who: m.creator, cred: "Mission creator", verified: ["Email"], funders: [[m.creator, m.bounty]], record: "First mission", safety: "Auto-check passed", deliver: m.rules, fail: "Unspent escrow goes back to funders. Approved work stays paid." };
export function trustSheet(m) {
  const t = trustOf(m), total = t.funders.reduce((a, [, v]) => a + v, 0);
  drill("Can I trust it?", `${Group([
      Row(Tick(1), esc(t.who), `${esc(t.cred)} · verified by ${t.verified.join(", ")}`),
      Row(Tick(1), `$${fmt(total)} in escrow`, "Locked before launch. Paid out only as stages clear."),
      Row(Tick(1), "Safety review", esc(t.safety)),
      Row("★", "Track record", esc(t.record)),
    ])}
    <div class="eyebrow">Who put up the bounty</div>
    ${Group(t.funders.map(([n, v]) => Row(`<span class="coin"></span>`, esc(n), "", `<b>$${fmt(v)}</b>`)))}
    <div class="eyebrow">What we hand over</div><ol class="wins">${t.deliver.map(d => `<li>${esc(d)}</li>`).join("")}</ol>
    <div class="eyebrow">If it stops</div><p class="small">${esc(t.fail)}</p>`, esc(m.title));
}
export function ledgerSheet(m) {
  const all = ledgerOf(m), total = all.reduce((a, x) => a + x.amt, 0);
  drill("Ledger", `<div class="small muted">$${fmt(total)} spent this stage. Every spend has a receipt.</div>
    ${Group(all.map(x => Row("$", esc(x.what), `${esc(x.squad)} · ${esc(x.when)} · receipt ✓`, `<b>$${fmt(x.amt)}</b>`)))}
    <button class="btn block" data-a="flagspend">Flag a spend for the Referees</button>`, esc(m.title));
}
export function manageSheet(m) {
  const pend = strats(m).filter(s => s.status === "review");
  drill("Manage mission", Group([
    Row("✎", "Strategy proposals", pend.length ? `${pend.length} waiting for your OK` : "None waiting", pend.length ? `<button class="btn sm red" data-a="approvestrat">Approve</button>` : ""),
    Row("$", "Escrow", `$${fmt(m.bounty)} locked · nothing pending`, `<button class="btn sm" data-a="topup">Top up</button>`),
    Row("🔒", "Stages", "You can edit future stages. The current one is locked."),
    Row("⚑", "Reports", "No flagged spends or disputes"),
  ]), esc(m.title));
}
export function personSheet(n) {
  const p = PEOPLE[n];
  if (!p) return;
  drill(esc(n), `<div class="row" style="gap:12px"><span class="av big">${face(p.color, n.length)}</span><div style="min-width:0"><b>${esc(p.bio)}</b><div class="small muted">${esc(p.squad)}${p.agent ? ` · agent ${esc(p.agent)}` : ""}</div></div></div>
    <div class="stats"><div class="stat"><b>★ ${p.rep}</b><span>review score</span></div><div class="stat"><b>${p.quests}</b><span>quests cleared</span></div><div class="stat"><b>${ROLES[p.role].name}</b><span>main role</span></div></div>
    <div class="eyebrow">Skills</div>
    ${Group(p.skills.map(([k, h]) => Row(Tick(/verified/.test(h), "✓", "~"), esc(k), esc(h))))}
    <div class="qbtns"><button class="btn blue" data-a="dm" data-x="${esc(n)}">Message</button><button class="btn" data-a="pair" data-x="${esc(n)}">Pair up</button></div>`, "Player profile");
}
export function openDM(n) {
  let t = thread("dm-" + n);
  if (!t) { t = { id: "dm-" + n, kind: "dm", person: n, title: n, unread: 0, msgs: [{ sys: `${n} · ★ ${PEOPLE[n].rep} · ${PEOPLE[n].squad}` }] }; threads.push(t); }
  go("thread", { thread: t.id });
}
// Squad formation: slots carry the detailed skill requirements
export function squadSheet(q) {
  const s = stratOf(q), humans = crewOf(q).filter(x => !x.bot).map(x => x.who);
  const n = Math.max(q.needs || 0, humans.length + 1, 3);
  const slots = [{ role: q.role, req: (q.skills || [])[0] || ROLES[q.role].does, who: "you" }, ...humans.map(h => ({ role: (PEOPLE[h] || {}).role || "helper", req: PEOPLE[h] ? PEOPLE[h].skills[0][0] : "", who: h }))];
  const open = [["critic", `Verified ${(q.skills || ["review"])[0]} · not in ${s.squad}`], ["investigator", "Can read papers fast"], ["implementer", (q.skills || ["Python"])[0]]];
  for (let i = 0; slots.length < n; i++) slots.push({ role: open[i % 3][0], req: open[i % 3][1], who: null });
  const recs = Object.keys(PEOPLE).filter(p => !humans.includes(p)).sort((a, b) => PEOPLE[b].rep - PEOPLE[a].rep).slice(0, 3);
  const pav = p => `<button class="avbtn" data-a="person" data-x="${esc(p)}">${crewAv({ who: p, color: PEOPLE[p] ? PEOPLE[p].color : "var(--paper-2)" })}</button>`;
  drill("Squad", `<div class="small muted">${n} slots · every player brings their own agent</div>
    <div class="dgroup">${slots.map(x => `<div class="drow">${x.who === "you" ? youAv() : x.who ? pav(x.who) : `<span class="mono open-slot">+</span>`}<span style="min-width:0"><b>${x.who === "you" ? esc(duoName()) : x.who ? esc(x.who) : "Open slot"}</b><span class="small muted" style="display:block">${ROLES[x.role].name} · ${esc(x.req)}</span></span>${x.who ? `<span class="ok small">✓</span>` : `<span class="qstat">Open</span>`}</div>`).join("")}</div>
    ${slots.some(x => !x.who) ? `<div class="eyebrow">Good fits for the open slots</div><div class="dgroup">${recs.map(p => { const P = PEOPLE[p], inv = (q.invited || []).includes(p); return `<div class="drow">${pav(p)}<span style="min-width:0"><b>${esc(p)}</b><span class="small muted" style="display:block">${ROLES[P.role].name} · ★ ${P.rep} · ${esc(P.skills[0][0])}${/verified/.test(P.skills[0][1]) ? " ✓" : ""}</span></span>${inv ? `<span class="small muted">Invited</span>` : `<button class="btn sm blue" data-a="invite" data-x="${esc(p)}" data-q="${q.id}" data-keep="1">Invite</button>`}</div>`; }).join("")}</div>` : ""}
    <div class="eyebrow">Squad rules</div>
    <ul class="news"><li>Pay splits by approved work, not time online</li><li>The lead and players edit the brief. Others suggest changes</li><li>No word for 3 days and your slot reopens</li><li>Critics always come from another squad</li></ul>`, esc(short(q.title)), () => squadSheet(q));
}
export function reqSheet(q) {
  const sk = q.skills || [], tl = q.tools || [];
  drill("What it needs", `${sk.length ? `<div class="eyebrow">Skills</div>${Group(sk.map(k => { const h = S.skills.find(([n]) => n === k); return Row(Tick(h), esc(k), h ? esc(h[1]) : q.verified ? "Must be verified to play" : `${esc(S.agentName)} can cover it. A verified Critic checks the result.`, h ? "" : `<button class="btn sm" data-a="verify" data-x="${esc(k)}">Verify</button>`); }))}` : ""}
    ${tl.length ? `<div class="eyebrow">Tools · where the work happens</div>${Group(tl.map(t => Row(Tick(S.tools[t]), esc(t), esc(TOOLS[t] || ""), S.tools[t] ? `<span class="small muted">connected</span>` : `<button class="btn sm" data-a="tool" data-x="${esc(t)}" data-keep="1">Connect</button>`)))}` : ""}
    <div class="eyebrow">The rest</div>
    ${Group([
      q.human ? Row("✋", "In person", `${esc(S.agentName)} preps, you do the real-world step, then add proof: ${q.evidence.join(", ").toLowerCase()}.`) : "",
      Row("⏱", "Time", esc(q.eta || SIZE[q.size].label)),
      q.spend ? Row(`<span class="coin"></span>`, "Computer money", `About $${q.spend}, from the plan's budget`) : "",
      q.safety ? Row("⚠", "Safety check", "Designs are screened for toxicity and dual-use before anyone sees them.") : "",
      q.after ? Row("🔒", "Order", `Starts after “${esc(short(findQuest(q.after)[0].title))}”`) : "",
      Row("✓", "2 checkers", "Two players from other squads check it before it counts."),
    ])}`, esc(q.title), () => reqSheet(q));
}
export function verifySheet(k) {
  drill(`Verify ${esc(k)}`, `<div class="small muted">Verified skills unlock harder quests and squad slots.</div>
    <div class="dgroup">${VERIFY.map(([v, d]) => `<button class="drow" data-a="doverify" data-x="${esc(k)}" data-m="${v}"><span>✓</span><span><b>${v}</b><span class="small muted" style="display:block">${d}</span></span><span class="muted">›</span></button>`).join("")}</div>`, "Pick one way");
}
const whereLives = f => /PR|repo|yaml|config|github/i.test(f) ? "GitHub" : /GPU|credit/i.test(f) ? "GPU pool" : /cns|database/i.test(f) ? "CNS database" : "Shared drive";
export function inputSheet(f) {
  const t = whereLives(f), [name, ...rest] = f.split(" · ");
  drill(esc(name), `${Group([
      Row("▤", `Lives in ${t}`, esc(TOOLS[t] || "")),
      Row(Tick(S.tools[t]), S.tools[t] ? "You have access" : "Connect to open it", "Access comes with your squad slot", S.tools[t] ? "" : `<button class="btn sm" data-a="tool" data-x="${t}" data-keep="1">Connect</button>`),
      Row("↻", "v3 · updated 2h ago", "by Kenji · checksum verified"),
    ])}
    <button class="btn blue block" data-a="openin" data-x="${t}">Open in ${t} ↗</button>
    <p class="small muted" style="text-align:center">The work happens there. Results sync back to the brief.</p>`, esc(rest.join(" · ") || "Input"), () => inputSheet(f));
}
export function historySheet(q) {
  const s = stratOf(q), vs = [["v1", s.lead, "Created from the strategy plan"]];
  (q.notes || []).forEach(n => vs.push([`v${vs.length + 1}`, q.editedBy || s.lead, n]));
  if (q.picked) vs.push([`v${vs.length + 1}`, duoName(), `Decision: ${q.picked}`]);
  drill("Brief history", `${Group(vs.reverse().map(([v, who, what]) => Row(v, esc(what), esc(who))))}
    <p class="small muted">The squad lead and quest players can edit. Everyone else suggests changes in chat.</p>`, esc(short(q.title)));
}
export function proofSheet(q) {
  q.proof = q.proof || [];
  const ready = q.evidence.every((_, i) => q.proof[i]);
  drill("Add proof", `<div class="small muted">A checker looks at these before it counts.</div>
    ${Group(q.evidence.map((e, i) => Row(Tick(q.proof[i], "✓", "○"), esc(e), q.proof[i] ? esc(q.proof[i]) : "Photo, PDF or link", q.proof[i] ? "" : `<button class="btn sm" data-a="attach" data-x="${i}" data-q="${q.id}" data-keep="1">Attach</button>`)))}
    <button class="btn red block" data-a="submitproof" data-x="${q.id}" ${ready ? "" : "disabled"}>Submit for review</button>`, esc(short(q.title)), () => proofSheet(q));
}
export function reviewInfo() {
  drill("How checking works", Group([
    Row("1", `You and ${esc(S.agentName)} finish it`, "It goes out under your name"),
    Row("2", "2 players from other squads check it", "Nobody checks their own squad's work"),
    Row("3", "Both say yes, it counts", "You get paid when the stage clears"),
  ]));
}
export function refereeSheet() {
  drill("Who are the Referees?", `<p class="small">9 players with high review scores, picked at random from squads that aren't racing this stage. They check the evidence and vote on whether the stage is really done.</p>
    ${Group([Row("✓", "Paid per stage", "From the 15% Referee share of the prize"), Row("⚖", "Disagreements", "Referees also settle review disagreements")])}`);
}


// ---- Account (from the Profile)
export function skillsSheet() {
  const more = ["Python", "Docking (Vina)", "Pharmacology", "ML", "Med chem", "C++", "Writing"].filter(k => !hasSkill(k)).slice(0, 4);
  drill("Skills", `<div class="small muted">Verified skills unlock harder quests and squad slots. Self-reported ones still help matching.</div>
    ${S.skills.length ? Group(S.skills.map(([k, h]) => Row(Tick(/verified/.test(h), "✓", "~"), esc(k), esc(h), /verified/.test(h) ? "" : `<button class="btn sm" data-a="verify" data-x="${esc(k)}">Verify</button>`))) : `<p class="small muted">None yet.</p>`}
    <div class="eyebrow">Add a skill</div>
    ${Group(more.map(k => Row("+", esc(k), "", `<button class="btn sm" data-a="verify" data-x="${esc(k)}">Verify</button>`)))}`);
}
export function toolsSheet() {
  drill("Connected tools", `<div class="small muted">The real work happens in these. ${esc(S.agentName)} uses them for you, and results sync back.</div>
    ${Group(Object.keys(TOOLS).map(t => Row(Tick(S.tools[t]), esc(t), esc(TOOLS[t]), `<button class="btn sm ${S.tools[t] ? "" : "blue"}" data-a="tool" data-x="${esc(t)}" data-keep="1">${S.tools[t] ? "Disconnect" : "Connect"}</button>`)))}`, "", toolsSheet);
}
export function creditsSheet() {
  drill("Credits", `<div class="small muted">When a mission ships a paper, dataset or release, everyone here gets named, ordered by approved work.</div>
    ${S.credits.length ? Group(S.credits.map(c => { const mm = mission(c.m); return Row(mm ? chanIcon(mm, 28) : "★", esc(c.what), esc([mm && mm.title, c.out].filter(Boolean).join(" · "))); })) : `<p class="small muted">Clear a quest to earn your first credit.</p>`}
    <div class="eyebrow">Export</div>
    <div class="row wrap" style="gap:8px">${["ORCID", "GitHub", "LinkedIn", "CV (PDF)"].map(x => `<button class="btn sm" data-a="export" data-x="${x}">${x}</button>`).join("")}</div>`);
}
export function payoutSheet() {
  drill("Your money", `<div style="text-align:center"><div class="display" style="font-size:40px">$${fmt(S.coins)}</div><div class="small muted">ready to take out</div></div>
    ${S.wallet.pending ? `<p class="small muted" style="text-align:center">+ $${fmt(S.wallet.pending)} more when your stages clear</p>` : ""}
    <button class="btn red block" data-a="withdraw" ${S.coins ? "" : "disabled"}>${S.kyc ? `Take out $${fmt(S.coins)}` : "Check your ID to take it out"}</button>
    <p class="small muted" style="text-align:center">To your bank in 1–2 days.</p>`, "", payoutSheet);
}
export function kycSheet() {
  drill("Verify once", `${Group([Row("1", "Photo of your ID", "Passport or driving licence"), Row("2", "Quick selfie", "Matched to the ID"), Row("3", "Tax form", "Filled in for you from the ID")])}
    <p class="small muted">About 2 minutes. Handled by a licensed payments partner.</p>
    <button class="btn red block" data-a="kyc">Verify (demo)</button>`);
}

// How the prize works: who gets what, when, and what happens if it stops
export function prizeSheet(m) {
  drill(`The $${fmt(m.bounty)} prize`, `${Group(m.split.map(([k, v]) => Row(`${v}%`, esc(k), "")))}
    <div class="eyebrow">How you get paid</div>
    <ul class="news"><li>Every quest that passes review pays, even if its plan loses</li><li>You get paid when the stage is cleared</li></ul>
    <div class="eyebrow">If it stops</div><p class="small">${esc(trustOf(m).fail)}</p>
    <button class="info" data-a="trust" data-x="${m.id}">Who runs it, and is it safe? →</button>`, esc(m.title));
}
