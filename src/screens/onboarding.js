import { VALUES } from "../data/world.js";
import { ROLES, SUITS, medal, missions } from "../data/content.js";
import { color } from "../design/tokens.js";
import { playable, strats } from "../game/strategies.js";
import { homeDeck, homeMap, homeSwitch, startForm } from "./home.js";
import { S } from "../state.js";
import { BOT_PAINT, bot, botAv, esc, face, fmt, glyph, mission, mono, youAv, youColor } from "../ui/helpers.js";

// ===================== Onboarding =====================
export function onboard() {
  const dots = `<div class="dots">${[0, 1, 2, 3].map(i => `<i class="${i <= S.ob ? "on" : ""}"></i>`).join("")}</div>`;
  if (S.ob === 0 && S.home !== "classic") return S.home === "map" ? homeMap() : homeDeck();
  if (S.ob === 0) {
    const glio = missions[0];
    return `<div class="title-screen">
    ${homeSwitch()}
    <div class="hero">
      <div class="live-pill"><i></i>${missions.reduce((a, m) => a + m.players, 0).toLocaleString()} playing now</div>
      <div class="logo-big">Joystick</div>
      <div class="hero-stage">
        <span class="sticker s1"><span class="coin"></span>$250k bounty</span>
        <span class="sticker s2">+2 candidates</span>
        <span class="sticker s3">CLEARED!</span>
        <span class="sticker s4 medal-st">${medal("slayer", 54, true)}</span>
        <div class="bubble hero-bubble">Ready, partner?</div>
        <div class="hero-duo"><span class="av bounce">${face(youColor, 2)}</span><span class="av bounce" style="animation-delay:.2s">${bot(S.botColor, true)}</span></div>
        <div class="podium"></div>
      </div>
      <div class="ribbon"><span>Hard problems. Played like a game.</span></div>
      <div class="hero-stats">
        <span><b>${missions.length}</b> missions</span>
        <span><b>$${fmt(missions.reduce((a, m) => a + m.bounty, 0))}</b> in bounties</span>
        <span><b>${missions.reduce((a, m) => a + strats(m).length, 0)}</b> strategies racing</span>
      </div>
    ${startForm()}
      <a class="howto-link" href="#howto">How it works ↓</a>
    </div>
    <div class="ticker" aria-hidden="true"><span>${"&nbsp;★&nbsp; Rosa & Dot cleared “Verify docking” +$25 &nbsp;★&nbsp; Fold Gang is 1 quest from clearing a milestone &nbsp;★&nbsp; Kenji & Byte joined Open CAD &nbsp;★&nbsp; @dr.amara added $10k to the bounty ".repeat(2)}</span></div>
    <div class="howto-wrap">
      <div class="howto" id="howto">
        <div class="panel"><div class="card panel-card">
          <div class="step"><span class="num">1</span>Pick a problem.</div>
          <div class="mini-poster"><div class="band" style="background:${glio.color}">${glyph(glio)}<b>${esc(glio.title)}</b></div>
            <div class="mini-row"><span class="chip"><span class="coin"></span> $250k bounty</span><span class="chip">${glio.players.toLocaleString()} playing</span></div></div>
          <p class="panel-cap">Cure a disease. Ship a product. Or start your own.</p>
        </div></div>
        <div class="panel"><div class="card panel-card">
          <div class="step"><span class="num">2</span>Play your part.</div>
          <div class="mini-chat">
            <div class="msg">${botAv()}<div class="bubble"><div class="from">Pip <span class="via">via you</span></div>Which engine do we bet on?<div class="mini-opts"><span>Fast & free</span><span>Slow & exact</span></div></div></div>
            <div class="msg me">${youAv()}<div class="bubble">Fast & free</div></div>
          </div>
          <p class="panel-cap">Your AI partner does the legwork. You make the calls.</p>
        </div></div>
        <div class="panel"><div class="card panel-card">
          <div class="step"><span class="num">3</span>Own a piece of the win.</div>
          <div class="mini-win"><div class="gate"><i style="width:100%"></i></div><div class="cup" style="font-size:26px">Milestone cleared!</div><span class="chip" style="background:var(--gold)"><span class="coin"></span> +$600</span><span class="chip" style="background:var(--navy);color:var(--white)">+120 $GLIO</span></div>
          <p class="panel-cap">Put in time or money. Earn the mission’s token: your vote, and your cut of what it builds.</p>
        </div></div>
      </div>
      <div class="dots" id="howdots"><i class="on"></i><i></i><i></i></div>
    </div>
  </div>`;
  }
  if (S.ob === 1) {
    return `<div class="onboard">
      <div><h1 class="display" style="font-size:30px">What are you great at?</h1><div class="eyebrow" style="margin-top:6px">Pick up to three</div></div>
      ${rolePicker(S.roles, "ob-role")}
      <div><div class="eyebrow">And what should a solution be?</div>
        <div class="chips wrap" style="margin-top:8px">${VALUES.map(v => `<button class="chip" data-a="value" data-x="${v}" aria-pressed="${S.values.includes(v)}">${v}</button>`).join("")}</div></div>
      <div class="sticky-cta">${dots}
      <button class="btn red block" data-a="ob-next" ${S.roles.length ? "" : "disabled"}>${S.roles.length ? `That's me · ${S.roles.length}/3` : "Tap 1 to 3"}</button></div>
    </div>`;
  }
  if (S.ob === 3) {
    S.picks = S.picks || [];
    const fit = m => m.quests.filter(q => playable(q) && S.roles.includes(q.role)).length;
    const topics = ["All", ...new Set(missions.map(m => m.tag))];
    const topic = S.obTopic || "All";
    const list = missions.filter(m => topic === "All" || m.tag === topic).sort((a, b) => fit(b) - fit(a));
    return `<div class="onboard">
      <div><h1 class="display" style="font-size:30px">What do you care about?</h1><div class="eyebrow" style="margin-top:6px">Pick as many as you like</div></div>
      <div class="chips ob-topics">${topics.map(t => `<button class="chip" data-a="ob-topic" data-x="${t}" aria-pressed="${topic === t}">${t}</button>`).join("")}</div>
      <div class="list">${list.map(m => `
        <button class="card pickm" data-a="ob-mission" data-x="${m.id}" aria-pressed="${S.picks.includes(m.id)}">
          <span class="band" style="background:${m.color}">${glyph(m)}<b>${esc(m.title)}</b></span>
          <span class="pick-body"><span class="small"><b>$${fmt(m.bounty)}</b> bounty · ${m.players.toLocaleString()} playing</span>
            ${fit(m) ? `<span class="fit">${fit(m)} quest${fit(m) === 1 ? "" : "s"} fit your style</span>` : ""}
            <span class="pick-tick">${S.picks.includes(m.id) ? "✓ Joined" : "+ Join"}</span></span>
        </button>`).join("")}</div>
      <div class="sticky-cta">${dots}
        <button class="btn red block" data-a="ob-done" ${S.picks.length ? "" : "disabled"} style="font-size:18px;padding:15px">${S.picks.length ? "Let's play" : "Pick one"}</button></div>
    </div>`;
  }
  return `<div class="onboard">
    <h1 class="display" style="font-size:30px">Meet your partner.</h1>
    <div class="sunbox"><span class="av bounce" style="width:120px;height:120px">${bot(S.botColor, true)}</span>
      <p class="cup" style="font-size:22px">“You call the shots. I do the legwork.”</p></div>
    <div class="field"><label for="pname">Your name</label><input class="inp" id="pname" value="${esc(S.name)}" placeholder="nova" maxlength="16"></div>
    <div class="field"><label for="aname">Its name</label><input class="inp" id="aname" value="${esc(S.agentName)}" maxlength="12"></div>
    <div class="field"><label>Its color</label>${swatches()}</div>
    <div class="sticky-cta">${dots}
    <button class="btn red block" data-a="ob-next" style="font-size:18px;padding:15px">Next</button></div>
  </div>`;
}
export const swatches = () => `<div class="swatches">${BOT_PAINT.map(c => `<button class="swatch" data-a="paint" data-x="${c}" style="background:${c}" aria-label="Paint ${c}" aria-pressed="${S.botColor === c}"></button>`).join("")}</div>`;
export function rolePicker(selected, action, max = 3) {
  return Object.entries(SUITS).map(([sk, s]) => `
    <div class="suit">
      <div class="suit-head"><i class="pip" style="background:${s.color}"></i>${s.name}</div>
      <div class="role-grid ${selected.length >= max ? "full" : ""}">${Object.entries(ROLES).filter(([, r]) => r.suit === sk).map(([k, r]) => `
        <button class="role" data-a="${action}" data-x="${k}" aria-pressed="${selected.includes(k)}">${mono(k)}<span><b>${r.name}</b><span class="muted">${r.does}</span></span></button>`).join("")}
      </div>
    </div>`).join("");
}
