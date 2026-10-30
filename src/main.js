import { askPip, outputSheet, stageRecapSheet } from "./screens/recap.js";
import "./design/tokens.css";
import "./design/base.css";
import "./design/components.css";
import "./styles/screens.css";
import "./styles/desktop.css";
import "./live/style.css";
import { bootAccount, loadGame, live } from "./live/game-client.js";
import { applySnapshot, handleLiveClick, handleLiveSubmit, handleLiveInput, handleLiveFile, openPushRoom } from "./live/game-ui.js";
import { refreshPush } from "./live/push.js";
import { installViewportSizing } from "./ui/viewport.js";
import { missions } from "./data/content.js";
import { reopenDrill } from "./design/components.js";
import { learnedSheet, lookSheet, styleSheet, walletSheet } from "./screens/profile.js";
import { fixQuest, pickCall, playQuest, submitProof } from "./game/questflow.js";
import { ensureStrategies, strats } from "./game/strategies.js";
import { sendInThread } from "./screens/comms.js";
import { contractSheet } from "./screens/contract.js";
import { forgeKind, forgeLaunch, forgeNext, forgeStart, forgeText } from "./screens/forge.js";
import { drawTrail } from "./screens/missions.js";
import { backSheet, fuelSheet, launchStrategy, proposeStrategy, sendInRoom, stageCleared, startSession } from "./screens/quests.js";
import { creditsSheet, stageBriefSheet, historySheet, inputSheet, kycSheet, ledgerSheet, manageSheet, notifSheet, openDM, payoutSheet, prizeSheet, proofSheet, refereeSheet, reqSheet, reviewInfo, skillsSheet, squadSheet, toolsSheet, trustSheet, verifySheet } from "./screens/sheets.js";
import { S } from "./state.js";
import { go, goBack, render } from "./ui/chrome.js";
import { $, duoName, esc, findQuest, fmt, loadReturning, mission, thread, titleCard, toast, toggle } from "./ui/helpers.js";
import { hasSkill } from "./game/personalise.js";
import { demandOf } from "./screens/missions.js";

// ===================== Events =====================
window.addEventListener("resize", () => { if (S.screen === "mission" && S.tab === "map") drawTrail(); });
document.addEventListener("scroll", e => {
  if (e.target.id === "deck") {
    const i = Math.round(e.target.scrollLeft / (e.target.firstElementChild?.offsetWidth + 12 || 1));
    document.querySelectorAll("#deckdots i").forEach((d, j) => d.classList.toggle("on", j === i));
    return;
  }
  if (e.target.id !== "howto") return;
  const i = Math.round(e.target.scrollLeft / e.target.clientWidth);
  document.querySelectorAll("#howdots i").forEach((d, j) => d.classList.toggle("on", j === i));
}, true);
document.addEventListener("input", e => {
  if (S.live && handleLiveInput(e)) return;
  const t = e.target, f = S.forge;
  if (t.id === "pname") S.name = t.value.trim();
  if (t.id === "aname") { S.agentName = t.value.trim() || "Pip"; document.querySelectorAll("[data-botname]").forEach(el => { el.textContent = S.agentName; }); }
  if (f && t.id === "ftitle") f.title = t.value;
  if (f && t.id === "fpitch") f.pitch = t.value;
  if (f && t.dataset.fs) f.stages[+t.dataset.fs] = t.value;
});
document.addEventListener("change", e => { if (S.live) handleLiveFile(e); });
document.addEventListener("submit", e => {
  if (S.live) { e.preventDefault(); handleLiveSubmit(e); return; }
  e.preventDefault();
  if (e.target.id === "stageBar") { const v = $("#stagesay").value.trim(); if (v) startSession(v); }
  if (e.target.id === "stratBar") { const v = $("#stratsay").value.trim(); if (v) startSession(v, `${strats(mission()).find(x => x.id === S.stratId).name}: ${v.replace(/@\S+\s*/, "").slice(0, 24)}`); }
  if (e.target.id === "roomComposer") { const v = $("#roomsay").value.trim(); if (v) sendInRoom(v); }
  if (e.target.id === "composer") { const v = $("#say").value.trim(); if (v) sendInThread(v); }
  if (e.target.id === "forgeComposer") { const v = $("#fsay").value.trim(); if (v) forgeText(v); }
});
document.addEventListener("click", async e => {
  if (S.live && await handleLiveClick(e)) return;
  const b = e.target.closest("[data-a]");
  if (!b || b.disabled || (b.closest(".scrim") && !b.closest(".dd")) || (b.closest(".titlecard") && b.dataset.a !== "onward")) return;
  // Actions inside a drill-down close it, unless they change something shown in it (data-keep)
  const dd = b.closest(".dd");
  if (dd && !b.dataset.keep) dd.remove();
  const a = b.dataset.a, x = b.dataset.x, f = S.forge;
  const fromNav = Boolean(b.closest("#nav"));
  switch (a) {
    case "ob-next": if (S.ob === 2 && !S.name) S.name = "nova"; S.ob++; return render();
    case "ob-role": S.roles = toggle(S.roles, x, 3); return render();
    case "botname": S.agentName = x; render(); return dd && reopenDrill();
    case "recap": return go("recap", { recapId: x });
    case "prize": return prizeSheet(mission(x));
    case "stagebrief": return stageBriefSheet(mission(x));
    case "output": return outputSheet(x);
    case "askpip": return askPip(x);
    case "ob-mission": S.picks = toggle(S.picks || [], x); return render();
    case "ob-done": {
      (S.picks || []).forEach(id => { S.joined[id] = [...S.roles]; mission(id).players++; });
      S.badges.push("squad");
      S.lobbyTab = "mine";
      return titleCard("", "READY?", `${esc(duoName())} — Go!`, () => go("lobby"));
    }
    case "returning": return loadReturning();
    case "ltab": S.lobbyTab = x; return render();
    case "shape": S.botShape = x; render(); return dd && reopenDrill();
    case "back": return goBack(x || "lobby");
    case "duo-role": { const n = toggle(S.roles, x, 3); if (n.length) S.roles = n; render(); return reopenDrill(); }
    case "go": { const navigated = go(x); if (fromNav && navigated) S.hist = []; return navigated; }
    case "filter": S.filter = x; return render();
    case "ob-topic": S.obTopic = x; return render();
    case "mission": return go("mission", { missionId: x, tab: "map" });
    case "tab": S.tab = x; return render();
    case "contract": return contractSheet(x);
    case "stage": {
      const m = mission(), i = +x;
      if (i === m.current) return titleCard(`Stage ${i + 1}`, esc(m.stages[i].name), "Ready? Go!", () => go("stage"), 1200);
      if (i > m.current && (m.stages[i].tracks || []).length > 1) return toast(`${esc(m.stages[i].name)}: ${m.stages[i].tracks.length} tracks run in parallel, once ${esc(m.stages[m.current].name)} clears`);
      if (i < m.current) return stageRecapSheet(m, i);
      return toast(`Clear ${esc(m.stages[m.current].name)} first`);
    }
    case "openq": if (findQuest(b.dataset.q)[0].back) return playQuest(b.dataset.q); S.roomTab = "chat"; return go("quest", { missionId: x, questId: b.dataset.q, stratId: findQuest(b.dataset.q)[0].strat });
    case "quest": { const [q, mm] = findQuest(x); if (q.back) return playQuest(x); q.unread = 0; S.roomTab = q.visited ? "chat" : "brief"; q.visited = true; return go("quest", { missionId: mm.id, questId: x, stratId: q.strat }); }
    case "rtab": { const [q] = findQuest(S.questId); S.roomTab = x; if (x === "chat") q.unreadChat = 0; return render(); }
    case "strategy": return go("strategy", { stratId: x });
    case "strategy-from-map": return go("strategy", { stratId: x });
    case "joinsquad": { const mm = mission(), s = strats(mm).find(y => y.id === x); if (!S.joined[mm.id]) return contractSheet(mm.id, x); S.squads[mm.id] = x; S.squad = s.squad; toast(`You joined ${esc(s.squad)} ✓`); return render(); }
    case "backsheet": { const mm = missions.find(y => (y.strategies || []).some(s => s.id === x)); if (mm) S.missionId = mm.id; return backSheet(x); }
    case "openstrat": return go("strategy", { missionId: x, stratId: b.dataset.s });
    case "needit": { const m = mission(x); if (S.voiced[m.id]) return; S.voiced[m.id] = true; demandOf(m).asks++; toast("Added your voice · it pays a little if this ships"); return render(); }
    case "merge": S.mergeSeen[x] = true; toast("Suggested to both squads. They vote on it"); return render();
    case "mergeno": S.mergeSeen[x] = true; return render();
    case "propose": return proposeStrategy();
    case "showall": S.showAll[x] = !S.showAll[x]; return render();
    case "fuelit": return fuelSheet(x);
    case "newstrat": { const c = mission().sessions.find(c => c.id === S.sessionId); if (c) c.proposing = false; return launchStrategy(x); }
    case "session": return go("session", { sessionId: x });
    case "roomquick": return sendInRoom(x);
    case "mission-ch": return go("stage", { missionId: x });
    case "play": return playQuest(x);
    case "pick": return pickCall(x, +b.dataset.i);
    case "thread": return go("thread", { thread: x });
    case "quick": return sendInThread(x);
    case "forge": return forgeStart();
    case "f-kind": return forgeKind(x);
    case "f-next": return forgeNext();
    case "f-addstage": f.stages.splice(f.stages.length - 1, 0, "New stage"); return render();
    case "f-delstage": f.stages.splice(+x, 1); return render();
    case "f-rule": { const r = f.ruleOpts[+x]; f.rules = toggle(f.rules, r); return render(); }
    case "f-role": f.roles = toggle(f.roles, x); return render();
    case "f-amt": f.bounty = +x; return render();
    case "f-launch": return forgeLaunch();
    case "f-fund": f.funded = true; toast(`$${fmt(f.bounty)} locked in escrow`); return render();
    // Drill-downs and the real-world steps behind them
    case "dclose": return;
    case "notifs": return notifSheet();
    case "trust": return trustSheet(mission(x));
    case "ledger": return ledgerSheet(mission());
    case "flagspend": return toast("Flagged. Referees will ask for the receipt");
    case "manage": return manageSheet(mission());
    case "approvestrat": strats(mission()).forEach(s => { if (s.status === "review") s.status = null; }); toast("Approved. It's live"); return render();
    case "topup": return fuelSheet(S.missionId);
    case "person": return go("person", { personId: x });
    case "dm": return openDM(x);
    case "pair": return toast(`Asked ${esc(x)} to pair. Their agent will reply`);
    case "squad": return squadSheet(findQuest(x)[0]);
    case "invite": { const [q] = findQuest(b.dataset.q); (q.invited = q.invited || []).push(x); toast(`Invite sent to ${esc(x)}`); return reopenDrill(); }
    case "reqs": return reqSheet(findQuest(x)[0]);
    case "verify": return verifySheet(x);
    case "doverify": { if (!hasSkill(x)) S.skills.push([x, "verified · " + b.dataset.m]); else S.skills = S.skills.map(([k, h]) => k === x ? [k, "verified · " + b.dataset.m] : [k, h]); toast(`${esc(x)} verified ✓`); render(); return S.screen === "quest" ? reqSheet(findQuest(S.questId)[0]) : skillsSheet(); }
    case "tool": S.tools[x] = !S.tools[x]; if (S.tools[x]) toast(`${esc(x)} connected`); return reopenDrill();
    case "openin": return toast(`Opens ${esc(x)}. Work happens there, results sync back`);
    case "input": return inputSheet(x);
    case "history": return historySheet(findQuest(x)[0]);
    case "watchq": return toast("We'll ping you when it unlocks");
    case "nudge": return toast("Nudged. The lab replies within a day");
    case "proof": return proofSheet(findQuest(x)[0]);
    case "attach": { const [q] = findQuest(b.dataset.q), e = q.evidence[+x]; q.proof[+x] = e.toLowerCase().replace(/[^a-z]+/g, "-") + (+x ? ".jpg" : ".pdf"); return reopenDrill(); }
    case "submitproof": return submitProof(x);
    case "fixq": return fixQuest(x);
    case "reviewinfo": return reviewInfo();
    case "refinfo": return refereeSheet();
    case "gvote": { const m = mission(); m.gv.mine = x; toast("Thanks 👍"); return render(); }
    case "opengate": return stageCleared(mission());
    case "acct": return ({ skills: skillsSheet, tools: toolsSheet, credits: creditsSheet, payouts: payoutSheet, wallet: walletSheet, look: lookSheet, style: styleSheet, learned: learnedSheet })[x]();
    case "kyc": S.kyc = true; toast("Identity verified ✓"); render(); return payoutSheet();
    case "withdraw": if (!S.kyc) return kycSheet(); toast(`$${fmt(S.coins)} on its way · 1–2 days`); S.coins = 0; return render();
    case "export": return toast(`Credits exported to ${esc(x)}`);
  }
});

// The prototype's seeded state is never shown to an authenticated account.
document.querySelector("#main").innerHTML = '<div class="live-loading" role="status">Opening Joystick…</div>';
installViewportSizing();
bootAccount(async () => {
  const snapshot = await loadGame();
  applySnapshot(snapshot);
  render();
  void refreshPush();
  const roomId=new URL(location.href).searchParams.get('room');
  if(roomId){
    await openPushRoom(roomId);
    const clean=new URL(location.href);clean.searchParams.delete('room');
    history.replaceState(null,'',clean.pathname+clean.search+clean.hash);
  }
}).catch(error => { document.querySelector("#main").textContent = error.message; });

// Offline support for the installed app (production builds only, so dev reloads stay fresh)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}

// Dev-only console handle for testing screens: jq.go("lobby"), jq.S, …
if (import.meta.env.DEV) window.jq = { S, go, render, missions, mission, findQuest };
