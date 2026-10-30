import { BADGES, medal, missions, ROLES } from "../data/content.js";
import { S, threads } from "../state.js";
import "./screens.css";
import "./people-task-design.css";
import "./mission-design.css";
import { go, render, renderHud } from "../ui/chrome.js";
import { SHAPES, backBtn, bot, botAv, esc, face, fmt, glyph, mono, youAv } from "../ui/helpers.js";
import { api, apiOrigin, gameAction, live, loadGame, signOut } from "./game-client.js";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { connectRooms, loadRoom, markRoomRead, onRoomsChanged, roomState, resetRooms, sendRoom } from "./room-chat.js";
import { acceptCreationDraft, beginCreation, creationClick, creationInput, creationSubmit, creationView } from "./creation.js";
import { onboardingView } from "./onboarding.js";
import { MISSION_WHY } from "../screens/quests.js";

const ui = { busy: false, error: "", draft: null, editor: null, questDraft: null, questSubmitAttempt: null, creation: null, savedCreation: null, context: null, room: null, message: "", agentBusy: false, run: null, runData: null, preview: null, sheet: null, security: null, codes: null, onboard: null };
let accountGeneration = 0;
let navigationGeneration = 0;
let questOpenSequence = 0;
let startingQuestRun = false;
function syncThreadSummaries(summaries) {
  const prior = new Map(threads.map(t => [t.id, t]));
  threads.splice(0, threads.length, ...summaries.map(t => ({ ...prior.get(t.id), ...t, msgs: prior.get(t.id)?.msgs || [] })));
  if (S.live) renderHud();
}
onRoomsChanged(message => {
  if (message?.type === "agent.activity" && message.completed) refreshGame();
  if(message?.sequence){const t=live.snapshot?.threads.find(x=>x.id===message.roomId);if(t){const seq=Number(message.sequence);t.lastMessage={text:message.text,createdAt:message.createdAt||message.created_at,senderName:message.senderName};if(t._liveSequence!==undefined&&seq>t._liveSequence&&message.senderId!==live.user?.id&&!((S.screen==="thread"&&S.thread===t.id)||(S.screen==="quest"&&t.kind==="quest"&&S.questId===t.scopeId)))t.unread=(t.unread||0)+1;t._liveSequence=Math.max(t._liveSequence||0,seq);}}
  if (live.snapshot?.threads) syncThreadSummaries(live.snapshot.threads);
  if (!S.live || ui.editor || ui.questDraft || ui.creation || ui.context || ui.preview || (ui.run && !(S.screen==="quest"&&ui.runData?.run?.kind==="quest-execute")) || ui.runHistory) return;
  if (updateVisibleMessages()) return;
  if (S.screen==="quest"&&ui.runData?.run?.kind==="quest-execute") return;
  if (!document.activeElement?.closest("form") && ["thread", "quest", "stage", "strategy", "mission"].includes(S.screen)) render();
});
const current = () => missions.find(m => m.id === S.missionId) || missions[0];
const stage = m => m?.stages?.find(x => x.id === S.stageId) || m?.stages?.[m.current];
const plan = m => m?.strategies?.find(p => p.id === S.stratId);
const quest = m => m?.quests?.find(q => q.id === S.questId);
const currentStage = m => m.stages?.[m.current];
const stageTasks = (m, s) => m.quests.filter(q => q.stageId === s?.id);
const progress = (m, s = currentStage(m)) => { const qs = stageTasks(m,s); return {done:qs.filter(q=>q.done).length,total:qs.length,need:s?.gateTarget || 1}; };
const meter = (done, total, color = "var(--blue)") => `<div class="meter" role="progressbar" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${Math.max(total,1)}"><i style="width:${Math.min(100,Math.round(done/Math.max(total,1)*100))}%;background:${color}"></i></div>`;
const statusText = q => ({open:"Open",claimed:"In progress",submitted:"In review",changes_requested:"Changes needed",approved:"Approved"})[q.state] || q.state;
const taskLink = (m,q,sub="") => row(mono(ROLES[q.role]?q.role:"user",32),q.title,sub || `${statusText(q)} · ${m.title}`,"quest",q.id,q.done?"✓":"›");
const mostRecent = m => (live.snapshot?.notifications || []).find(n => n.entityId && (m.quests.some(q=>q.id===n.entityId)||m.stages.some(s=>s.id===n.entityId)||m.strategies.some(p=>p.id===n.entityId)||n.entityId===m.id));
const row = (icon, title, sub, action, id, suffix = "›") => `<button class="card qitem" data-live="${action}" data-id="${esc(id || "")}">${icon}<span style="min-width:0;flex:1"><b class="qt">${esc(title)}</b><span class="small muted" style="display:block">${esc(sub || "")}</span></span><span class="qstat">${suffix}</span></button>`;
const form = (id, title, fields, button = "Save") => `<form class="card live-form" id="${id}"><h2 class="sec-title">${esc(title)}</h2>${fields}<button class="btn red block" type="submit" ${ui.busy ? "disabled" : ""}>${esc(button)}</button></form>`;
const field = (name, labelText, value = "", type = "text", extra = "") => `<label class="field" for="f-${name}"><span>${esc(labelText)}</span>${type === "textarea" ? `<textarea class="inp" id="f-${name}" name="${name}" ${extra}>${esc(value)}</textarea>` : `<input class="inp" id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`}</label>`;
const message = () => ui.error ? `<p class="live-form-error" role="alert">${esc(ui.error)}</p>` : ui.message ? `<p class="small ok" role="status">${esc(ui.message)}</p>` : "";
const agentText = value => esc(value || "").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\n/g,"<br>");
const catalogText = (label, value) => typeof value === "string" && value.trim() ? `<h3>${esc(label)}</h3><p>${esc(value)}</p>` : "";
const catalogList = (label, values, ordered = false) => { const entries = Array.isArray(values) ? values.filter(value => typeof value === "string" && value.trim()) : []; return entries.length ? `<h3>${esc(label)}</h3><${ordered ? "ol" : "ul"} class="checks">${entries.map(value => `<li>${esc(value)}</li>`).join("")}</${ordered ? "ol" : "ul"}>` : ""; };
const catalogRoles = roles => roles && typeof roles === "object" && !Array.isArray(roles) && Object.keys(roles).length ? `<h3>Roles in this stage</h3><ul class="checks">${Object.entries(roles).map(([role, work]) => `<li><b>${esc(role)}:</b> ${esc(work)}</li>`).join("")}</ul>` : "";
const catalogDisclosure = (label, body) => body ? `<details class="wallet-details"><summary>${esc(label)}</summary>${body}</details>` : "";
const button = (text, action, id = "", cls = "btn sm") => `<button type="button" class="${cls}" data-live="${action}" data-id="${esc(id)}" ${ui.busy ? "disabled" : ""}>${esc(text)}</button>`;
const kind = k => ({ mission: "Mission", stage: "Stage", plan: "Plan", quest: "Task", agent: "Agent", dm: "Person" })[k] || "Chat";
const roomFor = (k, id) => live.snapshot?.threads?.find(t => t.kind === k && (k === "agent" || t.scopeId === id));
const roomTitle = t => { if (t.kind === "agent") return S.agentName; if (t.kind === "dm") return t.peerName || t.title; const m=missions.find(x=>x.id===t.scopeId||x.stages.some(s=>s.id===t.scopeId)||x.strategies.some(p=>p.id===t.scopeId)||x.quests.some(q=>q.id===t.scopeId)); return t.kind==="mission"?m?.title||t.title:t.kind==="stage"?m?.stages.find(s=>s.id===t.scopeId)?.name||t.title:t.kind==="plan"?m?.strategies.find(p=>p.id===t.scopeId)?.name||t.title:m?.quests.find(q=>q.id===t.scopeId)?.title||t.title; };
function resetAccountUI() {
  accountGeneration++;
  navigationGeneration++;
  pendingGameRender = false;
  resetRooms();
  for (const key of Object.keys(ui)) ui[key] = null;
  ui.busy = false; ui.error = ""; ui.message = "";
  missions.splice(0); threads.splice(0);
  S.live = false; S.hist = []; S.screen = "lobby"; S.missionId = null; S.stageId = null; S.stratId = null; S.questId = null; S.thread = null;
}

export function applySnapshot(snapshot) {
  const p = snapshot.profile || {};
  S.live = true;
  S.name = p.name || live.user?.name || "You";
  S.agentName = p.agentName || "Pip";
  S.roles = p.roles || [];
  S.skills = (p.skills || []).map(x => [x, "self declared"]);
  S.preferences = p.preferences || {};
  S.botShape = S.preferences.botShape || "blob";
  S.xp = p.xp || 0;
  S.level = 1 + Math.floor(S.xp / 1200);
  S.xpMax = 1200 * S.level;
  S.coins = snapshot.wallet?.available || 0;
  S.joined = p.joined || {};
  S.notifs = snapshot.notifications || [];
  const oldMission = S.missionId;
  const mapped = (snapshot.missions || []).map(m => ({ ...m,
    creator: m.creator || (m.ownerId ? "Mission creator" : "Mission team"),
    bounty: m.bounty || 0, squads: m.strategies?.length || 0,
    target: m.stages?.[m.current]?.gateTarget || 1, unit: "approved tasks",
    news: [],
    merges: (m.merges || []).map(x => ({...x, sourcePlanId:x.sourcePlanId || x.source_plan_id, targetPlanId:x.targetPlanId || x.target_plan_id})),
    strategies: (m.strategies || []).map(p => ({ ...p, lead: p.creatorId ? (snapshot.people || []).find(x => x.id === p.creatorId)?.name || "Member" : "Mission team", status: p.status === "active" ? null : p.status })),
    quests: (m.quests || []).map(q => ({ ...q, mine: q.claimed, claimed: q.claimedBy && !q.claimed ? [(snapshot.people || []).find(x => x.id === q.claimedBy)?.name || "Member", "active"] : null,
      state: q.state, gain: q.brief?.gain || 0, out: q.out || q.brief?.out || "", log: q.log || [], call: q.call || null,
      feed: [], proof: [], rv: (q.reviews || []).map(r => ({ n: (snapshot.people || []).find(x => x.id === r.reviewer_id)?.name || "Reviewer", st: r.verdict === "approve" ? "ok" : "changes" })) })),
  }));
  missions.splice(0, missions.length, ...mapped);
  S.squads = Object.fromEntries(missions.flatMap(m => m.strategies.filter(p => p.joined).map(p => [m.id, p.id])));
  S.credits = missions.flatMap(m => m.quests.filter(q => q.done && q.claimedBy === live.user?.id).map(q => ({ m: m.id, what: q.title, out: q.artifacts?.at(-1)?.title || "" })));
  const mine=missions.flatMap(m=>m.quests.filter(q=>q.done&&q.claimedBy===live.user?.id).map(q=>({m,q})));
  S.badges=[...(mine.length?["spark"]:[]),...(mine.length>=3?["sync"]:[]),...(mine.some(({q})=>q.size==="L")?["slayer"]:[]),...(mine.some(({m,q})=>m.stages.some(st=>st.id===q.stageId&&st.status==="approved"))?["gate"]:[]),...(missions.some(m=>m.ownerId===live.user?.id)?["founder"]:[]),...(missions.some(m=>m.strategies.some(p=>p.joined))?["squad"]:[]),...(missions.some(m=>m.strategies.some(p=>p.creatorId===live.user?.id))?["trail"]:[])];
  syncThreadSummaries(snapshot.threads || []);
  if (!missions.some(m => m.id === oldMission)) S.missionId = missions[0]?.id;
  const previouslySetUp = S.preferences.onboarded || S.roles.length > 0 || !!S.preferences.botShape;
  if (!previouslySetUp && !ui.onboard) ui.onboard={step:0,agentName:S.agentName,botShape:S.botShape,roles:[...S.roles],picks:[],topic:"All"};
  if (previouslySetUp) {ui.onboard=null;if(S.screen === "onboard") S.screen="lobby";}
  else S.screen="onboard";
  connectRooms();
}

let refreshPending = false, pendingGameRender = false;
const editingGameView = () => ui.editor || ui.questDraft || ui.creation || ui.context || ui.preview || ui.sheet || ui.run || ui.runHistory || document.activeElement?.closest("form");
async function refreshGame() {
  if (!S.live || !live.user || ui.busy || refreshPending || document.visibilityState === "hidden") return;
  const account = live.user, generation = accountGeneration;
  refreshPending = true;
  try {
    const snapshot = await api("/game");
    if (!S.live || live.user !== account || accountGeneration !== generation || ui.busy) return;
    if (snapshot.revision <= (live.snapshot?.revision || 0)) {
      if(live.snapshot){const incoming=new Map((snapshot.threads||[]).map(t=>[t.id,t]));live.snapshot.threads=(live.snapshot.threads||[]).filter(t=>incoming.has(t.id)).map(t=>({...t,...incoming.get(t.id),_liveSequence:t._liveSequence}));for(const t of snapshot.threads||[])if(!live.snapshot.threads.some(x=>x.id===t.id))live.snapshot.threads.push(t);syncThreadSummaries(live.snapshot.threads);}
      if(S.screen==="comms"&&!editingGameView())render();
      if (pendingGameRender && !editingGameView()) { pendingGameRender = false; render(); }
      return;
    }
    live.snapshot = snapshot;
    applySnapshot(snapshot);
    pendingGameRender = !!editingGameView();
    if (!pendingGameRender) render();
  } catch { /* The next refresh or explicit action retries after a transient outage. */ }
  finally { refreshPending = false; }
}
setInterval(refreshGame, 5000);
window.addEventListener("focus", refreshGame);
document.addEventListener("focusout", () => setTimeout(() => {
  if (S.live && pendingGameRender && !ui.busy && !editingGameView()) { pendingGameRender = false; render(); }
}, 0));

async function act(action, id, payload = {}, success = "Saved", requestId) {
  if (ui.busy) return;
  ui.busy = true; ui.error = ""; ui.lastActionUncertain = false;
  try { const result = await gameAction(action, id, payload, requestId); applySnapshot(result.snapshot || live.snapshot); ui.message = success; return result; }
  catch (error) { ui.error = error.message; ui.lastActionUncertain = !error.status || error.status >= 500 || error.status === 408; return null; }
  finally { ui.busy = false; render(); }
}
const nav = (screen, extra = {}) => { ui.error = ""; ui.message = ""; go(screen, extra); };
export function prepareLiveNavigation() {
  if (!S.live) return true;
  // An in-flight publish uses a stable request ID and must finish before leaving its view.
  if (ui.busy) return false;
  navigationGeneration++;
  if (ui.creation) ui.savedCreation = ui.creation;
  ui.creation = null;
  ui.context = null;
  ui.run = null;
  ui.runData = null;
  ui.runHistory = null;
  ui.editor = null;
  ui.questDraft = null;
  ui.questSubmitAttempt = null;
  ui.preview = null;
  ui.sheet = null;
  ui.error = "";
  return true;
}
const tabs = (choices, selected, action) => `<div class="${action === "quest-tab" ? "roomtabs" : "tabs live-segment-tabs"}" role="tablist"${action === "quest-tab" ? "" : ` style="grid-template-columns:repeat(${choices.length},minmax(0,1fr))"`}>${choices.map(([id, title]) => `<button role="tab" data-live="${action}" data-id="${id}" aria-selected="${selected === id}">${title}</button>`).join("")}</div>`;
const stageProgress = (m, s = m.stages[m.current]) => { const qs=m.quests.filter(q => q.stageId === s?.id); return `${qs.filter(q => q.done).length}/${qs.length} tasks approved`; };
function onboardView() {
  const o=ui.onboard||{step:0,agentName:S.agentName,botShape:"blob",roles:[],picks:[],topic:"All"};
  return `${onboardingView(o,S.name,missions)}${message()}`;
}

async function finishOnboarding() {
  if (ui.busy || !ui.onboard) return;
  const o=ui.onboard;
  ui.busy=true; ui.error=""; ui.message="";
  try {
    for (const mid of o.picks) {
      const result=await gameAction("mission.join",mid);
      applySnapshot(result.snapshot || live.snapshot);
    }
    const result=await gameAction("profile.update",null,{agentName:o.agentName.trim() || "Pip",roles:o.roles,preferences:{...S.preferences,onboarded:true,botShape:o.botShape}});
    applySnapshot(result.snapshot || live.snapshot);
    S.screen="lobby"; S.lobbyTab="mine";
  } catch (error) { ui.error=error.message; }
  finally { ui.busy=false; render(); }
}

function lobby() {
  const mine = missions.filter(m => m.joined), others = missions.filter(m => !m.joined && (S.filter === "All" || m.tag === S.filter));
  const tab = S.lobbyTab || (mine.length ? "mine" : "explore");
  const mineCard = m => { const s=currentStage(m), p=progress(m,s), latest=mostRecent(m), unread=(live.snapshot?.notifications||[]).filter(n=>!n.read&&n.entityId&&(n.entityId===m.id||m.quests.some(q=>q.id===n.entityId)||m.stages.some(st=>st.id===n.entityId)||m.strategies.some(pl=>pl.id===n.entityId))).length; return `<div class="card mine"><button class="band" style="background:${esc(m.color)}" data-live="mission" data-id="${m.id}">${glyph(m)}<h3>${esc(m.title)}</h3>${unread?`<span class="unread" aria-label="${unread} unread updates">${unread}</span>`:""}</button><div class="body"><div class="row small"><b>Stage ${m.current+1} of ${m.stages.length} · ${esc(s?.goal||"")}</b><span class="spacer"></span><b>${p.done}/${p.total}</b></div>${meter(p.done,Math.max(p.total,p.need))}${latest?`<div class="small muted">Latest: ${esc(latest.text)}</div>`:""}${button(`Continue stage ${m.current+1} →`,"open-stage",s?.id,"btn sm blue block")}</div></div>`; };
  const fit=m=>m.quests.filter(q=>q.stageId===currentStage(m)?.id&&q.state==="open"&&(!q.strat||!m.strategies.find(p=>p.id===q.strat)?.status)&&(!q.dependencies||q.dependencies.every(id=>m.quests.find(x=>x.id===id)?.done))&&S.roles.includes(q.role)).length;
  const completed=missions.filter(m=>m.stages.length&&m.stages.every(st=>st.status==="approved"));
  const visions=missions.filter(m=>m.sample?.finished&&!completed.includes(m));
  const exploreCard=m=>`<button class="card poster" data-live="mission" data-id="${m.id}"><div class="band" style="background:${esc(m.color)}">${glyph(m)}<h3>${esc(m.title)}</h3></div><div class="body"><div class="pfacts"><span><b>${fmt(m.bounty||0)}</b>credit goal</span><span><b>${m.players}</b>players</span><span><b>${m.current+1} of ${m.stages.length}</b>stage</span></div><div class="row wrap">${m.tag?`<span class="chip">${esc(m.tag)}</span>`:""}${fit(m)?'<span class="chip fitchip">Good fit for you</span>':""}</div></div></button>`;
  return `<div class="screen"><div class="row"><h2 class="sec-title">Missions</h2><span class="spacer"></span>${button("+ New", "forge")}</div>${ui.savedCreation?`<div class="card milestone"><b>Continue your ${esc(({mission:"mission",plan:"plan",quest:"task"})[ui.savedCreation.kind]||"proposal")}</b><p class="small muted">Your draft is saved while you browse.</p>${button("Resume draft","creation-resume")}</div>`:""}${tabs([["mine", `Mine · ${mine.length}`], ["explore", "Explore"]], tab, "lobby-tab")}${tab === "mine" ? `<div class="list mine-list">${mine.map(mineCard).join("") || '<p class="muted small">Join a mission to keep it here.</p>'}</div>${completed.filter(m=>m.quests.some(q=>q.done&&q.claimedBy===live.user?.id)).length?`<h2 class="sec-title">You helped finish</h2><div class="list">${completed.filter(m=>m.quests.some(q=>q.done&&q.claimedBy===live.user?.id)).map(m=>row(glyph(m),m.title,"All stages approved","recap",m.id,"✓")).join("")}</div>`:""}${button(`Find more missions →`,"lobby-tab","explore","card explore-nudge")}` : `<div class="chips">${["All",...new Set(missions.map(m=>m.tag).filter(Boolean))].map(t => `<button class="chip" data-live="filter" data-id="${esc(t)}" aria-pressed="${S.filter === t}">${esc(t)}</button>`).join("")}</div><div class="list poster-list">${others.sort((a,b)=>fit(b)-fit(a)).map(exploreCard).join("") || '<p class="small muted">No missions in this topic yet.</p>'}</div>${completed.length?`<h2 class="sec-title">Finished missions</h2><div class="list">${completed.map(m=>row(glyph(m),m.title,"All stages approved","recap",m.id,"✓")).join("")}</div>`:""}${visions.length?`<h2 class="sec-title">Mission stories</h2><div class="list">${visions.map(m=>row(glyph(m),m.title,m.sample.finished.Outcome||m.pitch,"recap",m.id)).join("")}</div>`:""}`}${message()}</div>`;
}

function liveMapView(m) {
  return `<div class="gmap" id="map"><svg class="trail" id="trail"></svg>${m.stages.map((st,i)=>{
    const state=st.status==="approved"?"done":i===m.current?"now":"locked", prev=i?`c-${i-1}`:"";
    const checkpoint=from=>`<div class="crow"><button class="cp ${state} ${i===m.stages.length-1?"finish":""}" id="c-${i}" data-from="${from}" data-live="stage" data-id="${st.id}">${state==="now"?`<span class="flag">STAGE ${i+1} GOAL</span>`:""}<span class="cdisc"><span>${state==="done"?"✓":i===m.stages.length-1?"★":i+1}</span></span><span class="lbl">${esc(st.name)}</span></button></div>`;
    if(i!==m.current)return checkpoint(prev);
    const plans=m.strategies.filter(p=>p.stageId===st.id&&p.status!=="merged").sort((a,b)=>b.score-a.score), mine=plans.find(p=>p.joined), goal=Math.max(1,st.gateTarget||1);
    if(!plans.length)return `${checkpoint(prev)}<p class="small muted" style="text-align:center">No plans yet for this stage.</p>`;
    const cap=`<div class="trow-cap"><b>Stage ${i+1} · ${esc(st.name)}:</b> ${plans.length} ${plans.length===1?"plan":"plans"} working toward the goal.${mine?` You're in <b>${esc(mine.squad)}</b>.`:""}</div>`;
    const tracks=`<div class="trow">${plans.map((p,j)=>{const pct=Math.min(100,Math.round(p.score/goal*100));return `<button class="tnode ${p.status?"raising":"now"}" id="t-${i}-${j}" data-from="${prev}" data-live="plan" data-id="${p.id}" data-pct="${pct}" data-score="${p.score}/${goal}" data-mine="${p.joined?1:""}" style="--track:${esc(p.color)}">${p.joined?'<span class="flag you">YOUR SQUAD</span>':""}<span class="tdisc">${esc(p.squad.split(/\s+/).map(w=>w[0]).join("").slice(0,2))}</span><span class="tl"><b>${esc(p.squad)}</b><i>${esc(p.name)}${p.status?` · ${esc(p.status)}`:""}</i></span></button>`}).join("")}</div>`;
    return `${cap}${tracks}${checkpoint(plans.map((_,j)=>`t-${i}-${j}`).join(" "))}`;
  }).join("")}</div>`;
}

const missionLedger = m => (live.snapshot?.wallet?.ledger || []).filter(entry => entry.mission_id === m.id);
const creditAmount = value => fmt(Number(value) || 0);
function missionMoneyView(m) {
  const wallet=live.snapshot?.wallet || {}, ledger=missionLedger(m), reserved=Number(m.funding?.reserved)||0, spent=Number(m.funding?.spent)||0;
  const mine=ledger.filter(entry=>entry.kind==="reserve").reduce((sum,entry)=>sum-Math.min(0,Number(entry.amount)||0),0);
  const pledges=m.pledges||[], kinds=[...new Set(pledges.map(entry=>entry.kind))];
  const sources=[{label:"Mission reservations",amount:reserved}];
  const target=Number(m.bounty)||0, committed=reserved+spent;
  return `<div class="card milestone mission-money-overview"><div class="row"><div class="eyebrow">Money for this mission</div><span class="spacer"></span></div><div class="mgoal">${creditAmount(committed)}${target?` of ${creditAmount(target)}`:""}</div>${target?meter(Math.min(committed,target),target,"var(--gold)"):""}<p class="small muted">${creditAmount(reserved)} available funding · ${creditAmount(spent)} spent on approved work</p>${m.joined&&wallet.enabled?button("Reserve credits","fund",m.id,"btn gold block"):""}</div><div class="card milestone mission-funding"><div class="eyebrow">How the work is backed</div>${sources.filter(source=>source.amount>0).length?sources.filter(source=>source.amount>0).map(source=>`<div class="statline"><span>${esc(source.label)}</span>${meter(source.amount,Math.max(reserved,target,source.amount),"var(--gold)")}<b>${creditAmount(source.amount)}</b></div>`).join(""):'<p class="small muted">No credit backing recorded yet.</p>'}<div class="row wrap">${button("How it works","mission-prize",m.id)}${button("Can I trust it?","mission-trust",m.id)}</div></div><div class="card milestone mission-personal-money"><div class="eyebrow">Your stake here</div><div class="kvrow"><span>Reserved by you</span><b>${creditAmount(mine)}</b></div><div class="kvrow"><span>Available credits</span><b>${creditAmount(wallet.available)}</b></div>${kinds.length?`<div class="eyebrow">Other contributions</div>${kinds.map(kind=>`<div class="kvrow"><span>${esc(kind)}</span><b>${fmt(pledges.filter(entry=>entry.kind===kind).reduce((sum,entry)=>sum+(Number(entry.amount)||0),0))}</b></div>`).join("")}`:""}${m.joined?button("Add time or compute","pledge",m.id):""}</div><div class="card milestone mission-ledger-preview"><div class="row"><div class="eyebrow">Your credit history</div><span class="spacer"></span>${button("See all","mission-ledger",m.id,"info small")}</div>${ledger.slice(0,3).map(entry=>`<div class="kvrow"><span>${esc(entry.kind.replaceAll("_"," "))}</span><b>${Number(entry.amount)>0?"+":""}${creditAmount(entry.amount)}</b></div>`).join("")||'<p class="small muted">No credit activity for you on this mission yet.</p>'}</div>`;
}
function missionDetailSheet(m, kind) {
  const ledger=missionLedger(m), target=Number(m.bounty)||0, reserved=Number(m.funding?.reserved)||0, spent=Number(m.funding?.spent)||0, committed=reserved+spent;
  const close=button("×","sheet-close","","btn sm"), heading={prize:"How the mission goal works",trust:"Can I trust it?",ledger:"Credit history"}[kind];
  let body="";
  if(kind==="prize") body=`<p class="claim">${creditAmount(committed)} credits committed${target?` toward a ${creditAmount(target)} credit goal`:""}.</p><div class="mission-sheet-facts"><div class="kvrow"><span>Spent on approved work</span><b>${creditAmount(spent)}</b></div><div class="kvrow"><span>Available funding</span><b>${creditAmount(reserved)}</b></div></div><div class="eyebrow">What counts</div><p class="small">Approved work uses reserved credits. The mission goal is the target.</p>${m.rules?.length?`<div class="eyebrow">Mission win rules</div><ol class="wins">${m.rules.map(rule=>`<li>${esc(rule)}</li>`).join("")}</ol>`:""}`;
  if(kind==="trust") body=`<div class="dgroup"><div class="drow"><span>★</span><span><b>Mission owner</b><small>${esc(m.creator||"Mission team")}</small></span></div><div class="drow"><span>◎</span><span><b>Members</b><small>${m.players||0} joined</small></span></div><div class="drow"><span>✓</span><span><b>Review</b><small>Two different mission members review each submitted artifact.</small></span></div></div><div class="eyebrow">Recorded backing</div><p class="small">${creditAmount(reserved)} credits reserved; ${creditAmount(spent)} spent on approved work. </p>${m.ownerId===live.user?.id?button("Manage mission","mission-edit",m.id):""}`;
  if(kind==="ledger") body=`<p class="small muted">Your recorded credit activity for ${esc(m.title)}.</p><div class="dgroup">${ledger.length?ledger.map(entry=>`<div class="drow"><span class="coin"></span><span><b>${esc(entry.kind.replaceAll("_"," "))}</b>${entry.created_at||entry.createdAt?`<small>${esc(entry.created_at||entry.createdAt)}</small>`:""}</span><b>${Number(entry.amount)>0?"+":""}${creditAmount(entry.amount)}</b></div>`).join(""):'<p class="small muted">No credit activity here yet.</p>'}</div><div class="row wrap">${button("Export JSON","export")}${button("Export CSV","export-csv")}${m.joined?button("Flag spending concern","flag",m.id):""}</div>`;
  return `${missionView()}<div class="live-sheet-backdrop"><div class="live-sheet card mission-detail-sheet" role="dialog" aria-modal="true" aria-label="${esc(heading)}"><div class="grab"></div><div class="row"><h2 class="sec-title">${esc(heading)}</h2><span class="spacer"></span>${close}</div>${body}${message()}</div></div>`;
}
function stageGoalSheet(m, st) {
  const ps=progress(m,st), tasks=stageTasks(m,st), approved=st.status==="approved";
  const target=Number(st.target)||0;
  return `${stageView()}<div class="live-sheet-backdrop"><div class="live-sheet card stage-detail-sheet" role="dialog" aria-modal="true" aria-label="Stage goal"><div class="grab"></div><div class="row"><h2 class="sec-title">Stage ${st.ordinal+1} · ${esc(st.name)}</h2><span class="spacer"></span>${button("×","sheet-close","","btn sm")}</div><p class="claim">${esc(st.plainWords||st.goal)}</p><div class="stage-sheet-progress"><div class="eyebrow">The goal</div><b>${esc(st.goal)}</b>${meter(ps.done,Math.max(ps.total,ps.need))}<span class="small">${ps.done} of ${ps.total} tasks approved · ${ps.need} required</span></div><div class="eyebrow">What counts here</div><div class="stage-criteria">${tasks.length?tasks.map(task=>`<button class="stage-criterion" data-live="quest" data-id="${esc(task.id)}"><span class="criterion-mark ${task.done?"approved":"pending"}">${task.done?"✓":"○"}</span><span><b>${esc(task.title)}</b><small>${esc(statusText(task))}</small></span><span class="criterion-arrow">›</span></button>`).join(""):'<p class="small muted">No tasks have been recorded for this stage.</p>'}</div>${st.doneWhen?`<div class="eyebrow">Outcome criteria</div><p class="small">${esc(st.doneWhen)}</p>`:""}${target?`<div class="eyebrow">Outcome target</div><p class="small">${target} ${esc(st.unit||"results")} planned.</p>`:""}${catalogDisclosure("How this stage works",catalogList("Tracks",st.catalogTracks||st.tracks)+catalogText("Why this stage matters",st.why)+catalogText("How it fits together",st.howItFits)+catalogText("Planned sign-off",st.approves)+catalogRoles(st.roles))}<div class="eyebrow">How it is checked</div><p class="small">Two different mission members review each submitted artifact.</p><div class="eyebrow">Who closes the stage</div><p class="small">The mission owner closes the stage after every task passes review and the required task count is met.${approved?" Stage approved.":""}</p></div></div>`;
}

function missionView() {
  const m = current(); if (!m) return lobby();
  const t = S.tab || "map", s = currentStage(m);
  let body = "";
  const plans=m.strategies.filter(p=>p.stageId===s?.id&&p.status!=="merged").sort((a,b)=>b.score-a.score);
  const p=progress(m,s);
  if(t==="map") body=liveMapView(m);
  if(t==="squads") body=`<div class="card milestone"><div class="eyebrow">Stage ${m.current+1} · ${esc(s?.name||"")}</div><div class="mgoal">${esc(s?.goal||"")}</div>${meter(p.done,Math.max(p.total,p.need))}<b class="small">${p.done}/${p.total} tasks approved</b></div><div class="row"><div class="eyebrow">Plans for this stage</div><span class="spacer"></span>${m.joined?button("+ Plan","plan-new",s?.id):""}</div><div class="list">${plans.map((pl,i)=>`<button class="card squad" data-live="plan" data-id="${pl.id}"><span class="rank">${i+1}</span><span><b>${esc(pl.name)}</b><small>${esc(pl.squad)} · ${pl.memberCount||0} members · ${pl.backers} backers${pl.status?` · ${esc(pl.status)}`:""}</small>${meter(pl.score,Math.max(p.need,1),pl.color)}</span><b>+${pl.score}</b></button>`).join("")||'<p class="small muted">No plan yet. Start one for this stage.</p>'}</div>`;
  if(t==="fuel") body=missionMoneyView(m);
  if(t==="rules") body=`<article class="card doc"><h1 class="doc-title">${esc(m.title)}</h1>${catalogText("The problem",m.sample?.detail?.problem || MISSION_WHY[m.seedKey] || m.pitch)}${catalogText("Who it helps",m.sample?.detail?.whoItHelps)}${catalogText("Why it is still unsolved",m.sample?.detail?.whyUnsolved)}<h3>The goal</h3><p>${esc(m.pitch)}</p><h3>We win when</h3><ol class="wins">${m.rules.map(r=>`<li>${esc(r)}</li>`).join("")}</ol><h3>What we'll make</h3><ol class="wins">${m.stages.map(st=>`<li>${esc(st.goal)}</li>`).join("")}</ol>${m.team?`<h3>Team needed</h3><p>${esc(m.team)}</p>`:""}<div class="row wrap">${(m.roles||[]).map(r=>`<span class="chip">${esc(ROLES[r]?.name||r)}</span>`).join("")}</div></article><div class="card milestone"><div class="eyebrow">Who needs this</div><p class="small">${m.voices||0} voices</p>${m.needs.map(n=>row("♥",n.title,`${n.supporters} supporters · ${n.detail}`,"need-support",n.id,n.supported?"✓":"+1")).join("")||'<p class="small muted">No needs recorded yet.</p>'}<div class="row wrap">${!m.voiced?button("Add your voice","voice",m.id):'<span class="chip">✓ Your voice is counted</span>'}${m.joined?button("Describe a need","need",m.id):""}</div></div><div class="card milestone"><div class="eyebrow">Plan merge proposals</div>${m.merges?.map(x=>`<div class="drow"><span>${esc(m.strategies.find(p=>p.id===x.sourcePlanId)?.name||"Plan")} → ${esc(m.strategies.find(p=>p.id===x.targetPlanId)?.name||"Plan")}</span>${m.ownerId===live.user?.id?`${button("Approve","merge-approve",x.id)}${button("Dismiss","merge-dismiss",x.id)}`:""}</div>`).join("")||'<p class="small muted">No merge suggestions yet.</p>'}</div><div class="row wrap">${button("Story & outputs","recap",m.id)}${m.joined?button("Mission chat","room",`mission:${m.id}`):""}${m.joined?button("Invite member","invite",m.id):""}${m.ownerId===live.user?.id?button("Edit mission","mission-edit",m.id):""}${m.ownerId===live.user?.id?button("Add stage","stage-new",m.id):""}${m.joined?button("Flag spending concern","flag",m.id):""}</div>`;
  return `<div class="screen"><div class="card mhead"><div class="band" style="background:${esc(m.color)}">${backBtn("back","lobby")}<span class="mtitle"><span class="kind kind-mission">Mission</span><h1>${esc(m.title)}</h1><span class="msquad">${m.players} people · ${plans.length} plans in this stage${m.joined?" · Joined":""}</span></span>${glyph(m)}</div><div class="in"><div class="kv"><div class="stat"><b>${fmt(m.bounty||0)}</b><span>credit goal</span></div><div class="stat"><b>${m.current+1} of ${m.stages.length}</b><span>stage</span></div><div class="stat"><b>${plans.length}</b><span>plans</span></div></div>${m.joined?"":`<div class="row wrap">${button("Join mission","join",m.id,"btn red")}</div>`}</div></div>${tabs([["map","Map"],["squads","Plans"],["fuel","Money"],["rules","About"]],t,"mission-tab")}${body}${m.joined?`<div class="sticky-cta">${button(`Open stage ${m.current+1} →`,"open-stage",s?.id,"btn blue block")}</div>`:""}${message()}</div>`;
}

function stageView() {
  const m = current(), s = stage(m); if (!m || !s) return lobby();
  const qs = m.quests.filter(q => q.stageId === s.id);
  const allDone = qs.every(q => q.done);
  const p=progress(m,s), plans=m.strategies.filter(x=>x.stageId===s.id&&x.status!=="merged").sort((a,b)=>b.score-a.score), mine=plans.find(x=>x.joined), standalone=qs.filter(q=>!q.strat);
  return `<div class="chat"><div class="chat-head">${backBtn("back","mission")}${glyph(m)}<div><div class="where"><span class="kind kind-stage">Stage</span>${esc(m.title)}</div><div class="display chan-name">Stage ${s.ordinal+1} of ${m.stages.length} · ${esc(s.name)}</div></div></div><div class="stage-list"><button class="card milestone stage-goal" data-live="stage-policy" data-id="${s.id}"><div class="eyebrow">Stage ${s.ordinal+1} goal</div><div class="mgoal">${esc(s.goal)}</div>${meter(p.done,Math.max(p.total,p.need))}<div class="row small"><b>${p.done}/${p.total} tasks approved</b><span class="spacer"></span><span>${plans.length} plans</span></div><span class="info small">What does this mean? →</span></button><div class="row"><div class="eyebrow">Pick a plan to play</div><span class="spacer"></span>${m.joined&&s.status==="active"?button("+ Suggest one","plan-new",s.id):""}</div><div class="list">${plans.map(pl=>`<button class="card strat" data-live="plan" data-id="${pl.id}"><span class="sbadge" style="background:${esc(pl.color)}">${esc(pl.squad.slice(0,2))}</span><span><b class="sname">${esc(pl.name)}</b><span class="small muted">${esc(pl.squad)}${pl.joined?" · your squad":""} · ${pl.backers} backers</span><span class="sbet">${esc(pl.bet)}</span><span class="small muted">${pl.score} approved · ${qs.filter(q=>q.strat===pl.id&&q.state==="open").length} open tasks</span></span></button>`).join("")||'<p class="small muted">No plans for this stage yet.</p>'}</div>${mine?`<p class="small muted">Your squad: ${esc(mine.squad)}</p>`:""}${standalone.length?`<div class="eyebrow">Tasks outside a plan</div><div class="list">${standalone.map(q=>taskLink(m,q)).join("")}</div>`:""}<div class="row wrap">${m.joined&&s.status==="active"?button("+ Task","quest-new",s.id):""}${m.joined?button("Stage chat","room",`stage:${s.id}`):""}${m.joined&&s.status==="active"?button("Ask agent for a plan","agent-plan",s.id):""}${m.joined?button("Agent work history","run-history",m.id):""}</div>${m.ownerId===live.user?.id&&allDone&&qs.length>=p.need&&s.status==="active"?button("Approve completed stage","stage-approve",s.id,"btn red block"):""}${m.ownerId===live.user?.id&&s.status==="approved"&&m.current<m.stages.length-1?button("Advance to next stage","stage-advance",m.id,"btn red block"):""}</div>${contextComposer(`stage:${s.id}`)}${message()}</div>`;
}

function planView() {
  const m = current(), p = plan(m), s = stage(m); if (!p) return stageView();
  const qs = m.quests.filter(q => q.strat === p.id);
  const done=qs.filter(q=>q.done), open=qs.filter(q=>q.state==="open"), waiting=qs.filter(q=>!q.done&&q.state!=="open"), blocked=open.filter(q=>(q.dependencies||[]).some(id=>!m.quests.find(x=>x.id===id)?.done)), canHelp=open.filter(q=>!blocked.includes(q)&&S.roles.includes(q.role));
  return `<div class="chat"><div class="chat-head">${backBtn("back","stage")}<span class="sbadge" style="background:${esc(p.color)}">${esc(p.squad.slice(0,2))}</span><div><div class="where"><span class="kind kind-strategy">Plan</span>${esc(m.title)} › Stage ${s.ordinal+1}</div><div class="room-title">${esc(p.name)}</div><div class="small muted">${esc(p.squad)}'s plan</div></div></div><div class="stage-list"><p class="claim">${esc(p.bet)}</p>${catalogDisclosure("How this plan works",catalogList("Steps",p.howItWorks,true)+catalogText("People needed",p.rolesNeeded)+catalogText("Other plans",p.relations))}<div class="card squadcard"><div class="eyebrow">Squad</div><b>${esc(p.squad)}</b><p class="small muted">Led by ${esc(p.lead)} · ${p.memberCount||0} members · ${p.backers} backers</p><div class="row wrap">${p.joined?'<span class="chip">✓ Your squad</span>':m.joined?button(`Join ${p.squad}`,"plan-join",p.id,"btn sm red"):""}${m.joined?button(p.backed?"✓ Backed":"Back this plan","plan-back",p.id):""}</div></div><div class="card milestone"><div class="row"><div class="eyebrow">How it's going</div><span class="spacer"></span><span class="chip">${esc(p.status||"Active")}</span></div><div class="kvrow"><span>Goal</span><b>${esc(s.goal)}</b></div>${meter(done.length,Math.max(qs.length,s.gateTarget||1),p.color)}<div class="kvrow"><span>Tasks</span><b>${done.length} approved · ${open.length} open · ${waiting.length} in progress</b></div>${p.status==="proposed"&&m.ownerId===live.user?.id?button("Approve plan","plan-approve",p.id,"btn red"):""}${blocked.length?`<div class="eyebrow">What's stopping it</div>${blocked.map(q=>taskLink(m,q,`Waiting for ${(q.dependencies||[]).map(id=>m.quests.find(x=>x.id===id)?.title).filter(Boolean).join(", ")}`)).join("")}`:""}</div>${canHelp.length?`<div class="eyebrow">How you can help</div><div class="list">${canHelp.map(q=>taskLink(m,q,`${q.size} · ${statusText(q)}`)).join("")}</div>`:""}<div class="row"><div class="eyebrow">${canHelp.length?"More open tasks":"Open tasks"}</div><span class="spacer"></span>${m.joined?button("+ Task","quest-new",s.id):""}</div><div class="list">${open.filter(q=>!canHelp.includes(q)).map(q=>taskLink(m,q)).join("")||'<p class="small muted">No other open tasks.</p>'}</div>${waiting.length?`<div class="eyebrow">In progress</div><div class="list">${waiting.map(q=>taskLink(m,q)).join("")}</div>`:""}${done.length?`<div class="eyebrow">Approved</div><div class="list">${done.map(q=>taskLink(m,q)).join("")}</div>`:""}<div class="row wrap">${m.joined?button("Ask agent for tasks","agent-quest",p.id):""}${p.creatorId===live.user?.id?button("Edit plan","plan-edit",p.id):""}${m.joined?button("Plan chat","room",`plan:${p.id}`):""}${m.strategies.filter(x=>x.stageId===s.id&&x.id!==p.id).length?button("Suggest merging plans","merge",p.id):""}</div></div>${contextComposer(`plan:${p.id}`)}${message()}</div>`;
}

function questHistoryContent(q) {
  const notes=(q.log||[]).filter(Boolean).map(item=>`<div class="drow"><span>✎</span><b>${esc(typeof item==="string"?item:item.text||item.note||item.action||"Task updated")}</b></div>`).join("");
  const decision=q.decision?.choice?`<div class="drow"><span>✓</span><span><b>Decision</b><small>${esc(q.decision.choice)}</small></span></div>`:"";
  const versions=(q.artifacts||[]).map(a=>`<div class="drow"><span>▤</span><span><b>${esc(a.title)}</b><small>Submitted version ${esc(a.version)}</small></span>${button("Preview","artifact",a.id)}</div>`).join("");
  const reviews=(q.reviews||[]).map(r=>`<div class="drow"><span>${r.verdict==="approve"?"✓":"↺"}</span><span><b>${esc(r.verdict==="approve"?"Approved":"Changes requested")}</b><small>${esc(r.note||"")}</small></span></div>`).join("");
  return notes+decision+versions+reviews||'<p class="small muted">No recorded changes yet.</p>';
}
function focusQuestDraft() {
  const editor=document.querySelector("#quest-inline-submit");
  if(!editor)return;
  editor.querySelector('[name="title"]')?.focus({preventScroll:true});
  editor.scrollIntoView({block:"start",inline:"nearest",behavior:"instant"});
}
function questView() {
  const m=current(), q=quest(m); if(!q)return stageView();
  const people=live.snapshot.people||[], claimant=people.find(p=>p.id===q.claimedBy), room=roomFor("quest",q.id);
  const speakers=[...new Set((room?roomState(room.id).messages:[]).map(x=>x.senderId).filter(Boolean))];
  const participants=[...new Set([q.claimedBy,...speakers].filter(Boolean))].map(id=>people.find(p=>p.id===id)).filter(Boolean);
  const crew=participants.length?`<button class="task-crew" data-live="quest-crew" data-id="${esc(q.id)}" aria-label="See ${participants.length} task participants"><span class="stack">${participants.slice(0,3).map(p=>`<span class="av">${face("var(--pink)",p.name.length)}</span>`).join("")}</span><span class="small">${participants.length}</span></button>`:"";
  const artifact=q.artifacts?.at(-1), mine=q.claimedBy===live.user?.id;
  const canReview=m.joined&&!mine&&q.state==="submitted"&&!q.reviews?.some(r=>r.reviewer_id===live.user?.id&&(r.artifact_id||r.artifactId)===artifact?.id);
  const waits=(q.dependencies||[]).map(id=>m.quests.find(x=>x.id===id)).filter(x=>x&&!x.done);
  const parts=m.quests.filter(x=>x.parent===q.id&&!x.done), qPlan=m.strategies.find(x=>x.id===q.strat);
  const qStage=m.stages.find(x=>x.id===q.stageId), claimable=q.state==="open"&&!waits.length&&!parts.length&&(!qPlan||!qPlan.status)&&qStage?.status==="active";
  const tab=S.roomTab||"chat";
  const review=q.reviews?.length?`<div class="card milestone"><div class="eyebrow">Review history</div>${q.reviews.map(r=>`<p class="small">${esc((live.snapshot.people||[]).find(x=>x.id===r.reviewer_id)?.name||"Reviewer")}: ${esc(r.verdict)} · ${esc(r.note||"")}</p>`).join("")}</div>`:"";
  const artifacts=q.artifacts?.length?`<div class="card milestone"><div class="eyebrow">Saved artifacts</div>${q.artifacts.map(v=>`<div class="drow"><span><b>${esc(v.title)}</b><span class="small muted" style="display:block">Version ${v.version}</span></span><span class="row">${button("Preview","artifact",v.id)}${button("Download","artifact-download",v.id)}</span></div>`).join("")}</div>`:"";
  const decision=q.call?.q?`<div class="card task-decision"><div class="eyebrow">Decision needed</div><b>${esc(q.call.q)}</b>${mine&&["claimed","changes_requested"].includes(q.state)&&!q.decision?`<div class="quick wrap">${(q.call.opts||[]).map(o=>button(o,"quest-decision",q.id,"chip")).join("")}</div>`:q.decision?`<p class="small">You chose: ${esc(q.decision.choice)}</p>`:""}</div>`:"";
  const taskRunPending=startingQuestRun||(ui.runData?.run?.kind==="quest-execute"&&ui.runData.run.questId===q.id&&!['completed','failed','cancelled','uncertain'].includes(ui.runData.run.status));
  const agentAction=taskRunPending?'<span class="chip">Agent working</span>':button("Work with agent","agent-execute",q.id);
  const actions=!m.joined?button("Join mission","join",m.id,"btn red"):q.done?'<span class="chip">✓ Approved by two members</span>':q.state==="open"?claimable?button("Start task","quest-claim",q.id,"btn blue"):`<span class="chip">${esc(waits.length?`Waiting for ${waits.map(x=>x.title).join(", ")}`:parts.length?`${parts.length} parts still open`:qPlan?.status?"Plan awaits approval":"Stage is closed")}</span>`:mine&&q.state==="claimed"?`${button("Submit work","quest-inline-edit",q.id,"btn red")}${agentAction}`:mine&&q.state==="changes_requested"?`${button("Revise and resubmit","quest-inline-edit",q.id,"btn red")}${taskRunPending?'<span class="chip">Agent working</span>':button("Ask agent to revise","agent-execute",q.id)}`:canReview?button("Review this work","quest-review",q.id,"btn red"):`<span class="chip">${esc(q.state==="submitted"?"Waiting for two independent reviews":q.state)}</span>`;
  const pairing=q.claimedBy&&!mine?button("Ask to pair","pair",q.id):"";
  const secondary=`${mine&&q.state==="claimed"?button("Release","quest-release",q.id):""}${m.ownerId===live.user?.id&&q.state==="open"?button("Edit task","quest-edit",q.id):""}${q.state==="open"?button(q.watched?"✓ Watching":"Watch task","quest-watch",q.id):""}${q.claimedBy&&!mine?button("Nudge for update","nudge",q.id):""}`;
  const actionRow=`<div class="row wrap task-actions">${actions}${pairing}</div>`;
  const briefActionRow=`<div class="row wrap task-actions">${actions}${pairing}${secondary}</div>`;
  const activeRun=ui.runData?.run?.kind==="quest-execute"&&ui.runData.run.questId===q.id&&ui.run;
  const log=(q.log||[]).filter(Boolean).map(item=>`<div class="task-history-item">${esc(typeof item==="string"?item:item.text||item.note||item.action||"")}</div>`).join("");
  const history=log?`<div class="card task-history"><div class="eyebrow">Task history</div>${log}</div>`:"";
  const inlineEdit=ui.questDraft===q.id?`<form class="card task-inline-editor" id="quest-inline-submit"><div class="eyebrow">Hand in your work</div>${field("title","Artifact title",ui.draft?.title??artifact?.title??`${q.title} · result`,"text",`required maxlength=160 ${ui.questSubmitAttempt?.uncertain?"disabled":""}`)}${field("content","Work and evidence",ui.draft?.content??"","textarea",`required maxlength=262144 ${ui.questSubmitAttempt?.uncertain?"disabled":""}`)}<label class="field" for="artifact-file"><span>Import a text file into this artifact</span></label><input class="inp" id="artifact-file" type="file" accept=".txt,.md,.markdown,.csv,.json,.js,.ts,.py,.html,.css,.xml,.yaml,.yml,text/plain,text/markdown,text/csv,application/json" ${ui.questSubmitAttempt?.uncertain?"disabled":""}><p class="small muted" id="artifact-file-status">Text, code, Markdown, CSV, and JSON files up to 256 KB. Review and edit imported content before submitting.</p><div class="row wrap"><button class="btn red" type="submit" ${ui.busy?"disabled":""}>${ui.questSubmitAttempt?.uncertain?"Retry same submission":"Submit for review"}</button>${button("Cancel","quest-inline-cancel")}</div><p class="small muted">${ui.questSubmitAttempt?.uncertain?"The last result is uncertain. Retry this same submission to confirm it.":"Your saved artifact is available for two independent reviews."}</p></form>`:"";
  const chat=`<div class="msgs task-timeline" id="msgs"><div id="room-messages">${roomMessages("quest",q.id)}</div>${activeRun?`<div id="task-run-panel">${taskRunContent()}</div>`:""}${decision}${inlineEdit}${review}${artifacts}${history}</div><div class="room-bar task-room-bar">${actionRow}</div>`;
  const deps=(q.dependencies||[]).map(id=>m.quests.find(x=>x.id===id)?.title).filter(Boolean);
  const brief=`<div class="stage-list task-stream"><article class="card doc"><h1 class="doc-title">${esc(q.title)}</h1><h3>What needs doing</h3><p>${esc(q.brief?.description||q.title)}</p>${catalogText("Why this task matters",q.detail?.brief)}${catalogText("Hand in",q.detail?.handIn)}${catalogText("Target criteria",q.detail?.doneWhen)}${catalogDisclosure("Steps and support",catalogList("Suggested steps",q.detail?.steps,true)+catalogText("Agent can help with",q.detail?.agentDoes)+catalogText("You would do",q.detail?.humanDoes)+catalogText("Tools",q.detail?.tools)+catalogText("Skills",q.detail?.skills)+catalogText("Catalogue review notes",q.detail?.checkedBy)+catalogText("Where",q.where)+catalogText("Good fit if",q.fit)+catalogText("Safety note",q.safetyNote))}${q.out?`<h3>Expected output</h3><p>${esc(q.out)}</p>`:""}<h3>Where it fits</h3><p>${esc(m.title)} · ${esc(qStage?.name||"Stage")}${qPlan?` · ${esc(qPlan.name)}`:""}</p>${q.parent?`<p class="small">Part of ${esc(m.quests.find(x=>x.id===q.parent)?.title||"another task")}</p>`:""}${deps.length?`<h3>Before this starts</h3><ul class="checks">${deps.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}<h3>Requirements</h3><p>${esc(ROLES[q.role]?.name||q.role)} · ${esc(q.size)} · ${q.xp} XP</p>${button("More requirements","task-requirements",q.id)}<h3>How review works</h3><p>${esc(live.snapshot.policy?.reviewerRule||"Two distinct mission members review the submitted artifact.")}</p>${button("Review policy","review-policy",q.id)}${button("Task history","quest-history",q.id)}</article>${decision}${artifacts}${review}${briefActionRow}</div>`;
  return `<div class="chat task-chat"><div class="chat-head">${backBtn("back",q.strat?"strategy":"stage")}<div class="task-head-copy"><div class="room-title">${esc(q.title)}</div><div class="small muted">${esc(m.title)} · <b class="rewardline">${q.coins||0} credits</b></div></div>${crew}</div>${tabs([["chat","Chat"],["brief","Brief"]],tab,"quest-tab")}${tab==="brief"?brief:chat}${tab==="chat"&&m.joined?composer(`quest:${q.id}`):""}${message()}</div>`;
}

function agentSuggestion() {
  const options = missions.flatMap(m => m.joined ? m.quests.filter(q => q.state === "open" && q.stageId === currentStage(m)?.id && currentStage(m)?.status === "active" && (!q.strat || !m.strategies.find(pl => pl.id === q.strat)?.status) && !m.quests.some(child => child.parent === q.id && !child.done) && (q.dependencies || []).every(id => m.quests.find(x => x.id === id)?.done)).map(q => ({m,q})) : []);
  options.sort((a,b) => Number(S.roles.includes(b.q.role)) - Number(S.roles.includes(a.q.role)) || Number(b.q.xp || 0) - Number(a.q.xp || 0));
  const pick = options[0];
  if (!pick) return "";
  const {m,q} = pick;
  return `<div class="agent-recommendation"><div class="eyebrow">Open work for you</div><div class="card qrow">${mono(ROLES[q.role] ? q.role : "user",30)}<span class="suggestion-copy"><b>${esc(q.title)}</b><span class="small muted">${esc(m.title)} · ${esc(ROLES[q.role]?.name || q.role)} · ${q.xp} XP</span></span>${button("Start", "quest", q.id, "btn sm blue")}</div></div>`;
}
function roomMessages(k, scopeId, roomId) {
  const room = roomId ? live.snapshot.threads.find(t => t.id === roomId) : roomFor(k, scopeId); if (!room) return `<p class="small muted">Open this room to start a conversation.</p>`;
  const state = roomState(room.id);
  const messages = state.messages;
  const events = messages.map(m => ({at:m.createdAt||m.created_at||"",order:Number(m.sequence)||0,pending:!!m.pending,html:(()=>{const me=m.role==="user"&&(m.senderId===live.user?.id||m.pending);return `<div class="msg ${me ? "me" : ""}">${me ? "" : botAv()}<div class="bubble"><div class="from">${esc(me ? "You" : m.role === "assistant" ? S.agentName : m.senderName || "Member")}</div><div>${agentText(m.text)}</div>${m.pending ? '<span class="small muted">Sending…</span>' : ""}${m.error ? `<span class="small no">${esc(m.error)}</span>` : ""}</div></div>`;})()}));
  if (k === "agent") {
    for (const activity of [...state.activities].reverse()) {
      const label = activity.handoff?.type === "download" ? "Download" : activity.handoff?.screen === "run" ? "Open work" : activity.handoff?.screen === "security" ? "Manage passkeys" : activity.handoff?.screen === "wallet" ? "Open money" : "Open";
      const handoff = activity.status === "completed" && activity.handoff ? button(label,"agent-handoff",activity.id,"btn sm blue") : "";
      events.push({at:activity.createdAt||"",order:0,html:`<div class="agent-activity card" data-activity-id="${esc(activity.id)}"><span class="agent-activity-mark" aria-hidden="true">${activity.status === "completed" ? "✓" : activity.status === "failed" ? "!" : "…"}</span><span class="agent-activity-copy"><b>${esc(activity.summary || (activity.status === "running" ? "Working on it…" : activity.status === "failed" ? "That didn't work" : "Done"))}</b><small>${esc(activity.status === "completed" ? "Done" : activity.status === "failed" ? "Could not finish" : "In progress")}</small></span>${handoff}</div>`});
    }
    if (state.preview?.text) events.push({at:"~",order:0,html:`<div class="msg">${botAv()}<div class="bubble"><div class="from">${esc(S.agentName)}</div><div>${agentText(state.preview.text)}</div></div></div>`});
  }
  const history = events.sort((a,b)=>Number(!!a.pending)-Number(!!b.pending)||String(a.at).localeCompare(String(b.at))||a.order-b.order).map(e=>e.html).join("");
  if (k === "agent") return history + agentSuggestion() || '<p class="small muted">No messages yet. Start the conversation.</p>';
  return history || '<p class="small muted">No messages yet. Start the conversation.</p>';
}
function composer(scope, placeholder = "Message this room…") { return `<form class="composer" id="live-composer" data-scope="${esc(scope)}"><input name="text" placeholder="${esc(placeholder)}" maxlength="4000" autocomplete="off" required><button class="btn sm red" type="submit">Send</button></form>`; }
function contextComposer(scope) { return `<form class="composer" id="context-composer" data-scope="${esc(scope)}"><input name="text" placeholder="Ask ${esc(S.agentName)} about this ${scope.startsWith("plan:")?"plan":"stage"}…" maxlength="4000" autocomplete="off" required><button class="btn sm red" type="submit">Ask</button></form>`; }
function updateVisibleMessages() {
  const list = document.querySelector(S.screen==="quest"?"#room-messages":"#msgs");
  if (!list) return false;
  const scroller=S.screen==="quest"?list.closest("#msgs"):list;
  const atBottom=scroller&&scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<100;
  if (S.screen === "thread") {
    const room = live.snapshot?.threads.find(t => t.id === S.thread);
    if (!room) return false;
    list.innerHTML = roomMessages(room.kind, room.scopeId, room.id);
  } else if (S.screen === "quest") list.innerHTML = roomMessages("quest", S.questId);
  else return false;
  if(atBottom)scroller.scrollTop=scroller.scrollHeight;
  const room=S.screen==="thread"?live.snapshot?.threads.find(t=>t.id===S.thread):S.screen==="quest"?roomFor("quest",S.questId):null;
  if(room&&document.visibilityState!=="hidden")markRoomRead(room.id).catch(()=>{});
  return true;
}
function chatView() {
  const t = live.snapshot.threads.find(x => x.id === S.thread); if (!t) return chatsView();
  return `<div class="chat ${t.kind==="agent"?"partner-chat":""}"><div class="chat-head">${backBtn("back","comms")}${t.kind==="agent"?botAv("av partner-head-avatar"): `<span class="mono">${esc(kind(t.kind).slice(0,1))}</span>`}<div><div class="display chan-name">${esc(roomTitle(t))}</div><div class="small muted">${t.kind==="agent"?"Your partner · works for you":kind(t.kind)}</div></div></div><div class="msgs" id="msgs">${roomMessages(t.kind,t.scopeId,t.id)}</div>${t.kind==="agent"?`<div class="chips quick private-prompts">${["What's next?","What do you know about me?","Use free tools"].map(x=>button(x,"agent-quick",x,"chip")).join("")}</div>`:""}${composer(`id:${t.id}`,t.kind==="agent"?`Message ${S.agentName}`:`Message ${roomTitle(t)}`)}${message()}</div>`;
}
function chatsView() { const rooms=[...(live.snapshot.threads||[])].sort((a,b)=>(b.unread||0)-(a.unread||0)||String(b.lastMessage?.createdAt||"").localeCompare(String(a.lastMessage?.createdAt||""))), agent=rooms.find(t=>t.kind==="agent"), groups=rooms.filter(t=>t.kind!=="agent");const roomRow=t=>`<button class="card qitem chat-row" data-live="thread" data-id="${t.id}">${t.kind==="agent"?botAv():`<span class="mono">${esc(kind(t.kind).slice(0,1))}</span>`}<span><b class="qt">${esc(roomTitle(t))}</b><small>${esc(t.lastMessage?.text||kind(t.kind))}</small></span>${t.unread?`<span class="unread">${t.unread}</span>`:'<span class="qstat">›</span>'}</button>`;return `<div class="screen"><h2 class="sec-title">Chats</h2>${agent?`<div class="eyebrow">Your agent</div>${roomRow(agent)}`:""}<div class="eyebrow">Rooms</div><div class="list">${groups.map(roomRow).join("")||'<p class="small muted">Your mission rooms will appear here.</p>'}</div><h2 class="sec-title">People in your missions</h2><div class="list">${(live.snapshot.people||[]).filter(p=>p.id!==live.user?.id).map(p=>row("●",p.name,(p.roles||[]).map(r=>ROLES[r]?.name||r).join(" · ")||"Member","person",p.id)).join("")||'<p class="small muted">Join a mission with someone to message them.</p>'}</div>${message()}</div>`; }
function playView() {
  const all=missions.flatMap(m=>m.joined?m.quests.map(q=>({m,q})):[]), mine=all.filter(({q})=>q.claimedBy===live.user?.id&&!q.done), calls=mine.filter(({q})=>q.state==="changes_requested"||(q.call?.q&&!q.decision)), working=mine.filter(x=>!calls.includes(x)), open=all.filter(({m,q})=>q.state==="open"&&q.stageId===currentStage(m)?.id&&m.stages.find(s=>s.id===q.stageId)?.status==="active"&&!m.quests.some(x=>x.parent===q.id&&!x.done)&&(!q.strat||!m.strategies.find(p=>p.id===q.strat)?.status)&&(q.dependencies||[]).every(id=>m.quests.find(x=>x.id===id)?.done));open.sort((a,b)=>Number(S.roles.includes(b.q.role))-Number(S.roles.includes(a.q.role))||Number(b.q.xp||0)-Number(a.q.xp||0));
  return `<div class="screen"><h2 class="sec-title">Play</h2>${calls.length?`<div class="eyebrow urgent">${esc(S.agentName)} needs you</div><div class="list">${calls.map(({m,q})=>taskLink(m,q,q.state==="changes_requested"?"Changes requested":`Choose a direction · ${m.title}`)).join("")}</div>`:""}${working.length?`<div class="eyebrow">Your current work</div><div class="list">${working.map(({m,q})=>taskLink(m,q,`${statusText(q)} · ${m.title}`)).join("")}</div>`:""}<h2 class="sec-title">For you</h2><div class="list">${open.slice(0,6).map(({m,q})=>`<div class="card qplay">${mono(ROLES[q.role]?q.role:"user",34)}<button class="qbody" data-live="quest" data-id="${q.id}"><b>${esc(q.title)}</b><span class="small muted">${esc(m.title)} · ${esc(q.size)} · ${q.xp} XP</span>${S.roles.includes(q.role)?'<span class="chip fitchip">Fits your role</span>':""}</button>${button("Start","quest",q.id,"btn sm blue")}</div>`).join("")||'<p class="small muted">No eligible open tasks right now. Explore a mission or start a new one.</p>'}</div></div>`;
}
const walletEarned = w => Number(w?.earnedLifetime ?? (w?.ledger||[]).filter(l=>l.kind==="earning").reduce((n,l)=>n+Math.max(0,Number(l.amount)||0),0));
const profileRow = (icon,title,detail,action,id) => `<button class="drow" data-live="${action}" data-id="${esc(id||"")}"><span>${icon}</span><b>${esc(title)}</b><span class="small muted">${esc(detail||"")} ›</span></button>`;
const personDetailRow = (icon,title,detail,action,id) => `<button class="drow person-detail-row" data-live="${action}" data-id="${esc(id||"")}"><span>${icon}</span><span class="person-detail-copy"><b>${esc(title)}</b><small class="muted">${esc(detail||"")}</small></span><span class="muted">›</span></button>`;
function profileView() {
  const p=live.snapshot.profile||{}, w=live.snapshot.wallet||{};
  const approved=missions.flatMap(m=>m.quests.filter(q=>q.done&&q.claimedBy===live.user?.id).map(q=>({m,q})));
  const completed=missions.filter(m=>m.joined&&m.stages.length&&m.stages.every(s=>s.status==="approved"));
  const medals=Object.keys(BADGES).sort((a,b)=>Number(S.badges.includes(b))-Number(S.badges.includes(a)));
  const work=[...completed.map(m=>profileRow(glyph(m),m.title,"Mission finished","recap",m.id)),...approved.map(({m,q})=>profileRow("✓",q.title,m.title,"quest",q.id))];
  return `<div class="screen live-profile"><div class="card duo-card"><div class="sunbox"><div class="duo-pair">${youAv("av bounce")}${botAv("av bounce",true)}</div><h1 class="cup">${esc(S.name)} & ${esc(S.agentName)}</h1><div class="small duo-tagline">One team. Everything we win, we win together.</div></div><div class="profile-level"><div class="row"><span class="eyebrow">Level ${S.level}</span><span class="spacer"></span><span class="small muted">${1200-((p.xp||0)%1200)} XP to level ${S.level+1}</span></div>${meter((p.xp||0)%1200,1200,"var(--red)")}</div><div class="kv"><div class="stat"><b>${approved.length}</b><span>quests done</span></div><div class="stat"><b>${Object.keys(p.joined||{}).length}</b><span>missions</span></div><div class="stat"><b>${fmt(walletEarned(w))}</b><span>earned</span></div></div></div><div class="row"><h2 class="sec-title">Our medals</h2><span class="spacer"></span><span class="eyebrow">${S.badges.length} of ${medals.length}</span></div><div class="medals">${medals.map(id=>`<div class="medal ${S.badges.includes(id)?"":"off"}">${medal(id,64)}<b>${esc(BADGES[id].name)}</b><span>${esc(S.badges.includes(id)?BADGES[id].desc:"Still up for grabs")}</span></div>`).join("")}</div><h2 class="sec-title">What we've done</h2>${work.length?`<div class="dgroup">${work.join("")}</div>`:'<p class="muted small">Nothing yet. Finish a task together and it shows up here.</p>'}<h2 class="sec-title">Our stuff</h2><div class="dgroup">${profileRow('<span class="coin"></span>',"Money",`${fmt(w.available||0)} credits`,"wallet-sheet")}${profileRow("✎",`${S.agentName}'s name and look`,"","profile-detail","look")}${profileRow("★","What we're good at",`${(p.roles||[]).length}`,"profile-detail","style")}${profileRow("✓",`What ${S.agentName} knows about you`,"","profile-detail","learned")}${profileRow("✓","Skills",`${(p.skills||[]).length} self declared`,"profile-detail","skills")}${profileRow("⇄","Apps we use",`${Object.values(S.preferences.tools||{}).filter(Boolean).length}`,"profile-detail","tools")}${profileRow("◷","Agent work history","","run-history")}${profileRow("⚙","Account security","","security")}${profileRow("↪","Sign out","","signout")}</div>${message()}</div>`;
}

function notificationsView() { return `<div class="screen"><h2 class="sec-title">Updates and invites</h2><div class="list">${(live.snapshot.notifications || []).map(n=>row("🔔",n.text,n.createdAt,"notification",n.id,n.read?"Read":"Open")).join("") || '<p class="small muted">No updates yet.</p>'}</div><h2 class="sec-title">Mission invites</h2><div class="list">${(live.snapshot.invites || []).map(i=>`<div class="card milestone"><b>${esc(i.inviter)} invited you</b><p class="small">${esc(missions.find(m=>m.id===i.missionId)?.title || "Mission")} · ${esc(i.status)}</p>${i.status==="pending"?`${button("Accept","invite-accept",i.id)}${button("Decline","invite-decline",i.id)}`:""}</div>`).join("") || '<p class="small muted">No invites yet.</p>'}</div></div>`; }
function personView() {
  const p=(live.snapshot.people||[]).find(x=>x.id===S.personId);
  if(!p)return `<div class="screen">${backBtn("back","comms")}<p class="small muted">This member is unavailable.</p></div>`;
  const shared=missions.filter(m=>m.joined&&(p.sharedMissionIds||[]).includes(m.id));
  const sharedPlans=missions.flatMap(m=>m.strategies.filter(pl=>(p.sharedPlanIds||[]).includes(pl.id)).map(pl=>({m,pl})));
  const role=(p.roles||[]).find(id=>ROLES[id]);
  const approved=p.approvedTasks||[];
  return `<div class="chat live-person"><div class="chat-head">${backBtn("back","comms")}<div class="person-head-copy"><div class="room-title">${esc(p.name)}</div><div class="small muted">${sharedPlans[0]?esc(sharedPlans[0].pl.squad):"Mission member"}</div></div></div><div class="stage-list"><div class="card duo-card"><div class="sunbox"><div class="duo-pair"><span class="av">${face("var(--pink)",p.name.length)}</span><span class="av">${bot(p.botShape||"blob",true)}</span></div><h1 class="cup">${esc(p.name)}${p.agentName?` &amp; ${esc(p.agentName)}`:""}</h1><div class="small person-bio">${approved.length?`${approved.length} approved ${approved.length===1?"task":"tasks"} across shared missions`:"Mission member"}</div></div><div class="kv"><div class="stat"><b>${Math.floor((p.xp||0)/1200)+1}</b><span>level</span></div><div class="stat"><b>${approved.length}</b><span>quests done</span></div><div class="stat"><b>—</b><span>check score</span></div></div>${role?`<div class="person-role">${mono(role,30)}<span class="small"><b>${esc(ROLES[role].name)}</b> · ${esc(ROLES[role].does)}</span></div>`:'<p class="small muted">No role selected yet.</p>'}<div class="person-actions">${p.id!==live.user?.id?`${button("Message","dm",p.id,"btn blue")}${button("Team up on a quest","person-team-up",p.id,"btn")}`:""}</div></div><div class="eyebrow">Squad</div>${sharedPlans.length?`<div class="dgroup">${sharedPlans.map(({m,pl})=>personDetailRow(`<span class="sbadge" style="background:${esc(pl.color)}">${esc(pl.squad.slice(0,2))}</span>`,pl.squad,`${pl.name} · ${m.title}`,"plan",pl.id)).join("")}</div>`:'<p class="small muted">No shared squad yet.</p>'}<div class="eyebrow">Skills</div>${p.skills?.length?`<div class="dgroup">${p.skills.map(skill=>`<div class="drow"><span class="skill-mark">~</span><b>${esc(skill)}</b><span class="small muted">Self declared</span></div>`).join("")}</div>`:'<p class="small muted">No skills declared yet.</p>'}<div class="eyebrow">Medals</div><p class="small muted">No medals yet.</p>${shared.length?`<div class="eyebrow">Missions together</div><div class="dgroup">${shared.map(m=>personDetailRow(glyph(m),m.title,"Shared mission","mission",m.id)).join("")}</div>`:""}${approved.length?`<div class="eyebrow">Recent work</div><div class="dgroup">${approved.map(x=>personDetailRow("✓",x.title,missions.find(m=>m.id===x.missionId)?.title||"Mission","quest",x.id)).join("")}</div>`:""}</div>${message()}</div>`;
}
function recapView() {
  const m=missions.find(x=>x.id===S.recapId)||current(); if(!m)return lobby();
  const approved=m.quests.filter(q=>q.done), contributed=approved.filter(q=>q.claimedBy===live.user?.id), artifacts=approved.flatMap(q=>(q.artifacts||[]).map(a=>({q,a}))), cleared=m.stages.filter(s=>s.status==="approved"), finished=cleared.length===m.stages.length&&m.stages.length>0;
  return `<div class="screen mission-recap"><div class="card mhead"><div class="band" style="background:${esc(m.color)}">${backBtn("back","mission")}<span class="mtitle"><span class="row" style="gap:6px"><span class="kind kind-mission">Mission</span>${finished?'<span class="kind done-tag">✓ Finished</span>':""}</span><h1>${esc(m.title)}</h1><span class="msquad">${m.players} people · ${cleared.length} of ${m.stages.length} stages approved</span></span>${glyph(m)}</div><div class="in"><p class="claim">${esc(m.pitch)}</p><div class="kv"><div class="stat"><b>${cleared.length}/${m.stages.length}</b><span>stages approved</span></div><div class="stat"><b>${approved.length}</b><span>tasks approved</span></div><div class="stat"><b>${artifacts.length}</b><span>saved outputs</span></div></div>${m.joined?button(`Ask ${S.agentName} to explain it`,"agent-context",m.id,"btn blue block"):""}</div></div>${m.sample?.finished?`<div class="card milestone"><div class="eyebrow">The envisioned result</div><p class="claim">${esc(m.sample.finished.Outcome||"")}</p><p class="small">${esc(m.sample.finished["What happened"]||"")}</p></div>`:""}${contributed.length?`<div class="card banner"><span class="display" style="font-size:22px">★</span><span class="small"><b>Your part:</b> ${esc(contributed.map(q=>q.title).join(", "))}.</span></div>`:""}<h2 class="sec-title">What it produced</h2><div class="dgroup recap-output-list">${artifacts.length?artifacts.map(({q,a})=>`<div class="drow"><span><b>${esc(a.title)}</b><small>${esc(q.title)} · version ${a.version}</small></span><span class="row">${button("Preview","artifact",a.id)}${button("Download","artifact-download",a.id)}</span></div>`).join(""):'<p class="small muted">No accessible artifacts recorded yet.</p>'}</div><h2 class="sec-title">How it went</h2><div class="card milestone"><ol class="mstones">${m.stages.map(st=>`<li class="${st.status==="approved"?"done":""}"><b>${esc(st.name)}</b><span>${esc(st.goal)}</span><span>${esc(st.status==="approved"?"Approved":"In progress")} · ${stageProgress(m,st)}</span>${button("Open stage","stage",st.id)}</li>`).join("")}</ol></div>${button("Back to mission","mission",m.id)}${message()}</div>`;
}

function editorView() {
  const m = current(), p = plan(m), q = quest(m), s = stage(m), d = ui.draft || {}, id = S.editId;
  const scopeFields = () => { const currentStageId=ui.editor==="quest-new"?id:q?.stageId; const candidates=(m?.quests||[]).filter(x=>x.stageId===currentStageId&&x.id!==q?.id); const selectedPlan=d.planId||q?.strat||S.stratId; const selectedParent=d.parentId||q?.parent||""; const selectedDeps=d.dependencies||q?.dependencies|| (q?.after?[q.after]:[]); return `${ui.editor==="quest-new"?`${field("callPrompt","Decision prompt (optional)",d.callPrompt||"")}${field("callOptions","Decision choices, one per line",d.callOptions||"","textarea")}<label class="field" for="q-role">Role</label><select class="inp" id="q-role" name="role">${Object.entries(ROLES).map(([key,r])=>`<option value="${key}">${r.name}</option>`).join("")}</select><label class="field" for="q-size">Size</label><select class="inp" id="q-size" name="size"><option>S</option><option>M</option><option>L</option></select>`:""}<label class="field" for="q-plan">Plan</label><select class="inp" id="q-plan" name="planId"><option value="">No plan yet</option>${(m?.strategies||[]).filter(x=>x.stageId===currentStageId).map(x=>`<option value="${x.id}" ${x.id===selectedPlan?"selected":""}>${esc(x.name)}</option>`).join("")}</select><label class="field" for="q-parent">Part of</label><select class="inp" id="q-parent" name="parentId"><option value="">Standalone task</option>${candidates.filter(x=>!x.parent).map(x=>`<option value="${x.id}" ${x.id===selectedParent?"selected":""}>${esc(x.title)}</option>`).join("")}</select><div class="eyebrow">Wait for these tasks</div><div class="mini-roles">${candidates.map(x=>`<label><input type="checkbox" name="dependencies" value="${x.id}" ${selectedDeps.includes(x.id)?"checked":""}> ${esc(x.title)}</label>`).join("")||'<span class="small muted">No other tasks in this stage yet.</span>'}</div>`; };
  let body = "";
  if (ui.editor === "forge") body = form("forge-form", "Create a mission", `<p class="small muted">Describe the change you want, then edit each part before publishing.</p><div class="row wrap">${button("Ask agent for a first draft", "agent-mission")}${button("Previous agent drafts", "run-history")}</div>` + field("title", "Mission name", d.title, "text", "required maxlength=160") + field("pitch", "The win", d.pitch, "textarea", "maxlength=5000") + field("tag", "Topic", d.tag || "Community") + field("stages", "Stages: name | goal | approved tasks needed", (d.stages || []).map(x => typeof x === "string" ? x : `${x.name} | ${x.goal || x.name} | ${x.target || 1}`).join("\n"), "textarea", "required") + field("rules", "Win rules, one per line", (d.rules || []).join("\n"), "textarea") + field("team", "Team needed", d.team || "", "textarea") + field("roles", "Roles needed, one per line", (d.roles || []).join("\n"), "textarea") + field("bounty", "Credit goal (optional)", d.bounty || 0, "number", "min=0"), "Publish mission");
  if (ui.editor === "mission-edit") body = form("mission-form", "Edit mission", field("title", "Mission name", m.title, "text", "required") + field("pitch", "The win", m.pitch, "textarea") + field("tag", "Topic", m.tag) + field("team", "Team needed", m.team || "", "textarea") + field("roles", "Roles needed, one per line", (m.roles || []).join("\n"), "textarea") + field("bounty", "Credit goal", m.bounty || 0, "number", "min=0"), "Save mission");
  if (ui.editor === "plan-new" || ui.editor === "plan-edit") body = form("plan-form", ui.editor === "plan-new" ? "New plan" : "Edit plan", field("name", "Plan name", d.name || (ui.editor === "plan-edit" ? p?.name : ""), "text", "required") + field("squad", "Squad name", d.squad || (ui.editor === "plan-edit" ? p?.squad : `${S.name}'s squad`), "text", "required") + field("bet", "How this wins the stage", d.bet || (ui.editor === "plan-edit" ? p?.bet : ""), "textarea"), "Save plan");
  if (ui.editor === "quest-new" || ui.editor === "quest-edit") body = form("quest-form", ui.editor === "quest-new" ? "New task or part" : "Edit task", field("title", "Task name", d.title || (ui.editor === "quest-edit" ? q?.title : ""), "text", "required") + field("description", "What needs doing", d.description || (ui.editor === "quest-edit" ? q?.brief?.description : ""), "textarea") + field("rewardCredits", "Credit reward", d.rewardCredits || (ui.editor === "quest-edit" ? q?.coins : 0) || 0, "number", "min=0") + scopeFields(), "Save task");
  if (ui.editor === "quest-submit") body = form("submit-form", q.state === "changes_requested" ? "Revise work" : "Submit work", field("title", "Artifact title", d.title || q.artifacts?.at(-1)?.title || `${q.title} · result`) + field("content", "Work and evidence", d.content || "", "textarea", "required maxlength=262144") + `<label class="field" for="artifact-file"><span>Import a text file into this artifact</span></label><input class="inp" id="artifact-file" type="file" accept=".txt,.md,.markdown,.csv,.json,.js,.ts,.py,.html,.css,.xml,.yaml,.yml,text/plain,text/markdown,text/csv,application/json"><p class="small muted" id="artifact-file-status">Text, code, Markdown, CSV, and JSON files up to 256 KB. You can edit the imported content before submitting it.</p><p class="small muted">Your submitted text becomes a saved, downloadable artifact for two independent reviews.</p>`, "Submit for review");
  if (ui.editor === "quest-review") body = form("review-form", "Review work", `<p class="small">Read the submitted artifact first. Two distinct members must approve.</p>${q.artifacts?.at(-1) ? button("Preview artifact", "artifact", q.artifacts.at(-1).id) : ""}<label class="field">Verdict<select class="inp" name="verdict"><option value="approve">Approve</option><option value="changes_requested">Request changes</option></select></label>` + field("note", "Review notes", "", "textarea"), "Save review");
  if (ui.editor === "profile-edit") body = form("profile-form", "Your team", field("agentName", "Agent name", S.agentName) + `<div class="eyebrow">Agent look</div><div class="profile-shapes">${Object.entries(SHAPES).map(([id,shape])=>`<label class="profile-shape"><input type="radio" name="botShape" value="${id}" ${S.botShape===id?"checked":""}><span class="av">${bot(id)}</span><b>${esc(shape.name)}</b></label>`).join("")}</div><div class="eyebrow">Roles</div><div class="mini-roles">${Object.entries(ROLES).filter(([,r]) => !r.auto).map(([id,r]) => `<label><input type="checkbox" name="roles" value="${id}" ${S.roles.includes(id) ? "checked" : ""}> ${r.name}</label>`).join("")}</div>` + field("skills", "Self declared skills, one per line", S.skills.map(x => x[0]).join("\n"), "textarea") + field("toolLinks", "Preferred tool URLs, one per line", (S.preferences.toolLinks || []).join("\n"), "textarea"), "Save profile");
  if (ui.editor === "fund") {const attempt=ui.fundAttempt;body=form("fund-form", "Reserve credits", field("amount", "Credits", attempt?.amount ?? "10", "number", `min=1 max=${live.snapshot.wallet.available} ${attempt?.uncertain?"disabled":""}`)+(attempt?.uncertain?'<p class="small muted">The last reservation needs confirmation. Retry the same amount.</p>':""),attempt?.uncertain?"Retry reservation":"Reserve");}
  if (ui.editor === "back") body = form("back-form", `Back ${p?.name || "plan"}`, `<p class="small muted">Back for free with 0, or reserve credits for this plan.</p>` + field("testCredits", "Credits", "0", "number", `min=0 max=${live.snapshot.wallet.available}`), "Back plan");
  if (ui.editor === "pledge") body = form("pledge-form", "Add a contribution", `<label class="field">Kind<select class="inp" name="kind"><option value="time">Time</option><option value="compute">Compute</option><option value="test_credits">Credits</option></select></label>` + field("amount", "Amount", "1", "number", "min=1") + field("note", "Note", "", "textarea"), "Save contribution");
  if (ui.editor === "invite") body = form("invite-form", "Invite a member", field("email", "Their account email", "", "email", "required"), "Send invite");
  if (ui.editor === "need") body = form("need-form", "Add a need", field("title", "What do you need?", "", "text", "required") + field("detail", "Details", "", "textarea"), "Save need");
  if (ui.editor === "stage-new") body = form("stage-form", "Add a stage", field("name", "Stage name", "", "text", "required") + field("goal", "Goal", "", "textarea") + field("target", "Approved tasks needed", "1", "number", "min=1"), "Save stage");
  if (ui.editor === "agent-prompt") body = form("agent-form", "Work with your agent", `<p class="small muted">The agent may produce a draft. You review and publish it yourself.</p>` + field("prompt", "What should it do?", d.prompt || "", "textarea", "required"), "Ask agent");
  if (ui.editor === "merge") body = form("merge-form", "Suggest a merge", `<label class="field">Merge into<select class="inp" name="targetPlanId">${m.strategies.filter(x => x.id !== id).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></label>` + field("reason", "Why combine these plans?", "", "textarea"), "Suggest merge");
  if (ui.editor === "nudge") body = form("nudge-form", "Nudge this task", field("message", "Message", "Can you share an update?", "text", "required"), "Send nudge");
  if (ui.editor === "join") body = form("join-form", `Join ${m?.title || "mission"}`, `<p class="small">Choose the roles you want to play. You can change these later.</p><div class="mini-roles">${Object.entries(ROLES).filter(([,r])=>!r.auto).map(([key,r])=>`<label><input type="checkbox" name="roles" value="${key}" ${S.roles.includes(key)?"checked":""}> ${esc(r.name)}</label>`).join("")}</div><div class="card milestone"><div class="eyebrow">The rules</div><ul class="checks">${(m?.rules||[]).map(r=>`<li>${esc(r)}</li>`).join("")}</ul></div>`, "Join mission");
  if (ui.editor === "flag") body = form("flag-form", "Flag a spending concern", field("reason", "What should the mission owner review?", "", "textarea", "required"), "Save concern");
  if (ui.editor === "skill") body = form("skill-form", "Add a self declared skill", field("skill", "Skill", "", "text", "required maxlength=80") + '<p class="small muted">This is self declared; no verification is implied.</p>', "Add skill");
  if (ui.editor === "tools") body = `<div class="card milestone"><h2 class="sec-title">Tool preferences</h2><p class="small muted">Choose which tools the agent may use. Connections are not established here.</p>${["Shared drive","GPU pool","Browser","Code workspace"].map(key=>`<div class="drow"><b>${esc(key)}</b>${button(S.preferences.tools?.[key] ? "On" : "Off","tool-toggle",key)}</div>`).join("")}${button("Done","editor-close")}</div>`;
  if (ui.editor === "security") body = `<div class="card milestone"><h2 class="sec-title">Account security</h2><p class="small muted">Passkeys on this account</p>${(ui.security?.passkeys || []).map(k=>`<div class="drow"><span><b>Passkey</b><span class="small muted" style="display:block">Added ${esc(k.createdAt || "")} · ${esc(k.deviceType || "Device")}</span></span>${(ui.security?.passkeys || []).length > 1 ? button("Remove","passkey-remove",k.id) : ""}</div>`).join("") || '<p class="small muted">Loading passkeys…</p>'}<div class="row wrap">${button("Verify with passkey","reauth")}${button("Add passkey","passkey-add")}${button("Generate recovery codes","recovery-codes")}</div>${ui.codes ? `<div class="card milestone"><b>Save these codes now. They are shown once.</b><pre class="live-artifact">${esc(ui.codes.join("\n"))}</pre>${button("Download codes","codes-download")}</div>` : ""}</div>`;
  return `<div class="screen">${backBtn("back", "lobby")}${body}${message()}</div>`;
}

function taskRunContent() {
  const data=ui.runData||{}, run=data.run||{}, active=!['completed','failed','cancelled','uncertain'].includes(run.status);
  const decisions=(data.decisions||[]).filter(d=>!d.selectedOptionId).map(d=>`<div class="card task-run-decision"><div class="eyebrow">${esc(S.agentName)} needs your choice</div><b>${esc(d.prompt)}</b><div class="quick wrap">${d.options.map(o=>button(o.label,"agent-decision",`${d.id}:${o.id}`,"chip")).join("")}</div>${ownWords(d)}</div>`).join("");
  const artifacts=(data.artifacts||[]).map(a=>`<div class="card task-run-artifact"><div class="eyebrow">${esc(S.agentName)}'s saved work · version ${a.version}</div><b>${esc(a.title)}</b><pre class="live-artifact">${esc(a.content)}</pre>${button("Edit and submit","agent-submit",a.id,"btn sm red")}</div>`).join("");
  return `<div class="card task-run-status" role="status"><div class="eyebrow">Agent work · private until you submit</div><b>${esc(runStatus(run.status))}</b>${run.error?`<p class="small no">${esc(run.error)}</p>`:""}${ui.runPollError?`<p class="small no">${esc(ui.runPollError)} · retrying…</p>`:""}${run.response?`<p class="small">${agentText(run.response)}</p>`:""}<div class="row wrap">${active?button("Cancel","run-cancel"):""}${!active&&["failed","cancelled"].includes(run.status)?button("Try again","agent-execute",run.questId):""}</div></div>${decisions}${artifacts}`;
}
function updateTaskRunPanel() {
  const panel=document.querySelector("#task-run-panel"), scroller=document.querySelector("#msgs.task-timeline");
  if(!panel)return false;
  const atBottom=scroller&&scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<100;
  panel.innerHTML=taskRunContent();
  if(atBottom)scroller.scrollTop=scroller.scrollHeight;
  return true;
}
const runStatus = status => ({queued:"Starting…",starting:"Starting…",running:`${S.agentName} is working…`,needs_input:`${S.agentName} has a question`,completed:"Done",failed:"Something went wrong",cancelled:"Stopped",uncertain:"Couldn't confirm the last step"})[status] || "Starting…";
const runKind = kind => ({"mission-draft":"New mission","plan-draft":"New plan","quest-draft":"New task","quest-execute":"Working on a task","context-chat":"Chat"})[kind] || "Agent work";
// Every question Pip asks can also be answered in the person's own words.
const ownWords = d => `<form class="composer decision-own" data-decision="${esc(d.id)}"><input class="inp" name="answer" maxlength="1000" placeholder="Or answer in your own words…" aria-label="Answer in your own words" autocomplete="off"><button class="btn sm red" type="submit">Send</button></form>`;
function runView() {
  const data = ui.runData || {}, run = data.run || {};
  const drafts=(data.drafts||[]).map(d=>`<div class="msg">${botAv()}<div class="bubble"><div class="from">${esc(S.agentName)} · ${esc(d.kind)} draft</div><div class="card draftcard"><h3>${esc(d.data?.title||d.data?.name||d.kind)}</h3><p>${esc(d.data?.pitch||d.data?.bet||d.data?.description||"")}</p>${button("Edit draft","draft-edit",d.id,"btn sm red")}</div></div></div>`).join("");
  const artifacts=(data.artifacts||[]).map(a=>`<div class="msg">${botAv()}<div class="bubble"><div class="from">${esc(S.agentName)} · saved work</div><div class="card draftcard"><h3>${esc(a.title)}</h3><pre class="live-artifact">${esc(a.content)}</pre><p class="small muted">Version ${a.version}</p>${button("Edit and submit","agent-submit",a.id,"btn sm red")}</div></div></div>`).join("");
  return `<div class="chat creation-chat"><div class="chat-head">${button("← Back","run-close")} ${botAv()}<div><div class="display chan-name">${esc(S.agentName)}</div><div class="small muted">${esc(runKind(run.kind))}</div></div></div><div class="msgs run-stream"><div class="msg">${botAv()}<div class="bubble"><div class="from">${esc(S.agentName)}</div><b>${esc(runStatus(run.status))}</b>${run.status==="uncertain"?'<p class="small no">The last action could not be confirmed. This run needs reconciliation.</p>':""}${run.error?`<p class="no">${esc(run.error)}</p>`:""}${run.response?`<p>${esc(run.response)}</p>`:""}</div></div>${drafts}${artifacts}${(data.decisions||[]).filter(d=>!d.selectedOptionId).map(d=>`<div class="msg">${botAv()}<div class="bubble"><div class="from">Decision needed</div><b>${esc(d.prompt)}</b><div class="quick wrap">${d.options.map(o=>button(o.label,"agent-decision",`${d.id}:${o.id}`,"chip")).join("")}</div>${ownWords(d)}</div></div>`).join("")}</div><div class="row wrap run-actions">${!['completed','failed','cancelled','uncertain'].includes(run.status)?button("Cancel run","run-cancel"):""}${button("Close","run-close")}</div>${message()}</div>`;
}
function runHistoryView() { return `<div class="screen">${button("← Back","run-history-close")}<h2 class="sec-title">Agent work history</h2><div class="list">${(ui.runHistory?.runs||[]).map(r=>row(botAv(),r.prompt||r.kind,`${r.kind} · ${r.status} · ${r.updatedAt||""}`,"run-open",r.id)).join("") || '<p class="small muted">No agent work yet. New drafts and runs will appear here.</p>'}</div>${ui.runHistory?.nextCursor?button("Older runs","run-history-more",ui.runHistory.nextCursor):""}${message()}</div>`; }
async function pollRun(id) {
  const account = live.user, generation = accountGeneration;
  if (!S.live || !account) return;
  try { const data = await api(`/agent/runs/${id}`); if (ui.run !== id || live.user !== account || accountGeneration !== generation) return; ui.runData = data; ui.runPollError=""; if (ui.creation?.runId === id && data.run.status === "completed" && data.drafts?.length && data.run.kind === `${ui.creation.kind}-draft`) { const draft=data.drafts.at(-1); ui.creation=acceptCreationDraft(ui.creation,draft,data.run);ui.run=null;ui.runData=null;render();return; } if(data.run.kind==="quest-execute"&&data.run.questId){const opening=S.screen!=="quest"||S.questId!==data.run.questId,m=missions.find(x=>x.id===data.run.missionId),q=m?.quests.find(x=>x.id===data.run.questId);S.screen="quest";S.missionId=data.run.missionId;S.stageId=q?.stageId;S.questId=data.run.questId;S.stratId=data.run.planId;ui.runHistory=null;if(!ui.editor&&(opening||S.roomTab!=="brief"))if(!updateTaskRunPanel())render();} else if(!ui.editor)render(); if (!['completed','failed','cancelled','uncertain'].includes(data.run.status)) setTimeout(() => pollRun(id), 1800); }
  catch (error) { if (ui.run === id && live.user === account && accountGeneration === generation) { if(ui.runData?.run?.kind==="quest-execute"){ui.runPollError=error.message;if(!ui.editor&&S.roomTab!=="brief")updateTaskRunPanel();setTimeout(()=>pollRun(id),2500);}else{ui.error=error.message;if(!ui.editor)render();} } }
}
async function startRun(kind, prompt, ids = {}) {
  if(kind==="quest-execute"){
    if(startingQuestRun||(ui.runData?.run?.kind==="quest-execute"&&ui.runData.run.questId===ids.questId&&!['completed','failed','cancelled','uncertain'].includes(ui.runData.run.status)))return;
    startingQuestRun=true;
  }
  const navigation = navigationGeneration, creation = ui.creation, context=ui.context, editor=ui.editor, screen=S.screen;
  const active=()=>creation?ui.creation===creation:navigation===navigationGeneration&&ui.creation===null&&ui.context===context&&ui.editor===editor&&S.screen===screen;
  try { ui.error=""; const {run} = await api("/agent/runs", {method:"POST",body:JSON.stringify({requestId:crypto.randomUUID(),kind,prompt,...ids})}); if (creation && kind===`${creation.kind}-draft`) creation.runId=run.id; if (!active()) return; ui.editor=null; ui.run=run.id; ui.runData={run,drafts:[],artifacts:[],decisions:[]}; ui.runPollError=""; render(); pollRun(run.id); }
  catch (error) { if(creation){creation.busy=false;creation.error=error.message;} if(active()){ui.error=error.message;render();} }
  finally {if(kind==="quest-execute")startingQuestRun=false;}
}
async function startCreationDraft(kind, idea, ids) {
  if (!ui.creation || ui.creation.busy) return;
  const creation=ui.creation;
  if (creation.publishUncertain) {creation.error="Retry the previous publish first so its outcome can be confirmed.";render();return;}
  creation.busy = true; creation.error = ""; render();
  const scope=ids.stageId?` Selected stage ID: ${ids.stageId}. The saved draft must use exactly this stageId and stay within that stage.`:"";
  const ask=kind==="mission"
    ?`Create a mission proposal for this problem: ${idea}. A mission is the problem and a measurable win, not a solution. If this names only a broad area, first ask one bounded decision offering concrete problems in that area; never ask what to build or which technology. Save an editable draft once the problem is clear.`
    :`Create a specific ${kind} proposal for: ${idea}.${scope} If this is only a broad category, first request a bounded decision to learn the actual goal; do not invent one. Save an editable draft after the person's choice.`;
  await startRun(`${kind}-draft`, ask, {...(ids.missionId?{missionId:ids.missionId}:{}),...(ids.planId?{planId:ids.planId}:{})});
  creation.busy=false;
  if (!creation.runId) creation.error=ui.error || "Could not start the agent. Try again.";
  if (ui.creation===creation) render();
}
function openCreation(kind, ids = {}) {
  ui.creation = beginCreation(kind, ids);
  ui.editor = null; ui.run = null; ui.runData = null; ui.error = "";
  render();
}
function resumeCreation() {
  if (!ui.savedCreation) return;
  ui.creation = ui.savedCreation;
  ui.savedCreation = null;
  ui.error = "";
  if (ui.creation.runId) { ui.creation.busy = false; ui.run = ui.creation.runId; ui.runData = null; pollRun(ui.run); }
  render();
}
function contextView() {
  const c=ui.context, m=missions.find(x=>x.id===c.missionId), s=m?.stages.find(x=>x.id===c.stageId), p=m?.strategies.find(x=>x.id===c.planId);
  return `<div class="chat creation-chat"><div class="chat-head">${button("← Back","context-close")}${botAv("av")}<div><div class="display" style="font-size:15px">Ask ${esc(S.agentName)}</div><div class="small muted">Private help with ${esc(p?.name||s?.name||m?.title||"this mission")}</div></div></div><div class="msgs" id="msgs"><div class="msg">${botAv()}<div class="bubble"><div class="from">${esc(S.agentName)}</div><div>What would help you move this forward?</div><div class="quick wrap">${["What should we do next?","Where are we stuck?","Draft a plan","Suggest tasks"].map(x=>button(x,"context-ask",x,"chip")).join("")}</div></div></div></div><form class="composer" id="context-composer"><input name="text" placeholder="Ask in your own words…" maxlength="4000" required><button class="btn sm red" type="submit">Send</button></form>${message()}</div>`;
}
async function askContext(text) {
  const c=ui.context;if(!c)return;
  await startRun("context-chat", `${text} Current stage: ${c.stageId||"none"}. Give a useful answer grounded in authorized context; save a plan or task draft only if requested.`, {missionId:c.missionId,...(c.planId?{planId:c.planId}:{})});
}
async function publishCreation(c) {
  if (c.busy) return;
  const account=live.user;
  c.busy = true; c.error = ""; render();
  c.prepublishMissionIds ||= (live.snapshot?.missions || []).map(m=>m.id);
  const before = new Set(c.prepublishMissionIds);
  let result=c.publishedMissionId?{}:undefined;
  if (c.kind !== "mission") {const m=live.snapshot?.missions?.find(x=>x.id===c.ids.missionId),s=m?.stages.find(x=>x.id===c.ids.stageId);if(!s||s.status!=="active"){c.error="This stage is no longer active. Reopen it and try again.";c.busy=false;render();return;}if(c.kind==="quest"&&c.planId&&!m.strategies.some(p=>p.id===c.planId&&p.stageId===s.id&&p.status==="active")){c.error="That plan is no longer active in this stage.";c.busy=false;render();return;}}
  c.publishRequestId ||= crypto.randomUUID();
  if (c.kind === "mission" && !c.publishedMissionId) result = await act("mission.create", null, {title:c.title.trim(),pitch:c.pitch.trim(),tag:c.tag,team:c.team.trim(),roles:c.roles,bounty:c.bounty,stages:c.stages.map(s=>({name:s.name.trim(),goal:s.goal.trim()||s.name.trim(),target:s.target,gateTarget:s.gateTarget,unit:s.unit})),rules:c.rules}, "Mission published", c.publishRequestId);
  if (c.kind === "plan") result = await act("plan.create", c.ids.stageId, {name:c.name.trim(),squad:c.squad.trim(),bet:c.bet.trim()}, "Plan created", c.publishRequestId);
  if (c.kind === "quest") result = await act("quest.create", c.ids.stageId, {title:c.title.trim(),description:c.description.trim(),role:c.role,size:c.size,planId:c.planId || undefined,parentId:c.parentId||undefined,dependencies:c.dependencies,call:c.callPrompt&&c.callOptions.length>=2?{q:c.callPrompt,opts:c.callOptions}:undefined,rewardCredits:c.rewardCredits}, "Task created", c.publishRequestId);
  if (live.user!==account||ui.creation!==c) return;
  if (!result) { c.error=ui.error;c.publishUncertain=ui.lastActionUncertain;if(!ui.lastActionUncertain){c.publishRequestId=null;c.prepublishMissionIds=null;}c.busy=false;render();return; }
  c.publishUncertain=false;
  if (c.kind === "mission") {
    const created=live.snapshot.missions.find(m=>m.id===c.publishedMissionId) || live.snapshot.missions.find(m=>m.ownerId===live.user?.id&&!before.has(m.id));
    if (created) {
      c.publishedMissionId=created.id;
      S.missionId=created.id; S.stageId=created.stages?.[0]?.id;
      if (c.reserve > 0) {
        c.reserveRequestId ||= crypto.randomUUID();
        const reserved=await act("funding.reserve",created.id,{amount:c.reserve},"Credits reserved",c.reserveRequestId);
        if (live.user!==account||ui.creation!==c) return;
        if (!reserved) {c.reserveUncertain=ui.lastActionUncertain;if(!c.reserveUncertain)c.reserveRequestId=null;c.error=c.reserveUncertain?`Mission published. Reservation outcome is uncertain. Retry the same reservation to confirm it.`:`Mission published. ${ui.error} Choose another amount or finish without reserving.`;c.busy=false;render();return;}
        c.reserveUncertain=false;
      }
    }
    S.screen="mission"; S.tab="map";
  } else if (c.kind === "plan") {S.missionId=c.ids.missionId;S.stageId=c.ids.stageId;S.screen="stage";}
  else {S.missionId=c.ids.missionId;S.stageId=c.ids.stageId;S.screen=c.planId?"strategy":"stage";if(c.planId)S.stratId=c.planId;}
  ui.creation=null; c.busy=false; render();
}
async function refreshSecurity() { ui.security = await api("/auth/passkeys"); render(); }
async function reauthorize() {
  const {options}=await api("/auth/reauth/options",{method:"POST",body:"{}"});
  const response=await startAuthentication({optionsJSON:options});
  await api("/auth/reauth/verify",{method:"POST",body:JSON.stringify({response})});
  await refreshSecurity();
}
async function securityWrite(operation) {
  try {
    if (!ui.security?.manageUntil || new Date(ui.security.manageUntil).getTime() < Date.now()+5000) await reauthorize();
    await operation();
    await refreshSecurity();
    ui.error="";
  } catch(error) { ui.error=error.name==="NotAllowedError"?"Passkey was cancelled.":error.message; render(); }
}

export function renderLiveScreen() {
  if (ui.sheet?.kind === "quest-history") {const q=current()?.quests.find(x=>x.id===ui.sheet.id);return `${questView()}<div class="live-sheet-backdrop"><div class="live-sheet card quest-history-sheet" role="dialog" aria-modal="true" aria-label="Task history"><div class="grab"></div><div class="row"><h2 class="sec-title">Task history</h2><span class="spacer"></span>${button("×","sheet-close")}</div><div class="dgroup">${q?questHistoryContent(q):'<p class="small muted">Task unavailable.</p>'}</div>${message()}</div></div>`;}
  if (ui.sheet?.kind === "pair") {
    const person=(live.snapshot.people||[]).find(p=>p.id===ui.sheet.id);
    const eligible=missions.filter(m=>m.joined&&(person?.sharedMissionIds||[]).includes(m.id)).flatMap(m=>m.quests.filter(q=>q.claimedBy===live.user?.id&&["claimed","changes_requested"].includes(q.state)).map(q=>({m,q})));
    return `${personView()}<div class="live-sheet-backdrop"><div class="live-sheet card pair-sheet" role="dialog" aria-modal="true" aria-label="Team up on a quest"><div class="grab"></div><div class="row"><h2 class="sec-title">Team up on a quest</h2><span class="spacer"></span>${button("×","sheet-close")}</div><p class="small muted">Choose one of your active tasks to invite ${esc(person?.name||"this member")} to collaborate.</p><div class="dgroup">${eligible.map(({m,q})=>personDetailRow(mono(q.role,28),q.title,m.title,"pair-select",q.id)).join("")||'<p class="small muted">Claim a task in a shared mission to invite this member.</p>'}</div>${message()}</div></div>`;
  }
  if (ui.sheet?.kind === "crew") {
    const q=current()?.quests.find(x=>x.id===ui.sheet.id), room=q&&roomFor("quest",q.id), people=live.snapshot.people||[];
    const speakers=[...new Set((room?roomState(room.id).messages:[]).map(x=>x.senderId).filter(Boolean))];
    const ids=[...new Set([q?.claimedBy,...speakers].filter(Boolean))], members=ids.map(id=>people.find(p=>p.id===id)).filter(Boolean);
    return `${questView()}<div class="live-sheet-backdrop"><div class="live-sheet card crew-sheet" role="dialog" aria-modal="true" aria-label="Task participants"><div class="grab"></div><div class="row"><h2 class="sec-title">Who's on it</h2><span class="spacer"></span>${button("×","sheet-close")}</div><div class="dgroup">${members.map(p=>personDetailRow(`<span class="av">${face("var(--pink)",p.name.length)}</span>`,p.name,p.id===q.claimedBy?"Task claimant":"In the conversation","person",p.id)).join("")||'<p class="small muted">Nobody has claimed or spoken in this task yet.</p>'}</div>${message()}</div></div>`;
  }
  if (ui.sheet?.kind === "profile") {
    const key=ui.sheet.id, p=live.snapshot.profile||{}, titles={look:`${S.agentName}'s name and look`,style:"What we're good at",learned:`What ${S.agentName} knows about you`,skills:"Skills",tools:"Apps we use"};
    const body=key==="look"?`<div class="duo-pair sheet-agent-avatar">${botAv("av big",true)}</div><p class="small muted sheet-center">${esc(SHAPES[S.botShape]?.name||S.botShape)} · ${esc(SHAPES[S.botShape]?.line||"")}</p><form id="profile-look-form">${field("agentName","Name",S.agentName,"text","required maxlength=60")}<div class="chips wrap profile-name-picks">${["Pip","Bolt","Sprout","Mochi","Rex"].map(name=>button(name,"profile-name-pick",name,`chip ${S.agentName===name?"selected":""}`)).join("")}</div><div class="eyebrow">Look</div><div class="shapes">${Object.entries(SHAPES).map(([id,shape])=>`<label class="shape-pick"><input type="radio" name="botShape" value="${id}" ${S.botShape===id?"checked":""}><span class="av">${bot(id)}</span><b>${esc(shape.name)}</b></label>`).join("")}</div><button class="btn red block" type="submit">Save name and look</button></form>`:key==="style"?`<p class="small muted">Pick up to three roles. We use these to find work that fits.</p><form id="profile-role-form"><div class="role-grid">${Object.entries(ROLES).filter(([,role])=>!role.auto).map(([id,role])=>`<label class="role"><input type="checkbox" name="roles" value="${id}" ${S.roles.includes(id)?"checked":""}>${mono(id,44)}<span><b>${esc(role.name)}</b><span class="muted">${esc(role.does)}</span></span></label>`).join("")}</div><button class="btn red block" type="submit">Save roles</button></form>`:key==="learned"?`<p class="small muted">${esc(S.agentName)} can use the preferences and information you saved in your profile. There are no saved agent memories to show yet.</p><div class="dgroup"><div class="drow"><span>●</span><b>Your name</b><small>${esc(S.name)}</small></div><div class="drow"><span>★</span><b>Roles</b><small>${esc((p.roles||[]).map(r=>ROLES[r]?.name||r).join(", ")||"Not chosen")}</small></div><div class="drow"><span>✓</span><b>Skills</b><small>${esc((p.skills||[]).join(", ")||"None added")}</small></div><div class="drow"><span>⇄</span><b>Preferred tools</b><small>${esc(Object.entries(S.preferences.tools||{}).filter(([,on])=>on).map(([name])=>name).join(", ")||"None selected")}</small></div></div>`:key==="skills"?`<p class="small muted">Skills are self declared.</p><div class="dgroup">${(p.skills||[]).map(x=>`<div class="drow"><span class="skill-mark">~</span><b>${esc(x)}</b><small>Self declared</small></div>`).join("")||'<p class="small muted">No skills added yet.</p>'}</div>${button("Add a skill","skill","","btn red block")}`:key==="tools"?`<p class="small muted">Preferences tell your agent which tools you prefer. They do not connect accounts.</p><div class="dgroup">${["Shared drive","GPU pool","Browser","Code workspace"].map(name=>`<div class="drow"><span>⇄</span><b>${esc(name)}</b>${button(S.preferences.tools?.[name]?"On":"Off","tool-toggle",name,"btn sm")}</div>`).join("")}</div>`:"";
    return `${profileView()}<div class="live-sheet-backdrop"><div class="live-sheet card profile-sheet" role="dialog" aria-modal="true" aria-label="${esc(titles[key]||"Profile details")}"><div class="grab"></div><div class="row"><h2 class="sec-title">${esc(titles[key]||"Profile details")}</h2><span class="spacer"></span>${button("×","sheet-close","","btn sm")}</div>${body}${message()}</div></div>`;
  }
  if (ui.sheet?.kind === "wallet") {
    const w=live.snapshot.wallet||{}, ledger=w.ledger||[];
    const earned=walletEarned(w);
    const ready=missions.flatMap(m=>m.quests.filter(q=>q.done&&q.claimedBy===live.user?.id&&ledger.some(l=>l.quest_id===q.id&&l.kind==="earning"&&l.amount>0)&&!ledger.some(l=>l.quest_id===q.id&&l.kind==="payout_simulation")).map(q=>({m,q})));
    return `${profileView()}<div class="live-sheet-backdrop"><div class="live-sheet card wallet-sheet" role="dialog" aria-modal="true" aria-label="Our money"><div class="grab"></div><div class="row"><h2 class="sec-title">Our money</h2><span class="spacer"></span>${button("×","sheet-close","","btn sm")}</div><div class="wallet-summary"><div class="drow"><span class="coin"></span><span><b>Available credits</b><small>Ready to use</small></span><b>${fmt(w.available||0)}</b></div><div class="drow"><span>⏳</span><span><b>Reserved for work</b><small>Committed to mission work</small></span><b>${fmt(w.reserved||0)}</b></div></div><div class="eyebrow">What we've earned</div><p class="small">${fmt(earned)} credits from approved work</p>${w.enabled&&ready.length?`<div class="eyebrow">Ready to record</div>${ready.map(({q})=>`<div class="drow"><span>✓</span><span><b>${esc(q.title)}</b></span>${button("Record payout","payout",q.id)}</div>`).join("")}`:""}<div class="eyebrow">Credit history</div>${ledger.length?ledger.map(l=>`<div class="drow"><span>${l.kind==="earning"?"★":"$"}</span><span><b>${esc(l.kind==="payout_simulation"?"Payout recorded":l.kind.replaceAll("_"," "))}</b>${l.created_at||l.createdAt?`<small>${esc(l.created_at||l.createdAt)}</small>`:""}</span><b>${Number(l.amount)>0?"+":""}${fmt(l.amount)}</b></div>`).join(""):'<p class="small muted">No credit activity yet.</p>'}<div class="row wrap">${button("Export JSON","export")}${button("Export CSV","export-csv")}</div>${message()}</div></div>`;
  }
  if (ui.sheet?.kind === "mission-detail") { const m=missions.find(x=>x.id===ui.sheet.id); if(m)return missionDetailSheet(m,ui.sheet.detail); }
  if (ui.sheet) { const m=missions.find(x=>x.stages.some(st=>st.id===ui.sheet.id)), st=m?.stages.find(x=>x.id===ui.sheet.id); if(m&&st)return stageGoalSheet(m,st); }

  if (ui.preview) return `<div class="screen">${button("← Back", "preview-close")}<article class="card doc"><h1 class="doc-title">${esc(ui.preview.title)}</h1><pre class="live-artifact">${esc(ui.preview.content)}</pre></article></div>`;
  if (ui.editor) return editorView();
  if (ui.run && !(ui.runData?.run?.kind==="quest-execute" && S.screen==="quest")) return runView();
  if (ui.runHistory) return runHistoryView();
  if (ui.creation) return creationView(ui.creation);
  if (ui.context) return contextView();
  return ({ onboard:onboardView, lobby, mission: missionView, stage: stageView, strategy: planView, quest: questView, play: playView, comms: chatsView, thread: chatView, profile: profileView, notifications: notificationsView, recap: recapView, person: personView })[S.screen]?.() || lobby();
}
export function isLiveConversation() { return Boolean(ui.creation || ui.context || ui.run); }

export function handleLiveInput(event) { if(ui.creation&&creationInput(ui.creation,event.target))return true; if(event.target.form?.id==="quest-inline-submit"&&["title","content"].includes(event.target.name)){ui.draft={...ui.draft,[event.target.name]:event.target.value};return true;} if(S.screen==="onboard"&&event.target.name==="agentName"&&ui.onboard){ui.onboard.agentName=event.target.value;document.querySelectorAll("[data-botname]").forEach(el=>{el.textContent=event.target.value.trim()||"Pip";});return true;} return false; }
export async function handleLiveFile(event) {
  if (!S.live || event.target.id !== "artifact-file") return false;
  const input = event.target, file = input.files?.[0], status = document.querySelector("#artifact-file-status");
  if (!file) return true;
  const accepted = /\.(txt|md|markdown|csv|json|js|ts|py|html|css|xml|yaml|yml)$/i.test(file.name);
  if (!accepted || file.size > 262144) { if (status) status.textContent = "Choose a text, code, Markdown, CSV, or JSON file no larger than 256 KB."; input.value=""; return true; }
  try {
    const content = await file.text();
    if (content.includes("\0") || new TextEncoder().encode(content).length > 262144) throw new Error("File is not valid text within 256 KB.");
    const field = document.querySelector("#f-content");
    if (field && input.isConnected) { field.value = content; ui.draft = {...ui.draft, content}; if (status) status.textContent = `${file.name} imported. Review and edit the text before submitting.`; }
  } catch (error) { if (status) status.textContent = error.message; }
  input.value="";
  return true;
}
export async function handleLiveClick(event) {
  if (S.live && (ui.editor || ui.preview || (ui.run&&!(S.screen==="quest"&&ui.runData?.run?.kind==="quest-execute"))) && event.target.closest('[data-a="back"]')) { event.preventDefault(); if(ui.editor)ui.editor=null;else if(ui.preview)ui.preview=null;else{ui.run=null;ui.runData=null;} render(); return true; }
  if (S.live && event.target.closest('[data-a="notifs"]')) { event.preventDefault(); nav("notifications"); return true; }
  const b = event.target.closest("[data-live]"); if (!b) return false;
  event.preventDefault();
  const a = b.dataset.live, id = b.dataset.id;
  if (a === "agent-handoff") {
    const room = live.snapshot?.threads?.find(t => t.id === S.thread && t.kind === "agent");
    const activity = room && roomState(room.id).activities.find(item => item.id === id && item.status === "completed");
    const handoff = activity?.handoff;
    if (!handoff) return true;
    if (handoff.type === "download") {
      const path = handoff.path;
      if (!/^\/api\/v1\/game\/(?:artifacts\/[0-9a-f-]{36}|credits\.(?:csv|json))$/.test(path)) return true;
      const response = await fetch(new URL(path, apiOrigin), {credentials:"include",cache:"no-store"}).catch(() => null);
      if (!response?.ok) { ui.error="Download unavailable"; updateVisibleMessages(); return true; }
      const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = path.endsWith("credits.csv") ? "joystick-test-credits.csv" : path.endsWith("credits.json") ? "joystick-test-credits.json" : "artifact.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
      return true;
    }
    if (handoff.type !== "navigate") return true;
    const screen = handoff.screen, entityId = handoff.entityId;
    if (screen === "security") { ui.editor="security"; ui.codes=null; ui.error=""; render(); refreshSecurity().catch(error=>{ui.error=error.message;render();}); return true; }
    if (screen === "wallet") { nav("profile"); ui.sheet={kind:"wallet"}; render(); return true; }
    if (screen === "run" && entityId) { ui.run=entityId; ui.runData=null; await pollRun(entityId); return true; }
    const extras = {mission:"missionId",stage:"stageId",strategy:"stratId",quest:"questId",thread:"thread"};
    if (["lobby","comms","profile"].includes(screen)) { nav(screen); return true; }
    if (screen === "thread" && entityId && live.snapshot.threads.some(t => t.id === entityId)) { nav("thread",{thread:entityId}); loadRoom(entityId).catch(()=>{}); return true; }
    const target = missions.find(m => screen === "mission" ? m.id === entityId : screen === "stage" ? m.stages.some(s => s.id === entityId) : screen === "strategy" ? m.strategies.some(p => p.id === entityId) : screen === "quest" ? m.quests.some(q => q.id === entityId) : false);
    if (target && extras[screen] && entityId) { const extra = {[extras[screen]]:entityId,missionId:target.id}; if (screen === "strategy") extra.stageId=target.strategies.find(p=>p.id===entityId)?.stageId; if (screen === "quest") { const q=target.quests.find(q=>q.id===entityId); extra.stageId=q?.stageId; extra.stratId=q?.strat; } nav(screen,extra); return true; }
    return true;
  }
  if (a === "creation-start" || a === "forge") { openCreation("mission"); return true; }
  if (a === "creation-resume") { resumeCreation(); return true; }
  if (a === "plan-new") { const m=current(); openCreation("plan",{missionId:m?.id,stageId:id}); return true; }
  if (a === "quest-new") { const m=current(); openCreation("quest",{missionId:m?.id,stageId:id,planId:S.screen==="strategy"?S.stratId:undefined}); return true; }
  if (a === "creation-context") { const [kind,scopeId]=String(id||"").split(":");const m=current();ui.context={missionId:m.id,stageId:kind==="stage"?scopeId:kind==="plan"?m.strategies.find(x=>x.id===scopeId)?.stageId:S.stageId,planId:kind==="plan"?scopeId:null};ui.editor=null;ui.error="";render();return true; }
  if (a === "agent-quick") {const room=live.snapshot?.threads.find(t=>t.kind==="agent");if(room){await loadRoom(room.id).catch(()=>{});nav("thread",{thread:room.id});sendRoom(room.id,id);markRoomRead(room.id).catch(()=>{});}return true;}
  if (a.startsWith("creation-")) return creationClick(ui.creation,a,id,{close:()=>{ui.savedCreation=ui.creation;ui.creation=null;render();},render,start:startCreationDraft,publish:publishCreation});
  if (a === "context-close") {ui.context=null;render();return true;}
  if (a === "context-ask") {await askContext(id);return true;}
  if (a === "noop") return true;
  if (a === "onboard-next") { if(ui.onboard.step===0&&!ui.onboard.roles.length)return true;ui.onboard.step=Math.min(2,ui.onboard.step+1);render();return true; }
  if (a === "onboard-prev") { ui.onboard.step=Math.max(0,ui.onboard.step-1); render(); return true; }
  if (a === "onboard-shape") { ui.onboard.botShape=id; render(); return true; }
  if (a === "onboard-name") { ui.onboard.agentName=id; render(); return true; }
  if (a === "onboard-role") { const r=ui.onboard.roles; ui.onboard.roles=r.includes(id)?r.filter(x=>x!==id):r.length<3?[...r,id]:r;render();return true; }
  if (a === "onboard-topic") { ui.onboard.topic=id; render(); return true; }
  if (a === "onboard-pick") { const picks=ui.onboard.picks;ui.onboard.picks=picks.includes(id)?picks.filter(x=>x!==id):[...picks,id];render();return true; }
  if (a === "onboard-finish") { if(!ui.onboard.picks.length)return true;await finishOnboarding();return true; }
  if (a === "editor-close") { ui.editor=null; render(); return true; }
  if (a === "security") { ui.editor="security"; ui.codes=null; ui.error=""; render(); try { await refreshSecurity(); } catch(error) { ui.error=error.message; render(); } return true; }
  if (a === "reauth") { try { await reauthorize(); ui.message="Passkey verified"; render(); } catch(error) { ui.error=error.name==="NotAllowedError"?"Passkey was cancelled.":error.message; render(); } return true; }
  if (a === "passkey-add") { await securityWrite(async()=>{const {options}=await api("/auth/passkeys/options",{method:"POST",body:"{}"});const response=await startRegistration({optionsJSON:options});await api("/auth/passkeys/verify",{method:"POST",body:JSON.stringify({response})});ui.message="Passkey added";}); return true; }
  if (a === "passkey-remove") { await securityWrite(async()=>{await api(`/auth/passkeys/${id}/remove`,{method:"POST",body:"{}"});ui.message="Passkey removed";}); return true; }
  if (a === "recovery-codes") { await securityWrite(async()=>{const result=await api("/auth/recovery-codes",{method:"POST",body:"{}"});ui.codes=result.codes;ui.message="New recovery codes generated";}); return true; }
  if (a === "codes-download") { const blob=new Blob([ui.codes.join("\n")+"\n"],{type:"text/plain"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="joystick-recovery-codes.txt";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true; }
  if (a === "preview-close") { ui.preview=null; render(); return true; }
  if (a === "sheet-close") {ui.sheet=null;render();return true;}
  if (a === "person-team-up") {ui.sheet={kind:"pair",id};render();return true;}
  if (a === "pair-select") {const personId=ui.sheet?.kind==="pair"?ui.sheet.id:null;if(personId){const q=missions.flatMap(m=>m.quests).find(x=>x.id===id);if(q?.claimedBy===live.user?.id){const result=await act("pair.request",id,{userId:personId},"Collaboration request sent");if(result)ui.sheet=null;render();}}return true;}
  if (a === "quest-crew") {ui.sheet={kind:"crew",id};render();return true;}
  if (a === "quest-history") {ui.sheet={kind:"quest-history",id};render();return true;}
  if (a === "quest-inline-edit") {if(ui.questDraft===id&&S.roomTab==="chat"){focusQuestDraft();return true;}if(ui.questDraft!==id){ui.questDraft=id;ui.draft={};ui.questSubmitAttempt=null;}S.roomTab="chat";render();focusQuestDraft();return true;}
  if (a === "quest-inline-cancel") {ui.questDraft=null;ui.draft=null;ui.questSubmitAttempt=null;render();return true;}
  if (a === "wallet-sheet") {ui.sheet={kind:"wallet"};render();return true;}
  if (["mission-prize","mission-trust","mission-ledger"].includes(a)) {ui.sheet={kind:"mission-detail",id,detail:a.slice("mission-".length)};render();return true;}
  if (a === "profile-detail") {ui.sheet={kind:"profile",id};render();return true;}
  if (a === "profile-name-pick") {const input=document.querySelector('#profile-look-form [name="agentName"]');if(input){input.value=id;document.querySelectorAll('.profile-name-picks .chip').forEach(chip=>chip.classList.toggle('selected',chip.dataset.id===id));}return true;}
  if (a === "stage-policy") { ui.sheet={id};render();return true; }
  if (a === "task-requirements") { const q=current()?.quests.find(x=>x.id===id); ui.preview={title:"Task requirements",content:`${q?.brief?.description || q?.title || "Task"}\n\nExpected output: ${q?.out || "A saved artifact describing the work and evidence."}\n\nDependencies: ${(q?.dependencies || []).map(dep=>current()?.quests.find(x=>x.id===dep)?.title || "Task").join(", ") || "None"}\n\nSkills are self declared. Tool preferences do not connect external accounts.`}; render(); return true; }
  if (a === "review-policy") { const p=live.snapshot.policy || {}; ui.preview={title:"Review policy",content:`${p.reviewerRule || "Two distinct registered mission members other than the claimant review each submitted artifact."}\n\nChanges can be requested, then the claimant may submit a new version. The mission owner closes the stage after eligible task reviews. No identity or skill verification is implied.`}; render(); return true; }
  if (a === "run-close") { ui.run=null; ui.runData=null; render(); return true; }
  if (a === "run-history-close") { ui.runHistory=null; render(); return true; }
  if (a === "run-history" || a === "run-history-more") { const navigation=navigationGeneration; try { const query=new URLSearchParams(); if(a==="run-history"&&id)query.set("missionId",id); if(a==="run-history-more"&&id)query.set("cursor",id); const data=await api(`/agent/runs?${query}`); if(navigation!==navigationGeneration)return true; ui.runHistory=a==="run-history-more"?{runs:[...(ui.runHistory?.runs||[]),...data.runs],nextCursor:data.nextCursor}:{...data}; ui.error=""; render(); } catch(error){if(navigation===navigationGeneration){ui.error=error.message;render();}} return true; }
  if (a === "run-open") { ui.run=id; ui.runData=null; await pollRun(id); return true; }
  if (a === "run-cancel") { try { await api(`/agent/runs/${ui.run}/cancel`,{method:"POST",body:JSON.stringify({requestId:crypto.randomUUID()})}); pollRun(ui.run); } catch(error) { ui.error=error.message; render(); } return true; }
  if (a === "agent-decision") { const split=id.indexOf(":"),decisionId=id.slice(0,split),optionId=id.slice(split+1); try { await api(`/agent/runs/${ui.run}/decisions`,{method:"POST",body:JSON.stringify({decisionId,optionId,requestId:crypto.randomUUID()})}); pollRun(ui.run); } catch(error) { ui.error=error.message; render(); } return true; }
  if (a === "draft-edit") { const draft=ui.runData?.drafts.find(d=>d.id===id); if (!draft) return true; const run=ui.runData.run; ui.creation=acceptCreationDraft(ui.creation || beginCreation(draft.kind,{missionId:run.missionId,planId:run.planId}),draft,run); ui.run=null; ui.runData=null; ui.runHistory=null; ui.editor=null; if(run.missionId)S.missionId=run.missionId; if(draft.data.stageId)S.stageId=draft.data.stageId; if(draft.data.planId)S.stratId=draft.data.planId; render(); return true; }
  if (a === "agent-submit") { const artifact=ui.runData?.artifacts.find(x=>x.id===id); if (!artifact) return true; const run=ui.runData.run,m=missions.find(x=>x.id===run.missionId),q=m?.quests.find(x=>x.id===run.questId);if(!q)return true;ui.draft={title:artifact.title,content:artifact.content};ui.questDraft=q.id;ui.questSubmitAttempt=null;ui.runHistory=null;ui.editor=null;S.screen="quest";S.roomTab="chat";S.missionId=m.id;S.stageId=q.stageId;S.stratId=q.strat;S.questId=q.id;render();focusQuestDraft();return true; }
  if (a === "lobby-tab") { S.lobbyTab = id; render(); return true; }
  if (a === "filter") { S.filter = id; render(); return true; }
  if (a === "mission-tab") { S.tab = id; render(); return true; }
  if (a === "quest-tab") { S.roomTab = id; render(); if(id==="chat"){const room=roomFor("quest",S.questId);if(room)markRoomRead(room.id).catch(()=>{});} return true; }
  if (a === "mission") { const m=missions.find(x=>x.id===id); nav("mission", { missionId: id, stageId:m?.stages?.[m.current]?.id, tab: "map" }); return true; }
  if (a === "recap") { nav("recap",{recapId:id,missionId:id}); return true; }
  if (a === "person") { nav("person",{personId:id}); return true; }
  if (a === "stage" || a === "open-stage") { const m=missions.find(x=>x.stages.some(s=>s.id===id)); if(m)nav("stage", { missionId:m.id, stageId:id }); return true; }
  if (a === "plan") { const m = missions.find(x => x.strategies.some(p => p.id === id)), p=m.strategies.find(x=>x.id===id); nav("strategy", { missionId: m.id, stageId:p.stageId, stratId: id }); return true; }
  if (a === "quest") { const m = missions.find(x => x.quests.some(q => q.id === id)), q=m.quests.find(x=>x.id===id), room=roomFor("quest",id),navigation=navigationGeneration,account=live.user,generation=accountGeneration,opening=++questOpenSequence;const [latest]=await Promise.all([q.claimedBy===live.user?.id&&["claimed","changes_requested"].includes(q.state)?api(`/agent/runs?questId=${encodeURIComponent(id)}&limit=1`).then(x=>x.runs?.[0]).catch(()=>null):Promise.resolve(null),room?loadRoom(room.id).catch(()=>{}):Promise.resolve()]);if(opening!==questOpenSequence||navigation!==navigationGeneration||account!==live.user||generation!==accountGeneration||!S.live)return true; S.roomTab="chat";nav("quest", { missionId: m.id, stageId:q.stageId, stratId:q.strat, questId: id });if(latest){ui.run=latest.id;ui.runData={run:latest,drafts:[],artifacts:[],decisions:[]};render();pollRun(latest.id);}if(room)markRoomRead(room.id).catch(()=>{}); return true; }
  if (a === "thread") { await loadRoom(id).catch(error => ui.error = error.message); nav("thread", { thread: id }); markRoomRead(id).catch(()=>{}); return true; }
  if (a === "room") { const [k, scopeId] = id.split(":"); let r = roomFor(k, scopeId); if (!r) { await act("room.create", null, {kind:k,scopeId}, "Room opened"); r = roomFor(k, scopeId); } if (r) { await loadRoom(r.id).catch(error => ui.error = error.message); nav("thread", { thread:r.id }); markRoomRead(r.id).catch(()=>{}); } return true; }
  if (a === "join") { const m=missions.find(x=>x.id===id); if(m){S.missionId=m.id;S.stageId=m.stages[m.current]?.id;} ui.editor="join"; S.editId=id; render(); return true; }
  if (a === "dm") { await act("room.create", null, {kind:"dm",userId:id}, "Chat opened"); const room=live.snapshot.threads.find(t=>t.kind==="dm" && t.peerId===id); if (room) { await loadRoom(room.id); nav("thread",{thread:room.id}); } else nav("comms"); return true; }
  if (a === "voice") { await act("mission.voice", id, {}, "Your voice was added"); return true; }
  if (a === "need-support") { await act("need.support", id, {}, "You support this need"); return true; }
  if (a === "plan-join") { await act("plan.join", id, {}, "Joined plan"); return true; }
  if (a === "plan-back") { ui.editor="back"; S.editId=id; render(); return true; }
  if (a === "plan-approve") { await act("plan.approve",id,{},"Plan approved"); return true; }
  if (a === "merge-approve" || a === "merge-dismiss") { await act(a==="merge-approve"?"merge.decide":"merge.dismiss",id,{},"Merge decision saved"); return true; }
  if (a === "quest-claim") { await act("quest.claim", id, {}, "Task claimed"); return true; }
  if (a === "quest-watch") { await act("quest.watch", id, {}, "You will get updates"); return true; }
  if (a === "notification") { await act("notification.read",id,{},"Marked read"); const n=live.snapshot.notifications.find(x=>x.id===id); if (n?.entityId) { const m=missions.find(x=>x.quests.some(q=>q.id===n.entityId)); if(m){S.roomTab="chat";nav("quest",{missionId:m.id,questId:n.entityId});} } return true; }
  if (a === "invite-accept" || a === "invite-decline") { await act(a==="invite-accept"?"invite.accept":"invite.decline",id,{},"Invite updated"); return true; }
  if (a === "pair") { const q=current()?.quests.find(x=>x.id===id); if (q?.claimedBy) await act("pair.request", id, {userId:q.claimedBy}, "Pair request sent"); return true; }
  if (a === "quest-release") { await act("quest.release", id, {}, "Task released"); return true; }
  if (a === "stage-approve") { await act("stage.approve", id, {}, "Stage approved"); return true; }
  if (a === "stage-advance") { const result=await act("stage.advance", id, {}, "Next stage opened"); if(result){const m=missions.find(x=>x.id===id), next=m&&currentStage(m);if(next){ui.error="";ui.message="";go("stage",{missionId:id,stageId:next.id,stratId:null,questId:null},false);}} return true; }
  if (a === "quest-decision") { await act("quest.decide", id, {choice:b.textContent.trim()}, "Decision saved"); return true; }
  if (a === "agent-mission") { openCreation("mission"); return true; }
  if (a === "agent-plan") { openCreation("plan",{missionId:current().id,stageId:id}); return true; }
  if (a === "agent-quest") { const p=current().strategies.find(x=>x.id===id);openCreation("quest",{missionId:current().id,stageId:p?.stageId,planId:id}); return true; }
  if (a === "agent-execute") { const q=current().quests.find(x=>x.id===id); if (q) await startRun("quest-execute", `Work on this task: ${q.title}`, {missionId:current().id,...(q.strat?{planId:q.strat}:{}),questId:id}); return true; }
  if (a === "agent-context") { await startRun("context-chat",`Explain the recorded history and next steps for ${current().title}. Separate illustrative workbook examples from live actions.`,{missionId:id}); return true; }
  if (a === "artifact" || a === "artifact-download") { const navigation=navigationGeneration; try { const response = await fetch(new URL(`/api/v1/game/artifacts/${id}`, apiOrigin), { credentials:"include", cache:"no-store" }); if (!response.ok) throw new Error("Artifact could not be opened"); const text = await response.text(); if (a === "artifact") { if(navigation!==navigationGeneration)return true; ui.sheet=null; ui.preview={title:"Submitted artifact",content:text}; render(); } else { const blob = new Blob([text], {type:"text/plain"}); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href=url; link.download="artifact.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); } } catch (error) { if(navigation===navigationGeneration){ui.error=error.message;render();} } return true; }
  if (a === "export" || a === "export-csv") { try { let blob,name; if(a==="export-csv"){ const response=await fetch(new URL("/api/v1/game/credits.csv",apiOrigin),{credentials:"include",cache:"no-store"}); if(!response.ok) throw new Error("Export unavailable"); blob=await response.blob(); name="joystick-test-credits.csv"; } else { blob=new Blob([JSON.stringify({kind:"test-credits",exportedAt:new Date().toISOString(),userId:live.user.id,wallet:live.snapshot.wallet},null,2)],{type:"application/json"}); name="joystick-test-credits.json"; } const url=URL.createObjectURL(blob), link=document.createElement("a"); link.href=url; link.download=name; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); ui.message="Credits exported"; render(); } catch(error){ui.error=error.message;render();} return true; }
  if (a === "payout") { await act("payout.simulate",id,{},"Payout recorded"); return true; }
  if (a === "tool-toggle") { await act("tool.preference",null,{key:id,enabled:!S.preferences.tools?.[id]},"Tool preference saved"); return true; }
  if (a === "signout") { await signOut(async () => { applySnapshot(await loadGame()); render(); }, resetAccountUI); return true; }
  if (a === "fund") {const pending=ui.fundAttempt?.uncertain?ui.fundAttempt:null;ui.fundAttempt=pending||{missionId:id,amount:null,requestId:null,uncertain:false};ui.editor="fund";ui.draft={};S.editId=ui.fundAttempt.missionId;ui.error=pending&&pending.missionId!==id?"Confirm the previous reservation before starting another.":"";render();return true;}
  if (["forge", "mission-edit", "plan-new", "plan-edit", "quest-new", "quest-edit", "quest-submit", "quest-review", "profile-edit", "pledge", "invite", "need", "stage-new", "merge", "nudge", "flag", "skill", "tools"].includes(a)) { ui.sheet=null; ui.editor=a; ui.draft={}; S.editId=id; render(); return true; }
  return true;
}

export async function handleLiveSubmit(event) {
  const formEl = event.target;
  if(formEl.id==="profile-look-form") {const values=Object.fromEntries(new FormData(formEl).entries());await act("profile.update",null,{agentName:values.agentName,preferences:{...S.preferences,botShape:values.botShape}},"Name and look saved");return;}
  if(formEl.id==="profile-role-form") {const roles=new FormData(formEl).getAll("roles");if(roles.length>3){ui.error="Choose up to three roles.";render();return;}await act("profile.update",null,{roles},"Roles saved");return;}
  if(formEl.id==="quest-inline-submit") {const q=current()?.quests.find(x=>x.id===ui.questDraft);if(!q||q.claimedBy!==live.user?.id||(!ui.questSubmitAttempt?.uncertain&&!["claimed","changes_requested"].includes(q.state)))return;const values=ui.questSubmitAttempt?.uncertain?ui.questSubmitAttempt.payload:Object.fromEntries(new FormData(formEl).entries());ui.draft=values;if(new TextEncoder().encode(values.content||"").length>262144){ui.error="Artifact text must be 256 KB or less.";render();return;}const attempt=ui.questSubmitAttempt?.uncertain?ui.questSubmitAttempt:{questId:q.id,payload:{title:values.title,content:values.content},requestId:crypto.randomUUID(),uncertain:false};ui.questSubmitAttempt=attempt;const result=await act("quest.submit",q.id,attempt.payload,"Work submitted for review",attempt.requestId);if(result){ui.questDraft=null;ui.questSubmitAttempt=null;ui.draft=null;ui.run=null;ui.runData=null;render();}else{attempt.uncertain=ui.lastActionUncertain;if(!attempt.uncertain)ui.questSubmitAttempt=null;render();}return;}
  if(formEl.id==="context-composer") {const text=formEl.elements.text.value.trim();if(!text)return;const scope=formEl.dataset.scope;if(scope){const [kind,scopeId]=scope.split(":"),m=current();ui.context={missionId:m.id,stageId:kind==="stage"?scopeId:m.strategies.find(x=>x.id===scopeId)?.stageId,planId:kind==="plan"?scopeId:null};}await askContext(text);return;}
  if(formEl.classList.contains("decision-own")) { const answer=formEl.elements.answer.value.trim(); if(!answer||!ui.run)return; try { await api(`/agent/runs/${ui.run}/decisions`,{method:"POST",body:JSON.stringify({decisionId:formEl.dataset.decision,optionId:"own_words",answer,requestId:crypto.randomUUID()})}); formEl.elements.answer.value=""; pollRun(ui.run); } catch(error) { ui.error=error.message; render(); } return; }
  if(formEl.id==="creation-composer") { const text=formEl.elements.text.value.trim();formEl.elements.text.value="";await creationSubmit(ui.creation,text,{render,start:startCreationDraft});return; }
  if (formEl.id === "live-composer") { const text = formEl.elements.text.value.trim(); if (!text) return; formEl.elements.text.value=""; const [k, id] = formEl.dataset.scope.split(":"); let room = k === "id" ? live.snapshot.threads.find(t => t.id === id) : roomFor(k,id); if (!room && k !== "id") { await act("room.create", null, {kind:k,scopeId:id}); room=roomFor(k,id); } if (room) { await loadRoom(room.id).catch(() => {}); sendRoom(room.id,text); if(k!=="id"&&k!=="quest") nav("thread",{thread:room.id}); } else { ui.error="Room unavailable"; render(); } return; }
  const values = Object.fromEntries(new FormData(formEl).entries()), lines = x => String(x || "").split("\n").map(y => y.trim()).filter(Boolean);
  ui.draft = {...values};
  if (formEl.id === "forge-form") ui.draft = {...values, stages:lines(values.stages), rules:lines(values.rules), roles:lines(values.roles)};
  if (formEl.id === "quest-form") ui.draft.dependencies = new FormData(formEl).getAll("dependencies");
  const editor = ui.editor, id = S.editId; let result;
  const priorMissionIds = new Set(missions.map(m => m.id));
  if (editor === "forge") result = await act("mission.create", null, { title:values.title,pitch:values.pitch,tag:values.tag,team:values.team,roles:lines(values.roles),bounty:Number(values.bounty)||0,stages:lines(values.stages).map(line => { const [name,goal,target] = line.split("|").map(x=>x.trim()); return {name,goal:goal || name,target:Math.max(1,Number(target)||1)}; }),rules:lines(values.rules) }, "Mission published");
  if (editor === "mission-edit") result = await act("mission.update", id, {title:values.title,pitch:values.pitch,tag:values.tag,team:values.team,roles:lines(values.roles),bounty:Number(values.bounty)||0}, "Mission saved");
  if (editor === "plan-new") result = await act("plan.create", id, {name:values.name,squad:values.squad,bet:values.bet}, "Plan published");
  if (editor === "plan-edit") result = await act("plan.update", id, {name:values.name,squad:values.squad,bet:values.bet}, "Plan saved");
  if (editor === "quest-new") { if(values.callPrompt && lines(values.callOptions).length < 2){ui.error="Add at least two choices for the decision prompt.";render();return;} result = await act("quest.create", id, {title:values.title,description:values.description,role:values.role,size:values.size,planId:values.planId || undefined,parentId:values.parentId || undefined,dependencies:new FormData(formEl).getAll("dependencies"),call:values.callPrompt ? {q:values.callPrompt,opts:lines(values.callOptions)} : undefined,rewardCredits:Number(values.rewardCredits)||0}, "Task published"); }
  if (editor === "quest-edit") result = await act("quest.update", id, {title:values.title,description:values.description,planId:values.planId||null,parentId:values.parentId||null,dependencies:new FormData(formEl).getAll("dependencies"),rewardCredits:Number(values.rewardCredits)||0}, "Task saved");
  if (editor === "quest-submit") { if (new TextEncoder().encode(values.content || "").length > 262144) { ui.error="Artifact text must be 256 KB or less.";render();return; } result = await act("quest.submit", id, {title:values.title,content:values.content}, "Work submitted for review"); }
  if (editor === "quest-review") result = await act("quest.review", id, {verdict:values.verdict,note:values.note}, "Review saved");
  if (editor === "profile-edit") result = await act("profile.update", null, {agentName:values.agentName,roles:new FormData(formEl).getAll("roles"),skills:lines(values.skills),preferences:{...S.preferences,botShape:values.botShape,toolLinks:lines(values.toolLinks)}}, "Profile saved");
  if (editor === "fund") {const attempt=ui.fundAttempt||{missionId:id,amount:null,requestId:null,uncertain:false};ui.fundAttempt=attempt;if(attempt.missionId!==id){ui.error="Confirm the previous reservation first.";render();return;}const amount=attempt.uncertain?attempt.amount:Number(values.amount);if(!Number.isSafeInteger(amount)||amount<1){ui.error="Choose a whole credit amount above zero.";render();return;}attempt.amount=amount;attempt.requestId ||= crypto.randomUUID();result=await act("funding.reserve",id,{amount},"Credits reserved",attempt.requestId);if(!result){attempt.uncertain=ui.lastActionUncertain;if(!attempt.uncertain)attempt.requestId=null;render();return;}ui.fundAttempt=null;}
  if (editor === "back") result = await act("plan.back",id,{testCredits:Number(values.testCredits)||0},"Plan backed");
  if (editor === "pledge") result = await act("pledge.create", id, {kind:values.kind,amount:Number(values.amount),note:values.note}, "Contribution saved");
  if (editor === "invite") result = await act("invite.create", id, {email:values.email}, "Invite saved");
  if (editor === "need") result = await act("need.create", id, {title:values.title,detail:values.detail}, "Need saved");
  if (editor === "stage-new") result = await act("stage.create", id, {name:values.name,goal:values.goal,target:Number(values.target)}, "Stage added");
  if (editor === "merge") result = await act("merge.propose", id, {targetPlanId:values.targetPlanId,reason:values.reason}, "Merge proposed");
  if (editor === "nudge") result = await act("quest.nudge", id, {message:values.message}, "Nudge sent");
  if (editor === "flag") result = await act("spend.flag", id, {reason:values.reason}, "Concern saved");
  if (editor === "skill") result = await act("skill.assert", null, {skill:values.skill}, "Skill added as self declared");
  if (editor === "join") { const roles=new FormData(formEl).getAll("roles"); const updated=await act("profile.update",null,{roles},"Roles saved"); if(updated)result=await act("mission.join",id,{},"Joined mission"); }
  if (editor === "agent-prompt") { await startRun(ui.agentKind, values.prompt, ui.agentIds || {}); return; }
  if (result) { ui.editor=null; ui.draft=null; if(editor==="quest-submit"){ui.run=null;ui.runData=null;} if (editor === "forge") { const created = live.snapshot.missions.find(m => !priorMissionIds.has(m.id) && m.ownerId === live.user.id); if (created) { S.missionId = created.id; S.stageId=created.stages?.[0]?.id; } S.screen="mission"; S.tab="map"; } render(); }
}
