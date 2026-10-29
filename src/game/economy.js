import { ROLES } from "../data/content.js";
import { LEDGER } from "../data/world.js";
import { strats } from "./strategies.js";
import { S } from "../state.js";
import { fmt } from "../ui/helpers.js";

// ===================== Economy =====================
// Missions run on four fuels and pay out four rewards. Every contribution turns into
// mission shares at the current milestone's multiplier, so early players earn more.
export const FUELS = {
  money:   { name: "Money",     color: "var(--gold)", icon: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v11"/>' },
  time:    { name: "Time",      color: "var(--sky)", icon: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>' },
  know:    { name: "Knowledge", color: "var(--lilac)", icon: '<path d="M9 17h6M10 20h4M12 4a6 6 0 0 0-3.5 10.9V17h7v-2.1A6 6 0 0 0 12 4z"/>' },
  compute: { name: "Compute",   color: "var(--leaf)", icon: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>' },
};
export const RATE = { money: 1, time: 50, know: 200, compute: 2 };   // contribution value in $
export const MULT = [3, 2, 1.5, 1.2, 1, 1];
export const mult = m => MULT[Math.min(m.current, MULT.length - 1)];
export const FUEL0 = {
  glio:  { money: [9200, 12000], time: [310, 400], know: [14, 20], compute: [2100, 3000], dryDays: 9,  supply: 480000, more: [41, 312] },
  cad:   { money: [2600, 5000],  time: [140, 300], know: [6, 12],  compute: [200, 600],   dryDays: 21, supply: 120000, more: [12, 96] },
  reef:  { money: [6000, 8000],  time: [220, 260], know: [9, 10],  compute: [80, 200],    dryDays: 30, supply: 210000, more: [6, 40] },
  tutor: { money: [3000, 10000], time: [40, 200],  know: [3, 15],  compute: [50, 400],    dryDays: 12, supply: 90000,  more: [9, 77] },
};
export const ASK = { "glio-dock": [6000, 150, 2500], "glio-repurpose": [4000, 120, 200], "glio-gen": [5000, 100, 1500], "glio-whole": [3500, 90, 100], "cad-rust": [40000, 600, 1000] };
// Matching pool for each milestone round: the part of the treasury that matches backers quadratically
export const POOL = { glio: 25000, cad: 8000, reef: 10000, tutor: 12000 };
export function fuelOf(m) {
  if (!m.fuel) m.fuel = JSON.parse(JSON.stringify(FUEL0[m.id] || { money: [0, 2000], time: [0, 100], know: [0, 5], compute: [0, 100], dryDays: 30, supply: 10000, more: [0, 0] }));
  return m.fuel;
}
export const fuelIcon = (k, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${FUELS[k].icon}</svg>`;
export const fuelNum = (k, v) => k === "money" ? "$" + fmt(v) : k === "time" ? fmt(v) + "h" : k === "know" ? fmt(v) : fmt(v);
export const fuelUnit = k => ({ money: "", time: "", know: "", compute: " GPU-h" })[k];
export function fuelGauges(m) {
  const f = fuelOf(m);
  return `<div class="fuels">${Object.keys(FUELS).map(k => {
    const [have, need] = f[k], pct = Math.min(100, have / need * 100);
    return `<div class="fuel"><span class="fi" style="background:${FUELS[k].color}">${fuelIcon(k, 16)}</span><span class="fbody"><span class="fname">${FUELS[k].name}</span><span class="meter"><i style="width:${pct}%;background:${FUELS[k].color}"></i></span><span class="fnum">${fuelNum(k, have)} / ${fuelNum(k, need)}${fuelUnit(k)}</span></span></div>`;
  }).join("")}</div>`;
}
export function tokenCard(m) {
  const mine = S.wallet.shares[m.id] || 0, t = TOKEN[m.id] || { pays: ["Bounty payouts"] };
  return `<div class="tokcard">
    <div class="row"><span class="tokcoin">${tok(m).slice(1, 2)}</span><span style="flex:1;min-width:0"><b class="tokname">${tok(m)}</b><span class="small muted" style="display:block">${fmt(fuelOf(m).supply + mine)} minted · ${fmt(holders(m))} holders</span></span>
      ${mine ? `<span class="tokmine"><b>${fmt(mine)}</b><span>${ownPct(m).toFixed(2)}%</span></span>` : ""}</div>
    <p class="small">${mine ? `You own <b>${ownPct(m).toFixed(2)}%</b> of this mission.` : "Own a small piece of this mission."} Owners vote on how the money is spent, and get paid if it makes money.</p>
    <div class="row" style="gap:8px"><button class="btn gold sm" style="flex:1" data-a="fuelit" data-x="${m.id}">Get more</button><span class="small muted" style="flex:1">$100 gets you <b>${fmt(Math.round(100 * mult(m) / 10))} ${tok(m)}</b></span></div>
  </div>`;
}
// Credit a contribution: fuel goes in, mission tokens come out
export function contribute(m, parts) {
  const f = fuelOf(m);
  let cv = 0;
  Object.entries(parts).forEach(([k, v]) => { if (!v) return; f[k][0] += v; cv += v * RATE[k]; });
  const shares = Math.round(cv * mult(m) / 10);
  S.wallet.shares[m.id] = (S.wallet.shares[m.id] || 0) + shares;
  return shares;
}
// Each mission has its own governance token: your vote now, your cut of what it builds later
export const TOKEN = {
  glio:  { tick: "GLIO", pays: ["Drug licences", "Trial data access", "Bounty payouts"] },
  cad:   { tick: "OCAD", pays: ["Pro & team plans", "Plugin store fees", "Bounty payouts"] },
  reef:  { tick: "REEF", pays: ["Data licences", "Insurer risk feeds", "Bounty payouts"] },
  tutor: { tick: "TUTR", pays: ["School licences", "Grant funding", "Bounty payouts"] },
};
export const tok = m => "$" + ((TOKEN[m.id] || {}).tick || m.id.slice(0, 4).toUpperCase());
export const holders = m => Math.round(m.players * .62 + fuelOf(m).more[1]);
export const ownPct = m => { const mine = S.wallet.shares[m.id] || 0; return mine ? (mine / (fuelOf(m).supply + mine) * 100) : 0; };
export const tokFor = (m, parts) => Math.round(Object.entries(parts).reduce((a, [k, v]) => a + (v || 0) * RATE[k], 0) * mult(m) / 10);
export const questFuel = q => ({ time: { S: 1, M: 4, L: 8 }[q.size] || 1, know: ["seekers", "guardians", "architects"].includes(ROLES[q.role].suit) ? 1 : 0, compute: /shard|dock|train|screen/i.test(q.title) ? 200 : 0 });
// Your weight in mission votes (treasury draws, the final check) grows with the mission tokens you hold
export const votePower = m => 1 + Math.floor((S.wallet.shares[m.id] || 0) / 200);
// Team stakes: money you put straight into a strategy. They pay from that team's product, not the mission's.
export const stakeOf = s => (S.stakes || {})[s.id] || 0;
export const askOf = s => { const a = ASK[s.id] || [3000, 80, 300]; return { money: a[0], time: a[1], compute: a[2] }; };
// Every spend from a mission's treasury, with a receipt
export const ledgerOf = m => (m.ledger = m.ledger || (LEDGER[m.id] || []).map(([what, squad, amt, when]) => ({ what, squad, amt, when })));
