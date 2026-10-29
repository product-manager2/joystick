import { missions } from "../data/content.js";
import { commsScreen, threadScreen } from "../screens/comms.js";
import { duoScreen } from "../screens/duo.js";
import { forgeScreen } from "../screens/forge.js";
import { drawTrail, lobby, missionScreen } from "../screens/missions.js";
import { onboard } from "../screens/onboarding.js";
import { playScreen } from "../screens/play.js";
import { roomScreen, stageScreen, startScript, strategyScreen } from "../screens/quests.js";
import { gateScreen, runGateVote } from "../screens/gate.js";
import { closeDrill } from "../design/components.js";
import { S, threads } from "../state.js";
import { $, botAv, duoName, esc, findQuest, mission, thread, youAv } from "./helpers.js";

// ===================== Chrome =====================
export function renderHud() {
  const h = $("#hud");
  h.innerHTML = `<div class="duo-mini">${youAv()}${botAv()}</div>
    <div class="who">
      <div class="name">${esc(duoName())}</div>
      <div class="meter"><i style="width:${S.xp / S.xpMax * 100}%"></i></div>
      <div class="sub">LV ${S.level} · ${S.streak}-day streak</div>
    </div>
    <div class="coins" title="Cash you can withdraw"><span class="coin"></span>${S.coins.toLocaleString()}</div>
    <button class="bell" data-a="notifs" aria-label="Updates"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>${S.notifs.filter(n => !n.read).length ? `<span class="unread">${S.notifs.filter(n => !n.read).length}</span>` : ""}</button>`;
  h.dataset.a = "go"; h.dataset.x = "duo";
  const unread = threads.reduce((a, t) => a + t.unread, 0) + missions.reduce((a, m) => a + (m.unread || 0), 0);
  $("#navBadge").innerHTML = unread ? `<span class="unread">${unread}</span>` : "";
}
export const FULL = ["stage", "strategy", "quest", "session", "thread", "forge", "gate"];
// History: each move to a different screen (or a different mission, strategy, quest or chat) is
// remembered, so Back returns to exactly where you came from, tab included. The bottom nav starts fresh.
const PLACE = ["missionId", "tab", "stratId", "questId", "thread", "sessionId", "roomTab", "lobbyTab"];
export function go(screen, extra = {}, remember = true) {
  const moved = screen !== S.screen || ["missionId", "stratId", "questId", "thread", "sessionId"].some(k => k in extra && extra[k] !== S[k]);
  if (remember && moved && S.screen !== "onboard") S.hist = [...(S.hist || []), Object.fromEntries([["screen", S.screen], ...PLACE.map(k => [k, S[k]])])].slice(-30);
  Object.assign(S, extra, { screen });
  closeDrill();
  render();
  $("#main").scrollTop = 0;
}
export function goBack(fallback = "lobby") {
  const h = (S.hist || []).pop();
  if (!h) return go(fallback, {}, false);
  const { screen, ...place } = h;
  go(screen, place, false);
}
export function render() {
  const inGame = S.screen !== "onboard";
  const fullChat = FULL.includes(S.screen);
  // The mission page has its own header, so the HUD steps aside there
  $("#hud").hidden = !inGame || fullChat || S.screen === "mission";
  $("#nav").hidden = !inGame || fullChat;
  const views = { onboard, play: playScreen, lobby, mission: missionScreen, stage: stageScreen, strategy: strategyScreen, quest: roomScreen, session: roomScreen, comms: commsScreen, thread: threadScreen, forge: forgeScreen, duo: duoScreen, gate: gateScreen };
  const main = $("#main");
  main.style.display = fullChat ? "flex" : "";
  main.style.flexDirection = fullChat ? "column" : "";
  main.style.overflowY = fullChat ? "hidden" : "";
  main.innerHTML = views[S.screen]();
  const tabFor = { play: "play", lobby: "lobby", mission: "lobby", comms: "comms", duo: "duo" };
  document.querySelectorAll(".nav button").forEach(b => b.setAttribute("aria-current", String(b.dataset.x === tabFor[S.screen])));
  if (inGame) renderHud();
  // Map lines need the final layout: draw after this frame and again once web fonts settle
  if (S.screen === "mission" && S.tab === "map") { setTimeout(drawTrail, 30); document.fonts?.ready.then(drawTrail); }
  if (S.screen === "quest") startScript(findQuest(S.questId)[0]);
  if (S.screen === "gate") runGateVote(mission());
  clearInterval(window.__howto);
  if (S.screen === "onboard" && S.ob === 0 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.__howto = setInterval(() => {
      const c = $("#howto");
      if (!c || document.activeElement?.id === "pname") return;
      const i = (Math.round(c.scrollLeft / c.clientWidth) + 1) % 3;
      c.scrollTo({ left: i * c.clientWidth, behavior: "smooth" });
    }, 3200);
  }
  if (fullChat) {
    const ms = $(".msgs");
    if (ms) ms.scrollTop = ms.scrollHeight;
  }
}
