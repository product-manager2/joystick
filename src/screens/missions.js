import { FINISHED } from "../data/history.js";
import { ROLES, missions, roleColor, hasRole } from "../data/content.js";
import { Button, Stats, Tabs } from "../design/components.js";
import { color } from "../design/tokens.js";
import { DEMAND } from "../data/world.js";
import { fuelOf, ledgerOf, tokenCard } from "../game/economy.js";
import { STATUS, gateOf, playable, shown, strats } from "../game/strategies.js";
import { MISSION_WHY, chName, chanIcon, gateBar, short } from "./quests.js";
import { trustOf } from "./sheets.js";
import { S } from "../state.js";
import { go } from "../ui/chrome.js";
import { $, backBtn, esc, fmt, glyph, mission } from "../ui/helpers.js";

// ===================== Missions =====================
// Finished missions: what they produced is one tap away
const finishedList = (list, title) => list.length ? `<h2 class="sec-title">${title}</h2><div class="list">${list.map(f => `
  <button class="card qitem" data-a="recap" data-x="${f.id}">${chanIcon(f, 40)}<span style="min-width:0"><b class="qt">${esc(f.title)}</b><span class="small muted" style="display:block">${esc(f.result)}</span></span><span class="qstat done">✓ Done</span></button>`).join("")}</div>` : "";
export function lobby() {
  const mine = missions.filter(m => S.joined[m.id]);
  const tab = mine.length ? (S.lobbyTab || "mine") : "explore";
  const tags = ["All", "Science", "Product", "Planet", "Education"];
  const fitN = m => m.quests.filter(q => playable(q) && hasRole(q.role)).length;
  const others = missions.filter(m => !S.joined[m.id] && (S.filter === "All" || m.tag === S.filter)).sort((a, b) => fitN(b) - fitN(a));
  const hot = Math.max(...missions.map(x => x.players));
  const mineCard = m => {
    const g = gateOf(m);
    return `<div class="card mine">
      <button class="band" style="background:${m.color}" data-a="mission" data-x="${m.id}">${glyph(m)}<h3>${esc(m.title)}</h3>${m.unread ? `<span class="unread">${m.unread}</span>` : ""}</button>
      <div class="body">
        <div class="row small"><b>Stage ${m.current + 1} of ${m.stages.length} · ${esc(m.stages[m.current].goal)}</b><span class="spacer"></span><span>${g.have}/${g.need}</span></div>
        ${gateBar(m)}
        ${(m.news || [])[0] ? `<div class="small muted">Latest: ${esc(m.news[0])}</div>` : ""}
        <button class="btn sm blue block" data-a="mission-ch" data-x="${m.id}">Continue stage ${m.current + 1} →</button>
      </div></div>`;
  };
  return `<div class="screen">
    <div class="row"><h2 class="sec-title">Missions</h2><span class="spacer"></span><button class="btn sm" data-a="forge">+ New</button></div>
    ${mine.length ? Tabs([["mine", `Mine · ${mine.length}`], ["explore", "Explore"]], tab, "ltab") : ""}
    ${tab === "mine" ? `<div class="list" style="gap:16px">${mine.map(mineCard).join("")}</div>
      ${finishedList(FINISHED.filter(f => f.yours && S.together > 0), "You helped finish")}
      <button class="card explore-nudge" data-a="ltab" data-x="explore"><b>Find more missions</b><span class="small muted">${missions.length - mine.length} more need players</span><span class="display" style="font-size:22px">→</span></button>`
    : `<div class="chips">${tags.map(t => `<button class="chip" data-a="filter" data-x="${t}" aria-pressed="${S.filter === t}">${t}</button>`).join("")}</div>
    <div class="list" style="gap:16px">${others.length ? others.map(m => { const n = fitN(m); return `
      <button class="card poster" data-a="mission" data-x="${m.id}">
        <div class="band" style="background:${m.color}">${glyph(m)}<h3>${esc(m.title)}</h3></div>
        <div class="body">
          <div class="pfacts"><span><b>$${fmt(m.bounty)}</b>prize</span><span><b>${m.players.toLocaleString()}</b>players</span><span><b>${m.current + 1} of ${m.stages.length}</b>stage</span></div>
          <div class="row wrap" style="gap:6px">${n ? `<span class="chip fitchip">Good fit for you</span>` : ""}${m.players === hot ? `<span class="chip" style="background:var(--red);color:var(--white)">Hot</span>` : ""}<span class="chip">${m.tag}</span></div>
        </div>
      </button>`; }).join("") : `<div class="card muted" style="padding:14px">Nothing here yet. Start one?</div>`}</div>
    ${finishedList(FINISHED, "Finished missions")}`}
  </div>`;
}

export function missionScreen() {
  const m = mission();
  const signed = S.joined[m.id];
  const f = fuelOf(m), dry = f.money[0] < f.money[1];
  const tabs = [["map", "Map"], ["squads", "Plans"], ["fuel", "Money"], ["rules", "About"]];
  const body = S.tab === "map" ? mapView(m) : S.tab === "squads" ? strategiesView(m) : S.tab === "fuel" ? treasuryView(m) : rulesView(m);
  // The squad you race with matters more than who posted the mission (that lives in the trust sheet)
  const mine = S.backed?.[m.id] && strats(m).find(s => s.id === S.backed[m.id]);
  const who = mine ? `Your squad · ${mine.squad}` : `${m.squads} squads racing`;
  return `<div class="screen">
    <div class="card mhead">
      <div class="band" style="background:${m.color}">${backBtn("back", "lobby", "Back")}<span class="mtitle"><span class="kind kind-mission">Mission</span><h1>${esc(m.title)}</h1><span class="msquad">${esc(who)}</span></span>${glyph(m)}</div>
      <div class="in">
        ${Stats([[`$${fmt(m.bounty)}`, "prize"], [`${m.current + 1} of ${m.stages.length}`, "stage"], [`${m.squads}`, "squads"]])}
        <div class="row wrap" style="gap:6px"><button class="chip trust" data-a="trust" data-x="${m.id}">✓ Prize money is locked in</button>${m.creator === "@" + (S.name || "you") ? `<button class="chip" data-a="manage">Manage</button>` : ""}</div>
      </div>
    </div>
    ${Tabs(tabs, S.tab, "tab")}
    ${body}
    <div class="sticky-cta">${signed
      ? `${Button(`Pick a plan for stage ${m.current + 1} →`, { variant: "blue", block: true, action: "mission-ch", value: m.id })}`
      : `${Button("Join mission", { variant: "red", block: true, action: "contract", value: m.id })}`}</div>
  </div>`;
}
// Money: how much this stage needs, who pays for it, what you own, where the money went
export const demandOf = m => DEMAND[m.id] || { asks: 1, pledged: 0, revenue: 0 };
export function treasuryView(m) {
  const f = fuelOf(m), t = trustOf(m), d = demandOf(m);
  const mine = S.backed?.[m.id] && shown(m).find(s => s.id === S.backed[m.id]);
  const sources = [["Big sponsors", t.funders.filter(([n]) => !/backers/.test(n)).reduce((a, [, v]) => a + v, 0)], ["Players like you", t.funders.filter(([n]) => /backers/.test(n)).reduce((a, [, v]) => a + v, 0) + strats(m).reduce((a, s) => a + (s.raised || 0), 0)], ["People who want it", d.pledged], ["Sales", d.revenue]].filter(([, v]) => v);
  const total = sources.reduce((a, [, v]) => a + v, 0);
  const left = f.money[1] - f.money[0];
  return `<div class="card milestone">
      <div class="row"><div class="eyebrow">Money for stage ${m.current + 1}</div><span class="spacer"></span>${left > 0 ? `<span class="dry">Runs out in ${f.dryDays} days</span>` : ""}</div>
      <div class="mgoal">$${fmt(f.money[0])} of $${fmt(f.money[1])}</div>
      <div class="meter"><i style="width:${Math.min(100, f.money[0] / f.money[1] * 100)}%;background:var(--gold)"></i></div>
      <div class="small muted">${left > 0 ? `It needs $${fmt(left)} more to finish this stage.` : "This stage has all the money it needs."}</div>
      ${mine ? Button(`Back ${mine.name}`, { variant: "gold", block: true, action: "backsheet", value: mine.id }) : Button("Back a plan", { variant: "gold", block: true, action: "tab", value: "squads" })}
    </div>
    <div class="card milestone">
      <div class="eyebrow">Who pays for it</div>
      ${sources.map(([k, v]) => `<div class="statline"><span>${k}</span><span class="meter"><i style="width:${v / total * 100}%"></i></span><span class="display" style="font-size:13px">$${fmt(v)}</span></div>`).join("")}
      ${d.pledged ? `<div class="small muted">People who want it promise $${fmt(d.pledged)}, paid only when it works.</div>` : ""}
    </div>
    ${tokenCard(m)}
    <div class="card milestone"><div class="row"><div class="eyebrow">What the money paid for</div><span class="spacer"></span><button class="info small" data-a="ledger">See all</button></div>
      ${ledgerOf(m).slice(0, 3).map(x => `<div class="kvrow"><span>${esc(x.what)}<span class="small muted" style="display:block">${esc(x.squad)} · ${esc(x.when)}</span></span><b>$${fmt(x.amt)}</b></div>`).join("")}</div>`;
}
// The map: one checkpoint per stage. Only the current stage opens up to show the plans racing to its goal.
export function mapView(m) {
  return `<div class="gmap" id="map"><svg class="trail" id="trail"></svg>${m.stages.map((st, i) => {
    const state = i < m.current ? "done" : i === m.current ? "now" : "locked";
    const prev = i ? `c-${i - 1}` : "";
    const tracks = i === m.current ? shown(m).map(s => ({ name: s.name, s }))
      : (st.tracks || [st.name]).map(name => ({ name }));
    const ids = tracks.map((_, j) => `t-${i}-${j}`);
    // In the current stage, your plan carries a YOU flag; with none yet, the caption asks you to pick
    const isMine = s => S.squads?.[m.id] === s.id;
    const mineS = i === m.current ? tracks.map(t => t.s).find(s => s && isMine(s)) : null;
    const cap = i === m.current ? `<div class="trow-cap"><b>Stage ${i + 1} · ${esc(st.name)}:</b> ${tracks.length} squads racing to the goal, each with its own plan. ${mineS ? `You're in <b>${esc(mineS.squad)}</b>.` : "Tap a squad to join it."}</div>` : "";
    // Finished and future stages collapse to one checkpoint each; only the current stage shows its tracks
    if (i !== m.current) return `<div class="crow"><button class="cp ${state} ${st.finish ? "finish" : ""}" id="c-${i}" data-from="${prev}" data-a="stage" data-x="${i}">
      <span class="cdisc"><span>${state === "done" ? "✓" : st.finish ? "★" : i + 1}</span></span><span class="lbl">${esc(st.name)}</span></button></div>`;
    return `${cap}<div class="trow">${tracks.map((t, j) => {
      const tst = t.s ? (t.s.status === "queued" ? "queued" : t.s.status ? "raising" : "now") : state;
      // Each plan is a squad racing down its own path; the squad's marker sits as far along as it has got
      const inner = tst === "done" ? "✓" : t.s ? esc(t.s.squad.split(/\s+/).map(w => w[0]).join("").slice(0, 2)) : "";
      const pct = t.s ? Math.min(100, Math.round(t.s.score / m.target * 100)) : 0;
      return `<button class="tnode ${tst}" id="${ids[j]}" data-from="${prev}" ${t.s ? `data-a="strategy" data-x="${t.s.id}" data-pct="${pct}" data-score="${t.s.score}/${m.target}" data-mine="${t.s === mineS ? 1 : ""}"` : `data-a="stage" data-x="${i}"`} ${t.s ? `style="--track:${t.s.color}"` : ""}>
        ${t.s && t.s === mineS ? `<span class="flag you">YOUR SQUAD</span>` : ""}<span class="tdisc">${inner}</span><span class="tl">${t.s ? `<b>${esc(t.s.squad)}</b><i>${esc(t.name)}${t.s.status ? " · waiting" : ""}</i>` : esc(t.name)}</span></button>`;
    }).join("")}</div>
    <div class="crow"><button class="cp ${state} ${st.finish ? "finish" : ""}" id="c-${i}" data-from="${ids.join(" ")}" data-a="stage" data-x="${i}">
      ${state === "now" ? `<span class="flag">STAGE ${i + 1} GOAL</span>` : ""}
      <span class="cdisc"><span>${state === "done" ? "✓" : st.finish ? "★" : i + 1}</span></span><span class="lbl">${esc(st.name)}</span></button></div>`;
  }).join("")}</div>`;
}
// Lines are drawn after layout: from each node to the nodes it comes from
export function drawTrail() {
  const map = $("#map"), svg = $("#trail");
  if (!map) return;
  const r = map.getBoundingClientRect();
  // Squad lanes run side by side and only join at the goal
  if (map.classList.contains("lanes-map")) {
    const goal = map.querySelector(".goal .cdisc")?.getBoundingClientRect();
    svg.innerHTML = goal ? [...map.querySelectorAll(".lane")].map(lane => {
      const e = lane.querySelector(".lane-end").getBoundingClientRect(), x1 = e.left - r.left + e.width / 2, y1 = e.top - r.top, x2 = goal.left - r.left + goal.width / 2, y2 = goal.top - r.top + 4;
      const d = `M${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
      return `<path d="${d}" stroke="var(--ink)" stroke-width="4" fill="none" stroke-linecap="round" ${lane.dataset.done ? "" : 'stroke-dasharray="1 10"'}/>${lane.dataset.done ? `<path d="${d}" stroke="${getComputedStyle(lane).getPropertyValue("--track")}" stroke-width="2" fill="none"/>` : ""}`;
    }).join("") : "";
    return;
  }
  const mid = el => { const d = el.querySelector(".tdisc, .cdisc").getBoundingClientRect(); return [d.left - r.left + d.width / 2, d.top - r.top + d.height / 2]; };
  // A squad's path starts under its label, so its progress colour sits on that one line
  const start = el => { const lb = el.dataset.pct && el.querySelector(".tl"); if (!lb) return mid(el); const b = lb.getBoundingClientRect(); return [b.left - r.left + b.width / 2, b.bottom - r.top + 2]; };
  // A plan that skips checkpoints runs down the side of the map instead of through them.
  // Each skipping plan gets its own lane; the one aimed furthest runs on the outside.
  const curve = (x1, y1, x2, y2, lane) => { const side = r.width - 2 - lane * 14; return lane
    ? `M${x1} ${y1} C ${x1} ${y1 + 50}, ${side} ${y1 + 20}, ${side} ${y1 + 90} L ${side} ${y2 - 80} C ${side} ${y2 - 20}, ${x2 + 50} ${y2}, ${x2} ${y2}`
    : `M${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`; };
  const paths = [];
  map.querySelectorAll("[data-from]").forEach(to => {
    to.dataset.from.split(" ").filter(Boolean).forEach(id => {
      const from = document.getElementById(id);
      if (!from) return;
      const [x1, y1] = start(from), [x2, y2] = mid(to);
      const d = curve(x1, y1, x2, y2, +from.dataset.skip || 0);
      const done = from.classList.contains("done") && to.classList.contains("done");
      const queued = from.classList.contains("queued") || to.classList.contains("queued");
      paths.push(done ? `<path d="${d}" stroke="var(--ink)" stroke-width="8" fill="none" stroke-linecap="round"/><path d="${d}" stroke="var(--green)" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
        : queued ? `<path d="${d}" stroke="var(--ink-2)" stroke-width="3" fill="none" stroke-dasharray="7 7"/>`
        : to.classList.contains("locked") || from.classList.contains("locked") ? `<path d="${d}" stroke="var(--ink)" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="1 10"/>`
        : `<path d="${d}" stroke="var(--ink)" stroke-width="4" fill="none" stroke-linecap="round"/>`);
    });
  });
  svg.innerHTML = paths.join("");
  // Race progress: colour each squad's path up to how far it has got, with a marker at that point
  const marks = [];
  map.querySelectorAll(".tnode[data-pct]").forEach(from => {
    const to = [...map.querySelectorAll(".cp")].find(c => c.dataset.from.split(" ").includes(from.id));
    if (!to) return;
    // The race runs from under the squad's label down to the goal
    const [x1, y1] = start(from), [x2, y2] = mid(to), d = curve(x1, y1, x2, y2, +from.dataset.skip || 0);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    const len = path.getTotalLength(), pct = +from.dataset.pct, at = path.getPointAtLength(len * Math.max(.18, pct / 100) * .8);
    path.remove();
    const c = getComputedStyle(from).getPropertyValue("--track");
    marks.push(`<path d="${d}" pathLength="100" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${Math.max(18, pct) * .8} 100"/>`,
      `<g transform="translate(${at.x} ${at.y})"><rect x="-19" y="-11" width="38" height="22" rx="11" fill="var(--white)" stroke="${from.dataset.mine ? "var(--blue)" : "var(--ink)"}" stroke-width="${from.dataset.mine ? 3 : 2}"/><text text-anchor="middle" dy="4.5" class="race-n">${from.dataset.score}</text></g>`);
  });
  svg.insertAdjacentHTML("beforeend", marks.join(""));
}
export function strategiesView(m) {
  const g = gateOf(m);
  const all = [...shown(m)].sort((a, b) => b.score - a.score);
  return `<div class="card milestone"><div class="eyebrow">Stage ${m.current + 1}: ${esc(m.stages[m.current].name)}</div><div class="mgoal">${esc(m.stages[m.current].goal)}</div>${gateBar(m)}<div class="small"><b>${g.have}/${g.need} ${g.unit}</b></div></div>
    <div class="list">${all.map((s, i) => `<button class="card squad" data-a="strategy-from-map" data-x="${s.id}">
      <div class="rank">${i + 1}</div>
      <div style="min-width:0;text-align:left"><b>${esc(s.name)}</b><div class="muted small">${s.status ? `${STATUS[s.status](s)} · ` : ""}${esc(s.squad)} · led by ${esc(s.lead)}</div><div class="meter"><i style="width:${Math.min(100, s.score / g.need * 100)}%;background:${s.color}"></i></div></div>
      <div class="display" style="font-size:15px">+${s.score}</div>
    </button>`).join("")}</div>
`;
}
export function rulesView(m) {
  return `<article class="card doc">
    <h1 class="doc-title">${esc(m.title)}</h1>
    <h3>The problem</h3><p>${esc(MISSION_WHY[m.id] || m.pitch)}</p>
    <h3>The goal</h3><p>${esc(m.pitch)}</p>
    <h3>We win when</h3><ol class="wins">${m.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ol>
    <h3>What we'll make</h3><ol class="wins">${trustOf(m).deliver.map(d => `<li>${esc(d)}</li>`).join("")}</ol>
    <button class="info" data-a="prize" data-x="${m.id}" style="align-self:flex-start;margin-top:6px">How the $${fmt(m.bounty)} prize works →</button>
  </article>`;
}
