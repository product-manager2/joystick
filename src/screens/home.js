import { GLYPHS, missions } from "../data/content.js";
import { color } from "../design/tokens.js";
import { mult } from "../game/economy.js";
import { gateOf, leaderOf, strats } from "../game/strategies.js";
import { MISSION_WHY, chanIcon } from "./quests.js";
import { S } from "../state.js";
import { bot, esc, face, fmt, glyph, mission, youColor } from "../ui/helpers.js";

// ===================== Home screens: three takes to compare =====================
export const startForm = () => `<div class="start hero-start">
    <button class="btn red block" data-a="ob-next" style="font-size:22px;padding:16px">Start playing</button>
    <button class="linkbtn" data-a="returning">I've played before</button>
    <a class="linkbtn" href="/chat.html">Sign in &amp; chat</a>
  </div>`;
export const HEADLINE = `Change the world. <span>Multiplayer.</span>`;
export const PUNCH = { glio: "Cure brain cancer. With 1,284 strangers.", cad: "Free CAD for every engineer on Earth.", reef: "Map every reef on Earth. From space.", tutor: "A maths teacher in every kid's pocket." };
// Deck: the missions themselves are the pitch
export function homeDeck() {
  return `<div class="title-screen deck-home">
    <div class="deck-top">
      <div class="logo-mid">Joystick</div>
      <div class="deck-tag">${HEADLINE}</div>
    </div>
    <div class="deck-mid"><div class="deck" id="deck">${missions.map(m => {
      const g = gateOf(m), lead = leaderOf(m);
      return `<article class="card deckcard">
        <div class="band" style="background:${m.color}">${glyph(m)}<h3>${esc(m.title)}</h3></div>
        <div class="dbody">
          <p class="punch">${esc(PUNCH[m.id] || m.pitch)}</p>
          <p class="dwhy">${esc(MISSION_WHY[m.id] || "")}</p>
          <div class="bignums">
            <div><b>$${fmt(m.bounty)}</b><span>to win</span></div>
            <div><b>${m.players.toLocaleString()}</b><span>playing</span></div>
            <div><b>${Math.round(g.have / g.need * 100)}%</b><span>done</span></div>
          </div>
        </div>
      </article>`; }).join("")}</div>
    <div class="dots" id="deckdots">${missions.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div></div>
    ${startForm()}
  </div>`;
}
