import { Q, ROLES, award } from "../data/content.js";
import { PEOPLE } from "../data/world.js";
import { askOf, contribute, ledgerOf, questFuel, tok } from "./economy.js";
import { hasSkill } from "./personalise.js";
import { gateOf, playable, stratOf } from "./strategies.js";
import { contractSheet } from "../screens/contract.js";
import { animate, crewOf, postQ, short } from "../screens/quests.js";
import { reqSheet } from "../screens/sheets.js";
import { S, TEAMMATES } from "../state.js";
import { go, render, renderHud } from "../ui/chrome.js";
import { duoName, esc, findQuest, fmt, gain, learn, titleCard, toast } from "../ui/helpers.js";

// ===================== Playing a quest =====================
// One Start button. You and your agent always play together: it does the legwork, you make the calls,
// and nothing leaves the room until you stamp it. Then 2 Critics from other squads review it.
// start → (spend OK?) → your call → agent works → you stamp → Critics → approved (or fix / dispute)

// What a quest is waiting on you for
export const NEEDS = { call: q => q.call.q, spend: q => `Approve ~$${q.spend} of GPU time?`, stamp: q => `Stamp ${S.agentName}'s work: ${short(q.title)}`, proof: () => "Add proof to finish", changes: () => "A reviewer asked for changes" };
export const NEED_BTN = { call: "Answer", spend: "Approve", stamp: "Review", proof: "Add proof", changes: "Fix" };
export const needsYou = q => !!NEEDS[q.state];

export function playQuest(id) {
  const [q, m] = findQuest(id);
  if (!S.joined[m.id]) { S.pendingQuest = { id }; return contractSheet(m.id); }
  const open = () => go("quest", { missionId: m.id, questId: id, stratId: q.strat });
  if (q.state || q.done || q.parts || !playable(q)) return open();
  if (q.verified && !hasSkill(q.skills[0])) return reqSheet(q);
  S.roomTab = "chat"; q.unreadChat = 0;
  if (!(S.screen === "quest" && S.questId === id)) open();
  q.state = "run"; q.mine = true;
  postQ(q, m, { me: true, text: `@${S.agentName} let's go` });
  postQ(q, m, { sys: `Claimed by ${duoName()} · 3 days to finish, then it reopens` });
  if (q.spend) return spendGate(q, m);
  startRun(q, m);
}
function startRun(q, m) {
  const run = { agent: true, text: q.human ? "I'll do the prep. The real-world part is yours." : "On it. I'll need you for one call.", run: q.id, phase: 1, p: 0 };
  postQ(q, m, run);
  animate(run, 0, 1, q.size === "L" ? 2400 : 1600, q.log.slice(0, 2), () => {
    q.state = "call";
    postQ(q, m, { agent: true, call: q.id, text: q.call.q });
    notify(`${S.agentName} needs your call: ${short(q.title)}`, q.id);
  });
}

// The agent asks before spending a strategy's money above your limit
function spendGate(q, m) {
  const s = stratOf(q);
  if (q.spend <= S.spendCap) {
    logSpend(m, s, q, q.spend);
    postQ(q, m, { sys: `${S.agentName} spent $${q.spend} from ${s.squad}'s budget · under your $${S.spendCap} limit` });
    return startRun(q, m);
  }
  q.state = "spend";
  postQ(q, m, { agent: true, spend: q.id, text: `This needs about $${q.spend} of GPU time from ${s.squad}'s budget ($${fmt(askOf(s).money)} total). OK to spend it?` });
}
export const spendOpts = q => [`Approve $${q.spend}`, `Cheaper: $${Math.round(q.spend * .6)}, slower`, "Not now"];
export function pickSpend(id, i) {
  const [q, m] = findQuest(id);
  if (q.state !== "spend") return;
  const s = stratOf(q), cheap = Math.round(q.spend * .6), label = spendOpts(q)[i];
  q.feed.forEach(x => { if (x.spend === id) x.answered = label; });
  postQ(q, m, { me: true, text: label });
  if (i === 2) { q.state = null; q.mine = false; return postQ(q, m, { sys: "Paused · nothing spent · claim released" }); }
  const amt = i ? cheap : q.spend;
  if (i) q.eta = "about twice as long on spare GPUs";
  logSpend(m, s, q, amt);
  learn(i ? "Spending → picks the cheaper, slower option" : `Approves GPU spend up to $${amt}`);
  postQ(q, m, { sys: `$${amt} spent from ${s.squad}'s budget · logged in the Treasury` });
  q.state = "run";
  startRun(q, m);
}
function logSpend(m, s, q, amt) { ledgerOf(m).unshift({ what: `GPU · ${short(q.title)}`, squad: `${s.squad} · ${duoName()}`, amt, when: "just now" }); }

export function pickCall(id, i) {
  const [q, m] = findQuest(id);
  if (q.state !== "call") return;
  q.picked = q.call.opts[i];
  learn(`${q.call.q.replace(/\?$/, "")} → “${q.picked}”`);
  q.state = "run";
  q.feed.forEach(x => { if (x.call === id) x.answered = q.picked; });
  postQ(q, m, { me: true, text: q.picked });
  toast(`${esc(S.agentName)} learned that`);
  afterCall(q, m);
}
// After your call: real-world quests wait for your proof; long ones run in the background
function afterCall(q, m) {
  if (q.human) {
    q.state = "proof";
    return postQ(q, m, { agent: true, proof: q.id, text: `Prep's done: “${q.picked}”. The real-world part is yours. Add proof when it's done:` });
  }
  const long = q.size !== "S" || !!q.eta;
  q.state = long ? "work" : "run";
  const run = { agent: true, text: long ? `Running now, ${q.eta || "about an hour"}. You can leave, I'll ping you.` : "Got it.", run: q.id, phase: 2, p: 0 };
  postQ(q, m, run);
  animate(run, 0, 1, long ? 4200 : 1300, long ? [`working: “${q.picked}”`, "checkpoint saved", "almost there", q.log[2]] : [`on it: “${q.picked}”`, q.log[2]], () => readyToStamp(q, m));
}
// Your agent's work comes back to you first. Your stamp is what sends it to review.
function readyToStamp(q, m) {
  q.state = "stamp";
  postQ(q, m, { agent: true, text: "Done. Check it, then stamp it:", file: q.out || `${short(q.title)} · notes.md`, stamp: q.id });
  notify(`${S.agentName} finished “${short(q.title)}”. Stamp it?`, q.id);
}
export function stampQuest(id, ok) {
  const [q, m] = findQuest(id);
  if (q.state !== "stamp") return;
  q.feed.forEach(x => { if (x.stamp === id) x.answered = ok ? "Stamped ✓" : "Sent back"; });
  if (!ok) {
    q.redo = true; q.state = "run";
    postQ(q, m, { me: true, text: `@${S.agentName} not yet. Tighten it up.` });
    const run = { agent: true, text: "Fair. Redoing it.", run: q.id, phase: 4, p: 0 };
    postQ(q, m, run);
    return animate(run, 0, 1, 1500, ["re-reading the brief…", "tightened", q.log[2]], () => readyToStamp(q, m));
  }
  postQ(q, m, { me: true, text: "Stamped ✓" });
  S.stamped = (S.stamped || 0) + 1;
  if (!q.redo) award("mind");
  q.state = "run";
  submitQuest(q, m);
}
export function submitProof(id) {
  const [q, m] = findQuest(id);
  q.feed.forEach(x => { if (x.proof === id) x.answered = true; });
  postQ(q, m, { me: true, text: "Done in the real world. Proof attached:", file: q.proof.join(" · ") });
  q.state = "run";
  setTimeout(() => submitQuest(q, m), 400);
}

// Work counts only once 2 Critics from other squads have checked it
function submitQuest(q, m) {
  q.state = "review";
  q.rv = reviewersFor(q).map(n => ({ n, st: "checking" }));
  postQ(q, m, { agent: true, text: "Sent to 2 Critics from other squads:", review: q.id });
  const reject = q.reject && !q.reworked && !q.disputed;
  setTimeout(() => { q.rv[0].st = reject ? "changes" : "ok"; refreshRoom(q); }, 1200);
  setTimeout(() => {
    if (!reject) { q.rv[1].st = "ok"; return approveQuest(q, m); }
    q.rv[1].st = "waiting"; q.state = "changes";
    postQ(q, m, { who: q.rv[0].n, color: PEOPLE[q.rv[0].n].color, text: q.reject });
    postQ(q, m, { agent: true, fix: q.id, text: "Want me to fix it? If you think they're wrong, dispute it." });
    notify(`${q.rv[0].n} asked for changes on “${short(q.title)}”`, q.id);
  }, 2300);
}
const refreshRoom = q => { if (S.screen === "quest" && S.questId === q.id) render(); };
function reviewersFor(q) {
  const sq = stratOf(q).squad, crew = crewOf(q).map(c => c.who);
  return Object.keys(PEOPLE).filter(n => PEOPLE[n].squad !== sq && PEOPLE[n].squad !== S.squad && !crew.includes(n))
    .sort((a, b) => (PEOPLE[b].role === "critic") - (PEOPLE[a].role === "critic")).slice(0, 2);
}
export function fixQuest(id) {
  const [q, m] = findQuest(id);
  if (q.state !== "changes") return;
  q.reworked = true; q.state = "run";
  q.feed.forEach(x => { if (x.fix === id) x.answered = "Fixing it"; });
  postQ(q, m, { me: true, text: `@${S.agentName} fix it` });
  const run = { agent: true, text: "Fixing now.", run: q.id, phase: 3, p: 0 };
  postQ(q, m, run);
  animate(run, 0, 1, 1800, [`reading ${q.rv[0].n}'s notes…`, "re-running with the shared config", "fixed ✓"], () => readyToStamp(q, m));
}
export function fileDispute(id) {
  const [q, m] = findQuest(id);
  if (q.state !== "changes") return;
  q.disputed = true; q.state = "dispute";
  q.feed.forEach(x => { if (x.fix === id) x.answered = "Disputed"; });
  postQ(q, m, { sys: "Dispute filed · 3 Referees from other squads re-check it" });
  setTimeout(() => {
    postQ(q, m, { sys: "Referees ruled 2–1 for you: the cutoff changed after you started" });
    q.rv[0].st = "overruled"; q.rv[1].st = "ok";
    approveQuest(q, m);
  }, 2600);
}

function approveQuest(q, m) {
  q.done = true; q.state = null; q.mine = false;
  const s = stratOf(q);
  const xp = Math.round(q.xp * (S.roles.includes(q.role) ? 2 : 1) * 1.5);
  S.together++;
  s.score += q.gain || 0;
  S.contrib = S.contrib || {};
  S.contrib[s.id] = (S.contrib[s.id] || 0) + (q.gain || 0);
  gain(xp, 0, 6);
  S.wallet.pending += q.coins;
  S.credits.unshift({ m: m.id, what: q.title, out: q.out || "" });
  const qf = questFuel(q), shares = contribute(m, qf);
  S.wallet.timeCredits += qf.time; S.wallet.insights += qf.know + 1;
  award("spark");
  if (S.together === 3) award("sync");
  if (S.sync >= 70) award("proxy");
  m.news = [`${duoName()} cleared “${q.title}”${q.gain ? ` · +${q.gain} ${m.unit}` : ""}`, ...(m.news || [])];
  postQ(q, m, { sys: `✓ Approved by 2 Critics · +${xp} XP · $${q.coins} pending till the milestone clears · +${shares} ${tok(m)}${q.gain ? ` · ${s.name} +${q.gain} ${m.unit}` : ""}`, win: true });
  notify(`Approved: “${short(q.title)}” · $${q.coins} pending`, q.id);
  m.quests.filter(x => x.after === q.id).forEach(x => notify(`Unlocked: “${short(x.title)}”`, x.id));
  S.raid++;
  if (S.raid === 3) { S.coins += 50; award("raider"); setTimeout(() => titleCard("Daily raid", "RAID CLEARED!", "+$50 · crate unlocked", null, 1600), 80); }
  // A finished part may finish its parent
  let big = null;
  if (q.parent) {
    const p = m.quests.find(x => x.id === q.parent);
    if (p.parts.every(id => m.quests.find(x => x.id === id).done)) { p.done = true; p.by = "the squad"; if (p.size === "L") big = p; }
  }
  const g = gateOf(m), cleared = g.have >= g.need;
  const crew = crewOf(q).filter(x => !x.bot);
  const [n, c] = crew.length ? [crew[0].who, crew[0].color] : TEAMMATES[q.id.length % TEAMMATES.length];
  if (!cleared) setTimeout(() => postQ(q, m, { who: n, color: c, text: [`Nice. Goal's at ${g.have}/${g.need}.`, "Huge. Keep going.", "Clean work, you two."][S.together % 3] }), 900);
  const next = () => (cleared ? go("gate", { missionId: m.id }) : null);
  if (big) { award("slayer"); titleCard("The big one", "CLEARED!", esc(big.title), next, 1600); }
  else if (cleared) setTimeout(next, 900);
}

// Updates: the bell in the HUD, plus a toast when you're elsewhere
export function notify(text, qid) {
  const here = S.screen === "quest" && S.questId === qid;
  S.notifs.unshift({ text, q: qid, when: "just now", read: here });
  if (!here && S.screen !== "onboard") toast(`🔔 ${esc(text)}`);
  if (S.screen !== "onboard") renderHud();
}

// Break a big quest into parts anyone can pick up. Your agent offers this in the room.
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
