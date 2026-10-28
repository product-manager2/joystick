import { ROLES, award } from "../data/content.js";
import { Button, CloseButton, openSheet } from "../design/components.js";
import { color } from "../design/tokens.js";
import { contribute, mult, tok, tokFor } from "../game/economy.js";
import { LICENSE } from "../data/world.js";
import { playQuest } from "../game/questflow.js";
import { S, threads } from "../state.js";
import { go, render } from "../ui/chrome.js";
import { duoName, esc, fmt, gain, mission, titleCard, toast } from "../ui/helpers.js";

// ===================== Contract (joining) =====================
export function contractSheet(mid) {
  const m = mission(mid);
  let picks = [...S.roles];
  let signed = false;
  let allRoles = false, terms = false;
  const render = () => {
    const shown = allRoles ? Object.keys(ROLES) : [...new Set([...S.roles, ...picks])];
    const est = tokFor(m, { money: S.pledge.money, compute: S.pledge.compute });
    return `
      <div class="row"><span class="spacer"></span>${CloseButton()}</div>
      <div class="contract">
        <div class="cup" style="font-size:26px;text-align:center;color:var(--red)">Contract</div>
        <p class="clause"><b>${esc(duoName())}</b> join <b>${esc(m.title)}</b> as:</p>
        <div class="mini-roles">${shown.map(k => `<button data-c="role" data-x="${k}" aria-pressed="${picks.includes(k)}">${ROLES[k].name}</button>`).join("")}${allRoles ? "" : `<button data-c="more" class="more-roles">+ More</button>`}</div>
        <p class="clause">We win when:</p>
        <ol class="wins">${m.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ol>
        <p class="clause">We bring <span class="small muted">(charged to your card, not your earnings)</span>:</p>
        ${[["time", "Time / wk", [2, 5, 10], v => v + "h"], ["money", "Money", [0, 25, 100], v => "$" + v], ["compute", "GPU-h", [0, 20, 100], v => v ? v : "None"]].map(([k, l, opts, f]) => `
          <div class="pledge"><span class="small"><b>${l}</b></span><span class="mini-roles">${opts.map(v => `<button data-c="pledge" data-k="${k}" data-x="${v}" aria-pressed="${S.pledge[k] === v}">${f(v)}</button>`).join("")}</span></div>`).join("")}
        <button class="linkbtn" data-c="terms" style="align-self:flex-start;padding:0"><b>Fine print ${terms ? "▴" : "▾"}</b></button>
        ${terms ? `<ul class="news"><li>Licence: ${LICENSE[m.id] || "MIT"} on everything you ship</li><li>Claim a quest, then finish in 3 days or it reopens</li><li>Leave any time. Approved work stays paid</li><li>You're credited on what the mission ships</li><li>Disputes go to Referees. Their call is final</li></ul>` : ""}
        <div class="sigline">${signed ? `<span>${esc(S.name || "player")} & ${esc(S.agentName)}</span>` : ""}</div>
        <div class="typed small muted" style="text-align:center">signature</div>
      </div>
      <div class="sign-bar"><span class="small"><b class="display" style="font-size:18px;color:var(--navy)">+${fmt(est)} ${tok(m)}</b><span class="muted" style="display:block">now · more as you play</span></span>${Button(signed ? "Signed!" : "Sign", { variant: "red", "data-c": "sign", disabled: !picks.length })}</div>`;
  };
  openSheet({ label: "Mission contract", className: "contract-sheet", render, onClose: () => { if (!signed) S.pendingQuest = null; }, onClick: (e, close, draw) => {
    const b = e.target.closest("[data-c]");
    if (!b || signed) return;
    if (b.dataset.c === "more") { allRoles = true; return draw(); }
    if (b.dataset.c === "terms") { terms = !terms; return draw(); }
    if (b.dataset.c === "pledge") { S.pledge[b.dataset.k] = +b.dataset.x; return draw(); }
    if (b.dataset.c === "role") { const k = b.dataset.x; picks = picks.includes(k) ? picks.filter(x => x !== k) : [...picks, k]; return draw(); }
    if (b.dataset.c === "sign") {
      signed = true; draw();
      S.joined[m.id] = picks; m.players++;
      const sh = contribute(m, { money: S.pledge.money, compute: S.pledge.compute });
      setTimeout(() => toast(`Pledged · <b>+${fmt(sh)} ${tok(m)}</b> at ×${mult(m)}`), 1800);
      award("squad");
      threads.splice(1, 0, { id: "sq-" + m.id, kind: "squad", mission: m.id, title: `Your squad · ${m.title}`, unread: 1, msgs: [
        { who: "Rosa", color: "var(--pink)", text: `Hey! Critic here. Take ${m.stages[m.current].name} together?` }] });
      setTimeout(() => {
        close();
        gain(50, 0, 2);
        titleCard(esc(m.title), "SIGNED!", "Ready? Go!", () => {
          const pq = S.pendingQuest; S.pendingQuest = null;
          go("stage", { missionId: m.id });
          if (pq) setTimeout(() => playQuest(pq.id), 100);
        }, 1300);
      }, 900);
    }
  } });
}
