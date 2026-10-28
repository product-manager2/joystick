import { ROLES, missions, roleColor } from "../data/content.js";
import { Button, Stats, Tabs } from "../design/components.js";
import { color } from "../design/tokens.js";
import { fuelGauges, fuelOf, mult, tok, tokenCard } from "../game/economy.js";
import { gateOf, leaderOf, playable, strats } from "../game/strategies.js";
import { MISSION_WHY, chName, gateBar, short } from "./quests.js";
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
    const g = gateOf(m), boss = m.quests.find(q => q.size === "Boss" && !q.done);
    return `<div class="card mine">
      <button class="band" style="background:${m.color}" data-a="mission" data-x="${m.id}">${glyph(m)}<h3>${esc(m.title)}</h3>${m.unread ? `<span class="unread">${m.unread}</span>` : ""}</button>
      <div class="body">
        <div class="row small"><b>Milestone ${m.current + 1} · ${esc(m.stages[m.current].name)}</b><span class="spacer"></span><span>${g.have}/${g.need} ${g.unit}</span></div>
        ${gateBar(m)}
        <ul class="news">${(m.news || []).slice(0, 2).map(n => `<li>${esc(n)}</li>`).join("")}${boss ? `<li class="hotline">Boss is open: ${esc(short(boss.title))}</li>` : ""}</ul>
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
  return `<div class="screen">
    <div class="row">${backBtn("go", "lobby", "Back to missions")}<span class="eyebrow">Mission by ${esc(m.creator)}</span></div>
    <div class="card mhead">
      <div class="band" style="background:${m.color}">${glyph(m)}<h1>${esc(m.title)}</h1></div>
      <div class="in">
        <p>${esc(m.pitch)}</p>
        ${Stats([[`$${fmt(m.bounty)}`, "bounty"], [`${m.current + 1}/${m.stages.length}`, "milestone"], [fmt(m.players), "playing"]])}
        <div class="row wrap" style="gap:6px">${signed ? signed.map(r => `<span class="rtag" style="background:${roleColor(r)}">${ROLES[r].name}</span>`).join("") : ""}<span class="chip" style="background:var(--navy);color:var(--white)">${tok(m)} ×${mult(m)}</span>${dry ? `<button class="chip drychip" data-a="tab" data-x="fuel">Dry in ${f.dryDays}d</button>` : ""}</div>
      </div>
    </div>
    ${Tabs(tabs, S.tab, "tab")}
    ${body}
    <div class="sticky-cta">${signed
      ? `${Button(`Play ${chName(m)}`, { variant: "blue", block: true, action: "mission-ch", value: m.id })}`
      : `${Button("Join mission", { variant: "red", block: true, action: "contract", value: m.id })}`}</div>
  </div>`;
}
export function treasuryView(m) {
  const f = fuelOf(m);
  return `<div class="card milestone">
      <div class="row"><div class="eyebrow">Milestone ${m.current + 1} fuel</div><span class="spacer"></span>${f.money[0] < f.money[1] ? `<span class="dry">Dry in ${f.dryDays} days</span>` : ""}</div>
      ${fuelGauges(m)}
    </div>
    ${tokenCard(m)}`;
}
export function mapView(m) {
  const xs = [50, 72, 30, 66, 36, 70];
  return `<div class="map" id="map"><svg class="trail" id="trail"></svg>${m.stages.map((s, i) => {
    const st = i < m.current ? "done" : i === m.current ? "now" : "locked";
    return `<div class="node-row"><button class="node ${st} ${s.boss ? "boss" : ""}" style="left:${xs[i % xs.length]}%" data-a="stage" data-x="${i}">
      ${st === "now" ? `<span class="flag">${S.joined[m.id] ? "YOU ARE HERE" : `${m.players.toLocaleString()} HERE`}</span>` : ""}
      <span class="disc">${st === "done" ? "✓" : st === "locked" ? (s.boss ? "★" : "?") : i + 1}</span><span class="lbl">${esc(s.name)}</span></button></div>`;
  }).join("")}</div>
`;
}
export function drawTrail() {
  const map = $("#map"), svg = $("#trail");
  if (!map) return;
  const r = map.getBoundingClientRect();
  const pts = [...map.querySelectorAll(".disc")].map(d => { const b = d.getBoundingClientRect(); return [b.left - r.left + b.width / 2, b.top - r.top + b.height / 2]; });
  const cur = mission().current;
  svg.innerHTML = pts.slice(0, -1).map(([x1, y1], i) => {
    const [x2, y2] = pts[i + 1], my = (y1 + y2) / 2, d = `M${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
    return i < cur ? `<path d="${d}" stroke="var(--ink)" stroke-width="9" fill="none" stroke-linecap="round"/><path d="${d}" stroke="var(--green)" stroke-width="4" fill="none" stroke-linecap="round"/>`
                   : `<path d="${d}" stroke="var(--ink)" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="1 12"/>`;
  }).join("");
}
export function strategiesView(m) {
  const g = gateOf(m);
  const all = [...strats(m)].sort((a, b) => b.score - a.score);
  return `<div class="card milestone"><div class="eyebrow">Milestone ${m.current + 1}: ${esc(m.stages[m.current].name)}</div><div class="mgoal">${esc(m.stages[m.current].goal)}</div>${gateBar(m)}<div class="small"><b>${g.have}/${g.need} ${g.unit}</b></div></div>
    <div class="list">${all.map((s, i) => `<button class="card squad" data-a="strategy-from-map" data-x="${s.id}">
      <div class="rank">${i + 1}</div>
      <div style="min-width:0;text-align:left"><b>${esc(s.name)}</b><div class="muted small">${esc(s.squad)} · led by ${esc(s.lead)}</div><div class="meter"><i style="width:${Math.min(100, s.score / g.need * 100)}%;background:${s.color}"></i></div></div>
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
      </article>`;
}
