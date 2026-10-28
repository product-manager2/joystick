import { missions } from "../data/content.js";
import { commsScreen, threadScreen } from "../screens/comms.js";
import { duoScreen } from "../screens/duo.js";
import { forgeScreen } from "../screens/forge.js";
import { drawTrail, lobby, missionScreen } from "../screens/missions.js";
import { onboard } from "../screens/onboarding.js";
import { playScreen } from "../screens/play.js";
import { roomScreen, stageScreen, startScript, strategyScreen } from "../screens/quests.js";
import { S, threads } from "../state.js";
import { $, botAv, duoName, esc, findQuest, mission, thread, youAv } from "./helpers.js";

// ===================== Chrome =====================
export function renderHud() {
  const h = $("#hud");
  h.innerHTML = `<div class="duo-mini">${youAv()}${botAv()}</div>
    <div class="who">
      <div class="name">${esc(duoName())}</div>
      <div class="meter"><i style="width:${S.xp / S.xpMax * 100}%"></i></div>
      <div class="sub">LV ${S.level} · Sync ${S.sync}% · ${S.streak}-day streak</div>
    </div>
    <div class="coins" title="Your bounty share"><span class="coin"></span>${S.coins.toLocaleString()}</div>`;
  h.dataset.a = "go"; h.dataset.x = "duo";
  const unread = threads.reduce((a, t) => a + t.unread, 0) + missions.reduce((a, m) => a + (m.unread || 0), 0);
  $("#navBadge").innerHTML = unread ? `<span class="unread">${unread}</span>` : "";
}
export const FULL = ["stage", "strategy", "quest", "session", "thread", "forge"];
export function go(screen, extra = {}) {
  if (FULL.includes(screen) && !FULL.includes(S.screen)) S.from = S.screen;
  Object.assign(S, extra, { screen });
  render();
  $("#main").scrollTop = 0;
}
export function render() {
  const inGame = S.screen !== "onboard";
  const fullChat = FULL.includes(S.screen);
  $("#hud").hidden = !inGame || fullChat;
  $("#nav").hidden = !inGame || fullChat;
  const views = { onboard, play: playScreen, lobby, mission: missionScreen, stage: stageScreen, strategy: strategyScreen, quest: roomScreen, session: roomScreen, comms: commsScreen, thread: threadScreen, forge: forgeScreen, duo: duoScreen };
  const main = $("#main");
  main.style.display = fullChat ? "flex" : "";
  main.style.flexDirection = fullChat ? "column" : "";
  main.style.overflowY = fullChat ? "hidden" : "";
  main.innerHTML = views[S.screen]();
  const tabFor = { play: "play", lobby: "lobby", mission: "lobby", comms: "comms", duo: "duo" };
  document.querySelectorAll(".nav button").forEach(b => b.setAttribute("aria-current", String(b.dataset.x === tabFor[S.screen])));
  if (inGame) renderHud();
  if (S.screen === "mission" && S.tab === "map") requestAnimationFrame(drawTrail);
  if (S.screen === "quest") startScript(findQuest(S.questId)[0]);
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
