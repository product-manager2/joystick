import { ROLES, award } from "../data/content.js";
import { Button, CloseButton, openSheet } from "../design/components.js";
import { playQuest } from "../game/questflow.js";
import { leaderOf, strats } from "../game/strategies.js";
import { S, threads } from "../state.js";
import { go, render } from "../ui/chrome.js";
import { duoName, esc, findQuest, gain, mission, titleCard } from "../ui/helpers.js";

// ===================== Joining a mission =====================
// One tap: pick the roles you play as, then Join. Rules sit behind a link.
export function contractSheet(mid, sid) {
  const m = mission(mid);
  // You join a mission by joining one squad: the one you picked, the one behind the quest you tapped, or the leader
  const pq = S.pendingQuest && findQuest(S.pendingQuest.id)[0];
  const sq = strats(m).find(x => x.id === (sid || (pq && pq.strat))) || leaderOf(m);
  let picks = [...S.roles];
  let signed = false;
  let allRoles = false, terms = false;
  const render = () => {
    const shown = allRoles ? Object.keys(ROLES) : [...new Set([...S.roles, ...picks])];
    return `
      <div class="row"><span class="spacer"></span>${CloseButton()}</div>
      <div class="join">
        <div class="display" style="font-size:26px;text-align:center">Join ${esc(sq.squad)}</div>
        <p class="small muted" style="text-align:center">Their plan for ${esc(m.title)}: <b>${esc(sq.name)}</b></p>
        <p class="small" style="text-align:center"><b>${esc(duoName())}</b> play together. ${esc(S.agentName)} does the work, you make the calls.</p>
        <div class="eyebrow">We win when</div>
        <p class="small">${esc(m.rules[0] || m.stages[m.stages.length - 1].goal)}</p>
        <div class="eyebrow">We'll play as</div>
        <div class="mini-roles">${shown.map(k => `<button data-c="role" data-x="${k}" aria-pressed="${picks.includes(k)}">${ROLES[k].name}</button>`).join("")}${allRoles ? "" : `<button data-c="more" class="more-roles">+ More</button>`}</div>
        <button class="linkbtn" data-c="terms" style="align-self:flex-start;padding:0"><b>The rules ${terms ? "▴" : "▾"}</b></button>
        ${terms ? `<ul class="news"><li>Pick a quest, finish it in 3 days or it opens up again</li><li>Leave any time. Work that passed checking still pays</li><li>Your names go on everything the mission makes</li></ul>` : ""}
      </div>
      <div class="sign-bar"><span class="small muted">Free to join. Early players get a bigger piece of the mission.</span>${Button(signed ? "Joined!" : "Join", { variant: "red", "data-c": "sign", disabled: !picks.length })}</div>`;
  };
  openSheet({ label: `Join ${sq.squad}`, className: "contract-sheet", render, onClose: () => { if (!signed) S.pendingQuest = null; }, onClick: (e, close, draw) => {
    const b = e.target.closest("[data-c]");
    if (!b || signed) return;
    if (b.dataset.c === "more") { allRoles = true; return draw(); }
    if (b.dataset.c === "terms") { terms = !terms; return draw(); }
    if (b.dataset.c === "role") { const k = b.dataset.x; picks = picks.includes(k) ? picks.filter(x => x !== k) : [...picks, k]; return draw(); }
    if (b.dataset.c === "sign") {
      signed = true; draw();
      S.joined[m.id] = picks; m.players++; S.squads[m.id] = sq.id; S.squad = sq.squad;
      award("squad");
      threads.splice(1, 0, { id: "sq-" + m.id, kind: "squad", mission: m.id, title: `${sq.squad} · ${m.title}`, unread: 1, msgs: [
        { who: "Rosa", color: "var(--pink)", text: `Hey! Critic here. Take ${m.stages[m.current].name} together?` }] });
      setTimeout(() => {
        close();
        gain(50);
        titleCard(esc(sq.squad), "YOU'RE IN!", "Ready? Go!", () => {
          const pq = S.pendingQuest; S.pendingQuest = null;
          go("strategy", { missionId: m.id, stratId: sq.id });
          if (pq) setTimeout(() => playQuest(pq.id), 100);
        }, 1300);
      }, 900);
    }
  } });
}
