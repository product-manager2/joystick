import { FINISHED, OUTPUT_KIND, STAGE_RECAPS } from "../data/history.js";
import { DetailGroup as Group, DetailRow as Row, Stats, drill } from "../design/components.js";
import { where } from "./quests.js";
import { S, threads } from "../state.js";
import { go, render } from "../ui/chrome.js";
import { backBtn, esc, fmt, glyph, mission } from "../ui/helpers.js";

// ===================== Recaps of finished work =====================
// A cleared stage opens as a sheet over the map; a finished mission gets its own page.
// Both list what was produced and where it lives, and Pip can talk you through either.
export const finished = id => FINISHED.find(f => f.id === id);
const played = f => f.yours && S.together > 0;
// Outputs are addressed as "<mission or recap id>:<stage index or f>:<output index>"
function outputAt(key) {
  const [id, st, i] = key.split(":");
  const list = st === "f" ? finished(id).outputs : STAGE_RECAPS[id][+st].outputs;
  return list[+i];
}
const outputRows = (list, prefix) => Group(list.map(([name, kind, place, note], i) =>
  `<button class="drow" data-a="output" data-x="${prefix}:${i}"><span class="okind">${OUTPUT_KIND[kind].icon}</span><span style="min-width:0"><b>${esc(name.split(" · ")[0])}</b><span class="small muted" style="display:block">${esc(note)} · ${esc(place)}</span></span><span class="muted">›</span></button>`));

export function recapScreen() {
  const f = finished(S.recapId), mine = played(f);
  return `<div class="screen">
    <div class="card mhead">
      <div class="band" style="background:${f.color}">${backBtn("back", "lobby", "Back")}<span class="mtitle"><span class="row" style="gap:6px"><span class="kind kind-mission">Mission</span><span class="kind done-tag">✓ Finished</span></span><h1>${esc(f.title)}</h1><span class="msquad">Took ${esc(f.took)} · ${fmt(f.players)} players</span></span>${glyph(f)}</div>
      <div class="in">
        <p class="claim">${esc(f.result)}</p>
        ${Stats([[`$${fmt(f.bounty)}`, "bounty paid"], [`${f.stages.length}/${f.stages.length}`, "stages"], [`${f.squads}`, "squads"]])}
        <button class="btn blue block" data-a="askpip" data-x="f:${f.id}">Ask ${esc(S.agentName)} to explain it</button>
      </div>
    </div>
    ${mine ? `<div class="card banner"><span class="display" style="font-size:22px">★</span><span class="small"><b>Your part:</b> ${f.mine.quests.map(esc).join(", ")}. ${esc(f.mine.credit)}. You earned $${f.mine.earned} and ${f.mine.tokens} tokens.</span></div>` : ""}
    <h2 class="sec-title">What it produced</h2>
    ${outputRows(f.outputs, `${f.id}:f`)}
    <h2 class="sec-title">How it went</h2>
    <div class="card milestone"><ul class="mstones">${f.stages.map(([name, goal, won, squad]) => `<li class="done"><b>${esc(name)}</b><span>${esc(goal)}</span><span>Won by <b>${esc(won)}</b> · ${esc(squad)}</span></li>`).join("")}</ul></div>
  </div>`;
}

export function stageRecapSheet(m, i) {
  const r = (STAGE_RECAPS[m.id] || [])[i], st = m.stages[i];
  if (!r) return drill(`Stage ${i + 1} · ${esc(st.name)}`, `<p class="small">Cleared. ${esc(st.goal)}.</p>`, "Done");
  drill(`Stage ${i + 1} · ${esc(st.name)}`, `${where("stage", [m.title])}
    <p class="claim">${esc(r.result)}</p>
    ${Group([Row("✓", "The goal", esc(st.goal)), Row("★", `Won by ${esc(r.won)}`, `${esc(r.squad)} · ${r.days} days · ${fmt(r.people)} players`)])}
    <div class="eyebrow">What it produced</div>
    ${outputRows(r.outputs, `${m.id}:${i}`)}
    <button class="btn blue block" data-a="askpip" data-x="s:${m.id}:${i}">Ask ${esc(S.agentName)} what happened</button>`, "Cleared");
}

export function outputSheet(key) {
  const [name, kind, place, note, licence] = outputAt(key), K = OUTPUT_KIND[kind];
  drill(esc(name.split(" · ")[0]), `${Group([
      Row(K.icon, K.label, esc(note)),
      Row("▤", `Lives in ${esc(place)}`, kind === "live" ? "Anyone can use it" : "Open to everyone, no squad needed"),
      Row("©", "Licence", esc(licence || "Open")),
    ])}
    ${kind === "live" ? "" : `<button class="btn blue block" data-a="openin" data-x="${esc(place)}">Open in ${esc(place)} ↗</button>`}`, "Output");
}

// Pip explains finished work in your chat with it
export function askPip(key) {
  const [type, id, i] = key.split(":");
  let ask, parts;
  if (type === "f") {
    const f = finished(id);
    ask = `What happened in ${f.title}?`;
    parts = [`<b>${esc(f.title)}</b> took ${esc(f.took)}, ${fmt(f.players)} players and ${f.squads} squads. ${esc(f.result)}`,
      `How it went: ${f.stages.map(([name, goal, won]) => `<b>${esc(name)}</b> (${esc(goal.toLowerCase())}) was won by ${esc(won)}`).join("; ")}.`,
      `What it left behind: ${f.outputs.map(([n, k]) => `${esc(n.split(" · ")[0])} (${OUTPUT_KIND[k].label.toLowerCase()})`).join(", ")}. All of it is open, so anyone can reuse it.`,
      played(f) ? `Your part: ${f.mine.quests.map(esc).join(" and ")}. You're ${esc(f.mine.credit.toLowerCase())}.` : "Want me to open any of the files?"];
  } else {
    const m = mission(id), r = STAGE_RECAPS[id][+i], st = m.stages[+i];
    ask = `What happened in stage ${+i + 1} of ${m.title}?`;
    parts = [`Stage ${+i + 1}, <b>${esc(st.name)}</b>, had one goal: ${esc(st.goal.toLowerCase())}. ${esc(r.result)}`,
      `${esc(r.story)}`,
      `It took ${r.days} days and ${fmt(r.people)} players. It left behind ${r.outputs.map(([n]) => esc(n.split(" · ")[0])).join(" and ")}, which the next stages build on.`];
  }
  const t = threads.find(x => x.id === "partner");
  t.msgs.push({ me: true, text: ask }, { typing: true });
  go("thread", { thread: "partner" });
  setTimeout(() => {
    t.msgs = t.msgs.filter(x => !x.typing);
    t.msgs.push({ agent: true, html: true, text: parts.join("<br><br>") });
    if (S.screen === "thread") render();
  }, 900);
}
