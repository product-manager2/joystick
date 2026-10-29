import { tok } from "../game/economy.js";
import { gateOf, strats } from "../game/strategies.js";
import { chanIcon, gateBar, stratBadge } from "./quests.js";
import { S } from "../state.js";
import { $, esc, fmt, mission } from "../ui/helpers.js";

// ===================== Final check =====================
// Clearing a milestone is a vote on evidence, not an automatic count: 9 Referees from squads not racing
// this milestone re-check it, token holders can challenge, then payouts are released.
export function gateScreen() {
  const m = mission(), g = gateOf(m), v = m.gv || (m.gv = { yes: 0, no: 0, mine: null, done: false });
  const ranked = [...strats(m)].filter(s => s.score > 0).sort((a, b) => b.score - a.score), holds = S.wallet.shares[m.id] || 0;
  const idle = strats(m).length - ranked.length;
  return `<div class="chat">
    <div class="chat-head">${chanIcon(m)}<div style="min-width:0;flex:1"><div class="display chan-name">Final check</div><div class="small muted ellip">${esc(m.title)} · milestone ${m.current + 1}</div></div></div>
    <div class="stage-list">
      <div class="card milestone"><div class="eyebrow">The goal</div><div class="mgoal">${esc(m.stages[m.current].goal)}</div>${gateBar(m)}<div class="small"><b>${g.have}/${g.need} ${g.unit}</b> submitted</div></div>
      <div class="eyebrow">Evidence</div>
      <div class="list">${ranked.map(s => `<button class="card qitem" data-a="strategy" data-x="${s.id}">${stratBadge(s, 36)}<span style="min-width:0"><b class="qt">${esc(s.name)}</b><span class="small muted" style="display:block">${esc(s.squad)} · ${((n) => n ? `${n} approved quest${n === 1 ? "" : "s"}` : "results from earlier")(m.quests.filter(q => q.strat === s.id && q.done && !q.parts).length)}</span></span><span class="qstat">+${s.score}</span></button>`).join("")}</div>
      ${idle ? `<div class="small muted">${idle} other ${idle === 1 ? "strategy" : "strategies"} had no results to check</div>` : ""}
      <div class="card milestone"><div class="row"><div class="eyebrow">Referees vote</div><span class="spacer"></span><button class="info small" data-a="refinfo">Who are they?</button></div>
        <div class="referees" id="gvs">${gvCircles(v)}</div><div class="small muted" id="gvstat">${gvStat(v)}</div></div>
      ${holds ? `<div class="card milestone"><div class="eyebrow">Your vote · ${fmt(holds)} ${tok(m)}</div>${v.mine ? `<div class="small"><b>You: ${esc(v.mine)}</b></div>` : `<div class="qbtns"><button class="btn blue sm" data-a="gvote" data-x="Yes, it's done">Yes, it's done</button><button class="btn sm" data-a="gchallenge">Challenge</button></div>`}<div class="small muted">Challenge window: 24h. Payouts wait for it.</div></div>` : ""}
    </div>
    <div class="room-bar one"><button class="btn red" id="gopen" data-a="opengate" ${v.done ? "" : "disabled"}>${v.done ? "Clear the milestone" : "Referees voting…"}</button></div>
  </div>`;
}
const gvCircles = v => Array.from({ length: 9 }, (_, i) => `<span class="gv ${i < v.yes ? "yes" : i < v.yes + v.no ? "no" : ""}">${i < v.yes ? "✓" : i < v.yes + v.no ? "✗" : ""}</span>`).join("");
const gvStat = v => v.done ? `<b>${v.yes}–${v.no}</b>: the milestone is done` : `Re-checking the evidence · ${v.yes + v.no}/9 voted`;
export function runGateVote(m) {
  const v = m.gv;
  if (!v || v.started) return;
  v.started = true;
  const seq = ["yes", "yes", "yes", "no", "yes", "yes", "yes", "yes", "yes"];
  let i = 0;
  const t = setInterval(() => {
    if (S.screen !== "gate") return;
    v[seq[i++]]++;
    if (i >= seq.length) { v.done = true; clearInterval(t); }
    const a = $("#gvs"), b = $("#gvstat"), c = $("#gopen");
    if (a) a.innerHTML = gvCircles(v);
    if (b) b.innerHTML = gvStat(v);
    if (c && v.done) { c.disabled = false; c.textContent = "Clear the milestone"; }
  }, 500);
}
