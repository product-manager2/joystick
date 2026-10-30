import { esc, glyph } from "../ui/helpers.js";

// ===================== Home screens: three takes to compare =====================
export const startForm = () => `<div class="start hero-start">
    <button class="btn red block" data-a="ob-next" style="font-size:22px;padding:16px">Start playing</button>
    <button class="linkbtn" data-a="returning">I've played before</button>
    <a class="linkbtn" href="/chat.html">Sign in &amp; chat</a>
  </div>`;
export const HEADLINE = `Change the world. <span>Multiplayer.</span>`;
// The four hero cards: real seeded missions, each named for the problem it fixes.
export const HERO = [
  { glyph: "helix", color: "var(--pink)", title: "Make glioblastoma survivable", punch: "Beat the deadliest brain cancer. Together.", why: "Most patients die within 15 months. That hasn't changed in 20 years.", prize: "$250k", players: 640, stage: "3/6" },
  { glyph: "cube", color: "var(--gold)", title: "Every Indian can use AI in their language", punch: "AI that speaks Odia, Bodo and Santali.", why: "Most AI is built for English. Most of India doesn't speak it.", prize: "₹50L", players: 310, stage: "1/5" },
  { glyph: "wave", color: "var(--sky)", title: "Catch dying reefs in time to save them", punch: "Save the reef before it turns white.", why: "Coral can bleach in weeks, and most reefs are never checked.", prize: "$85k", players: 95, stage: "2/4" },
  { glyph: "spark", color: "var(--blue)", title: "Get families the benefits they're owed", punch: "Money that's already theirs. In their hands.", why: "Families in UP miss pensions and scholarships because the forms are too hard.", prize: "₹15L", players: 260, stage: "2/4" },
];
// Deck: the missions themselves are the pitch
export function homeDeck() {
  return `<div class="title-screen deck-home">
    <div class="deck-top">
      <div class="logo-mid">Joystick</div>
      <div class="deck-tag">${HEADLINE}</div>
    </div>
    <div class="deck-mid"><div class="deck" id="deck">${HERO.map(m => `<article class="card deckcard">
        <div class="band" style="background:${m.color}">${glyph(m)}<h3>${esc(m.title)}</h3></div>
        <div class="dbody">
          <p class="punch">${esc(m.punch)}</p>
          <p class="dwhy">${esc(m.why)}</p>
          <div class="bignums">
            <div><b>${m.prize}</b><span>to win</span></div>
            <div><b>${m.players}</b><span>playing</span></div>
            <div><b>${m.stage}</b><span>stage</span></div>
          </div>
        </div>
      </article>`).join("")}</div>
    <div class="dots" id="deckdots">${HERO.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div></div>
    ${startForm()}
  </div>`;
}
