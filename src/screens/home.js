import { GLYPHS, missions } from "../data/content.js";
import { color } from "../design/tokens.js";
import { mult } from "../game/economy.js";
import { gateOf, leaderOf, strats } from "../game/strategies.js";
import { MISSION_WHY, chanIcon } from "./quests.js";
import { S } from "../state.js";
import { bot, esc, face, fmt, glyph, mission, youColor } from "../ui/helpers.js";

// ===================== Home screens: three takes to compare =====================
export const homeSwitch = () => `<div class="home-switch" role="group" aria-label="Try a home screen">${[["deck", "Deck"], ["map", "Map"], ["classic", "Classic"]].map(([k, l]) => `<button data-a="home" data-x="${k}" aria-pressed="${(S.home || "deck") === k}">${l}</button>`).join("")}</div>`;
export const startForm = () => `<div class="start hero-start">
    <button class="btn red block" data-a="ob-next" style="font-size:22px;padding:16px">Start playing</button>
    <button class="linkbtn" data-a="returning">I've played before</button>
  </div>`;
export const HEADLINE = `The world's hardest problems. <span>Now a game you can win.</span>`;
export const SUBLINE = "Play your part. Own a piece of the win.";
export const PUNCH = { glio: "Cure brain cancer. With 1,284 strangers.", cad: "Free CAD for every engineer on Earth.", reef: "Map every reef on Earth. From space.", tutor: "A maths teacher in every kid's pocket." };
// Deck: the missions themselves are the pitch
export function homeDeck() {
  const total = missions.reduce((a, m) => a + m.players, 0);
  return `<div class="title-screen deck-home">
    ${homeSwitch()}
    <div class="deck-top">
      <div class="logo-mid">Joystick</div>
      <div class="deck-tag">${HEADLINE}</div>
      <p class="hero-sub">${SUBLINE}</p>
      <div class="live-pill"><i></i>${total.toLocaleString()} people playing right now</div>
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
// Map: missions are islands on an overworld
export function homeMap() {
  const spots = [[95, 78], [268, 70], [92, 212], [270, 206]];
  const pick = mission(S.mapPick || missions[0].id);
  const isle = (m, [x, y]) => `<g class="isle ${pick === m ? "on" : ""}" data-a="mapisle" data-x="${m.id}" transform="translate(${x} ${y})" tabindex="0" role="button" aria-label="${esc(m.title)}">
      <ellipse cx="3" cy="8" rx="64" ry="36" fill="var(--navy)" opacity=".35"/>
      <path d="M-60 2 C-64 -24 -26 -38 0 -32 C30 -40 64 -22 58 2 C62 26 22 36 -4 33 C-34 37 -62 26 -60 2Z" fill="var(--sand)" stroke="var(--ink)" stroke-width="3"/>
      <path d="M-40 -2 C-42 -18 -14 -26 4 -22 C24 -26 44 -14 40 2 C42 16 14 22 -4 20 C-26 22 -42 14 -40 -2Z" fill="${m.color}" stroke="var(--ink)" stroke-width="2.5"/>
      <circle cx="0" cy="-2" r="17" fill="var(--white)" stroke="var(--ink)" stroke-width="2.5"/>
      <g transform="translate(-11 -13) scale(.7)">${GLYPHS[m.glyph]}</g>
      <path d="M30 -22 V-48" stroke="var(--ink)" stroke-width="2.5"/><path d="M30 -48 L48 -42 L30 -36Z" fill="${m === pick ? "var(--red)" : "var(--gold)"}" stroke="var(--ink)" stroke-width="2"/>
      <text x="0" y="52" text-anchor="middle" class="isle-label">${esc({ glio: "Cure Glioblastoma", cad: "Open CAD", reef: "Reef Map", tutor: "AI Tutor" }[m.id] || m.title.split(" ").slice(0, 2).join(" "))}</text>
    </g>`;
  const waves = [[30, 140], [170, 20], [320, 140], [180, 270], [40, 280], [320, 290]].map(([x, y]) => `<path d="M${x} ${y} q6 -6 12 0 t12 0" stroke="var(--white)" stroke-width="2.5" fill="none" opacity=".55" stroke-linecap="round"/>`).join("");
  return `<div class="title-screen map-home">
    ${homeSwitch()}
    <div class="map-top"><div class="logo-mid">Joystick</div><div class="deck-tag">${HEADLINE}</div><p class="hero-sub">${SUBLINE}</p></div>
    <div class="overworld">
      <svg viewBox="0 0 360 320" role="img" aria-label="Mission map">
        ${waves}
        <path d="M95 78 C170 40 200 40 268 70 M95 78 C70 140 70 160 92 212 M268 70 C300 140 300 160 270 206 M92 212 C170 250 200 250 270 206" stroke="var(--white)" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round" fill="none" opacity=".8"/>
        ${missions.slice(0, 4).map((m, i) => isle(m, spots[i])).join("")}
        <g transform="translate(150 128)">
          <path d="M-6 40 L66 40 L56 56 L4 56Z" fill="var(--red)" stroke="var(--ink)" stroke-width="3"/>
          <path d="M30 40 V2" stroke="var(--ink)" stroke-width="3"/><path d="M30 4 L54 30 L30 30Z" fill="var(--white)" stroke="var(--ink)" stroke-width="2.5"/>
          <g transform="translate(-2 14) scale(.75)">${face(youColor, 2).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g>
          <g transform="translate(34 14) scale(.75)">${bot(S.botColor).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g>
        </g>
      </svg>
    </div>
    <div class="card isle-card">
      <div class="row">${chanIcon(pick, 40)}<div style="min-width:0;flex:1"><b class="display" style="font-size:17px;color:var(--navy)">${esc(pick.title)}</b><div class="small muted">${esc(MISSION_WHY[pick.id] || pick.pitch)}</div></div></div>
      <div class="row wrap small" style="gap:6px"><span class="chip"><span class="coin" style="width:15px;height:15px"></span>$${fmt(pick.bounty)}</span><span class="chip">${strats(pick).length} strategies</span><span class="chip">${gateOf(pick).have}/${gateOf(pick).need} ${pick.unit}</span><span class="early">×${mult(pick)}</span></div>
    </div>
    ${startForm()}
  </div>`;
}
