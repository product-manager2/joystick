import { BADGES, ROLES, medal, missions } from "../data/content.js";
import { PEOPLE } from "../data/world.js";
import { DetailGroup as Group, DetailRow as Row, Tick } from "../design/components.js";
import { strats } from "../game/strategies.js";
import { chanIcon, stratBadge } from "./quests.js";
import { S } from "../state.js";
import { backBtn, bot, esc, face, mono } from "../ui/helpers.js";

// ===================== Another player's profile =====================
// The same shape as your own: a person and their agent are one team, with one level, medals and history.
// Players without a full record (squad leads, new players) get a short profile built from their squad.
const leads = () => missions.flatMap(m => strats(m).map(s => ({ m, s }))).filter(({ s }) => s.lead === S.personId);
export function personOf(n) {
  if (PEOPLE[n]) return PEOPLE[n];
  const l = leads()[0];
  return { color: l ? l.s.color : "var(--sky)", role: "leader", squad: l ? l.s.squad : "No squad yet", rep: 4.6, quests: 12, bio: l ? `Leads ${l.s.squad}` : "New player", skills: [] };
}
export function personScreen() {
  const n = S.personId, p = personOf(n);
  const level = Math.max(2, Math.round(p.quests / 6));
  // Where they play: every plan their squad runs, across missions
  const plays = missions.flatMap(m => strats(m).filter(s => s.squad === p.squad).map(s => ({ m, s })));
  // What they've done: quests credited to them, or that they're in right now
  const work = missions.flatMap(m => m.quests.filter(q => (q.by || "").includes(n)).map(q => ({ m, q, done: true })));
  const medals = Object.keys(BADGES).slice(0, Math.min(Object.keys(BADGES).length, 2 + Math.floor(p.quests / 15)));
  const agent = p.agent || `${n.replace(/^@/, "")}'s agent`;
  return `<div class="chat">
    <div class="chat-head">${backBtn("back", "", "Back")}<div style="min-width:0;flex:1"><div class="room-title">${esc(n)}</div><div class="small muted">${esc(p.squad)}</div></div></div>
    <div class="stage-list">
      <div class="card duo-card">
        <div class="sunbox" style="padding:16px"><div class="duo-pair"><span class="av">${face(p.color, n.length)}</span><span class="av">${bot(agent, true)}</span></div>
          <h1 class="cup" style="font-size:26px">${esc(n)} &amp; ${esc(agent)}</h1>
          <div class="small" style="text-align:center">${esc(p.bio)}</div></div>
        <div class="kv"><div class="stat"><b>${level}</b><span>level</span></div><div class="stat"><b>${p.quests}</b><span>quests done</span></div><div class="stat"><b>★ ${p.rep}</b><span>check score</span></div></div>
        <div class="row" style="gap:8px">${mono(p.role, 30)}<span class="small"><b>${ROLES[p.role].name}</b> · ${esc(ROLES[p.role].does)}</span></div>
        <div class="qbtns"><button class="btn blue" data-a="dm" data-x="${esc(n)}">Message</button><button class="btn" data-a="pair" data-x="${esc(n)}">Team up on a quest</button></div>
      </div>
      <div class="eyebrow">Squad</div>
      ${plays.length ? Group(plays.map(({ m, s }) => `<button class="drow" data-a="openstrat" data-x="${m.id}" data-s="${s.id}">${stratBadge(s, 28)}<span style="min-width:0"><b>${esc(s.squad)}</b><span class="small muted" style="display:block">${esc(s.name)} · ${esc(m.title)}</span></span><span class="muted">›</span></button>`)) : `<p class="small muted">Not in a squad yet.</p>`}
      <div class="eyebrow">Skills</div>
      ${p.skills.length ? Group(p.skills.map(([k, h]) => Row(Tick(/verified/.test(h), "✓", "~"), esc(k), esc(h)))) : `<p class="small muted">No skills checked yet.</p>`}
      <div class="eyebrow">Medals · ${medals.length}</div>
      <div class="medals">${medals.map(id => `<div class="medal">${medal(id, 56)}<b>${BADGES[id].name}</b></div>`).join("")}</div>
      ${work.length ? `<div class="eyebrow">Recent work</div>${Group(work.map(({ m, q }) => Row(chanIcon(m, 28), esc(q.title), `${esc(m.title)} · cleared`)))}` : ""}
    </div>
  </div>`;
}
