import { ROLES, missions, roleColor } from "../data/content.js";
import { Button, Stats, Tabs } from "../design/components.js";
import { color } from "../design/tokens.js";
import { DEMAND } from "../data/world.js";
import { fuelGauges, fuelOf, ledgerOf, mult, tok, tokenCard } from "../game/economy.js";
import { matches, poolOf } from "../game/matching.js";
import { STATUS, gateOf, leaderOf, playable, strats } from "../game/strategies.js";
import { MISSION_WHY, chName, gateBar, short } from "./quests.js";
import { trustOf } from "./sheets.js";
import { S } from "../state.js";
import { go } from "../ui/chrome.js";
import { $, backBtn, esc, fmt, glyph, mission } from "../ui/helpers.js";

// ===================== Missions =====================
export function lobby() {
  const mine = missions.filter(m => S.joined[m.id]);
  const tab = mine.length ? (S.lobbyTab || "mine") : "explore";
  const tags = ["All", "Science", "Product", "Planet", "Education"];
  const fitN = m => m.quests.filter(q => playable(q) && S.roles.includes(q.role)).length;
  const others = missions.filter(m => !S.joined[m.id] && (S.filter === "All" || m.tag === S.filter)).sort((a, b) => fitN(b) - fitN(a));
  const hot = Math.max(...missions.map(x => x.players));
  const mineCard = m => {
    const g = gateOf(m), big = m.quests.find(q => q.size === "L" && !q.done);
    return `<div class="card mine">
      <button class="band" style="background:${m.color}" data-a="mission" data-x="${m.id}">${glyph(m)}<h3>${esc(m.title)}</h3>${m.unread ? `<span class="unread">${m.unread}</span>` : ""}</button>
      <div class="body">
        <div class="row small"><b>Milestone ${m.current + 1} · ${esc(m.stages[m.current].name)}</b><span class="spacer"></span><span>${g.have}/${g.need} ${g.unit}</span></div>
        ${gateBar(m)}
        <ul class="news">${(m.news || []).slice(0, 2).map(n => `<li>${esc(n)}</li>`).join("")}${big ? `<li class="hotline">Big quest open: ${esc(short(big.title))}</li>` : ""}</ul>
        <div class="row"><button class="btn sm blue" style="flex:1" data-a="mission-ch" data-x="${m.id}">Play</button><button class="btn sm" data-a="mission" data-x="${m.id}">Details</button></div>
      </div></div>`;
  };
  return `<div class="screen">
    <div class="row"><h2 class="sec-title">Missions</h2><span class="spacer"></span><button class="btn sm" data-a="forge">+ New</button></div>
    ${mine.length ? Tabs([["mine", `Mine · ${mine.length}`], ["explore", "Explore"]], tab, "ltab") : ""}
    ${tab === "mine" ? `<div class="list" style="gap:16px">${mine.map(mineCard).join("")}</div>
      <button class="card explore-nudge" data-a="ltab" data-x="explore"><b>Find another mission</b><span class="small muted">${missions.length - mine.length} more looking for players</span><span class="display" style="font-size:22px">→</span></button>`
    : `<div class="chips">${tags.map(t => `<button class="chip" data-a="filter" data-x="${t}" aria-pressed="${S.filter === t}">${t}</button>`).join("")}</div>
    <div class="list" style="gap:16px">${others.length ? others.map(m => { const n = fitN(m); return `
      <button class="card poster" data-a="mission" data-x="${m.id}">
        <div class="band" style="background:${m.color}">${glyph(m)}<h3>${esc(m.title)}</h3></div>
        <div class="body">
          <div class="pfacts"><span><b>$${fmt(m.bounty)}</b>bounty</span><span><b>${m.players.toLocaleString()}</b>playing</span><span><b>${m.current + 1}/${m.stages.length}</b>milestone</span></div>
          <div class="row wrap" style="gap:6px">${n ? `<span class="chip fitchip">${n} quest${n === 1 ? "" : "s"} fit you</span>` : ""}<span class="chip" style="background:var(--navy);color:var(--white)">${tok(m)} ×${mult(m)}</span>${m.players === hot ? `<span class="chip" style="background:var(--red);color:var(--white)">Hot</span>` : ""}<span class="chip">${m.tag}</span></div>
        </div>
      </button>`; }).join("") : `<div class="card muted" style="padding:14px">Nothing here yet. Start one?</div>`}</div>`}
  </div>`;
}

export function missionScreen() {
  const m = mission();
  const signed = S.joined[m.id];
  const f = fuelOf(m), dry = f.money[0] < f.money[1];
  const tabs = [["map", "Map"], ["squads", "Strategies"], ["fuel", "Treasury"], ["rules", "Brief"]];
  const body = S.tab === "map" ? mapView(m) : S.tab === "squads" ? strategiesView(m) : S.tab === "fuel" ? treasuryView(m) : rulesView(m);
  // The squad you race with matters more than who posted the mission (that lives in the trust sheet)
  const mine = S.backed?.[m.id] && strats(m).find(s => s.id === S.backed[m.id]);
  const who = mine ? `Your squad · ${mine.squad}` : `${m.squads} squads racing`;
  return `<div class="screen">
    <div class="card mhead">
      <div class="band" style="background:${m.color}">${backBtn("go", "lobby", "Back to missions")}<span class="mtitle"><h1>${esc(m.title)}</h1><span class="msquad">${esc(who)}</span></span>${glyph(m)}</div>
      <div class="in">
        <p>${esc(m.pitch)}</p>
        ${Stats([[`$${fmt(m.bounty)}`, "bounty"], [`${m.current + 1}/${m.stages.length}`, "milestone"], [`${m.squads}`, "squads"]])}
        <button class="demand" data-a="needit" data-x="${m.id}" aria-pressed="${!!S.voiced[m.id]}"><span class="small"><b>${fmt(demandOf(m).asks)}</b> people need this · <b>$${fmt(demandOf(m).pledged)}</b> pledged</span><span class="chip">${S.voiced[m.id] ? "✓ You too" : "+1 Me too"}</span></button>
        <div class="row wrap" style="gap:6px"><button class="chip trust" data-a="trust" data-x="${m.id}">✓ Escrow · verified</button>${m.creator === "@" + (S.name || "you") ? `<button class="chip" data-a="manage">Manage</button>` : ""}${signed ? signed.map(r => `<span class="rtag" style="background:${roleColor(r)}">${ROLES[r].name}</span>`).join("") : ""}<span class="chip" style="background:var(--navy);color:var(--white)">${tok(m)} ×${mult(m)}</span>${dry ? `<button class="chip drychip" data-a="tab" data-x="fuel">Dry in ${f.dryDays}d</button>` : ""}</div>
      </div>
    </div>
    ${Tabs(tabs, S.tab, "tab")}
    ${body}
    <div class="sticky-cta">${signed
      ? `${Button(`Play ${chName(m)}`, { variant: "blue", block: true, action: "mission-ch", value: m.id })}`
      : `${Button("Join mission", { variant: "red", block: true, action: "contract", value: m.id })}`}</div>
  </div>`;
}
// Treasury: who funds the mission, where the fuel stands, how the matching pool splits, where money went
export const demandOf = m => DEMAND[m.id] || { asks: 1, pledged: 0, revenue: 0 };
export function treasuryView(m) {
  const f = fuelOf(m), t = trustOf(m), d = demandOf(m), mt = matches(m);
  const sources = [["Sponsors", t.funders.filter(([n]) => !/backers/.test(n)).reduce((a, [, v]) => a + v, 0)], ["Crowd backers", t.funders.filter(([n]) => /backers/.test(n)).reduce((a, [, v]) => a + v, 0) + strats(m).reduce((a, s) => a + (s.raised || 0), 0)], ["People who need it", d.pledged], ["Product revenue", d.revenue]].filter(([, v]) => v);
  const total = sources.reduce((a, [, v]) => a + v, 0);
  return `<div class="card milestone">
      <div class="eyebrow">Who funds it</div>
      ${sources.map(([k, v]) => `<div class="statline"><span>${k}</span><span class="meter"><i style="width:${v / total * 100}%"></i></span><span class="display" style="font-size:13px">$${fmt(v)}</span></div>`).join("")}
      <div class="small muted">${fmt(d.asks)} people asked for it · pledges pay out only if it ships</div>
    </div>
    <div class="card milestone">
      <div class="row"><div class="eyebrow">Milestone ${m.current + 1} fuel</div><span class="spacer"></span>${f.money[0] < f.money[1] ? `<span class="dry">Dry in ${f.dryDays} days</span>` : ""}</div>
      ${fuelGauges(m)}
    </div>
    <div class="card milestone">
      <div class="row"><div class="eyebrow">Matching pool · $${fmt(poolOf(m))}</div><span class="spacer"></span><button class="info small" data-a="mission-ch" data-x="${m.id}">Back one</button></div>
      ${[...strats(m)].sort((a, b) => (mt[b.id] || 0) - (mt[a.id] || 0)).map(s => `<div class="statline"><span>${esc(s.name)}</span><span class="meter"><i style="width:${(mt[s.id] || 0) / poolOf(m) * 100}%;background:${s.color}"></i></span><span class="display" style="font-size:13px">$${fmt(mt[s.id] || 0)}</span></div>`).join("")}
      <div class="small muted">Paid to squads in tranches: 30% now, the rest at checkpoints</div>
    </div>
    ${tokenCard(m)}
    <div class="card milestone"><div class="row"><div class="eyebrow">Where it went</div><span class="spacer"></span><button class="info small" data-a="ledger">Full ledger</button></div>
      ${ledgerOf(m).slice(0, 3).map(x => `<div class="kvrow"><span>${esc(x.what)}<span class="small muted" style="display:block">${esc(x.squad)} · ${esc(x.when)}</span></span><b>$${fmt(x.amt)}</b></div>`).join("")}</div>`;
}
// The map is a graph: each milestone runs parallel tracks that converge on a ◆ checkpoint.
// The current milestone's tracks are its live strategies; a queued strategy shows as a dashed track.
export function mapView(m) {
  return `<div class="gmap" id="map"><svg class="trail" id="trail"></svg>${m.stages.map((st, i) => {
    const state = i < m.current ? "done" : i === m.current ? "now" : "locked";
    const prev = i ? `c-${i - 1}` : "";
    const tracks = i === m.current ? strats(m).filter(s => s.status !== "merged").map(s => ({ name: s.name, s }))
      : (st.tracks || [st.name]).map(name => ({ name }));
    const ids = tracks.map((_, j) => `t-${i}-${j}`);
    return `<div class="trow">${tracks.map((t, j) => {
      const tst = t.s ? (t.s.status === "queued" ? "queued" : t.s.status ? "raising" : "now") : state;
      const inner = tst === "done" ? "✓" : t.s ? (t.s.score ? "+" + t.s.score : "·") : "";
      return `<button class="tnode ${tst}" id="${ids[j]}" data-from="${prev}" ${t.s ? `data-a="strategy" data-x="${t.s.id}"` : `data-a="stage" data-x="${i}"`} ${t.s ? `style="--track:${t.s.color}"` : ""}>
        <span class="tdisc">${inner}</span><span class="tl">${esc(t.name)}${t.s && t.s.status ? `<i>${esc(t.s.status === "queued" ? "queued" : "raising")}</i>` : ""}</span></button>`;
    }).join("")}</div>
    <div class="crow"><button class="cp ${state} ${st.finish ? "finish" : ""}" id="c-${i}" data-from="${ids.join(" ")}" data-a="stage" data-x="${i}">
      ${state === "now" ? `<span class="flag">${S.joined[m.id] ? "YOU ARE HERE" : `${m.players.toLocaleString()} HERE`}</span>` : ""}
      <span class="cdisc"><span>${state === "done" ? "✓" : st.finish ? "★" : i + 1}</span></span><span class="lbl">${esc(st.name)}</span></button></div>`;
  }).join("")}</div>`;
}
// Lines are drawn after layout: from each node to the nodes it comes from
export function drawTrail() {
  const map = $("#map"), svg = $("#trail");
  if (!map) return;
  const r = map.getBoundingClientRect();
  const mid = el => { const d = el.querySelector(".tdisc, .cdisc").getBoundingClientRect(); return [d.left - r.left + d.width / 2, d.top - r.top + d.height / 2]; };
  const paths = [];
  map.querySelectorAll("[data-from]").forEach(to => {
    to.dataset.from.split(" ").filter(Boolean).forEach(id => {
      const from = document.getElementById(id);
      if (!from) return;
      const [x1, y1] = mid(from), [x2, y2] = mid(to), my = (y1 + y2) / 2;
      const d = `M${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
      const done = from.classList.contains("done") && to.classList.contains("done");
      const queued = from.classList.contains("queued") || to.classList.contains("queued");
      paths.push(done ? `<path d="${d}" stroke="var(--ink)" stroke-width="8" fill="none" stroke-linecap="round"/><path d="${d}" stroke="var(--green)" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
        : queued ? `<path d="${d}" stroke="var(--ink-2)" stroke-width="3" fill="none" stroke-dasharray="7 7"/>`
        : to.classList.contains("locked") || from.classList.contains("locked") ? `<path d="${d}" stroke="var(--ink)" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="1 10"/>`
        : `<path d="${d}" stroke="var(--ink)" stroke-width="4" fill="none" stroke-linecap="round"/>`);
    });
  });
  svg.innerHTML = paths.join("");
}
export function strategiesView(m) {
  const g = gateOf(m);
  const all = [...strats(m)].sort((a, b) => b.score - a.score);
  return `<div class="card milestone"><div class="eyebrow">Milestone ${m.current + 1}: ${esc(m.stages[m.current].name)}</div><div class="mgoal">${esc(m.stages[m.current].goal)}</div>${gateBar(m)}<div class="small"><b>${g.have}/${g.need} ${g.unit}</b></div></div>
    <div class="list">${all.map((s, i) => `<button class="card squad" data-a="strategy-from-map" data-x="${s.id}">
      <div class="rank">${i + 1}</div>
      <div style="min-width:0;text-align:left"><b>${esc(s.name)}</b><div class="muted small">${s.status ? `${STATUS[s.status](s)} · ` : ""}${esc(s.squad)} · led by ${esc(s.lead)}</div><div class="meter"><i style="width:${Math.min(100, s.score / g.need * 100)}%;background:${s.color}"></i></div></div>
      <div class="display" style="font-size:15px">+${s.score}</div>
    </button>`).join("")}</div>
`;
}
export function rulesView(m) {
  const lead = strats(m).length ? leaderOf(m) : null;
  return `<article class="card doc">
    <div class="crumbs">Mission brief · by ${esc(m.creator)}</div>
    <h1 class="doc-title">${esc(m.title)}</h1>
    <h3>The problem</h3><p>${esc(MISSION_WHY[m.id] || m.pitch)}</p>
    <h3>The goal</h3><p>${esc(m.pitch)}</p>
    <h3>We win when</h3><ol class="wins">${m.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ol>
    <h3>Milestones</h3>
    <ul class="mstones">${m.stages.map((st, i) => `<li class="${i < m.current ? "done" : i === m.current ? "now" : ""}"><b>${esc(st.name)}</b><span>${esc(st.goal)}</span>${i === m.current ? `<em>${strats(m).length} strategies racing${lead ? ` · ${esc(lead.name)} leads` : ""}</em>` : ""}</li>`).join("")}</ul>
    <h3>The $${fmt(m.bounty)} bounty</h3>
    ${m.split.map(([k, v]) => `<div class="statline"><span>${k}</span><span class="meter"><i style="width:${v}%"></i></span><span class="display" style="font-size:13px">${v}%</span></div>`).join("")}
    <h3>How pay works</h3>
    <ul class="news"><li>Every approved quest pays, even if its strategy loses</li><li>Pay is held until the milestone is cleared, then released</li><li>Backers own a stake in the team they back, not in the others</li><li>Teams that draw treasury money pay 5% of revenue back to the mission</li></ul>
    <h3>What we hand over</h3><ol class="wins">${trustOf(m).deliver.map(d => `<li>${esc(d)}</li>`).join("")}</ol>
    <h3>If it stops</h3><p>${esc(trustOf(m).fail)}</p>
    <button class="info" data-a="trust" data-x="${m.id}" style="align-self:flex-start;margin-top:4px">Creator, escrow & safety →</button>
      </article>`;
}
