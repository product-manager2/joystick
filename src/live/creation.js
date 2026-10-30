import { ROLES } from "../data/content.js";
import { S } from "../state.js";
import { backBtn, botAv, esc } from "../ui/helpers.js";
import { live } from "./game-client.js";
import { stage, refinedStages } from "./stage-refinement.js";

// Starting points are problem areas, not things to build: the mission is the problem, plans are the how.
const categories = ["A health problem", "A problem in my community", "A problem for the planet", "Something people can't learn", "A tool people badly need"];
const topics = {"A health problem":"Science","A problem in my community":"Community","A problem for the planet":"Planet","Something people can't learn":"Education","A tool people badly need":"Product"};
const steps = { mission: ["idea", "name", "stages", "rules", "team", "preview"], plan: ["idea", "details", "preview"], quest: ["idea", "details", "preview"] };
const chip = (label, action, id = "", selected = false) => `<button type="button" class="chip" data-live="${action}" data-id="${esc(id)}" aria-pressed="${selected}">${esc(label)}</button>`;
const input = (name, value, label, max = 160) => `<label class="field"><span>${esc(label)}</span><input class="inp" name="${name}" value="${esc(value || "")}" maxlength="${max}"></label>`;
const area = (name, value, label, max = 5000) => `<label class="field"><span>${esc(label)}</span><textarea class="inp" name="${name}" maxlength="${max}">${esc(value || "")}</textarea></label>`;
const say = (who, text, body = "") => `<div class="msg ${who === "me" ? "me" : ""} ${body ? "wide" : ""}">${who === "me" ? "" : botAv()}<div class="bubble"><div class="from">${who === "me" ? "You" : esc(S.agentName)}</div><div>${esc(text)}</div>${body}</div></div>`;
const next = (label = "Looks good") => `<button type="button" class="btn sm red" data-live="creation-next">${esc(label)}</button>`;
const context = c => { const mission=live.snapshot?.missions?.find(m=>m.id===c.ids.missionId); return {mission, stage:mission?.stages?.find(s=>s.id===c.ids.stageId)}; };
const stageContext = c => { const {mission,stage}=context(c); return stage?`<div class="creation-context"><span class="eyebrow">${esc(mission?.title||"Mission")} · Stage</span><b>${esc(stage.name)}</b>${stage.goal?`<p class="small">Goal: ${esc(stage.goal)}</p>`:""}</div>`:""; };
const initial = (kind, ids = {}) => ({kind, ids, step:0, idea:"", draft:null, messages:[], tag:"Community", title:"", pitch:"", stages:[], rules:[], ruleOpts:[], roles:[], team:"", bounty:0, reserve:0, name:"", squad:`${S.name || "Our"}'s squad`, bet:"", description:"", size:"S", role:"user", planId:ids.planId || "", parentId:"", dependencies:[], callPrompt:"", callOptions:[], rewardCredits:0, advanced:false, error:"", busy:false});

export function beginCreation(kind, ids = {}) { return initial(kind, ids); }
export function acceptCreationDraft(c, draft, run) {
  if (!c || !draft) return c;
  c.runId = null;
  if (c.ids.stageId && draft.data.stageId && c.ids.stageId !== draft.data.stageId) {c.error="The agent proposed work for another stage. Ask it to try again for this stage.";return c;}
  if (c.kind==="quest" && c.ids.planId && draft.data.planId && c.ids.planId !== draft.data.planId) {c.error="The agent proposed a task for another plan. Ask it to try again for this plan.";return c;}
  c.kind = draft.kind;
  c.ids = {missionId:run.missionId || c.ids.missionId, stageId:c.ids.stageId || draft.data.stageId, planId:c.ids.planId || run.planId || draft.data.planId};
  const d = draft.data;
  if (draft.kind === "mission") Object.assign(c, {title:d.title || "",pitch:d.pitch || "",tag:d.tag || c.tag || "Community",stages:refinedStages(c.stages || [],d.stages || []),rules:[...(d.rules || [])].slice(0,12),ruleOpts:[...new Set([...(c.ruleOpts||[]),...(d.rules||[])])].slice(0,20),step:1});
  if (draft.kind === "plan") Object.assign(c, {name:d.name || "",squad:d.squad || c.squad,bet:d.bet || "",step:1});
  if (draft.kind === "quest") Object.assign(c, {title:d.title || "",description:d.description || "",size:d.size || "S",planId:c.ids.planId || d.planId || "",step:1});
  c.draft = draft.id;
  c.error = "";
  if (!c.messages.some(m=>m.who==="me"&&m.text===c.idea)) c.messages.push({who:"me",text:c.idea});
  c.messages.push({who:"agent",text:"I made a first cut. Let’s review the details together."});
  return c;
}

function missionCard(c) {
  if (c.step === 1) return `<div class="form-card"><p class="small muted">This is an editable draft from ${esc(S.agentName)}. Name the problem and describe who it affects and what would improve.</p>${input("title",c.title,"Mission name")}${area("pitch",c.pitch,"Problem, people affected, and successful outcome")}${next("Review stages")}</div>`;
  if (c.step === 2) return `<div class="form-card"><p class="small muted">A stage is a milestone toward the mission goal. The last stage is the finish line.</p>${c.stages.map((s,i)=>`<div class="creation-stage"><span class="num">${i===c.stages.length-1?"★":i+1}</span>${input(`stage-name-${i}`,s.name,"Stage name",120)}<button type="button" class="x" data-live="creation-remove-stage" data-id="${i}" aria-label="Remove stage" ${c.stages.length===1?"disabled":""}>✕</button><div class="creation-stage-goal">${input(`stage-goal-${i}`,s.goal,"What should change by this stage?",500)}</div><details class="creation-stage-details" ${!s.unit||!s.target||!s.gateTarget?"open":""}><summary>Outcome target and approval threshold</summary><div class="creation-stage-metrics">${input(`stage-target-${i}`,s.target,"Outcome target",8)}${input(`stage-unit-${i}`,s.unit,"Outcome unit",40)}${input(`stage-gateTarget-${i}`,s.gateTarget,"Approved tasks needed to close stage",8)}</div></details></div>`).join("")}${chip("+ Add stage","creation-add-stage")}${next("Review success criteria")}</div>`;
  if (c.step === 3) return `<div class="form-card"><h3>Success criteria</h3><p class="small muted">What observable results would show this mission worked? Select the criteria that fit or add your own.</p><div class="mini-roles creation-criteria-options">${c.ruleOpts.map((r,i)=>`<button type="button" data-live="creation-rule" data-id="${i}" aria-pressed="${c.rules.includes(r)}">${esc(r)}</button>`).join("")}</div>${input("new-rule","","Add a success criterion",300)}${chip("+ Add criterion","creation-add-rule")}${next("Review team")}</div>`;
  if (c.step === 4) return `<div class="form-card"><div class="eyebrow">Topic</div><div class="mini-roles">${["Product","Science","Community","Planet","Education"].map(t=>chip(t,"creation-topic",t,c.tag===t)).join("")}</div><div class="eyebrow">Who can help?</div><div class="mini-roles">${Object.entries(ROLES).filter(([,r])=>!r.auto).map(([id,r])=>`<button type="button" data-live="creation-role" data-id="${id}" aria-pressed="${c.roles.includes(id)}">${esc(r.name)}</button>`).join("")}</div>${area("team",c.team,"What kind of team do you need?",1000)}<div class="eyebrow">Funding goal</div><div class="amounts">${[0,100,500,1000].map(n=>chip(n ? `${n} credits` : "No goal", "creation-bounty",String(n),c.bounty===n)).join("")}</div>${next("Review mission")}</div>`;
  return `<div class="form-card"><p class="small muted">Review this editable draft before publishing. Publishing adds the mission to the list so people can find and join it.</p><div class="card poster"><div class="band" style="background:var(--pink)"><h3>${esc(c.title)}</h3></div><div class="body"><p>${esc(c.pitch)}</p><p class="small">${c.stages.length} stages · ${c.rules.length} success ${c.rules.length===1?"criterion":"criteria"} · ${c.roles.length} roles</p>${c.stages.map((s,i)=>`<p class="small">${i+1}. ${esc(s.name)} — ${esc(s.goal)} · ${s.target} ${esc(s.unit)} · ${s.gateTarget} approved task${s.gateTarget===1?"":"s"} to close</p>`).join("")}${c.rules.length?`<div class="creation-criteria-review"><b>Success criteria</b><div>${c.rules.map(r=>`<span class="chip">${esc(r)}</span>`).join("")}</div></div>`:""}</div></div>${c.publishedMissionId?'<p class="small ok">Mission published. You can edit mission details from its page.</p>':`<div class="row wrap">${chip("Edit name","creation-jump","1")}${chip("Edit stages","creation-jump","2")}${chip("Edit success criteria","creation-jump","3")}${chip("Edit team","creation-jump","4")}</div>`}${live.snapshot?.wallet?.enabled && c.bounty > 0 ? `<p class="small muted">Available: ${Number(live.snapshot.wallet.available)||0} credits. Reserving sets them aside for the mission.</p><div class="amounts">${c.reserveUncertain?`<span class="chip">Confirm ${c.reserve} credit reservation before changing it</span>`:`${chip(c.publishedMissionId?"Finish without reserving":"Publish without reserving","creation-reserve","0",c.reserve===0)}${chip(`Reserve ${c.bounty} credits`,"creation-reserve",String(c.bounty),c.reserve===c.bounty)}`}</div>` : ""}<button type="button" class="btn red block" data-live="creation-publish" ${c.busy?"disabled":""}>${c.reserveUncertain?"Retry reservation":c.publishedMissionId?"Finish mission setup":"Publish mission"}</button></div>`;
}

function planCard(c) {
  const {mission}=context(c), owner=mission?.ownerId===live.user?.id;
  if (c.step === 1) return `<div class="form-card">${stageContext(c)}<p class="small muted">A plan is your squad’s approach to reaching this stage. What will you try, and how should it move the goal forward?</p>${input("name",c.name,"Plan name")}${input("squad",c.squad,"Squad name",120)}${area("bet",c.bet,"Approach and expected result",3000)}${next("Review plan")}</div>`;
  return `<div class="form-card">${stageContext(c)}<h3>${esc(c.name)}</h3><p>${esc(c.bet)}</p><p class="small muted">Squad: ${esc(c.squad)}</p><p class="small muted">${owner?"Creating this plan makes it active in the stage. You join its squad.":"Creating this plan sends it to the mission owner for approval. You join its squad."}</p><div class="row wrap">${chip("Edit plan","creation-jump","1")}</div><button type="button" class="btn red block" data-live="creation-publish">Create plan</button></div>`;
}

function questCard(c) {
  const m=live.snapshot?.missions?.find(x=>x.id===c.ids.missionId), plans=(m?.strategies||m?.plans||[]).filter(p=>p.stageId===c.ids.stageId&&p.status==="active"), tasks=(m?.quests||[]).filter(q=>q.stageId===c.ids.stageId);
  const advanced=`${chip(c.advanced?"Hide task options":"Task options","creation-advanced","",c.advanced)}${c.advanced?`<div class="eyebrow">Part of</div><div class="mini-roles">${chip("Standalone task","creation-parent","",!c.parentId)}${tasks.filter(q=>!q.parent).map(q=>chip(q.title,"creation-parent",q.id,c.parentId===q.id)).join("")}</div><div class="eyebrow">Wait for these tasks</div><div class="mini-roles">${tasks.map(q=>chip(q.title,"creation-dependency",q.id,c.dependencies.includes(q.id))).join("")||'<span class="small muted">No other tasks yet.</span>'}</div>${area("callPrompt",c.callPrompt,"Decision question, if needed",1000)}${area("callOptions",c.callOptions.join("\n"),"Decision choices, one per line",2000)}${m?.ownerId===live.user?.id?`<div class="eyebrow">Reward</div><div class="amounts">${[0,10,50,100].map(n=>chip(n?`${n} credits`:"No reward","creation-reward",String(n),c.rewardCredits===n)).join("")}</div>${input("rewardCredits",c.rewardCredits,"Or set a reward",8)}`:""}`:""}`;
  if (c.step === 1) return `<div class="form-card">${stageContext(c)}<p class="small muted">A task is one deliverable someone can take on. Say what to hand over and what reviewers should check when it is done.</p>${input("title",c.title,"Task name",200)}${area("description",c.description,"Deliverable and review guidance",5000)}<div class="eyebrow">Size</div><div class="amounts">${["S","M","L"].map(x=>chip(x,"creation-size",x,c.size===x)).join("")}</div><div class="eyebrow">Best fit role</div><div class="mini-roles">${Object.entries(ROLES).filter(([,r])=>!r.auto).map(([id,r])=>`<button type="button" data-live="creation-task-role" data-id="${id}" aria-pressed="${c.role===id}">${esc(r.name)}</button>`).join("")}</div>${plans.length?`<div class="eyebrow">Approach this task supports</div><div class="mini-roles">${chip("No plan","creation-plan","",!c.planId)}${plans.map(p=>chip(p.name,"creation-plan",p.id,c.planId===p.id)).join("")}</div>`:""}${advanced}${next("Review task")}</div>`;
  return `<div class="form-card">${stageContext(c)}<h3>${esc(c.title)}</h3><p>${esc(c.description)}</p><p class="small muted">${esc(c.size)} · ${esc(ROLES[c.role]?.name || c.role)}${c.planId?` · Plan: ${esc(plans.find(p=>p.id===c.planId)?.name||"Selected plan")}`:""} · ${c.rewardCredits} reward credits</p>${c.parentId?`<p class="small">Part of ${esc(tasks.find(q=>q.id===c.parentId)?.title||"task")}</p>`:""}${c.dependencies.length?`<p class="small">Wait for ${c.dependencies.length} task${c.dependencies.length===1?"":"s"}</p>`:""}${c.callPrompt?`<p class="small">Decision: ${esc(c.callPrompt)} (${c.callOptions.map(esc).join(" / ")})</p>`:""}<p class="small muted">Creating this task makes it available in the stage. Mission members can claim it when its dependencies are approved; completed work goes through review.</p>${chip("Edit task","creation-jump","1")}<button type="button" class="btn red block" data-live="creation-publish">Create task</button></div>`;
}

export function creationView(c) {
  const title={mission:"New mission",plan:"New plan",quest:"New task"}[c.kind];
  const back=backBtn("creation-close","","Leave creation").replace('data-a="creation-close"','data-live="creation-close"').replace('<button ',`<button type="button" ${c.busy?"disabled ":""}`);
  const question={mission:"What problem needs solving, who does it affect, and what would success look like?",plan:"How could your squad reach this stage's goal?",quest:"What specific deliverable would help this stage?"}[c.kind];
  const idea=say("agent",question,c.kind==="mission"?'<p class="small muted creation-draft-note">I’ll make an editable draft for you to review before you publish it.</p>':stageContext(c));
  const ideaChoices=c.step===0?`<div class="creation-idea-dock quick wrap">${(c.kind==="mission"?categories:c.kind==="plan"?["Research first","Build a prototype","Test with people","Launch together"]:["Research","Build","Test","Reach people"]).map(x=>chip(x,"creation-idea",x)).join("")}</div>`:"";
  const stepQuestion=c.kind==="mission"?["","Here's a draft. Does it name the problem and the outcome clearly?","Which stages lead to that outcome?","What results will show this worked?","Who can help, and what funding goal fits?","Ready to publish? Review every part first."][c.step]:c.kind==="plan"?["","How will this approach reach the stage goal?","Ready to create this plan?"][c.step]:["","What should someone deliver, and what should reviewers check?","Ready to create this task?"][c.step];
  const review = `${c.messages.map(m=>say(m.who,m.text)).join("")}${c.step?say("agent",stepQuestion,c.kind==="mission"?missionCard(c):c.kind==="plan"?planCard(c):questCard(c)):""}`;
  return `<div class="chat creation-chat"><div class="chat-head">${back}${botAv("av")}<div><div class="display" style="font-size:15px">${title}</div><div class="small muted">with ${esc(S.agentName)}</div></div></div><div class="msgs" id="msgs">${idea}${review}${c.busy?`<p class="small muted" role="status">${esc(S.agentName)} is preparing a draft…</p>`:""}</div>${ideaChoices}<form class="composer" id="creation-composer"><input name="text" placeholder="${c.step ? "Or say it in your words…" : "Or describe it in your words…"}" maxlength="4000" autocomplete="off" ${c.busy||c.publishUncertain||c.reserveUncertain||c.publishedMissionId?"disabled":""}><button class="btn sm red" type="submit" ${c.busy||c.publishUncertain||c.reserveUncertain||c.publishedMissionId?"disabled":""}>Send</button></form>${c.error?`<p class="live-form-error" role="alert">${esc(c.error)}</p>`:""}</div>`;
}

export function creationInput(c, target) {
  if (!c || !target.name) return false;
  if (c.publishUncertain || c.publishedMissionId) return true;
  const name=target.name;
  if (/^stage-(name|goal|target|unit|gateTarget)-\d+$/.test(name)) { const [,part,index]=name.match(/^stage-(name|goal|target|unit|gateTarget)-(\d+)$/); if(c.stages[Number(index)])c.stages[Number(index)][part]=["target","gateTarget"].includes(part)?Number(target.value):target.value; return true; }
  if (name==="callOptions") {c.callOptions=target.value.split("\n").map(x=>x.trim()).filter(Boolean).slice(0,5);return true;}
  if (name==="rewardCredits") {c.rewardCredits=Number(target.value);return true;}
  if (["title","pitch","team","name","squad","bet","description","callPrompt"].includes(name)) { c[name]=target.value; return true; }
  return false;
}

export async function creationClick(c, action, id, callbacks) {
  if (!c) return false;
  if (c.busy) return true;
  if (action==="creation-close") { callbacks.close(); return true; }
  if (c.publishedMissionId && !["creation-reserve","creation-publish"].includes(action)) {c.error="Mission details are already published. Open the mission to edit them.";callbacks.render();return true;}
  if (c.publishUncertain && action!=="creation-publish") {c.error="Retry publishing first to confirm whether the last attempt succeeded.";callbacks.render();return true;}
  if (action==="creation-idea") { c.idea=id; if(c.kind==="mission")c.tag=topics[id]||c.tag; await callbacks.start(c.kind,id,c.ids); return true; }
  if (action==="creation-next") {
    if (c.kind==="mission" && c.step===1 && !c.title.trim()) c.error="Give this mission a name.";
    else if(c.kind==="mission" && c.step===2 && (!c.stages.length || c.stages.some(s=>!s.name.trim()||!s.goal.trim()||!s.unit.trim()||!Number.isSafeInteger(s.target)||s.target<1||s.target>100000||!Number.isSafeInteger(s.gateTarget)||s.gateTarget<1||s.gateTarget>100000)))c.error="Complete each stage name, goal, outcome target, unit, and approved-task threshold.";
    else if(c.kind==="plan" && c.step===1 && (!c.name.trim()||!c.squad.trim()))c.error="Add a plan and squad name.";
    else if(c.kind==="quest" && c.step===1 && (!c.title.trim()||!c.description.trim()))c.error="Add a task name and what needs doing.";
    else if(c.kind==="quest" && c.step===1 && c.callPrompt && c.callOptions.length<2)c.error="Add at least two choices for the decision question.";
    else if(c.kind==="quest" && c.step===1 && (!Number.isSafeInteger(c.rewardCredits)||c.rewardCredits<0||c.rewardCredits>100000))c.error="Choose a whole credit reward between 0 and 100,000.";
    else { const summary=c.kind==="mission"?["",`${c.title}: ${c.pitch}`,c.stages.map(s=>s.name).join(" → "),c.rules.join(" · ")||"No success criteria selected",`${c.roles.length} roles · ${c.bounty} credit goal`][c.step]:c.kind==="plan"?`${c.name}: ${c.bet}`:`${c.title}: ${c.description}`;c.messages.push({who:"me",text:summary});c.error=""; c.step=Math.min(steps[c.kind].length-1,c.step+1); } callbacks.render(); return true;
  }
  if(action==="creation-jump")c.step=Number(id);
  if(action==="creation-add-stage"&&c.stages.length<12)c.stages.push(stage({name:"",goal:""}));
  if(action==="creation-remove-stage"&&c.stages.length>1)c.stages.splice(Number(id),1);
  if(action==="creation-add-rule") { const field=document.querySelector('[name="new-rule"]');const rule=field?.value.trim();if(rule&&!c.rules.includes(rule)&&c.rules.length<12){c.rules.push(rule);c.ruleOpts.push(rule);} }
  if(action==="creation-rule") {const rule=c.ruleOpts[Number(id)];c.rules=c.rules.includes(rule)?c.rules.filter(x=>x!==rule):c.rules.length<12?[...c.rules,rule]:c.rules;}
  if(action==="creation-role")c.roles=c.roles.includes(id)?c.roles.filter(x=>x!==id):[...c.roles,id];
  if(action==="creation-topic")c.tag=id;
  if(action==="creation-bounty") {c.bounty=Number(id);c.reserve=0;}
  if(action==="creation-reserve") {if(c.reserveUncertain){c.error="Retry the pending reservation before changing the amount.";callbacks.render();return true;}c.reserve=Number(id);c.reserveRequestId=null;}
  if(action==="creation-size")c.size=id;
  if(action==="creation-task-role")c.role=id;
  if(action==="creation-plan")c.planId=id;
  if(action==="creation-parent")c.parentId=id;
  if(action==="creation-dependency")c.dependencies=c.dependencies.includes(id)?c.dependencies.filter(x=>x!==id):[...c.dependencies,id];
  if(action==="creation-reward")c.rewardCredits=Number(id);
  if(action==="creation-advanced")c.advanced=!c.advanced;
  if(action==="creation-publish") { await callbacks.publish(c); return true; }
  callbacks.render(); return true;
}

export async function creationSubmit(c, text, callbacks) {
  if (!c || !text.trim()) return;
  if (c.busy || c.publishUncertain || c.reserveUncertain) {c.error="Retry the pending action before changing this proposal.";callbacks.render();return;}
  if (c.publishedMissionId) {c.error="Mission is already published. Open it to edit the details.";callbacks.render();return;}
  text=text.trim();
  if (!c.step) { c.idea=text; await callbacks.start(c.kind,text,c.ids); return; }
  const current=c.kind==="mission"?{title:c.title,pitch:c.pitch,tag:c.tag,stages:c.stages,rules:c.rules,roles:c.roles,team:c.team,bounty:c.bounty}:c.kind==="plan"?{name:c.name,squad:c.squad,bet:c.bet,stageId:c.ids.stageId}:{title:c.title,description:c.description,stageId:c.ids.stageId,planId:c.planId,parentId:c.parentId,dependencies:c.dependencies,callPrompt:c.callPrompt,callOptions:c.callOptions,rewardCredits:c.rewardCredits,role:c.role,size:c.size};
  c.messages.push({who:"me",text});
  await callbacks.start(c.kind,`Refine the current structured proposal ${JSON.stringify(current).slice(0,2500)}. Requested change: ${text.slice(0,900)}. Preserve every field not explicitly changed.`,c.ids);
}
