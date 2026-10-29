import { gateOf, strats } from "../game/strategies.js";
import { chanIcon, gateBar, stratBadge } from "./quests.js";
import { S } from "../state.js";
import { $, esc, mission } from "../ui/helpers.js";

// ===================== Stage check =====================
// A celebration with a safety net: 9 Referees from squads not racing this stage re-check the results,
// then the stage clears and everyone gets paid. Owners can add a 👍, nothing more.
export function gateScreen() {
  const m = mission(), g = gateOf(m), v = m.gv || (m.gv = { yes: 0, no: 0, mine: null, done: false });
  const ranked = [...strats(m)].filter(s => s.score > 0).sort((a, b) => b.score - a.score), owner = (S.wallet.shares[m.id] || 0) > 0;
  const idle = strats(m).filter(s => s.status !== "merged").length - ranked.length;
  return `<div class="chat">
    <div class="chat-head">${chanIcon(m)}<div style="min-width:0;flex:1"><div class="display chan-name">Stage check</div><div class="small muted ellip">${esc(m.title)} · stage ${m.current + 1}</div></div></div>
    <div class="stage-list">
      <div class="card milestone"><div class="eyebrow">The goal</div><div class="mgoal">${esc(m.stages[m.current].goal)}</div>${gateBar(m)}<div class="small"><b>${g.have}/${g.need} ${g.unit}</b> done</div></div>
      <div class="card milestone"><div class="row"><div class="eyebrow">Referees</div><span class="spacer"></span><button class="info small" data-a="refinfo">Who are they?</button></div>
        <div class="referees" id="gvs">${gvCircles(v)}</div><div class="small" id="gvstat">${gvStat(v)}</div>
        ${owner ? (v.mine ? `<div class="small muted">You said: ${esc(v.mine)}</div>` : `<button class="btn sm" data-a="gvote" data-x="Looks right 👍">Looks right 👍</button>`) : ""}</div>
      <div class="eyebrow">What counts</div>
      <div class="list">${ranked.map(s => `<button class="card qitem" data-a="strategy" data-x="${s.id}">${stratBadge(s, 36)}<span style="min-width:0"><b class="qt">${esc(s.name)}</b><span class="small muted" style="display:block">${esc(s.squad)} · ${((n) => n ? `${n} approved quest${n === 1 ? "" : "s"}` : "results from earlier")(m.quests.filter(q => q.strat === s.id && q.done && !q.parts).length)}</span></span><span class="qstat">+${s.score}</span></button>`).join("")}</div>
      ${idle ? `<div class="small muted">${idle} other ${idle === 1 ? "plan" : "plans"} had nothing to check yet</div>` : ""}
    </div>
    <div class="room-bar one"><button class="btn red" id="gopen" data-a="opengate" ${v.done ? "" : "disabled"}>${v.done ? "Celebrate →" : "Referees are checking…"}</button></div>
  </div>`;
}
const gvCircles = v => Array.from({ length: 9 }, (_, i) => `<span class="gv ${i < v.yes ? "yes" : i < v.yes + v.no ? "no" : ""}">${i < v.yes ? "✓" : i < v.yes + v.no ? "✗" : ""}</span>`).join("");
const gvStat = v => v.done ? `<b>✓ Stage cleared!</b> ${v.yes} of 9 referees agree` : `Referees are checking… ${v.yes + v.no}/9`;
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
    if (c && v.done) { c.disabled = false; c.textContent = "Celebrate →"; }
  }, 500);
}
