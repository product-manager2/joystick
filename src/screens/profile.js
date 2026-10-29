import { BADGES, medal, missions } from "../data/content.js";
import { FINISHED } from "../data/history.js";
import { DetailGroup as Group, DetailRow as Row, drill } from "../design/components.js";
import { ownPct, tok } from "../game/economy.js";
import { strats } from "../game/strategies.js";
import { rolePicker, swatches } from "./onboarding.js";
import { chanIcon } from "./quests.js";
import { S } from "../state.js";
import { bot, duoName, esc, face, fmt, mission, youColor } from "../ui/helpers.js";

// ===================== Profile =====================
// You and your agent are one team: one name, one level, one set of medals, one history.
// The main screen answers "who are we and what have we done together". Everything else is a drill-down.
export function profileScreen() {
  const got = Object.keys(BADGES).filter(id => S.badges.includes(id)), left = Object.keys(BADGES).filter(id => !got.includes(id));
  const done = FINISHED.filter(f => f.yours && S.together > 0);
  const history = [
    ...done.map(f => `<button class="drow" data-a="recap" data-x="${f.id}"><span>★</span><span style="min-width:0"><b>${esc(f.title)}</b><span class="small muted" style="display:block">Mission finished · ${esc(f.mine.credit)}</span></span><span class="muted">›</span></button>`),
    ...S.credits.map(c => { const mm = mission(c.m); return Row(mm ? chanIcon(mm, 28) : "✓", esc(c.what), esc(mm ? mm.title : "")); }),
  ];
  return `<div class="screen">
    <div class="card duo-card">
      <div class="sunbox" style="padding:16px"><div class="duo-pair"><span class="av bounce">${face(youColor, 2)}</span><span class="av bounce" style="animation-delay:.2s">${bot(S.botColor, true)}</span></div>
        <h1 class="cup" style="font-size:28px">${esc(duoName())}</h1>
        <div class="small" style="text-align:center">One team. Everything we win, we win together.</div></div>
      <div><div class="row"><span class="eyebrow">Level ${S.level}</span><span class="spacer"></span><span class="small muted">${S.xpMax - S.xp} XP to level ${S.level + 1}</span></div><div class="meter"><i style="width:${S.xp / S.xpMax * 100}%;background:var(--red)"></i></div></div>
      <div class="kv"><div class="stat"><b>${S.together}</b><span>quests done</span></div><div class="stat"><b>${Object.keys(S.joined).length}</b><span>missions</span></div><div class="stat"><b>$${fmt(S.coins)}</b><span>earned</span></div></div>
    </div>
    <div class="row"><h2 class="sec-title">Our medals</h2><span class="spacer"></span><span class="eyebrow">${got.length} of ${Object.keys(BADGES).length}</span></div>
    <div class="medals">${[...got, ...left].map(id => `
      <div class="medal ${got.includes(id) ? "" : "off"}">${medal(id, 64)}<b>${BADGES[id].name}</b><span>${BADGES[id].desc}</span></div>`).join("")}</div>
    <h2 class="sec-title">What we've done</h2>
    ${history.length ? Group(history) : `<p class="muted small">Nothing yet. Finish a quest together and it shows up here.</p>`}
    <h2 class="sec-title">Our stuff</h2>
    ${Group([["wallet", "$", "Money", `$${fmt(S.coins)}`], ["look", "✎", `${esc(S.agentName)}'s name and colour`, ""], ["style", "★", "What we're good at", `${S.roles.length}`],
      ["learned", "✓", `What ${esc(S.agentName)} knows about you`, `${S.learned.length}`], ["skills", "✓", "Skills", `${S.skills.filter(([, h]) => /verified/.test(h)).length} checked`],
      ["tools", "⇄", "Apps we use", `${Object.values(S.tools).filter(Boolean).length}`], ["spendcap", "$", "Spending limit", `$${S.spendCap}`]]
      .map(([k, i, l, v]) => `<button class="drow" data-a="acct" data-x="${k}"><span>${i}</span><b>${l}</b><span class="small muted">${v} ›</span></button>`))}
  </div>`;
}

export function walletSheet() {
  const shares = Object.entries(S.wallet.shares), stakes = Object.entries(S.stakes);
  drill("Our money", `${Group([
      Row(`<span class="coin"></span>`, "Ready to take out", "", `<b>$${fmt(S.coins)}</b>`),
      Row("⏳", "On the way", "Paid when a stage is finished", `<b>$${fmt(S.wallet.pending)}</b>`),
    ])}
    <button class="btn red block" data-a="acct" data-x="payouts">Take out money</button>
    ${shares.length ? `<div class="eyebrow">Missions we own a piece of</div>
    ${Group(shares.map(([id, n]) => { const mm = mission(id); return Row(chanIcon(mm, 28), esc(mm.title), `${fmt(n)} ${tok(mm)}`, `<b>${ownPct(mm).toFixed(2)}%</b>`); }))}` : ""}
    ${stakes.length ? `<div class="eyebrow">Teams we back</div>
    ${Group(stakes.map(([sid, n]) => { const mm = missions.find(x => (x.strategies || []).some(s => s.id === sid)); const s = mm && strats(mm).find(x => x.id === sid); return s ? Row("♥", esc(s.squad), esc(s.name), `<b>$${fmt(n)}</b>`) : ""; }))}` : ""}`, "", walletSheet);
}
export function lookSheet() {
  drill(`${esc(S.agentName)}'s look`, `<div class="row" style="justify-content:center"><span class="av" style="width:92px;height:92px">${bot(S.botColor, true)}</span></div>
    <div class="eyebrow">Name</div>
    <div class="chips wrap">${["Pip", "Bolt", "Sprout", "Mochi", "Rex"].map(n => `<button class="chip" data-a="botname" data-x="${n}" data-keep="1" aria-pressed="${S.agentName === n}">${n}</button>`).join("")}</div>
    <div class="eyebrow">Colour</div>${swatches().replace(/data-a="paint"/g, 'data-a="paint" data-keep="1"')}`, "", lookSheet);
}
export function styleSheet() {
  drill("What we're good at", `<div class="small muted">Pick up to three. We'll see quests that fit.</div>
    ${rolePicker(S.roles, "duo-role").replace(/data-a="duo-role"/g, 'data-a="duo-role" data-keep="1"')}`, "", styleSheet);
}
export function learnedSheet() {
  drill(`What ${esc(S.agentName)} knows`, `<div class="small muted">${esc(S.agentName)} remembers your calls, so next time it can do it your way.</div>
    ${S.learned.length ? Group(S.learned.map(l => Row("✓", esc(l), ""))) : `<p class="muted small">Nothing yet. Make some calls together.</p>`}`);
}
