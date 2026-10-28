import { BADGES, ROLES, TIERS, medal, missions } from "../data/content.js";
import { FUELS, fuelIcon, ownPct, tok } from "../game/economy.js";
import { rolePicker, swatches } from "./onboarding.js";
import { chanIcon } from "./quests.js";
import { S } from "../state.js";
import { bot, botAv, duoName, esc, face, fmt, mission, mono, tier, toggle, youColor } from "../ui/helpers.js";

// ===================== Duo profile =====================
export function duoScreen() {
  const t = tier();
  return `<div class="screen">
    <div class="card duo-card">
      <div class="sunbox" style="padding:16px"><div class="duo-pair"><span class="av bounce">${face(youColor, 2)}</span><span class="av bounce" style="animation-delay:.2s">${bot(S.botColor, true)}</span></div>
        <h1 class="cup" style="font-size:28px">${esc(duoName())}</h1>
        <div class="row" style="justify-content:center"><span class="chip">LV ${S.level}</span><span class="chip">${t.name}</span><span class="chip"><span class="coin" style="width:16px;height:16px"></span>${S.coins} earned</span></div></div>
      <div><div class="row"><span class="eyebrow">XP</span><span class="spacer"></span><span class="typed small">${S.xp}/${S.xpMax}</span></div><div class="meter"><i style="width:${S.xp / S.xpMax * 100}%;background:var(--red)"></i></div></div>
      <div><div class="row"><span class="eyebrow">Sync</span><span class="spacer"></span><span class="typed small">${S.sync}%</span></div><div class="meter"><i style="width:${S.sync}%;background:var(--blue)"></i></div></div>
      <div class="tiers">${TIERS.map(x => `<div class="tier ${x === t ? "on" : ""}"><b>${x.name}</b>${x.does}</div>`).join("")}</div>
      <div class="kv"><div class="stat"><b>${S.together}</b><span>together</span></div><div class="stat"><b>${S.solo}</b><span>solo</span></div><div class="stat"><b>${Object.keys(S.joined).length}</b><span>missions</span></div></div>
    </div>
    <div class="card wallet">
      <div class="row"><h2 class="sec-title" style="font-size:19px">Wallet</h2><span class="spacer"></span><span class="eyebrow">what you've earned</span></div>
      <div class="rewards">
        <div class="reward" style="background:${FUELS.money.color}">${fuelIcon("money", 22)}<b>$${fmt(S.coins)}</b><span>money</span></div>
        <div class="reward" style="background:${FUELS.time.color}">${fuelIcon("time", 22)}<b>${S.wallet.timeCredits}h</b><span>time credits</span></div>
        <div class="reward" style="background:${FUELS.know.color}">${fuelIcon("know", 22)}<b>${S.wallet.insights}</b><span>insights</span></div>
        <div class="reward" style="background:var(--white)"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/></svg><b>${Object.keys(S.wallet.shares).length}</b><span>mission tokens</span></div>
      </div>
      ${Object.entries(S.wallet.shares).map(([id, n]) => { const mm = mission(id); return `<div class="row small">${chanIcon(mm, 28)}<span style="flex:1;min-width:0"><b>${fmt(n)} ${tok(mm)}</b><span class="muted" style="display:block">${esc(mm.title)}</span></span><span>${ownPct(mm).toFixed(2)}%</span></div>`; }).join("")}
      
    </div>
    <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px">
      <div class="row"><b>Paint ${esc(S.agentName)}</b></div>${swatches()}
    </div>
    <div class="row"><h2 class="sec-title">Playing style</h2><span class="spacer"></span><button class="btn sm" data-a="style-toggle">${S.styleOpen ? "Done" : "Change"}</button></div>
    ${S.styleOpen ? rolePicker(S.roles, "duo-role") : `<div class="row wrap" style="gap:8px">${S.roles.map(r => `<span class="role" style="grid-template-columns:30px auto;padding:6px 10px">${mono(r)}<span><b>${ROLES[r].name}</b><span class="muted">${ROLES[r].does}</span></span></span>`).join("")}</div>`}
    <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px">
      <div class="row">${botAv()}<b>${esc(S.agentName)} learned</b></div>
      ${S.learned.length ? `<ul class="learned" style="margin:0;padding:0">${S.learned.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : `<p class="muted small">Nothing yet. Make some calls.</p>`}
    </div>
    <div class="row"><h2 class="sec-title">Badges</h2><span class="spacer"></span><span class="eyebrow">${S.badges.length}/${Object.keys(BADGES).length}</span></div>
    <div class="medals">${Object.keys(BADGES).sort((x, y) => S.badges.includes(y) - S.badges.includes(x)).map(id => `
      <div class="medal ${S.badges.includes(id) ? "" : "off"}">${medal(id, 64)}<b>${BADGES[id].name}</b><span>${S.badges.includes(id) ? BADGES[id].desc : "Still up for grabs"}</span></div>`).join("")}</div>
  </div>`;
}
