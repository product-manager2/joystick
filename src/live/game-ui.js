import { missions, ROLES } from "../data/content.js";
import { S, threads } from "../state.js";
import { mapView } from "../screens/missions.js";
import { go, render } from "../ui/chrome.js";
import { backBtn, botAv, esc, fmt, glyph, mono } from "../ui/helpers.js";
import { api, apiOrigin, gameAction, live, loadGame, signOut } from "./game-client.js";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { connectRooms, loadRoom, onRoomsChanged, roomState, resetRooms, sendRoom } from "./room-chat.js";

const ui = { busy: false, error: "", draft: null, editor: null, room: null, message: "", agentBusy: false, run: null, runData: null, preview: null, security: null, codes: null, onboard: null };
onRoomsChanged(() => { if (S.live && !ui.editor && !ui.preview && !ui.run && !ui.runHistory && !document.activeElement?.closest("form") && ["thread", "quest", "stage", "strategy", "mission"].includes(S.screen)) render(); });
const current = () => missions.find(m => m.id === S.missionId) || missions[0];
const stage = m => m?.stages?.find(x => x.id === S.stageId) || m?.stages?.[m.current];
const plan = m => m?.strategies?.find(p => p.id === S.stratId);
const quest = m => m?.quests?.find(q => q.id === S.questId);
const label = () => live.snapshot?.wallet?.label || "Test credits only";
const row = (icon, title, sub, action, id, suffix = "›") => `<button class="card qitem" data-live="${action}" data-id="${esc(id || "")}">${icon}<span style="min-width:0;flex:1"><b class="qt">${esc(title)}</b><span class="small muted" style="display:block">${esc(sub || "")}</span></span><span class="qstat">${suffix}</span></button>`;
const form = (id, title, fields, button = "Save") => `<form class="card live-form" id="${id}"><h2 class="sec-title">${esc(title)}</h2>${fields}<button class="btn red block" type="submit" ${ui.busy ? "disabled" : ""}>${esc(button)}</button></form>`;
const field = (name, labelText, value = "", type = "text", extra = "") => `<label class="field" for="f-${name}"><span>${esc(labelText)}</span>${type === "textarea" ? `<textarea class="inp" id="f-${name}" name="${name}" ${extra}>${esc(value)}</textarea>` : `<input class="inp" id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`}</label>`;
const message = () => ui.error ? `<p class="live-form-error" role="alert">${esc(ui.error)}</p>` : ui.message ? `<p class="small ok" role="status">${esc(ui.message)}</p>` : "";
const button = (text, action, id = "", cls = "btn sm") => `<button type="button" class="${cls}" data-live="${action}" data-id="${esc(id)}" ${ui.busy ? "disabled" : ""}>${esc(text)}</button>`;
const kind = k => ({ mission: "Mission", stage: "Stage", plan: "Plan", quest: "Task", agent: "Agent", dm: "Person" })[k] || "Chat";
const roomFor = (k, id) => live.snapshot?.threads?.find(t => t.kind === k && (k === "agent" || t.scopeId === id));
const roomTitle = t => { if (t.kind === "agent") return S.agentName; if (t.kind === "dm") return t.peerName || t.title; const m=missions.find(x=>x.id===t.scopeId||x.stages.some(s=>s.id===t.scopeId)||x.strategies.some(p=>p.id===t.scopeId)||x.quests.some(q=>q.id===t.scopeId)); return t.kind==="mission"?m?.title||t.title:t.kind==="stage"?m?.stages.find(s=>s.id===t.scopeId)?.name||t.title:t.kind==="plan"?m?.strategies.find(p=>p.id===t.scopeId)?.name||t.title:m?.quests.find(q=>q.id===t.scopeId)?.title||t.title; };
const taskTree = qs => { const ids=new Set(qs.map(q=>q.id)); const visit=(q,depth=0)=>`${row(`<span style="padding-left:${depth*16}px">${depth?"↳ ":""}${mono(ROLES[q.role]?q.role:"user",30)}</span>`,q.title,q.done?"Approved":q.state,"quest",q.id,q.done?"✓":"›")}${qs.filter(x=>x.parent===q.id).map(x=>visit(x,depth+1)).join("")}`; return qs.filter(q=>!q.parent||!ids.has(q.parent)).map(q=>visit(q)).join(""); };
function resetAccountUI() {
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
    creator: m.creator || (m.ownerId ? "Mission creator" : "Pilot catalog"),
    bounty: m.bounty || 0, squads: m.strategies?.length || 0,
    target: m.stages?.[m.current]?.gateTarget || 1, unit: "approved tasks",
    news: [],
    merges: (m.merges || []).map(x => ({...x, sourcePlanId:x.sourcePlanId || x.source_plan_id, targetPlanId:x.targetPlanId || x.target_plan_id})),
    strategies: (m.strategies || []).map(p => ({ ...p, lead: p.creatorId ? (snapshot.people || []).find(x => x.id === p.creatorId)?.name || "Member" : "Pilot catalog", status: p.status === "active" ? null : p.status })),
    quests: (m.quests || []).map(q => ({ ...q, mine: q.claimed, claimed: q.claimedBy && !q.claimed ? [(snapshot.people || []).find(x => x.id === q.claimedBy)?.name || "Member", "active"] : null,
      state: q.state, gain: q.brief?.gain || 0, out: q.out || q.brief?.out || "", log: q.log || [], call: q.call || null,
      feed: [], proof: [], rv: (q.reviews || []).map(r => ({ n: (snapshot.people || []).find(x => x.id === r.reviewer_id)?.name || "Reviewer", st: r.verdict === "approve" ? "ok" : "changes" })) })),
  }));
  missions.splice(0, missions.length, ...mapped);
  S.squads = Object.fromEntries(missions.flatMap(m => m.strategies.filter(p => p.joined).map(p => [m.id, p.id])));
  S.credits = missions.flatMap(m => m.quests.filter(q => q.done && q.claimedBy === live.user?.id).map(q => ({ m: m.id, what: q.title, out: q.artifacts?.at(-1)?.title || "" })));
  threads.splice(0, threads.length, ...(snapshot.threads || []).map(t => ({ ...t, msgs: [] })));
  if (!missions.some(m => m.id === oldMission)) S.missionId = missions[0]?.id;
  const previouslySetUp = S.preferences.onboarded || S.roles.length > 0 || !!S.preferences.botShape;
  if (!previouslySetUp && !ui.onboard) ui.onboard={step:0,agentName:S.agentName,botShape:S.botShape,roles:[...S.roles],picks:[]};
  if (previouslySetUp) {ui.onboard=null;if(S.screen === "onboard") S.screen="lobby";}
  else S.screen="onboard";
  connectRooms();
}

let refreshPending = false;
async function refreshGame() {
  if (!S.live || !live.user || ui.busy || refreshPending || document.visibilityState === "hidden") return;
  refreshPending = true;
  try {
    const snapshot = await api("/game");
    if (!S.live || !live.user || ui.busy || snapshot.revision <= (live.snapshot?.revision || 0)) return;
    live.snapshot = snapshot;
    applySnapshot(snapshot);
    const editing = ui.editor || ui.preview || ui.run || ui.runHistory || document.activeElement?.closest("form");
    if (!editing) render();
  } catch { /* The next refresh or explicit action retries after a transient outage. */ }
  finally { refreshPending = false; }
}
setInterval(refreshGame, 5000);
window.addEventListener("focus", refreshGame);

async function act(action, id, payload = {}, success = "Saved") {
  if (ui.busy) return;
  ui.busy = true; ui.error = "";
  try { const result = await gameAction(action, id, payload); applySnapshot(result.snapshot || live.snapshot); ui.message = success; return result; }
  catch (error) { ui.error = error.message; return null; }
  finally { ui.busy = false; render(); }
}
const nav = (screen, extra = {}) => { ui.error = ""; ui.message = ""; go(screen, extra); };
const tabs = (choices, selected, action) => `<div class="roomtabs" role="tablist">${choices.map(([id, title]) => `<button role="tab" data-live="${action}" data-id="${id}" aria-selected="${selected === id}">${title}</button>`).join("")}</div>`;
const stageProgress = (m, s = m.stages[m.current]) => { const qs=m.quests.filter(q => q.stageId === s?.id); return `${qs.filter(q => q.done).length}/${qs.length} tasks approved`; };
function onboardView() {
  const o=ui.onboard||{step:0,agentName:S.agentName,botShape:"blob",roles:[],picks:[]};
  const shapes=[["blob","Calm"],["cube","Steady"],["cone","Curious"],["star","Bright"],["drop","Quick"],["pill","Helpful"]];
  let body="";
  if(o.step===0)body=`<div class="sunbox"><div class="logo">Joystick</div>${botAv("av big",true)}<h1 class="cup">Change the world. Multiplayer.</h1><p>Team up, choose a mission, and build something useful with your agent.</p></div><div class="card milestone"><h2 class="sec-title">Welcome, ${esc(S.name)}.</h2><p>Your decisions and work will be saved to your account. Example missions are labeled. Credits are a test simulation.</p></div>${button("Make our team","onboard-next","","btn red block")}`;
  if(o.step===1)body=`<div class="sunbox">${botAv("av big",true)}<h1 class="cup">Meet your agent</h1><p>Pick a name and look. You can change them later.</p></div>${form("onboard-agent","Your partner",field("agentName","Agent name",o.agentName,"text","required maxlength=60")+`<div class="eyebrow">Look</div><div class="chips wrap">${shapes.map(([id,title])=>`<button type="button" class="chip" data-live="onboard-shape" data-id="${id}" aria-pressed="${o.botShape===id}">${title}</button>`).join("")}</div>`,"Next")}`;
  if(o.step===2)body=`<div class="sunbox"><h1 class="cup">How will you play?</h1><p>Pick up to three roles that fit you.</p></div><div class="card milestone"><div class="mini-roles">${Object.entries(ROLES).filter(([,r])=>!r.auto).map(([id,r])=>`<button class="chip" data-live="onboard-role" data-id="${id}" aria-pressed="${o.roles.includes(id)}">${esc(r.name)}</button>`).join("")}</div></div>${button("Choose missions","onboard-next","","btn red block")}`;
  if(o.step===3)body=`<div class="sunbox"><h1 class="cup">Find a mission</h1><p>Pick a few to follow now, or choose later.</p></div><div class="list">${missions.slice(0,8).map(m=>`<button class="card poster" data-live="onboard-pick" data-id="${m.id}" aria-pressed="${o.picks.includes(m.id)}"><div class="band" style="background:${esc(m.color)}">${glyph(m)}<h3>${esc(m.title)}</h3></div><div class="body"><p class="small">${esc(m.pitch)}</p>${m.seedNotice?`<p class="small muted">Illustrative workbook mission</p>`:""}<span class="chip">${o.picks.includes(m.id)?"✓ Selected":"Select"}</span></div></button>`).join("")}</div>${button("Start playing","onboard-finish","","btn red block")}`;
  return `<div class="onboard">${body}${o.step>0?button("Back","onboard-prev"):""}${button("Skip setup","onboard-skip","","linkbtn")}${message()}</div>`;
}

function lobby() {
  const mine = missions.filter(m => m.joined), others = missions.filter(m => !m.joined && (S.filter === "All" || m.tag === S.filter));
  const tab = S.lobbyTab || (mine.length ? "mine" : "explore");
  const cards = list => list.map(m => `<button class="card poster" data-live="mission" data-id="${m.id}"><div class="band" style="background:${esc(m.color)}">${glyph(m)}<h3>${esc(m.title)}</h3></div><div class="body"><p class="small">${esc(m.pitch)}</p><div class="pfacts"><span><b>${m.players}</b>people</span><span><b>${m.current + 1} of ${m.stages.length}</b>stage</span><span><b>${esc(m.tag)}</b>topic</span></div>${m.seedNotice ? `<p class="small muted">${esc(m.seedNotice)}</p>` : ""}</div></button>`).join("");
  return `<div class="screen"><div class="row"><h2 class="sec-title">Missions</h2><span class="spacer"></span>${button("+ New", "forge")}</div>${tabs([["mine", `Mine · ${mine.length}`], ["explore", "Explore"]], tab, "lobby-tab")}${tab === "mine" ? `<div class="list">${cards(mine) || '<p class="muted small">Join a mission to keep it here.</p>'}</div>` : `<div class="chips">${["All", "Science", "Product", "Planet", "Education", "Community"].map(t => `<button class="chip" data-live="filter" data-id="${t}" aria-pressed="${S.filter === t}">${t}</button>`).join("")}</div><div class="list">${cards(others) || '<p class="muted small">No missions in this topic yet.</p>'}</div><h2 class="sec-title">Illustrative outcomes</h2><div class="list">${missions.filter(m=>m.sample?.finished).map(m=>row(glyph(m),m.title,`Workbook example · ${m.sample.finished.Outcome}`,"recap",m.id)).join("") || '<p class="small muted">No example outcomes.</p>'}</div>`}${message()}</div>`;
}

function missionView() {
  const m = current(); if (!m) return lobby();
  const t = S.tab || "map", s = stage(m);
  let body = "";
  if (t === "map") body = `<div class="card milestone"><div class="eyebrow">The mission</div><p class="claim">${esc(m.pitch)}</p><div class="small muted">${m.seedNotice ? esc(m.seedNotice) : ""}</div></div>${mapView(m).replace(/data-a="stage" data-x="(\d+)"/g, (_, i) => `data-live="stage" data-id="${m.stages[Number(i)].id}"`).replace(/data-a="strategy" data-x="([^"]+)"/g, (_, id) => `data-live="plan" data-id="${id}"`)}`;
  if (t === "squads") body = `<div class="row"><div class="eyebrow">Plans for this stage</div><span class="spacer"></span>${m.joined ? button("+ Plan", "plan-new", s?.id) : ""}</div><div class="list">${m.strategies.filter(p => p.status !== "merged").map(p => row(`<span class="sbadge" style="background:${esc(p.color)}">${esc(p.name.slice(0, 2))}</span>`, p.name, `${p.squad} · ${p.score} approved tasks`, "plan", p.id)).join("") || '<p class="small muted">No plan yet. Start one for this stage.</p>'}</div>`;
  if (t === "fuel") body = `<div class="card milestone"><div class="eyebrow">${label()}</div><p class="small">Available: ${live.snapshot.wallet.available} · reserved: ${live.snapshot.wallet.reserved}</p><p class="small muted">Credits are a pilot simulation. They have no cash value and do not represent escrow, income, or ownership.</p>${m.joined && live.snapshot.wallet.enabled ? button("Reserve test credits", "fund", m.id, "btn gold") : ""}</div><div class="eyebrow">Contributions</div><div class="list">${m.pledges.map(p => row("♥", `${p.amount} ${p.kind}`, p.note, "noop", "")).join("") || '<p class="muted small">No contributions yet.</p>'}</div>${m.joined ? button("Add time or compute", "pledge", m.id) : ""}`;
  if (t === "rules") body = `<div class="card milestone"><div class="eyebrow">What counts as a win</div><ul class="checks">${m.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ul><div class="eyebrow">Team needed</div><p class="small">${esc(m.team || "Members can join and choose a plan.")}</p><div class="row wrap">${(m.roles || []).map(r=>`<span class="chip">${esc(ROLES[r]?.name || r)}</span>`).join("")}</div><p class="small muted">${esc(live.snapshot.trust?.policy || "")}</p>${m.seedNotice ? `<p class="small muted">${esc(m.seedNotice)}</p>` : ""}</div><div class="card milestone"><div class="eyebrow">Who needs this</div><p class="small">${m.voices || 0} voices</p><div class="list">${m.needs.map(n => row("♥", n.title, `${n.supporters} supporters · ${n.detail}`, "need-support", n.id, n.supported ? "✓" : "+1")).join("") || '<p class="small muted">No needs recorded yet.</p>'}</div><div class="row wrap">${!m.voiced ? button("Add your voice", "voice", m.id) : '<span class="chip">✓ Your voice is counted</span>'}${m.joined ? button("Describe a need", "need", m.id) : ""}</div></div><div class="card milestone"><div class="eyebrow">Plan merge proposals</div>${m.merges?.map(x=>`<div class="drow"><span>${esc(m.strategies.find(p=>p.id===x.sourcePlanId)?.name||"Plan")} → ${esc(m.strategies.find(p=>p.id===x.targetPlanId)?.name||"Plan")}</span><span class="small">${esc(x.status)}</span>${m.ownerId===live.user?.id&&x.status==="pending"?`${button("Approve","merge-approve",x.id)}${button("Dismiss","merge-dismiss",x.id)}`:""}</div>`).join("") || '<p class="small muted">No merge suggestions yet.</p>'}</div><div class="row wrap">${m.joined ? button("Mission chat", "room", `mission:${m.id}`) : ""}${m.joined ? button("Invite member", "invite", m.id) : ""}${m.ownerId === live.user?.id ? button("Edit mission", "mission-edit", m.id) : ""}${m.ownerId === live.user?.id ? button("Add stage", "stage-new", m.id) : ""}${m.joined ? button("Flag spending concern", "flag", m.id) : ""}</div>`;
  if (t === "rules" && m.sample?.people?.length) body += `<div class="card milestone"><div class="eyebrow">Illustrative squad examples</div><p class="small muted">These workbook characters are not registered members or available to message.</p>${m.sample.people.slice(0,8).map(p=>`<div class="drow"><b>${esc(p.Name||"Example")}</b><span class="small muted">${esc(p["Main role"]||"")} · ${esc(p.City||"")}</span></div>`).join("")}</div>`;
  return `<div class="screen"><div class="card mhead"><div class="band" style="background:${esc(m.color)}">${backBtn("back", "lobby")}${glyph(m)}<span class="mtitle"><span class="kind kind-mission">Mission</span><h1>${esc(m.title)}</h1></span></div><div class="in"><div class="small">${m.players} people · Stage ${m.current + 1} of ${m.stages.length} · ${stageProgress(m)}</div>${m.bounty ? `<div class="small muted">Test credit goal: ${m.bounty}. ${label()}; no funds are held.</div>` : ""}<div class="row wrap">${m.joined ? '<span class="chip">✓ Joined</span>' : button("Join mission", "join", m.id, "btn red")}${button("Story & outputs", "recap", m.id)}</div></div></div>${tabs([["map", "Map"], ["squads", "Plans"], ["fuel", "Credits"], ["rules", "About"]], t, "mission-tab")}${body}${m.joined ? `<div class="sticky-cta">${button(`Open stage ${m.current + 1} →`, "open-stage", m.stages[m.current]?.id, "btn blue block")}</div>` : ""}${message()}</div>`;
}

function stageView() {
  const m = current(), s = stage(m); if (!m || !s) return lobby();
  const qs = m.quests.filter(q => q.stageId === s.id);
  const allDone = qs.every(q => q.done);
  return `<div class="chat"><div class="chat-head">${backBtn("back", "mission")}${glyph(m)}<div><div class="where"><span class="kind kind-stage">Stage</span>${esc(m.title)}</div><div class="display chan-name">${esc(s.name)}</div></div></div><div class="stage-list"><div class="card milestone"><div class="eyebrow">Stage ${s.ordinal + 1} goal</div><div class="mgoal">${esc(s.goal)}</div><div class="small muted">Pilot outcome target: ${s.target} ${esc(s.unit)} · ${stageProgress(m,s)}</div>${button("How stage approval works", "stage-policy", s.id)}</div><div class="row"><div class="eyebrow">Plans and tasks</div><span class="spacer"></span>${m.joined && s.status === "active" ? button("+ Plan", "plan-new", s.id) : ""}</div><div class="list">${m.strategies.filter(p => p.stageId === s.id && p.status !== "merged").map(p => row(`<span class="sbadge" style="background:${esc(p.color)}">${esc(p.name.slice(0, 2))}</span>`, p.name, `${p.squad} · ${p.score} approved`, "plan", p.id)).join("")}</div><div class="eyebrow">Tasks outside a plan</div><div class="list">${taskTree(qs.filter(q=>!q.strat)) || '<p class="small muted">No unplanned tasks.</p>'}</div><div class="row wrap">${m.joined && s.status === "active" ? button("+ Task", "quest-new", s.id) : ""}${m.joined ? button("Stage chat", "room", `stage:${s.id}`) : ""}${m.joined && s.status === "active" ? button("Ask agent for a plan", "agent-plan", s.id) : ""}${m.joined ? button("Agent run history", "run-history", m.id) : ""}</div>${m.ownerId === live.user?.id && allDone && qs.length >= (s.gateTarget||1) && s.status === "active" ? button("Approve completed stage", "stage-approve", s.id, "btn red block") : ""}${m.ownerId === live.user?.id && s.status === "approved" && m.current < m.stages.length - 1 ? button("Advance to next stage", "stage-advance", m.id, "btn red block") : ""}</div>${composer(`stage:${s.id}`)}${message()}</div>`;
}

function planView() {
  const m = current(), p = plan(m), s = stage(m); if (!p) return stageView();
  const qs = m.quests.filter(q => q.strat === p.id);
  return `<div class="chat"><div class="chat-head">${backBtn("back", "stage")}<span class="sbadge" style="background:${esc(p.color)}">${esc(p.name.slice(0, 2))}</span><div><div class="where"><span class="kind kind-strategy">Plan</span>${esc(m.title)} › ${esc(s.name)}</div><div class="display chan-name">${esc(p.name)}</div><div class="small muted">${esc(p.squad)}</div></div></div><div class="stage-list"><p class="claim">${esc(p.bet)}</p><div class="card milestone"><div class="eyebrow">Progress</div><p>${p.score} approved tasks · ${qs.filter(q => !q.done).length} to do</p>${p.joined ? '<span class="chip">✓ Your plan</span>' : button("Join this plan", "plan-join", p.id)} ${button(p.backed ? "✓ Backed" : "Back this plan", "plan-back", p.id)}${p.status==="proposed"&&m.ownerId===live.user?.id?button("Approve plan","plan-approve",p.id,"btn red"):""}</div><div class="row"><div class="eyebrow">Tasks</div><span class="spacer"></span>${m.joined ? button("+ Task", "quest-new", s.id) : ""}</div><div class="list">${taskTree(qs) || '<p class="muted small">Add a task to put this plan into action.</p>'}</div><div class="row wrap">${m.joined ? button("Ask agent for tasks", "agent-quest", p.id) : ""}${p.creatorId === live.user?.id ? button("Edit plan", "plan-edit", p.id) : ""}${m.joined ? button("Plan chat", "room", `plan:${p.id}`) : ""}${m.strategies.length > 1 ? button("Suggest merging plans", "merge", p.id) : ""}</div></div>${composer(`plan:${p.id}`)}${message()}</div>`;
}

function questView() {
  const m = current(), q = quest(m); if (!q) return stageView();
  const a = q.artifacts?.at(-1), mine = q.claimedBy === live.user?.id, canReview = m.joined && !mine && q.state === "submitted" && !q.reviews?.some(r => r.reviewer_id === live.user?.id && (r.artifact_id || r.artifactId) === a?.id);
  const waits=(q.dependencies||[]).map(id=>m.quests.find(x=>x.id===id)).filter(x=>x&&!x.done), parts=m.quests.filter(x=>x.parent===q.id&&!x.done), qPlan=m.strategies.find(x=>x.id===q.strat), claimable=q.state==="open"&&!waits.length&&!parts.length&&(!qPlan||!qPlan.status)&&stage(m)?.status==="active";
  const tab = S.roomTab || "brief";
  const review = q.reviews?.length ? `<div class="card milestone"><div class="eyebrow">Review history</div>${q.reviews.map(r => `<p class="small">${esc((live.snapshot.people || []).find(x => x.id === r.reviewer_id)?.name || "Reviewer")}: ${esc(r.verdict)} · ${esc(r.note || "")}</p>`).join("")}</div>` : "";
  const artifact = q.artifacts?.length ? `<div class="card milestone"><div class="eyebrow">Saved artifact history</div>${q.artifacts.map(v=>`<div class="drow"><span><b>${esc(v.title)}</b><span class="small muted" style="display:block">Version ${v.version}</span></span><span class="row">${button("Preview", "artifact", v.id)}${button("Download", "artifact-download", v.id)}</span></div>`).join("")}</div>` : "";
  const actions = !m.joined ? button("Join mission", "join", m.id, "btn red") : q.done ? '<span class="chip">✓ Approved by two members</span>' : q.state === "open" ? claimable?button("Claim task", "quest-claim", q.id, "btn blue"):`<span class="chip">${esc(waits.length?`Waiting for ${waits.map(x=>x.title).join(", ")}`:parts.length?`${parts.length} parts still open`:qPlan?.status?"Plan awaits approval":"Stage is closed")}</span>` : mine && q.state === "claimed" ? `${button("Submit work", "quest-submit", q.id, "btn red")}${button("Work with agent", "agent-execute", q.id)}${button("Release", "quest-release", q.id)}` : mine && q.state === "changes_requested" ? `${button("Revise and resubmit", "quest-submit", q.id, "btn red")}${button("Ask agent to revise", "agent-execute", q.id)}` : canReview ? button("Review this work", "quest-review", q.id, "btn red") : `<span class="chip">${esc(q.state === "submitted" ? "Waiting for two independent reviews" : q.state)}</span>`;
  return `<div class="chat"><div class="chat-head">${backBtn("back", "strategy")}<div style="min-width:0"><div class="where"><span class="kind kind-quest">Task</span>${esc(m.title)}</div><div class="room-title">${esc(q.title)}</div><div class="small muted">${esc(q.role)} · ${esc(q.size)} · ${q.xp} XP · ${q.coins || 0} test credits</div></div></div>${tabs([["brief", "Brief"], ["chat", "Chat"]], tab, "quest-tab")}${tab === "brief" ? `<div class="stage-list"><article class="card doc"><h1 class="doc-title">${esc(q.title)}</h1><p>${esc(q.brief?.description || q.title)}</p>${q.out?`<h3>Expected output</h3><p>${esc(q.out)}</p>`:""}${q.call?.q ? `<h3>Decision needed</h3><p>${esc(q.call.q)}</p>${mine && q.state === "claimed" && !q.decision ? (q.call.opts || []).map(o => button(o, "quest-decision", q.id, "btn sm")).join("") : q.decision ? `<p class="small">Decision: ${esc(q.decision.choice)}</p>` : ""}` : ""}<h3>Status</h3><p>${esc(q.state)}</p><div class="row wrap">${button("Task requirements", "task-requirements", q.id)}${button("Review policy", "review-policy", q.id)}</div></article>${artifact}${review}<div class="row wrap">${actions}${m.ownerId === live.user?.id && q.state === "open" ? button("Edit task", "quest-edit", q.id) : ""}${q.state === "open" ? button(q.watched ? "✓ Watching" : "Watch task", "quest-watch", q.id) : ""}${q.claimedBy && !mine ? `${button("Ask to pair", "pair", q.id)}${button("Nudge for update", "nudge", q.id)}` : ""}</div></div>` : `<div class="msgs" id="msgs">${roomMessages("quest", q.id)}</div>`}${tab === "chat" ? composer(`quest:${q.id}`) : ""}${message()}</div>`;
}

function roomMessages(k, scopeId, roomId) {
  const room = roomId ? live.snapshot.threads.find(t => t.id === roomId) : roomFor(k, scopeId); if (!room) return `<p class="small muted">Open this room to start a conversation.</p>`;
  const messages = roomState(room.id).messages;
  return messages.length ? messages.map(m => {const me=m.role==="user"&&(m.senderId===live.user?.id||m.pending);return `<div class="msg ${me ? "me" : ""}">${me ? "" : botAv()}<div class="bubble"><div class="from">${esc(me ? "You" : m.role === "assistant" ? S.agentName : m.senderName || "Member")}</div><div>${esc(m.text)}</div>${m.pending ? '<span class="small muted">Sending…</span>' : ""}${m.error ? `<span class="small no">${esc(m.error)}</span>` : ""}</div></div>`}).join("") : '<p class="small muted">No messages yet. Start the conversation.</p>';
}
function composer(scope) { return `<form class="composer" id="live-composer" data-scope="${esc(scope)}"><input name="text" placeholder="Message this room…" maxlength="4000" autocomplete="off" required><button class="btn sm red" type="submit">Send</button></form>`; }
function chatView() {
  const t = live.snapshot.threads.find(x => x.id === S.thread); if (!t) return chatsView();
  return `<div class="chat"><div class="chat-head">${backBtn("back", "comms")}${botAv()}<div><div class="where"><span class="kind kind-${t.kind === "agent" ? "agent" : "quest"}">${kind(t.kind)}</span></div><div class="display chan-name">${esc(roomTitle(t))}</div></div></div><div class="msgs" id="msgs">${roomMessages(t.kind, t.scopeId, t.id)}</div>${composer(`id:${t.id}`)}${message()}</div>`;
}
function chatsView() { return `<div class="screen"><h2 class="sec-title">Chats</h2><div class="list">${live.snapshot.threads.map(t => row(t.kind === "agent" ? botAv() : "✦", roomTitle(t), kind(t.kind), "thread", t.id)).join("")}</div><h2 class="sec-title">People in your missions</h2><div class="list">${(live.snapshot.people || []).filter(p=>p.id!==live.user?.id).map(p=>row("●",p.name,"Registered member","person",p.id)).join("") || '<p class="small muted">Join a mission with someone to message them.</p>'}</div>${message()}</div>`; }
function playView() {
  const items = missions.flatMap(m => m.quests.filter(q => m.joined && q.state !== "approved").map(q => ({m,q})));
  return `<div class="screen"><h2 class="sec-title">Play</h2><div class="eyebrow">Your open tasks</div><div class="list">${items.map(({m,q}) => row(mono(ROLES[q.role] ? q.role : "user", 34), q.title, `${m.title} · ${q.state}`, "quest", q.id)).join("") || '<p class="small muted">Join a mission and choose a task to get started.</p>'}</div></div>`;
}
function profileView() {
  const p = live.snapshot.profile, w = live.snapshot.wallet;
  return `<div class="screen"><div class="card duo-card"><div class="sunbox">${botAv("av big", true)}<h1 class="cup">${esc(S.name)} & ${esc(S.agentName)}</h1><p class="small">Your team</p></div><div class="kv"><div class="stat"><b>${p.xp}</b><span>XP</span></div><div class="stat"><b>${Object.keys(p.joined || {}).length}</b><span>missions</span></div><div class="stat"><b>${w.available}</b><span>test credits</span></div></div></div><div class="card milestone"><div class="eyebrow">Our progress</div><p>${missions.flatMap(m=>m.quests).filter(q=>q.done&&q.claimedBy===live.user?.id).length} tasks approved · ${missions.filter(m=>m.stages.every(s=>s.status==="approved")).length} missions complete</p><div class="eyebrow">History and outputs</div>${missions.flatMap(m=>m.quests.filter(q=>q.done&&q.claimedBy===live.user?.id).map(q=>row("✓",q.title,`${m.title} · ${q.artifacts?.at(-1)?.title||"No artifact"}`,"quest",q.id))).join("") || '<p class="small muted">Approved work and its artifacts will appear here.</p>'}</div><div class="card milestone"><div class="eyebrow">Account</div><p class="small muted">${esc(live.user?.email || "")}</p><div class="row wrap">${button("Edit roles, skills and agent", "profile-edit")}${button("Add a skill", "skill")}${button("Tool preferences", "tools")}${button("Export credits JSON", "export")}${button("Export credits CSV", "export-csv")}${button("Agent work history", "run-history")}${button("Account security", "security")}${button("Sign out", "signout")}</div></div><div class="card milestone"><div class="eyebrow">${label()}</div><p class="small muted">A pilot simulation with no cash value. No deposits, withdrawals, or ownership rights.</p><p>Balance ${w.balance} · Reserved ${w.reserved} · Available ${w.available}</p><p class="small">${esc(w.demoOwnership?.label || "Demo participation points")}: ${w.demoOwnership?.points || 0}. This records participation, not a legal share or financial right.</p>${w.ledger?.map(l => `<div class="drow"><span>${esc(l.kind)}</span><b>${l.amount} credits</b></div>`).join("") || ""}${(w.enabled?missions.flatMap(m=>m.quests.filter(q=>q.done&&q.claimedBy===live.user?.id&&(w.ledger||[]).some(l=>l.quest_id===q.id&&l.kind==="earning"&&l.amount>0)&&!(w.ledger||[]).some(l=>l.quest_id===q.id&&l.kind==="payout_simulation")).map(q=>button("Simulate payout · "+q.title,"payout",q.id))).join(""):"")}</div>${message()}</div>`;
}

function notificationsView() { return `<div class="screen"><h2 class="sec-title">Updates and invites</h2><div class="list">${(live.snapshot.notifications || []).map(n=>row("🔔",n.text,n.createdAt,"notification",n.id,n.read?"Read":"Open")).join("") || '<p class="small muted">No updates yet.</p>'}</div><h2 class="sec-title">Mission invites</h2><div class="list">${(live.snapshot.invites || []).map(i=>`<div class="card milestone"><b>${esc(i.inviter)} invited you</b><p class="small">${esc(missions.find(m=>m.id===i.missionId)?.title || "Mission")} · ${esc(i.status)}</p>${i.status==="pending"?`${button("Accept","invite-accept",i.id)}${button("Decline","invite-decline",i.id)}`:""}</div>`).join("") || '<p class="small muted">No invites yet.</p>'}</div></div>`; }
function personView() { const p=(live.snapshot.people||[]).find(x=>x.id===S.personId); return `<div class="screen">${backBtn("back","comms")}<div class="card duo-card"><div class="sunbox"><h1 class="cup">${esc(p?.name||"Member")}</h1></div><p class="small muted">Registered Joystick member. Skills and background are self declared until verified.</p>${p&&p.id!==live.user?.id?button("Message","dm",p.id,"btn red"):""}</div>${message()}</div>`; }
function recapView() {
  const m=missions.find(x=>x.id===S.recapId) || current(); if(!m)return lobby();
  const finished=m.sample?.finished;
  return `<div class="screen">${backBtn("back","mission")}<div class="card mhead"><div class="band" style="background:${esc(m.color)}">${glyph(m)}<span class="mtitle"><span class="kind kind-mission">Mission history</span><h1>${esc(m.title)}</h1></span></div></div>${finished?`<div class="card milestone"><div class="eyebrow">Illustrative workbook outcome</div><h2 class="sec-title">${esc(finished.Outcome)}</h2><p>${esc(finished["What happened"]||"")}</p><p class="small muted">${esc(m.seedNotice||"This is an example, not verified live activity.")}</p></div>`:""}<div class="eyebrow">Recorded stage history</div><div class="list">${m.stages.map(s=>`<div class="card milestone"><div class="row"><b>${esc(s.name)}</b><span class="spacer"></span><span class="chip">${esc(s.status)}</span></div><p class="small">${esc(s.goal)}</p><p class="small muted">Outcome target: ${s.target} ${esc(s.unit)} · ${stageProgress(m,s)}</p>${s.approvedAt?`<p class="small">Approved ${esc(s.approvedAt)}</p>`:""}<div class="list">${m.quests.filter(q=>q.stageId===s.id&&q.done).map(q=>row("✓",q.title,`${q.artifacts?.length||0} saved artifact versions`,"quest",q.id)).join("") || '<p class="small muted">No approved work recorded for this stage.</p>'}</div>${button("Open stage","stage",s.id)}</div>`).join("")}</div><div class="row wrap">${m.joined?button("Ask agent to explain","agent-context",m.id):""}${button("Back to mission","mission",m.id)}</div>${message()}</div>`;
}

function editorView() {
  const m = current(), p = plan(m), q = quest(m), s = stage(m), d = ui.draft || {}, id = S.editId;
  const scopeFields = () => { const currentStageId=ui.editor==="quest-new"?id:q?.stageId; const candidates=(m?.quests||[]).filter(x=>x.stageId===currentStageId&&x.id!==q?.id); const selectedPlan=d.planId||q?.strat||S.stratId; const selectedParent=d.parentId||q?.parent||""; const selectedDeps=d.dependencies||q?.dependencies|| (q?.after?[q.after]:[]); return `${ui.editor==="quest-new"?`${field("callPrompt","Decision prompt (optional)",d.callPrompt||"")}${field("callOptions","Decision choices, one per line",d.callOptions||"","textarea")}<label class="field" for="q-role">Role</label><select class="inp" id="q-role" name="role">${Object.entries(ROLES).map(([key,r])=>`<option value="${key}">${r.name}</option>`).join("")}</select><label class="field" for="q-size">Size</label><select class="inp" id="q-size" name="size"><option>S</option><option>M</option><option>L</option></select>`:""}<label class="field" for="q-plan">Plan</label><select class="inp" id="q-plan" name="planId"><option value="">No plan yet</option>${(m?.strategies||[]).filter(x=>x.stageId===currentStageId).map(x=>`<option value="${x.id}" ${x.id===selectedPlan?"selected":""}>${esc(x.name)}</option>`).join("")}</select><label class="field" for="q-parent">Part of</label><select class="inp" id="q-parent" name="parentId"><option value="">Standalone task</option>${candidates.filter(x=>!x.parent).map(x=>`<option value="${x.id}" ${x.id===selectedParent?"selected":""}>${esc(x.title)}</option>`).join("")}</select><div class="eyebrow">Wait for these tasks</div><div class="mini-roles">${candidates.map(x=>`<label><input type="checkbox" name="dependencies" value="${x.id}" ${selectedDeps.includes(x.id)?"checked":""}> ${esc(x.title)}</label>`).join("")||'<span class="small muted">No other tasks in this stage yet.</span>'}</div>`; };
  let body = "";
  if (ui.editor === "forge") body = form("forge-form", "Create a mission", `<p class="small muted">Describe the change you want, then edit each part before publishing.</p><div class="row wrap">${button("Ask agent for a first draft", "agent-mission")}${button("Previous agent drafts", "run-history")}</div>` + field("title", "Mission name", d.title, "text", "required maxlength=160") + field("pitch", "The win", d.pitch, "textarea", "maxlength=5000") + field("tag", "Topic", d.tag || "Community") + field("stages", "Stages: name | goal | approved tasks needed", (d.stages || []).map(x => typeof x === "string" ? x : `${x.name} | ${x.goal || x.name} | ${x.target || 1}`).join("\n"), "textarea", "required") + field("rules", "Win rules, one per line", (d.rules || []).join("\n"), "textarea") + field("team", "Team needed", d.team || "", "textarea") + field("roles", "Roles needed, one per line", (d.roles || []).join("\n"), "textarea") + field("bounty", "Test credit goal (optional)", d.bounty || 0, "number", "min=0"), "Publish mission");
  if (ui.editor === "mission-edit") body = form("mission-form", "Edit mission", field("title", "Mission name", m.title, "text", "required") + field("pitch", "The win", m.pitch, "textarea") + field("tag", "Topic", m.tag) + field("team", "Team needed", m.team || "", "textarea") + field("roles", "Roles needed, one per line", (m.roles || []).join("\n"), "textarea") + field("bounty", "Test credit goal", m.bounty || 0, "number", "min=0"), "Save mission");
  if (ui.editor === "plan-new" || ui.editor === "plan-edit") body = form("plan-form", ui.editor === "plan-new" ? "New plan" : "Edit plan", field("name", "Plan name", d.name || (ui.editor === "plan-edit" ? p?.name : ""), "text", "required") + field("squad", "Squad name", d.squad || (ui.editor === "plan-edit" ? p?.squad : `${S.name}'s squad`), "text", "required") + field("bet", "How this wins the stage", d.bet || (ui.editor === "plan-edit" ? p?.bet : ""), "textarea"), "Save plan");
  if (ui.editor === "quest-new" || ui.editor === "quest-edit") body = form("quest-form", ui.editor === "quest-new" ? "New task or part" : "Edit task", field("title", "Task name", d.title || (ui.editor === "quest-edit" ? q?.title : ""), "text", "required") + field("description", "What needs doing", d.description || (ui.editor === "quest-edit" ? q?.brief?.description : ""), "textarea") + field("rewardCredits", "Test-credit reward (no cash value)", d.rewardCredits || (ui.editor === "quest-edit" ? q?.coins : 0) || 0, "number", "min=0") + scopeFields(), "Save task");
  if (ui.editor === "quest-submit") body = form("submit-form", q.state === "changes_requested" ? "Revise work" : "Submit work", field("title", "Artifact title", d.title || q.artifacts?.at(-1)?.title || `${q.title} · result`) + field("content", "Work and evidence", d.content || "", "textarea", "required maxlength=262144") + `<label class="field" for="artifact-file"><span>Import a text file into this artifact</span></label><input class="inp" id="artifact-file" type="file" accept=".txt,.md,.markdown,.csv,.json,.js,.ts,.py,.html,.css,.xml,.yaml,.yml,text/plain,text/markdown,text/csv,application/json"><p class="small muted" id="artifact-file-status">Text, code, Markdown, CSV, and JSON files up to 256 KB. You can edit the imported content before submitting it.</p><p class="small muted">Your submitted text becomes a saved, downloadable artifact for two independent reviews.</p>`, "Submit for review");
  if (ui.editor === "quest-review") body = form("review-form", "Review work", `<p class="small">Read the submitted artifact first. Two distinct members must approve.</p>${q.artifacts?.at(-1) ? button("Preview artifact", "artifact", q.artifacts.at(-1).id) : ""}<label class="field">Verdict<select class="inp" name="verdict"><option value="approve">Approve</option><option value="changes_requested">Request changes</option></select></label>` + field("note", "Review notes", "", "textarea"), "Save review");
  if (ui.editor === "profile-edit") body = form("profile-form", "Your team", field("agentName", "Agent name", S.agentName) + `<div class="eyebrow">Roles</div><div class="mini-roles">${Object.entries(ROLES).filter(([,r]) => !r.auto).map(([id,r]) => `<label><input type="checkbox" name="roles" value="${id}" ${S.roles.includes(id) ? "checked" : ""}> ${r.name}</label>`).join("")}</div>` + field("skills", "Self declared skills, one per line", S.skills.map(x => x[0]).join("\n"), "textarea") + field("toolLinks", "Preferred tool URLs, one per line", (S.preferences.toolLinks || []).join("\n"), "textarea"), "Save profile");
  if (ui.editor === "fund") body = form("fund-form", "Reserve test credits", `<p class="small muted">This reserves simulated credits only. No payment or escrow is created.</p>` + field("amount", "Credits", "10", "number", `min=1 max=${live.snapshot.wallet.available}`), "Reserve");
  if (ui.editor === "back") body = form("back-form", `Back ${p?.name || "plan"}`, `<p class="small muted">Back for free with 0, or reserve test credits for this plan. Test credits have no cash value or ownership rights.</p>` + field("testCredits", "Test credits", "0", "number", `min=0 max=${live.snapshot.wallet.available}`), "Back plan");
  if (ui.editor === "pledge") body = form("pledge-form", "Add a contribution", `<label class="field">Kind<select class="inp" name="kind"><option value="time">Time</option><option value="compute">Compute</option><option value="test_credits">Test credits</option></select></label>` + field("amount", "Amount", "1", "number", "min=1") + field("note", "Note", "", "textarea"), "Save contribution");
  if (ui.editor === "invite") body = form("invite-form", "Invite a member", field("email", "Their account email", "", "email", "required"), "Send invite");
  if (ui.editor === "need") body = form("need-form", "Add a need", field("title", "What do you need?", "", "text", "required") + field("detail", "Details", "", "textarea"), "Save need");
  if (ui.editor === "stage-new") body = form("stage-form", "Add a stage", field("name", "Stage name", "", "text", "required") + field("goal", "Goal", "", "textarea") + field("target", "Approved tasks needed", "1", "number", "min=1"), "Save stage");
  if (ui.editor === "agent-prompt") body = form("agent-form", "Work with your agent", `<p class="small muted">The agent may produce a draft. You review and publish it yourself.</p>` + field("prompt", "What should it do?", d.prompt || "", "textarea", "required"), "Ask agent");
  if (ui.editor === "merge") body = form("merge-form", "Suggest a merge", `<label class="field">Merge into<select class="inp" name="targetPlanId">${m.strategies.filter(x => x.id !== id).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></label>` + field("reason", "Why combine these plans?", "", "textarea"), "Suggest merge");
  if (ui.editor === "nudge") body = form("nudge-form", "Nudge this task", field("message", "Message", "Can you share an update?", "text", "required"), "Send nudge");
  if (ui.editor === "join") body = form("join-form", `Join ${m?.title || "mission"}`, `<p class="small">Choose the roles you want to play. You can change these later.</p><div class="mini-roles">${Object.entries(ROLES).filter(([,r])=>!r.auto).map(([key,r])=>`<label><input type="checkbox" name="roles" value="${key}" ${S.roles.includes(key)?"checked":""}> ${esc(r.name)}</label>`).join("")}</div><div class="card milestone"><div class="eyebrow">The rules</div><ul class="checks">${(m?.rules||[]).map(r=>`<li>${esc(r)}</li>`).join("")}</ul><p class="small muted">Joined work is saved to your account. Test credits have no cash value.</p></div>`, "Join mission");
  if (ui.editor === "flag") body = form("flag-form", "Flag a spending concern", field("reason", "What should the mission owner review?", "", "textarea", "required"), "Save concern");
  if (ui.editor === "skill") body = form("skill-form", "Add a self declared skill", field("skill", "Skill", "", "text", "required maxlength=80") + '<p class="small muted">This is self declared; no verification is implied.</p>', "Add skill");
  if (ui.editor === "tools") body = `<div class="card milestone"><h2 class="sec-title">Tool preferences</h2><p class="small muted">Choose which tools the agent may use. Connections are not established here.</p>${["Shared drive","GPU pool","Browser","Code workspace"].map(key=>`<div class="drow"><b>${esc(key)}</b>${button(S.preferences.tools?.[key] ? "On" : "Off","tool-toggle",key)}</div>`).join("")}${button("Done","editor-close")}</div>`;
  if (ui.editor === "security") body = `<div class="card milestone"><h2 class="sec-title">Account security</h2><p class="small muted">Passkeys on this account</p>${(ui.security?.passkeys || []).map(k=>`<div class="drow"><span><b>Passkey</b><span class="small muted" style="display:block">Added ${esc(k.createdAt || "")} · ${esc(k.deviceType || "Device")}</span></span>${(ui.security?.passkeys || []).length > 1 ? button("Remove","passkey-remove",k.id) : ""}</div>`).join("") || '<p class="small muted">Loading passkeys…</p>'}<div class="row wrap">${button("Verify with passkey","reauth")}${button("Add passkey","passkey-add")}${button("Generate recovery codes","recovery-codes")}</div>${ui.codes ? `<div class="card milestone"><b>Save these codes now. They are shown once.</b><pre class="live-artifact">${esc(ui.codes.join("\n"))}</pre>${button("Download codes","codes-download")}</div>` : ""}</div>`;
  return `<div class="screen">${backBtn("back", "lobby")}${body}${message()}</div>`;
}

function runView() {
  const data = ui.runData || {}, run = data.run || {};
  const drafts = (data.drafts || []).map(draft => `<div class="card milestone"><div class="eyebrow">${esc(draft.kind)} draft · ready for your review</div><h3>${esc(draft.data?.title || draft.data?.name || draft.kind)}</h3><p class="small">${esc(draft.data?.pitch || draft.data?.bet || draft.data?.description || "")}</p>${button("Edit draft", "draft-edit", draft.id, "btn red")}</div>`).join("");
  const artifacts = (data.artifacts || []).map(artifact => `<div class="card milestone"><div class="eyebrow">Agent work · version ${artifact.version}</div><h3>${esc(artifact.title)}</h3><pre class="live-artifact">${esc(artifact.content)}</pre><p class="small muted">You decide whether this work is ready for review.</p>${button("Edit and submit", "agent-submit", artifact.id, "btn red")}</div>`).join("");
  return `<div class="screen"><div class="row">${button("← Back", "run-close")}<span class="spacer"></span>${!['completed','failed','cancelled','uncertain'].includes(run.status) ? button("Cancel", "run-cancel") : ""}</div><div class="card milestone"><div class="eyebrow">${esc(S.agentName)} · ${esc(run.kind || "working")}</div><h2 class="sec-title">${esc(run.status || "Starting")}</h2>${run.status === "uncertain" ? '<p class="small no">Could not confirm the agent’s last action. This run needs reconciliation before retrying.</p>' : ""}${run.error ? `<p class="no">${esc(run.error)}</p>` : ""}${run.response ? `<p class="small">${esc(run.response)}</p>` : ""}</div>${drafts}${artifacts}${(data.decisions || []).filter(d => !d.selectedOptionId).map(d => `<div class="card milestone"><h3>${esc(d.prompt)}</h3><div class="row wrap">${d.options.map(o => button(o.label, "agent-decision", `${d.id}:${o.id}`)).join("")}</div></div>`).join("")}${message()}</div>`;
}
function runHistoryView() { return `<div class="screen">${button("← Back","run-history-close")}<h2 class="sec-title">Agent work history</h2><div class="list">${(ui.runHistory?.runs||[]).map(r=>row(botAv(),r.prompt||r.kind,`${r.kind} · ${r.status} · ${r.updatedAt||""}`,"run-open",r.id)).join("") || '<p class="small muted">No agent work yet. New drafts and runs will appear here.</p>'}</div>${ui.runHistory?.nextCursor?button("Older runs","run-history-more",ui.runHistory.nextCursor):""}${message()}</div>`; }
async function pollRun(id) {
  try { const data = await api(`/agent/runs/${id}`); if (ui.run !== id) return; ui.runData = data; render(); if (!['completed','failed','cancelled','uncertain'].includes(data.run.status)) setTimeout(() => pollRun(id), 1800); }
  catch (error) { if (ui.run === id) { ui.error = error.message; render(); } }
}
async function startRun(kind, prompt, ids = {}) {
  try { ui.error=""; const {run} = await api("/agent/runs", {method:"POST",body:JSON.stringify({requestId:crypto.randomUUID(),kind,prompt,...ids})}); ui.editor=null; ui.run=run.id; ui.runData={run,drafts:[],artifacts:[],decisions:[]}; render(); pollRun(run.id); }
  catch (error) { ui.error=error.message; render(); }
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
  if (ui.preview) return `<div class="screen">${button("← Back", "preview-close")}<article class="card doc"><h1 class="doc-title">${esc(ui.preview.title)}</h1><pre class="live-artifact">${esc(ui.preview.content)}</pre></article></div>`;
  if (ui.run) return runView();
  if (ui.runHistory) return runHistoryView();
  if (ui.editor) return editorView();
  return ({ onboard:onboardView, lobby, mission: missionView, stage: stageView, strategy: planView, quest: questView, play: playView, comms: chatsView, thread: chatView, profile: profileView, notifications: notificationsView, recap: recapView, person: personView })[S.screen]?.() || lobby();
}

export function handleLiveInput(event) { if(S.screen==="onboard"&&event.target.name==="agentName"&&ui.onboard){ui.onboard.agentName=event.target.value;return true;} return false; }
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
  if (S.live && (ui.editor || ui.preview || ui.run) && event.target.closest('[data-a="back"]')) { event.preventDefault(); ui.editor=null; ui.preview=null; ui.run=null; ui.runData=null; render(); return true; }
  if (S.live && event.target.closest('[data-a="notifs"]')) { event.preventDefault(); nav("notifications"); return true; }
  const b = event.target.closest("[data-live]"); if (!b) return false;
  event.preventDefault();
  const a = b.dataset.live, id = b.dataset.id;
  if (a === "noop") return true;
  if (a === "onboard-next") { ui.onboard.step=Math.min(3,ui.onboard.step+1); render(); return true; }
  if (a === "onboard-prev") { ui.onboard.step=Math.max(0,ui.onboard.step-1); render(); return true; }
  if (a === "onboard-shape") { ui.onboard.botShape=id; S.botShape=id; render(); return true; }
  if (a === "onboard-role") { const r=ui.onboard.roles; ui.onboard.roles=r.includes(id)?r.filter(x=>x!==id):r.length<3?[...r,id]:r;render();return true; }
  if (a === "onboard-pick") { const picks=ui.onboard.picks;ui.onboard.picks=picks.includes(id)?picks.filter(x=>x!==id):[...picks,id];render();return true; }
  if (a === "onboard-finish" || a === "onboard-skip") { const o=ui.onboard, picks=a==="onboard-skip"?[]:o.picks; const saved=await act("profile.update",null,{agentName:o.agentName||"Pip",roles:o.roles,preferences:{...S.preferences,onboarded:true,botShape:o.botShape}},"Team ready"); if(saved){for(const mid of picks)await act("mission.join",mid,{},"Mission joined");S.screen="lobby";S.lobbyTab=picks.length?"mine":"explore";render();}return true; }
  if (a === "editor-close") { ui.editor=null; render(); return true; }
  if (a === "security") { ui.editor="security"; ui.codes=null; ui.error=""; render(); try { await refreshSecurity(); } catch(error) { ui.error=error.message; render(); } return true; }
  if (a === "reauth") { try { await reauthorize(); ui.message="Passkey verified"; render(); } catch(error) { ui.error=error.name==="NotAllowedError"?"Passkey was cancelled.":error.message; render(); } return true; }
  if (a === "passkey-add") { await securityWrite(async()=>{const {options}=await api("/auth/passkeys/options",{method:"POST",body:"{}"});const response=await startRegistration({optionsJSON:options});await api("/auth/passkeys/verify",{method:"POST",body:JSON.stringify({response})});ui.message="Passkey added";}); return true; }
  if (a === "passkey-remove") { await securityWrite(async()=>{await api(`/auth/passkeys/${id}/remove`,{method:"POST",body:"{}"});ui.message="Passkey removed";}); return true; }
  if (a === "recovery-codes") { await securityWrite(async()=>{const result=await api("/auth/recovery-codes",{method:"POST",body:"{}"});ui.codes=result.codes;ui.message="New recovery codes generated";}); return true; }
  if (a === "codes-download") { const blob=new Blob([ui.codes.join("\n")+"\n"],{type:"text/plain"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="joystick-recovery-codes.txt";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true; }
  if (a === "preview-close") { ui.preview=null; render(); return true; }
  if (a === "stage-policy") { const m=current(), s=m?.stages.find(x=>x.id===id), p=live.snapshot.policy || {}; ui.preview={title:"Stage approval",content:`${s?.name || "Stage"}: at least ${s?.gateTarget || 1} approved task(s), with every task in this stage approved. ${p.stageClose || "The mission owner records the final stage approval."}\n\nOutcome target: ${s?.target || 0} ${s?.unit || "results"}. This is an owner-attested pilot goal, not verified evidence.`}; render(); return true; }
  if (a === "task-requirements") { const q=current()?.quests.find(x=>x.id===id); ui.preview={title:"Task requirements",content:`${q?.brief?.description || q?.title || "Task"}\n\nExpected output: ${q?.out || "A saved artifact describing the work and evidence."}\n\nDependencies: ${(q?.dependencies || []).map(dep=>current()?.quests.find(x=>x.id===dep)?.title || "Task").join(", ") || "None"}\n\nSkills are self declared. Tool preferences do not connect external accounts.`}; render(); return true; }
  if (a === "review-policy") { const p=live.snapshot.policy || {}; ui.preview={title:"Review policy",content:`${p.reviewerRule || "Two distinct registered mission members other than the claimant review each submitted artifact."}\n\nChanges can be requested, then the claimant may submit a new version. The mission owner closes the stage after eligible task reviews. No identity or skill verification is implied.`}; render(); return true; }
  if (a === "run-close") { ui.run=null; ui.runData=null; render(); return true; }
  if (a === "run-history-close") { ui.runHistory=null; render(); return true; }
  if (a === "run-history" || a === "run-history-more") { try { const query=new URLSearchParams(); if(a==="run-history"&&id)query.set("missionId",id); if(a==="run-history-more"&&id)query.set("cursor",id); const data=await api(`/agent/runs?${query}`); ui.runHistory=a==="run-history-more"?{runs:[...(ui.runHistory?.runs||[]),...data.runs],nextCursor:data.nextCursor}:{...data}; ui.error=""; render(); } catch(error){ui.error=error.message;render();} return true; }
  if (a === "run-open") { ui.run=id; ui.runData=null; await pollRun(id); return true; }
  if (a === "run-cancel") { try { await api(`/agent/runs/${ui.run}/cancel`,{method:"POST",body:JSON.stringify({requestId:crypto.randomUUID()})}); pollRun(ui.run); } catch(error) { ui.error=error.message; render(); } return true; }
  if (a === "agent-decision") { const [decisionId,optionId]=id.split(":"); try { await api(`/agent/runs/${ui.run}/decisions`,{method:"POST",body:JSON.stringify({decisionId,optionId,requestId:crypto.randomUUID()})}); pollRun(ui.run); } catch(error) { ui.error=error.message; render(); } return true; }
  if (a === "draft-edit") { const draft=ui.runData?.drafts.find(d=>d.id===id); if (!draft) return true; const run=ui.runData.run; ui.draft=draft.data; ui.run=null; ui.runData=null; ui.runHistory=null; ui.editor=draft.kind==="mission"?"forge":draft.kind==="plan"?"plan-new":"quest-new"; if (run.missionId) S.missionId=run.missionId; if (draft.kind==="plan") {S.editId=draft.data.stageId;S.stageId=draft.data.stageId;} if (draft.kind==="quest") { S.editId=draft.data.stageId; S.stageId=draft.data.stageId; if (draft.data.planId) S.stratId=draft.data.planId; } render(); return true; }
  if (a === "agent-submit") { const artifact=ui.runData?.artifacts.find(x=>x.id===id); if (!artifact) return true; const run=ui.runData.run; ui.draft={title:artifact.title,content:artifact.content}; ui.run=null; ui.runData=null; ui.runHistory=null; ui.editor="quest-submit"; S.missionId=run.missionId; S.stratId=run.planId; S.questId=run.questId; S.editId=run.questId; render(); return true; }
  if (a === "lobby-tab") { S.lobbyTab = id; render(); return true; }
  if (a === "filter") { S.filter = id; render(); return true; }
  if (a === "mission-tab") { S.tab = id; render(); return true; }
  if (a === "quest-tab") { S.roomTab = id; render(); return true; }
  if (a === "mission") { const m=missions.find(x=>x.id===id); nav("mission", { missionId: id, stageId:m?.stages?.[m.current]?.id, tab: "map" }); return true; }
  if (a === "recap") { nav("recap",{recapId:id,missionId:id}); return true; }
  if (a === "person") { nav("person",{personId:id}); return true; }
  if (a === "stage" || a === "open-stage") { nav("stage", { missionId: current()?.id, stageId:id }); return true; }
  if (a === "plan") { const m = missions.find(x => x.strategies.some(p => p.id === id)), p=m.strategies.find(x=>x.id===id); nav("strategy", { missionId: m.id, stageId:p.stageId, stratId: id }); return true; }
  if (a === "quest") { const m = missions.find(x => x.quests.some(q => q.id === id)), q=m.quests.find(x=>x.id===id); S.roomTab = "brief"; nav("quest", { missionId: m.id, stageId:q.stageId, stratId:q.strat, questId: id }); return true; }
  if (a === "thread") { await loadRoom(id).catch(error => ui.error = error.message); nav("thread", { thread: id }); return true; }
  if (a === "room") { const [k, scopeId] = id.split(":"); let r = roomFor(k, scopeId); if (!r) { await act("room.create", null, {kind:k,scopeId}, "Room opened"); r = roomFor(k, scopeId); } if (r) { await loadRoom(r.id).catch(error => ui.error = error.message); nav("thread", { thread:r.id }); } return true; }
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
  if (a === "notification") { await act("notification.read",id,{},"Marked read"); const n=live.snapshot.notifications.find(x=>x.id===id); if (n?.entityId) { const m=missions.find(x=>x.quests.some(q=>q.id===n.entityId)); if(m) nav("quest",{missionId:m.id,questId:n.entityId}); } return true; }
  if (a === "invite-accept" || a === "invite-decline") { await act(a==="invite-accept"?"invite.accept":"invite.decline",id,{},"Invite updated"); return true; }
  if (a === "pair") { const q=current()?.quests.find(x=>x.id===id); if (q?.claimedBy) await act("pair.request", id, {userId:q.claimedBy}, "Pair request sent"); return true; }
  if (a === "quest-release") { await act("quest.release", id, {}, "Task released"); return true; }
  if (a === "stage-approve") { await act("stage.approve", id, {}, "Stage approved"); return true; }
  if (a === "stage-advance") { await act("stage.advance", id, {}, "Next stage opened"); return true; }
  if (a === "quest-decision") { await act("quest.decide", id, {choice:b.textContent.trim()}, "Decision saved"); return true; }
  if (a === "agent-mission") { ui.agentKind="mission-draft"; ui.agentIds={}; ui.editor="agent-prompt"; ui.draft={prompt:"Draft a mission from my idea, with stages and clear win rules."}; render(); return true; }
  if (a === "agent-plan") { ui.agentKind="plan-draft"; ui.agentIds={missionId:current().id}; ui.editor="agent-prompt"; ui.draft={prompt:`Draft a plan for ${stage(current()).name}: ${stage(current()).goal}`}; render(); return true; }
  if (a === "agent-quest") { ui.agentKind="quest-draft"; ui.agentIds={missionId:current().id,planId:id}; ui.editor="agent-prompt"; ui.draft={prompt:`Draft practical tasks for ${plan(current())?.name || "this plan"}`}; render(); return true; }
  if (a === "agent-execute") { const q=current().quests.find(x=>x.id===id); if (q) await startRun("quest-execute", `Work on this task: ${q.title}`, {missionId:current().id,...(q.strat?{planId:q.strat}:{}),questId:id}); return true; }
  if (a === "agent-context") { await startRun("context-chat",`Explain the recorded history and next steps for ${current().title}. Separate illustrative workbook examples from live actions.`,{missionId:id}); return true; }
  if (a === "artifact" || a === "artifact-download") { try { const response = await fetch(new URL(`/api/v1/game/artifacts/${id}`, apiOrigin), { credentials:"include", cache:"no-store" }); if (!response.ok) throw new Error("Artifact could not be opened"); const text = await response.text(); if (a === "artifact") { ui.preview={title:"Submitted artifact",content:text}; render(); } else { const blob = new Blob([text], {type:"text/plain"}); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href=url; link.download="artifact.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); } } catch (error) { ui.error=error.message; render(); } return true; }
  if (a === "export" || a === "export-csv") { try { let blob,name; if(a==="export-csv"){ const response=await fetch(new URL("/api/v1/game/credits.csv",apiOrigin),{credentials:"include",cache:"no-store"}); if(!response.ok) throw new Error("Export unavailable"); blob=await response.blob(); name="joystick-test-credits.csv"; } else { blob=new Blob([JSON.stringify({kind:"test-credits",exportedAt:new Date().toISOString(),userId:live.user.id,wallet:live.snapshot.wallet},null,2)],{type:"application/json"}); name="joystick-test-credits.json"; } const url=URL.createObjectURL(blob), link=document.createElement("a"); link.href=url; link.download=name; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); ui.message="Credits exported"; render(); } catch(error){ui.error=error.message;render();} return true; }
  if (a === "payout") { await act("payout.simulate",id,{},"Payout simulation recorded"); return true; }
  if (a === "tool-toggle") { await act("tool.preference",null,{key:id,enabled:!S.preferences.tools?.[id]},"Tool preference saved"); return true; }
  if (a === "signout") { await signOut(async () => { applySnapshot(await loadGame()); render(); }, resetAccountUI); return true; }
  if (["forge", "mission-edit", "plan-new", "plan-edit", "quest-new", "quest-edit", "quest-submit", "quest-review", "profile-edit", "fund", "pledge", "invite", "need", "stage-new", "merge", "nudge", "flag", "skill", "tools"].includes(a)) { ui.editor=a; ui.draft={}; S.editId=id; render(); return true; }
  return true;
}

export async function handleLiveSubmit(event) {
  const formEl = event.target;
  if(formEl.id==="onboard-agent"){ui.onboard.agentName=formEl.elements.agentName.value.trim()||"Pip";ui.onboard.step=2;render();return;}
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
  if (editor === "profile-edit") result = await act("profile.update", null, {agentName:values.agentName,roles:new FormData(formEl).getAll("roles"),skills:lines(values.skills),preferences:{...S.preferences,toolLinks:lines(values.toolLinks)}}, "Profile saved");
  if (editor === "fund") result = await act("funding.reserve", id, {amount:Number(values.amount)}, "Test credits reserved");
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
  if (result) { ui.editor=null; ui.draft=null; if (editor === "forge") { const created = live.snapshot.missions.find(m => !priorMissionIds.has(m.id) && m.ownerId === live.user.id); if (created) { S.missionId = created.id; S.stageId=created.stages?.[0]?.id; } S.screen="mission"; S.tab="map"; } render(); }
}
