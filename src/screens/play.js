import { SIZE, missions } from "../data/content.js";
import { color } from "../design/tokens.js";
import { questScore, questWhy, why } from "../game/personalise.js";
import { gateOf, playable } from "../game/strategies.js";
import { partnerSeed } from "./comms.js";
import { AGENT_TAG, chName, chanIcon, gateBar } from "./quests.js";
import { S } from "../state.js";
import { go } from "../ui/chrome.js";
import { botAv, esc, mission, mono, pips } from "../ui/helpers.js";

// ===================== Play hub: what to do right now =====================
export function raidCard() {
  const done = Math.min(3, S.raid);
  return `<div class="raid">
    <div style="flex:1;min-width:0"><div class="display" style="font-size:16px">${done >= 3 ? "Raid cleared!" : "Daily raid"}</div>
      <div class="muted">${done >= 3 ? "Back tomorrow for more" : "Clear 3 quests · win $50 + a crate"}</div>
      <div class="raid-pips">${[0, 1, 2].map(i => `<i class="${i < done ? "on" : ""}"></i>`).join("")}</div></div>
    <div class="clock">04:12</div></div>`;
}
export function questRow({ q, m }) {
  return `<div class="card qplay">${mono(q.role, 34)}
    <button class="qbody" data-a="openq" data-x="${m.id}" data-q="${q.id}"><b>${q.size === "Boss" ? "★ " : ""}${esc(q.title)}</b><span class="small muted">${chName(m)} · ${SIZE[q.size].label} · +${q.xp} XP</span>${why(questWhy(q, m))}</button>
    <button class="btn sm blue" data-a="play" data-x="${q.id}" data-mode="together">Play</button></div>`;
}
export function playScreen() {
  partnerSeed();
  const joined = missions.filter(m => S.joined[m.id]);
  const calls = missions.flatMap(m => m.quests.filter(q => q.state === "call").map(q => ({ q, m })));
  const open = missions.flatMap(m => m.quests.filter(playable).map(q => ({ q, m })));
  const forYou = open.filter(x => questScore(x.q, x.m) > 1).sort((a, b) => questScore(b.q, b.m) - questScore(a.q, a.m));
  const list = (forYou.length ? forYou : open).slice(0, 4);
  const best = missions.map(m => ({ m, n: m.quests.filter(q => playable(q) && S.roles.includes(q.role)).length })).sort((a, b) => b.n - a.n)[0];
  return `<div class="screen">
    ${raidCard()}
    ${calls.length ? `<div class="eyebrow" style="color:var(--red)">${esc(S.agentName)} needs your call</div><div class="list">${calls.map(({ q, m }) => `
      <button class="card callrow" data-a="openq" data-x="${m.id}" data-q="${q.id}">${botAv()}<span style="min-width:0"><b>${esc(q.call.q)}</b><span class="small muted">${esc(q.title)}</span></span><span class="btn sm red">Answer</span></button>`).join("")}</div>` : ""}
    ${joined.length ? `<h2 class="sec-title">Your channels</h2><div class="list">${joined.map(m => {
        const g = gateOf(m);
        return `<button class="card chanrow" data-a="mission-ch" data-x="${m.id}">${chanIcon(m, 44)}
          <span style="min-width:0"><span class="display" style="font-size:16px;display:block">${chName(m)}</span><span class="small muted ellip" style="display:block">${esc(m.title)}</span>
          <span style="display:block;margin-top:6px">${gateBar(m, 10)}</span></span>
          ${m.unread ? `<span class="unread">${m.unread}</span>` : `<span class="small"><b>${g.have}/${g.need}</b></span>`}</button>`; }).join("")}</div>`
      : `<div class="card firstrun">${botAv("av big")}<div style="flex:1;min-width:0"><div class="from">${esc(S.agentName)}${AGENT_TAG}</div>
          <p><b>Start with ${esc(best.m.title)}?</b> ${best.n} quests fit your style.</p>
          <button class="btn red sm" data-a="mission" data-x="${best.m.id}" style="margin-top:8px">Let's go</button></div></div>`}
    <h2 class="sec-title">For you</h2>
    <div class="list">${list.map(questRow).join("")}</div>
  </div>`;
}
