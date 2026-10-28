import { color } from "../design/tokens.js";
import { S } from "../state.js";
import { go } from "../ui/chrome.js";
import { gain, glyph, mission, mono, titleCard } from "../ui/helpers.js";

// ===================== Content =====================
export const SUITS = {
  seekers:    { name: "Seekers",    color: "var(--leaf)" },
  creators:   { name: "Creators",   color: "var(--pink)" },
  producers:  { name: "Producers",  color: "var(--peach)" },
  leaders:    { name: "Leaders",    color: "var(--coral)" },
  architects: { name: "Architects", color: "var(--sky)" },
  advocates:  { name: "Advocates",  color: "var(--gold)" },
  guardians:  { name: "Guardians",  color: "var(--lilac)" },
  givers:     { name: "Givers",     color: "var(--teal)" },
};
// 16 roles on 8 islands. Generic on purpose: they fit a cancer cure, a product or a community project.
export const ROLES = {
  explorer:     { suit: "seekers",    name: "Explorer",     mono: "Ex", does: "Scouts new ground first" },
  investigator: { suit: "seekers",    name: "Investigator", mono: "Iq", does: "Digs until it's true" },
  inventor:     { suit: "creators",   name: "Inventor",     mono: "In", does: "Has the wild idea" },
  artisan:      { suit: "creators",   name: "Artisan",      mono: "Ar", does: "Sweats the details" },
  implementer:  { suit: "producers",  name: "Implementer",  mono: "Im", does: "Ships it today" },
  technician:   { suit: "producers",  name: "Technician",   mono: "Te", does: "Fixes what breaks" },
  commander:    { suit: "leaders",    name: "Commander",    mono: "Cm", does: "Calls the shots" },
  shaper:       { suit: "leaders",    name: "Shaper",       mono: "Sh", does: "Pushes the team further" },
  strategist:   { suit: "architects", name: "Strategist",   mono: "St", does: "Sees three moves ahead" },
  orchestrator: { suit: "architects", name: "Orchestrator", mono: "Or", does: "Gets everyone in step" },
  campaigner:   { suit: "advocates",  name: "Campaigner",   mono: "Ca", does: "Makes the world care" },
  connector:    { suit: "advocates",  name: "Connector",    mono: "Co", does: "Knows a person for that" },
  critic:       { suit: "guardians",  name: "Critic",       mono: "Cr", does: "Spots the flaw first" },
  protector:    { suit: "guardians",  name: "Protector",    mono: "Pr", does: "Guards the rules" },
  helper:       { suit: "givers",     name: "Helper",       mono: "He", does: "Unsticks whoever's stuck" },
  patron:       { suit: "givers",     name: "Patron",       mono: "Pa", does: "Backs it with money" },
};
export const roleColor = k => SUITS[ROLES[k].suit].color;
export const TIERS = [
  { name: "Sidekick", min: 0,  does: "Solo: S quests" },
  { name: "Partner",  min: 35, does: "Solo: S + M quests", unlock: "Now runs M quests solo" },
  { name: "Proxy",    min: 70, does: "Solo: bosses + votes", unlock: "Now takes on bosses solo" },
];
export const SIZE = { S: { label: "S · ~15 min", need: 0 }, M: { label: "M · ~1 hr", need: 35 }, Boss: { label: "BOSS", need: 70 } };

export const GLYPHS = {
  helix: '<path d="M9 4c0 8 14 8 14 16s-14 8-14 8M23 4c0 8-14 8-14 16s14 8 14 8M11 10h10M11 22h10" stroke="var(--ink)" stroke-width="2.8" fill="none" stroke-linecap="round"/>',
  cube:  '<path d="M16 4 27 10v12l-11 6-11-6V10zM5 10l11 6 11-6M16 16v12" stroke="var(--ink)" stroke-width="2.8" fill="none" stroke-linejoin="round"/>',
  wave:  '<circle cx="16" cy="16" r="11" stroke="var(--ink)" stroke-width="2.8" fill="none"/><path d="M5.5 14c3-3 5-3 7 0s4 3 7 0 4-3 7 0M7 20c3-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="var(--ink)" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  book:  '<path d="M4 7c5-2 9-1 12 2 3-3 7-4 12-2v18c-5-2-9-1-12 2-3-3-7-4-12-2zM16 9v18" stroke="var(--ink)" stroke-width="2.8" fill="none" stroke-linejoin="round"/>',
  star:  '<path d="M16 4l3.6 7.6 8.4 1-6.2 5.8 1.6 8.2L16 22.6 8.6 26.6l1.6-8.2L4 12.6l8.4-1z" stroke="var(--ink)" stroke-width="2.8" fill="none" stroke-linejoin="round"/>',
};
// Medals: earned by playing, shown on the Duo profile
export const BADGES = {
  spark:   { name: "Spark",        desc: "Cleared your first quest",       icon: '<path d="M10 16.5l4 4 8-9" stroke-width="3"/>', rib: ["var(--blue)", "var(--green)"] },
  sync:    { name: "In Sync",      desc: "3 quests played together",       icon: '<circle cx="12.5" cy="16" r="5"/><circle cx="19.5" cy="16" r="5"/>', rib: ["var(--pink)", "var(--blue)"] },
  raider:  { name: "Raider",       desc: "Cleared a daily raid",           icon: '<path d="M11 24V8M11 9h10l-2.5 3.5L21 16H11"/>', rib: ["var(--red)", "var(--gold)"] },
  slayer:  { name: "Giant Slayer", desc: "Took down a boss quest",         icon: '<path d="M16 7l2.6 5.4 5.9.8-4.3 4.1 1 5.8L16 20.3 10.8 23l1-5.8-4.3-4.1 5.9-.8z"/>', rib: ["var(--green-d)", "var(--gold)"] },
  gate:    { name: "Gatebreaker",  desc: "Helped clear a milestone",           icon: '<path d="M9 24V12a7 7 0 0 1 14 0v12M9 24h14M16 13v6"/>', rib: ["var(--violet)", "var(--green)"] },
  founder: { name: "Founder",      desc: "Launched a mission",             icon: '<path d="M16 6c4 3 5 8 3 13h-6c-2-5-1-10 3-13zM13 19l-3 4M19 19l3 4M16 12v2"/>', rib: ["var(--blue)", "var(--red)"] },
  owl:     { name: "Night Owl",    desc: "Found in a mystery crate",       icon: '<path d="M20 9a7.5 7.5 0 1 0 3 12 6 6 0 0 1-3-12z"/>', rib: ["var(--navy)", "var(--sky)"] },
  fire:    { name: "On Fire",      desc: "7-day streak",                   icon: '<path d="M16 6c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-6 1 2 2 2 3 1-1-2-1-4 0-6z"/>', rib: ["var(--red)", "var(--gold)"] },
  proxy:   { name: "Proxy",        desc: "Your agent hit 70% Sync",        icon: '<rect x="9" y="11" width="14" height="11" rx="3"/><path d="M16 11V7M13.5 16h.01M18.5 16h.01"/>', rib: ["var(--green)", "var(--blue)"] },
  squad:   { name: "Squad Up",     desc: "Signed your first contract",     icon: '<circle cx="12" cy="13" r="3"/><circle cx="20" cy="13" r="3"/><path d="M7 23c1-4 3-5 5-5s4 1 5 5M15 23c1-4 3-5 5-5s4 1 5 5"/>', rib: ["var(--pink)", "var(--green)"] },
  mind:    { name: "Mind Reader",  desc: "Your agent guessed your call",   icon: '<path d="M6 16s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/><circle cx="16" cy="16" r="2.5"/>', rib: ["var(--violet)", "var(--gold)"] },
  trail:   { name: "Trailblazer",  desc: "Proposed a new strategy",        icon: '<path d="M8 24l6-12 4 6 2-3 4 9z"/><circle cx="21" cy="9" r="2"/>', rib: ["var(--gold)", "var(--blue)"] },
};
export function medal(id, size = 64, force = false) {
  const b = BADGES[id], on = force || S.badges.includes(id);
  const [r1, r2] = on ? b.rib : ["var(--haze)", "var(--sage)"];
  return `<svg viewBox="0 0 40 52" width="${size * .77}" height="${size}" aria-hidden="true">
    <path d="M10 2h7l4 16h-7z" fill="${r1}" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>
    <path d="M30 2h-7l-4 16h7z" fill="${r2}" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="21" cy="35" r="15" fill="var(--ink)"/>
    <circle cx="20" cy="34" r="15" fill="${on ? "var(--gold)" : "var(--frost)"}" stroke="var(--ink)" stroke-width="2.4"/>
    <g transform="translate(4 18)" fill="none" stroke="${on ? "var(--ink)" : "var(--slate)"}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${on ? b.icon : '<rect x="11" y="15" width="10" height="8" rx="2"/><path d="M13 15v-2a3 3 0 0 1 6 0v2"/>'}</g>
  </svg>`;
}
export function award(id) {
  if (S.badges.includes(id)) return;
  S.badges.push(id);
  setTimeout(() => titleCard("New badge", BADGES[id].name + "!", BADGES[id].desc, null, 1800, `<div class="medal-pop">${medal(id, 120)}</div>`), 120);
}
export const SPLIT = [["Players, by XP", 70], ["Guardians", 15], ["Mission creator", 10], ["Community fund", 5]];

export function Q(id, title, role, size, xp, coins, log, call, extra = {}) {
  return { id, title, role, size, xp, coins, log, call, ...extra };
}
export const missions = [
  {
    id: "glio", title: "Cure Glioblastoma", tag: "Science", glyph: "helix", color: "var(--pink)",
    creator: "@dr.amara", bounty: 250000, players: 1284, squads: 37,
    pitch: "Find a compound that kills glioblastoma cells and get it to a Phase 0 trial, fully open.",
    current: 2,
    stages: [
      { name: "Recon", goal: "Map every open glioma dataset" },
      { name: "Hypothesis", goal: "Rank the top 50 drug targets" },
      { name: "Simulate", goal: "Screen 1M compounds in silico" },
      { name: "Wet Lab", goal: "Validate the top 10 in a partner lab" },
      { name: "Trial", goal: "File for a Phase 0 trial", boss: true },
    ],
    rules: ["Top 10 compounds kill more than 60% of tumour cells in vitro", "3 independent Critics reproduce every result", "All data and code published open-access"],
    quests: [
      Q("g1", "Curate a 1M compound library from ZINC", "explorer", "M", 200, 20, [], null, { done: true, by: "Fold Gang" }),
      Q("g2", "Build the docking pipeline", "implementer", "M", 300, 30, ["spinning up 8 GPUs…", "docking config drafted", "test run: 1,000 compounds ✓"],
        { q: "Which docking engine should we bet on?", opts: ["AutoDock Vina — fast and free", "Glide — slower, more accurate", "Run both on a sample and compare"] }),
      Q("g3", "Verify 20 docking results from Fold Gang", "critic", "S", 250, 25, ["re-running 20 results…", "17 match, 3 drift by >1 kcal", "verdict posted ✓"],
        { q: "3 results drift by more than 1 kcal/mol. What now?", opts: ["Flag them back to Fold Gang", "Re-run them on a finer grid", "Drop them from the shortlist"] }),
      Q("g4", "Recruit a medicinal chemist", "connector", "S", 150, 15, ["scanning 340 profiles…", "two chemists replied", "chemist joined the squad ✓"],
        { q: "Two chemists replied. Who do we bring in?", opts: ["Dr. Lin — brain-tumour pharmacology", "Dr. Rao — kinase inhibitors", "Invite both"] }),
      Q("g5", "Write this week's progress post", "campaigner", "S", 120, 10, ["pulling this week's numbers…", "draft ready", "posted to mission HQ ✓"],
        { q: "How should the post sound?", opts: ["Plain and factual", "Big and hopeful", "Charts first, few words"] }),
      Q("g6", "Screen 1M compounds against EGFRvIII", "commander", "Boss", 1200, 150, ["you + 2 squadmates + 3 agents…", "docked 1,000,000 · 38 hits", "shortlist locked ✓"],
        { q: "38 hits. Which 10 go to the wet lab?", opts: ["Top 10 by docking score", "Top 10 by chemical diversity", "Let the chemist pick"] }, { needs: 3 }),
    ],
  },
  {
    id: "cad", title: "Open CAD that beats SolidWorks", tag: "Product", glyph: "cube", color: "var(--gold)",
    creator: "@kitbash", bounty: 40000, players: 412, squads: 12,
    pitch: "A free, browser-based parametric CAD tool that working mechanical engineers switch to.",
    current: 1,
    stages: [
      { name: "Spec", goal: "Interview 100 engineers" },
      { name: "Kernel", goal: "Ship a working geometry kernel" },
      { name: "Sketcher", goal: "2D sketches with constraints" },
      { name: "Beta", goal: "500 weekly active engineers" },
      { name: "Switch", goal: "One firm drops SolidWorks", boss: true },
    ],
    rules: ["500 engineers use it weekly for a month", "Opens 95% of STEP test files", "MIT licensed"],
    quests: [
      Q("c1", "Design the sketch toolbar", "artisan", "M", 280, 25, ["pulling 12 CAD toolbars for reference…", "3 layouts mocked", "prototype shared ✓"],
        { q: "Which toolbar layout do we test?", opts: ["Left rail, like Fusion 360", "Top ribbon, like SolidWorks", "Radial menu on right-click"] }),
      Q("c2", "Test STEP import on 50 real files", "critic", "S", 160, 15, ["importing 50 files…", "46 open, 4 break on fillets", "bug report filed ✓"],
        { q: "4 files break on fillets. Priority?", opts: ["Blocker — fix before Sketcher", "Log it, keep moving", "Ask the 4 file owners for details"] }),
      Q("c3", "Fix boolean ops on curved faces", "implementer", "M", 320, 30, ["reproducing the crash…", "found it: tolerance on NURBS", "patch merged ✓"],
        { q: "Two fixes work. Which one ships?", opts: ["Tighter tolerance — safe, slower", "New intersection algorithm — fast, riskier"] }),
      Q("c4", "Interview 5 engineers about pain points", "explorer", "S", 140, 10, ["booking 5 calls…", "transcripts summarised", "top 3 pains posted ✓"],
        { q: "Which pain should the squad chase first?", opts: ["Licence cost", "Slow on big assemblies", "Bad Mac support"] }),
      Q("c5", "Kernel passes the 1,000-shape test suite", "implementer", "Boss", 1000, 120, ["you + squad + 4 agents…", "961 / 1,000 passing", "1,000 / 1,000 ✓"],
        { q: "39 shapes fail on one edge case. Ship anyway?", opts: ["No — fix all 39 first", "Ship, fix in Sketcher stage"] }, { needs: 3 }),
    ],
  },
  {
    id: "reef", title: "Map every coral reef from space", tag: "Planet", glyph: "wave", color: "var(--sky)",
    creator: "@bluecarbon", bounty: 85000, players: 903, squads: 21,
    pitch: "A live, open map of reef health from satellite imagery, updated weekly.",
    current: 3,
    stages: [
      { name: "Imagery", goal: "Collect 10 years of tiles" },
      { name: "Label", goal: "Label 50k reef patches" },
      { name: "Model", goal: "Train a bleaching classifier" },
      { name: "Ground truth", goal: "Check against 200 dive sites" },
      { name: "Live map", goal: "Weekly public map", boss: true },
    ],
    rules: ["Classifier is 90% accurate on dive-site data", "Map refreshes weekly for 3 months", "Free public API"],
    quests: [
      Q("r1", "Match 40 dive logs to satellite tiles", "investigator", "M", 260, 25, ["parsing dive logs…", "38 matched, 2 unclear", "matches published ✓"],
        { q: "2 dive logs have no GPS. Keep them?", opts: ["Drop them", "Estimate from the dive shop's location"] }),
      Q("r2", "Book divers for 12 unchecked sites", "technician", "S", 150, 15, ["finding dive shops…", "9 shops replied", "12 dives booked ✓"],
        { q: "Budget covers 10 of the 12 sites. Which to skip?", opts: ["The two most remote", "The two already well-studied"] }),
      Q("r3", "Review the model's 50 worst misses", "critic", "S", 200, 20, ["loading misses…", "pattern: cloud shadow", "report posted ✓"],
        { q: "Most misses are cloud shadow. Next step?", opts: ["Add a cloud-mask step", "Only use clear-sky tiles"] }),
    ],
  },
  {
    id: "tutor", title: "Free AI tutor for 1M kids", tag: "Education", glyph: "book", color: "var(--leaf)",
    creator: "@mrs.okafor", bounty: 120000, players: 657, squads: 18,
    pitch: "A maths tutor that works offline on cheap phones, in 10 languages.",
    current: 0,
    stages: [
      { name: "Curriculum", goal: "Map maths syllabi in 10 countries" },
      { name: "Tutor v1", goal: "Offline tutor on a $50 phone" },
      { name: "Pilot", goal: "Pilot with 20 schools" },
      { name: "Scale", goal: "Reach 1M kids", boss: true },
    ],
    rules: ["Pilot kids gain one grade level in 6 months", "Runs fully offline on a $50 Android phone", "Free forever"],
    quests: [
      Q("t1", "Map Kenya's Grade 4 maths syllabus", "explorer", "S", 140, 10, ["finding the official syllabus…", "62 topics extracted", "map published ✓"],
        { q: "Some topics overlap with Grade 5. Where do they go?", opts: ["Keep them in Grade 4", "Move them to Grade 5"] }),
      Q("t2", "Sketch the first lesson screen", "artisan", "M", 260, 25, ["looking at 8 kids' apps…", "2 sketches done", "posted for feedback ✓"],
        { q: "Kids read at different levels. How do we show questions?", opts: ["Big pictures, few words", "Read-aloud button on everything"] }),
      Q("t3", "Find 3 teachers to advise the squad", "connector", "S", 150, 15, ["reaching out via teacher forums…", "5 replies", "3 teachers onboarded ✓"],
        { q: "Who first?", opts: ["Rural teachers", "City teachers", "One of each plus a parent"] }),
    ],
  },
];
missions.forEach(m => { m.split = SPLIT; });
export const NEWS = {
  glio: ["Fold Gang cleared the compound library", "@dr.amara added $10k to the bounty", "Wet Hands booked the Basel lab"],
  cad: ["Kenji & Byte are testing STEP files", "Kernel crash on fillets found", "12 new players joined"],
  reef: ["9 of 12 dive shops confirmed", "Model accuracy hit 87%"],
  tutor: ["Kenya syllabus mapped", "3 teachers joined as Sages"],
};
missions.forEach(m => { m.news = NEWS[m.id] || []; });
missions[0].unread = 3; missions[1].unread = 1;
