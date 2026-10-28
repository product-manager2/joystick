import { ROLES, missions } from "../data/content.js";
import { PEOPLE } from "../data/world.js";
import { spendOpts } from "../game/questflow.js";
import { gateOf, playable, stratOf, strats } from "../game/strategies.js";
import { forgeCard } from "./forge.js";
import { AGENT_TAG, chName, chanIcon, crewAv, isMulti, short } from "./quests.js";
import { S, TEAMMATES, threads } from "../state.js";
import { render } from "../ui/chrome.js";
import { backBtn, bot, botAv, esc, face, findQuest, gain, learn, mission, mono, thread, tier, youAv } from "../ui/helpers.js";

// ===================== Comms =====================
export function threadTitle(t) { return t.kind === "agent" ? S.agentName : t.title; }
export function threadAv(t) {
  if (t.kind === "agent") return `<span class="av" style="width:44px;height:44px">${bot(S.botColor)}</span>`;
  if (t.kind === "dm") return `<span class="av" style="width:44px;height:44px">${face(PEOPLE[t.person].color, t.person.length)}</span>`;
  return chanIcon(mission(t.mission), 44);
}
export function lastLine(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const x = msgs[i];
    if (x.sys) return x.sys;
    if (x.text) return (x.me || x.you ? "You: " : x.agent ? S.agentName + ": " : x.who ? x.who + ": " : "") + x.text;
  }
  return "";
}
export function commsScreen() {
  partnerSeed();
  const row = (a, x, av, title, sub, unread, tag) => `<button class="card thread-row" data-a="${a}" data-x="${x}">${av}
    <span style="min-width:0"><span class="t" style="display:block">${title}</span><span class="last" style="display:block">${esc(sub)}</span></span>
    ${unread ? `<span class="unread">${unread}</span>` : `<span class="small muted">${tag}</span>`}</button>`;
  const chans = [...missions].sort((a, b) => !!S.joined[b.id] - !!S.joined[a.id]);
  return `<div class="screen">
    <h2 class="sec-title">Comms</h2>
    <div class="eyebrow">Direct</div>
    <div class="list">${threads.map(t => row("thread", t.id, threadAv(t), esc(threadTitle(t)) + (t.kind === "agent" ? AGENT_TAG : ""), lastLine(t.msgs), t.unread, t.kind)).join("")}</div>
    ${(() => {
      const rooms = missions.flatMap(m => m.quests.filter(q => q.feed && (q.scripted || q.feed.some(x => x.me))).map(q => ({ q, m })));
      return rooms.length ? `<div class="eyebrow">Quest rooms</div><div class="list">${rooms.map(({ q, m }) => row("quest", q.id, mono(q.role, 44), `${esc(short(q.title))} <span class="mode ${isMulti(q) ? "multi" : ""}">${isMulti(q) ? "Squad" : "Solo"}</span>`, lastLine(q.feed), q.unread, chName(m))).join("")}</div>` : "";
    })()}
    <div class="eyebrow">Channels</div>
    <div class="list">${chans.map(m => row("mission-ch", m.id, chanIcon(m, 44), `${chName(m)} <span class="small muted">· ${esc(m.title)}</span>`, `${gateOf(m).have}/${gateOf(m).need} ${m.unit} · ${strats(m).length} strategies racing`, m.unread, S.joined[m.id] ? "joined" : "")).join("")}</div>
  </div>`;
}
export function partnerSeed() {
  const p = thread("partner");
  if (p.msgs.length) return;
  const sug = missions.flatMap(m => m.quests.filter(q => playable(q) && S.roles.includes(q.role)))[0];
  p.msgs.push({ agent: true, text: `Morning! Start here?`, quest: sug && sug.id });
}
export function msgHTML(msg) {
  if (msg.typing) return `<div class="msg">${msg.who ? `<span class="av">${msg.bot ? bot(msg.color) : face(msg.color, msg.who.length)}</span>` : botAv()}<div class="bubble">${msg.who ? `<div class="from">${esc(msg.who)} is typing</div>` : ""}<span class="typing"><i></i><i></i><i></i></span></div></div>`;
  if (msg.sys) return `<div class="sys ${msg.win ? "win" : ""}">${esc(msg.sys)}</div>`;
  const me = msg.me || msg.you;
  const av0 = me ? youAv() : msg.agent ? botAv() : msg.bot ? `<span class="av">${bot(msg.color)}</span>` : `<span class="av">${face(msg.color || "var(--paper-2)", (msg.who || "").length)}</span>`;
  const pk = msg.bot ? msg.owner : msg.who;
  const av = !me && !msg.agent && PEOPLE[pk] ? `<button class="avbtn" data-a="person" data-x="${esc(pk)}" aria-label="${esc(pk)}">${av0}</button>` : av0;
  const from = me ? "" : `<div class="from">${esc(msg.agent ? S.agentName : msg.who)}${msg.agent || msg.bot ? ` <span class="via">via ${esc(msg.agent ? (S.name || "you") : msg.owner)}</span>` : ""}</div>`;
  let extra = "";
  if (msg.quest) {
    const [q, m] = findQuest(msg.quest);
    if (q) extra = `<div class="card qrow" style="margin-top:8px;box-shadow:2px 2px 0 var(--ink)">${mono(q.role, 30)}<span style="min-width:0"><b>${esc(q.title)}</b><span class="small muted">${esc(m.title)}</span></span>${q.done || q.state ? "" : `<button class="btn sm blue" data-a="play" data-x="${q.id}">Start</button>`}</div>`;
  }
  if (msg.run) extra = `<div class="prog live" style="margin-top:6px"><i id="bar-${msg.run}-${msg.phase}" style="width:${(msg.p || 0) * 100}%"></i></div><div class="log" id="log-${msg.run}-${msg.phase}">${esc(msg.log || "")}</div>`;
  if (msg.call) {
    const [q] = findQuest(msg.call);
    extra = msg.answered ? `<div class="small muted" style="margin-top:4px">→ ${esc(msg.answered)}</div>`
      : `<div class="call" style="margin-top:8px"><div class="opts">${q.call.opts.map((o, i) => `<button data-a="pick" data-x="${q.id}" data-i="${i}">${esc(o)}</button>`).join("")}</div></div>`;
  }
  if (msg.form) extra = forgeCard(msg.form);
  if (msg.file) extra = `<div class="filechip"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 2h7l4 4v12H5z"/><path d="M12 2v4h4"/></svg>${esc(msg.file)}</div>`;
  if (msg.split) {
    const [q] = findQuest(msg.split);
    extra = msg.splitDone || q.parts ? `<div class="small muted" style="margin-top:4px">→ Split into 3 parts</div>`
      : `<ol class="splitlist"><li>Scope it <span class="muted">· Strategist</span></li><li>Do it <span class="muted">· ${ROLES[q.role].name}</span></li><li>Check it <span class="muted">· Critic</span></li></ol><button class="btn sm red" data-a="dosplit" data-x="${q.id}">Split it</button>`;
  }
  if (msg.spend) {
    const [q] = findQuest(msg.spend);
    extra = msg.answered ? `<div class="small muted" style="margin-top:4px">→ ${esc(msg.answered)}</div>`
      : `<div class="call" style="margin-top:8px"><div class="opts">${spendOpts(q).map((o, i) => `<button data-a="spend" data-x="${q.id}" data-i="${i}">${o}</button>`).join("")}</div><div class="small muted">Auto-approve limit: $${S.spendCap} · <button class="info" data-a="acct" data-x="spendcap">change</button></div></div>`;
  }
  if (msg.review) {
    const [q] = findQuest(msg.review), sq = !S.squad || S.squad === stratOf(q).squad ? stratOf(q).squad : `${S.squad} or ${stratOf(q).squad}`;
    const ST = { checking: ["Checking…", ""], ok: ["✓ Approved", "done"], changes: ["Changes", "call"], waiting: ["Waiting", ""], overruled: ["Overruled", ""] };
    extra = `<div class="review"><div class="row small"><b>Review · 2 independent Critics</b><span class="spacer"></span><button class="info" data-a="reviewinfo" data-x="${q.id}">How?</button></div>${(q.rv || []).map(r => `<div class="rv"><button class="avbtn" data-a="person" data-x="${esc(r.n)}">${crewAv({ who: r.n, color: PEOPLE[r.n].color })}</button><span style="min-width:0"><b>${esc(r.n)}</b><span class="small muted" style="display:block">${esc(PEOPLE[r.n].squad)} · not in ${esc(sq)}</span></span><span class="qstat ${ST[r.st][1]}">${ST[r.st][0]}</span></div>`).join("")}</div>`;
  }
  if (msg.fix) extra = msg.answered ? `<div class="small muted" style="margin-top:4px">→ ${esc(msg.answered)}</div>`
    : `<div class="qbtns" style="margin-top:8px"><button class="btn sm red" data-a="fixq" data-x="${msg.fix}">Fix it, ${esc(S.agentName)}</button><button class="btn sm" data-a="dispute" data-x="${msg.fix}">Dispute</button></div>`;
  if (msg.proof) extra = msg.answered ? `<div class="small muted" style="margin-top:4px">→ Proof added</div>`
    : `<button class="btn sm red" data-a="proof" data-x="${msg.proof}" style="margin-top:8px">Add proof</button>`;
  if (msg.ideas) extra = `<div class="mini-roles" style="margin-top:8px">${msg.ideas.map(t => `<button data-a="newstrat" data-x="${esc(t)}">${esc(t)}</button>`).join("")}</div>`;
  const wide = msg.form || msg.quest || msg.run || msg.split || msg.ideas || msg.review || (msg.call && !msg.answered) || (msg.spend && !msg.answered) || (msg.fix && !msg.answered);
  const atMe = !me && msg.text && S.name && msg.text.includes("@" + S.name);
  return `<div class="msg ${me ? "me" : ""} ${wide ? "wide" : ""} ${atMe ? "atme" : ""}">${av}<div class="bubble">${from}${msg.text ? `<div>${msg.html ? msg.text : esc(msg.text)}</div>` : ""}${extra}</div></div>`;
}
export function threadScreen() {
  const t = thread(S.thread);
  t.unread = 0;
  const quick = t.kind === "agent" ? ["What's next?", "What have you learned?", "I prefer open-source tools"] : t.kind === "dm" ? ["Want to pair on a quest?", "Can you review my shard?"] : ["On it!", "Need a Critic here", "Pushed my part"];
  return `<div class="chat">
    <div class="chat-head">${backBtn("back", "", "Back")}${threadAv(t)}<div style="min-width:0"><div class="display chan-name">${esc(threadTitle(t))}</div><div class="small muted">${t.kind === "agent" ? `Your partner · ${tier().name} · Sync ${S.sync}%` : t.kind === "dm" ? `${esc(PEOPLE[t.person].squad)} · ★ ${PEOPLE[t.person].rep}` : "4 players · 4 agents"}</div></div></div>
    <div class="msgs" id="msgs">${t.msgs.map(msgHTML).join("")}</div>
    <div class="quick">${quick.map(q => `<button class="chip" data-a="quick" data-x="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <form class="composer" id="composer"><input id="say" placeholder="Message ${esc(threadTitle(t))}" autocomplete="off"><button class="btn sm red" type="submit">Send</button></form>
  </div>`;
}
export function sendInThread(text) {
  const t = thread(S.thread);
  t.msgs.push({ me: true, text });
  t.msgs.push({ typing: true });
  render();
  setTimeout(() => {
    t.msgs = t.msgs.filter(x => !x.typing);
    if (t.kind === "agent") t.msgs.push(agentReply(text));
    else if (t.kind === "dm") t.msgs.push({ who: t.person, color: PEOPLE[t.person].color, text: ["Sure, send me the quest link.", "Happy to pair tonight.", "My agent can take a first pass."][t.msgs.length % 3] });
    else { const [n, c] = TEAMMATES[Math.floor(Math.random() * TEAMMATES.length)]; t.msgs.push({ who: n, color: c, text: ["Nice. Checking it now.", "Copy. Ping me at the final vote.", "Our agents can split the rest."][t.msgs.length % 3] }); }
    if (S.screen === "thread") render();
  }, 900);
}
export function agentReply(text) {
  const low = text.toLowerCase();
  if (low.includes("next")) {
    const q = missions.flatMap(m => m.quests.filter(x => playable(x) && S.roles.includes(x.role)))[0] || missions[0].quests.find(playable);
    return { agent: true, text: "This one. Squad needs it.", quest: q && q.id };
  }
  if (low.includes("learn")) {
    return { agent: true, html: true, text: S.learned.length ? "So far:<br>" + S.learned.slice(0, 4).map(l => "• " + esc(l)).join("<br>") : "Not much yet. Play a quest with me." };
  }
  learn(`You said: “${text}”`);
  gain(0, 0, 1);
  return { agent: true, text: `Got it. I'll do it your way.` };
}
