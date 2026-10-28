import "./design/tokens.css";
import "./design/base.css";
import "./design/components.css";
import "./styles/screens.css";
import { missions } from "./data/content.js";
import { fundPct, myVotes } from "./game/economy.js";
import { ensureStrategies, strats } from "./game/strategies.js";
import { sendInThread } from "./screens/comms.js";
import { contractSheet } from "./screens/contract.js";
import { forgeKind, forgeLaunch, forgeNext, forgeStart, forgeText } from "./screens/forge.js";
import { drawTrail } from "./screens/missions.js";
import { doSplit, fuelSheet, launchStrategy, pickCall, playQuest, proposeStrategy, sendInRoom, splitQuest, startSession } from "./screens/quests.js";
import { S } from "./state.js";
import { go, render } from "./ui/chrome.js";
import { $, duoName, esc, findQuest, loadReturning, mission, thread, titleCard, toast, toggle } from "./ui/helpers.js";

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
  const t = e.target, f = S.forge;
  if (t.id === "pname") S.name = t.value.trim();
  if (t.id === "aname") S.agentName = t.value.trim() || "Pip";
  if (f && t.id === "ftitle") f.title = t.value;
  if (f && t.id === "fpitch") f.pitch = t.value;
  if (f && t.dataset.fs) f.stages[+t.dataset.fs] = t.value;
});
document.addEventListener("submit", e => {
  e.preventDefault();
  if (e.target.id === "stageBar") { const v = $("#stagesay").value.trim(); if (v) startSession(v); }
  if (e.target.id === "stratBar") { const v = $("#stratsay").value.trim(); if (v) startSession(v, `${strats(mission()).find(x => x.id === S.stratId).name}: ${v.replace(/@\S+\s*/, "").slice(0, 24)}`); }
  if (e.target.id === "roomComposer") { const v = $("#roomsay").value.trim(); if (v) sendInRoom(v); }
  if (e.target.id === "composer") { const v = $("#say").value.trim(); if (v) sendInThread(v); }
  if (e.target.id === "forgeComposer") { const v = $("#fsay").value.trim(); if (v) forgeText(v); }
});
document.addEventListener("click", e => {
  const b = e.target.closest("[data-a]");
  if (!b || b.disabled || b.closest(".scrim") || (b.closest(".titlecard") && b.dataset.a !== "onward")) return;
  const a = b.dataset.a, x = b.dataset.x, f = S.forge;
  switch (a) {
    case "ob-next": if (S.ob === 2 && !S.name) S.name = "nova"; S.ob++; return render();
    case "ob-role": S.roles = toggle(S.roles, x, 3); return render();
    case "ob-mission": S.picks = toggle(S.picks || [], x); return render();
    case "ob-done": {
      (S.picks || []).forEach(id => { S.joined[id] = [...S.roles]; mission(id).players++; });
      S.badges.push("squad");
      S.lobbyTab = "mine";
      return titleCard("", "READY?", `${esc(duoName())} — Go!`, () => go("play"));
    }
    case "returning": return loadReturning();
    case "ltab": S.lobbyTab = x; return render();
    case "paint": S.botColor = x; return render();
    case "back": return go(S.from || "play");
    case "style-toggle": S.styleOpen = !S.styleOpen; return render();
    case "duo-role": { const n = toggle(S.roles, x, 3); if (n.length) S.roles = n; return render(); }
    case "go": return go(x);
    case "filter": S.filter = x; return render();
    case "ob-topic": S.obTopic = x; return render();
    case "mission": return go("mission", { missionId: x, tab: "map" });
    case "tab": S.tab = x; return render();
    case "contract": return contractSheet(x);
    case "stage": {
      const m = mission(), i = +x;
      if (i === m.current) return titleCard(`Milestone ${i + 1}`, esc(m.stages[i].name), "Ready? Go!", () => go("stage"), 1200);
      return toast(i < m.current ? `${esc(m.stages[i].name)} · cleared` : `Clear ${esc(m.stages[m.current].name)} first`);
    }
    case "openq": S.roomTab = "chat"; return go("quest", { missionId: x, questId: b.dataset.q, stratId: findQuest(b.dataset.q)[0].strat });
    case "quest": { const [q, mm] = findQuest(x); q.unread = 0; S.roomTab = q.visited ? "chat" : "brief"; q.visited = true; return go("quest", { missionId: mm.id, questId: x, stratId: q.strat }); }
    case "rtab": { const [q] = findQuest(S.questId); S.roomTab = x; if (x === "chat") q.unreadChat = 0; return render(); }
    case "strategy": return go("strategy", { stratId: x });
    case "strategy-from-map": return go("strategy", { stratId: x });
    case "backit": { const m = mission(); S.backed = { ...(S.backed || {}), [m.id]: S.backed?.[m.id] === x ? null : x }; if (S.backed[m.id]) toast("Backed. <b>+$100</b> if it leads at the gate"); return render(); }
    case "propose": return proposeStrategy();
    case "showall": S.showAll[x] = !S.showAll[x]; return render();
    case "vote": { const m = mission(), v = myVotes(m); v[x] = Math.max(0, (v[x] || 0) + +b.dataset.d); return render(); }
    case "lockvotes": { const m = mission(); S.locked[m.id] = true; const top = [...strats(m)].sort((a, b) => fundPct(m, b) - fundPct(m, a))[0]; toast(`Votes locked · <b>${esc(top.name)}</b> gets ${fundPct(m, top)}%`); return render(); }
    case "fuelit": return fuelSheet(x);
    case "home": S.home = x; return render();
    case "mapisle": S.mapPick = x; return render();
    case "newstrat": { const c = mission().sessions.find(c => c.id === S.sessionId); if (c) c.proposing = false; return launchStrategy(x); }
    case "split": return splitQuest(x);
    case "dosplit": return doSplit(x);
    case "session": return go("session", { sessionId: x });
    case "roomquick": return sendInRoom(x);
    case "mission-ch": return go("stage", { missionId: x });
    case "play": return playQuest(x, b.dataset.mode);
    case "pick": return pickCall(x, +b.dataset.i);
    case "thread": return go("thread", { thread: x });
    case "quick": return sendInThread(x);
    case "forge": return forgeStart();
    case "f-kind": return forgeKind(x);
    case "f-next": return forgeNext();
    case "f-addstage": f.stages.splice(f.stages.length - 1, 0, "New milestone"); return render();
    case "f-delstage": f.stages.splice(+x, 1); return render();
    case "f-rule": { const r = f.ruleOpts[+x]; f.rules = toggle(f.rules, r); return render(); }
    case "f-role": f.roles = toggle(f.roles, x); return render();
    case "f-amt": f.bounty = +x; return render();
    case "f-launch": return forgeLaunch();
  }
});

// Boot: build each mission's strategies, then draw the first screen
missions.forEach(ensureStrategies);
render();

// Offline support for the installed app (production builds only, so dev reloads stay fresh)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}

// Dev-only console handle for testing screens: jq.go("lobby"), jq.S, …
if (import.meta.env.DEV) window.jq = { S, go, render, missions, mission, loadReturning, contractSheet, fuelSheet, forgeStart, findQuest };
