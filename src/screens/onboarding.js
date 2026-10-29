import { ROLES, SUITS, medal, missions } from "../data/content.js";
import { color } from "../design/tokens.js";
import { playable, strats } from "../game/strategies.js";
import { homeDeck, startForm } from "./home.js";
import { S } from "../state.js";
import { SHAPES, bot, botAv, esc, face, fmt, glyph, mission, mono, youAv, youColor } from "../ui/helpers.js";

// ===================== Onboarding =====================
export function onboard() {
  const dots = `<div class="dots">${[0, 1, 2, 3].map(i => `<i class="${i <= S.ob ? "on" : ""}"></i>`).join("")}</div>`;
  if (S.ob === 0) return homeDeck();
  if (S.ob === 1) {
    return `<div class="onboard">
      <div><h1 class="display" style="font-size:30px">What are you great at?</h1><div class="eyebrow" style="margin-top:6px">Pick up to three</div></div>
      ${rolePicker(S.roles, "ob-role")}
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
  // Character creator: your agent on a podium, naming and painting it updates it live
  return `<div class="onboard meet">
    <h1 class="display" style="font-size:30px">Meet your agent.</h1>
    <div class="meet-stage">
      <div class="say">Hi! I'm <b data-botname>${esc(S.agentName)}</b>. ${SHAPES[S.botShape].line}. You call the shots, I do the legwork.</div>
      <div class="meet-pod"><span class="av bounce meet-bot">${bot(S.botShape, true)}</span><div class="podium"></div></div>
    </div>
    <div class="field nameplate"><label for="aname">Name it</label><input class="inp" id="aname" value="${esc(S.agentName)}" maxlength="12" autocomplete="off"></div>
    <div class="chips wrap">${["Pip", "Bolt", "Sprout", "Mochi", "Rex"].map(n => `<button class="chip" data-a="botname" data-x="${n}" aria-pressed="${S.agentName === n}">${n}</button>`).join("")}</div>
    <div class="field"><label>Pick a look</label>${shapePicker()}</div>
    <div class="perks">${[["⚙", "Does the legwork", "Research, code, outreach"], ["✎", "Learns your calls", "Asks you on the big ones"], ["✓", "Works for you", "Ships under your name"]].map(([i, t, d]) => `<div class="perk"><span class="perk-i">${i}</span><b>${t}</b><span>${d}</span></div>`).join("")}</div>
    <div class="field"><label for="pname">And what should it call you?</label><input class="inp" id="pname" value="${esc(S.name)}" placeholder="nova" maxlength="16" autocomplete="off"></div>
    <div class="sticky-cta">${dots}
    <button class="btn red block" data-a="ob-next" style="font-size:18px;padding:15px">Team up with <span data-botname>${esc(S.agentName)}</span></button></div>
  </div>`;
}
export const shapePicker = (keep = false) => `<div class="shapes">${Object.entries(SHAPES).map(([k, sh]) => `<button class="shape-pick" data-a="shape" data-x="${k}"${keep ? ' data-keep="1"' : ""} aria-pressed="${S.botShape === k}" aria-label="${sh.name}: ${sh.line}"><span class="av">${bot(k)}</span><b>${sh.name}</b></button>`).join("")}</div>`;
export function rolePicker(selected, action, max = 3) {
  return Object.entries(SUITS).map(([sk, s]) => `
    <div class="suit">
      <div class="suit-head"><i class="pip" style="background:${s.color}"></i>${s.name}</div>
      <div class="role-grid ${selected.length >= max ? "full" : ""}">${Object.entries(ROLES).filter(([, r]) => r.suit === sk).map(([k, r]) => `
        <button class="role" data-a="${action}" data-x="${k}" aria-pressed="${selected.includes(k)}">${mono(k)}<span><b>${r.name}</b><span class="muted">${r.does}</span></span></button>`).join("")}
      </div>
    </div>`).join("");
}
