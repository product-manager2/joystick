import { SIZE, missions, hasRole } from "../data/content.js";
import { color } from "../design/tokens.js";
import { questScore, questWhy, why } from "../game/personalise.js";
import { NEEDS, NEED_BTN, needsYou } from "../game/questflow.js";
import { gateOf, playable } from "../game/strategies.js";
import { partnerSeed } from "./comms.js";
import { AGENT_TAG, questSub, chName, chanIcon, stageLine, gateBar, questStatus, short } from "./quests.js";
import { S } from "../state.js";
import { go } from "../ui/chrome.js";
import { botAv, esc, mission, mono, pips } from "../ui/helpers.js";

// ===================== Play hub: what to do right now =====================
export function questRow({ q, m }) {
  return `<div class="card qplay">${mono(q.role, 34)}
    <button class="qbody" data-a="openq" data-x="${m.id}" data-q="${q.id}"><b>${esc(q.title)}</b><span class="small muted">${chName(m)} · ${questSub(q, m)}</span>${why(questWhy(q, m))}</button>
    <button class="btn sm blue" data-a="play" data-x="${q.id}">Start</button></div>`;
}
export function playScreen() {
  partnerSeed();
  const joined = missions.filter(m => S.joined[m.id]);
  const calls = missions.flatMap(m => m.quests.filter(needsYou).map(q => ({ q, m })));
  const busy = missions.flatMap(m => m.quests.filter(q => ["work", "review", "run"].includes(q.state)).map(q => ({ q, m })));
  const open = missions.flatMap(m => m.quests.filter(playable).map(q => ({ q, m })));
  const forYou = open.filter(x => questScore(x.q, x.m) > 1).sort((a, b) => questScore(b.q, b.m) - questScore(a.q, a.m));
  // One top quest from each mission you're in, then the best of the rest
  const pool = forYou.length ? forYou : open, firsts = joined.map(m => pool.find(x => x.m === m)).filter(Boolean);
  const list = [...firsts, ...pool.filter(x => !firsts.includes(x))].filter((x, i, a) => !x.q.back || a.findIndex(y => y.q.back) === i).slice(0, 4);
  const best = missions.map(m => ({ m, n: m.quests.filter(q => playable(q) && hasRole(q.role)).length })).sort((a, b) => b.n - a.n)[0];
  return `<div class="screen">
    ${calls.length ? `<div class="eyebrow" style="color:var(--red)">${esc(S.agentName)} needs you</div><div class="list">${calls.map(({ q, m }) => `
      <button class="card callrow" data-a="openq" data-x="${m.id}" data-q="${q.id}">${botAv()}<span style="min-width:0"><b>${esc(NEEDS[q.state](q))}</b><span class="small muted">${esc(q.title)}</span></span><span class="btn sm red">${NEED_BTN[q.state]}</span></button>`).join("")}</div>` : ""}
    ${busy.length ? `<div class="eyebrow">In progress</div><div class="list">${busy.map(({ q, m }) => `
      <button class="card callrow" style="background:var(--card)" data-a="openq" data-x="${m.id}" data-q="${q.id}">${botAv()}<span style="min-width:0"><b>${esc(short(q.title))}</b><span class="small muted">${{ work: `${esc(S.agentName)} is working · ${esc(q.eta || "")}`, run: `${esc(S.agentName)} is on it`, review: "2 players checking" }[q.state]}</span></span>${questStatus(q)}</button>`).join("")}</div>` : ""}
    ${joined.length ? ""
      : `<div class="card firstrun">${botAv("av big")}<div style="flex:1;min-width:0"><div class="from">${esc(S.agentName)}${AGENT_TAG}</div>
          <p><b>Start with ${esc(best.m.title)}?</b> ${best.n} quests fit your style.</p>
          <button class="btn red sm" data-a="mission" data-x="${best.m.id}" style="margin-top:8px">Let's go</button></div></div>`}
    <h2 class="sec-title">For you</h2>
    <div class="list">${list.map(questRow).join("")}</div>
  </div>`;
}
