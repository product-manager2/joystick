import { color } from "../design/tokens.js";
import { S } from "../state.js";
import { go } from "../ui/chrome.js";
import { gain, glyph, mission, mono, titleCard } from "../ui/helpers.js";

// ===================== Content =====================
// 8 roles. Each has a colour, an icon and one plain line on what it does.
export const ROLES = {
  explorer: { color: "var(--leaf)", name: "Explorer", does: "Finds out what's out there and what's really true", icon: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8z"/>' },
  creator: { color: "var(--pink)", name: "Creator", does: "Dreams up new ideas and makes them look and feel right", icon: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>' },
  builder: { color: "var(--peach)", name: "Builder", does: "Turns plans into things that work, and fixes what breaks", icon: '<rect x="3.5" y="13" width="7.5" height="7" rx="1.5"/><rect x="13" y="13" width="7.5" height="7" rx="1.5"/><rect x="8.25" y="4" width="7.5" height="7" rx="1.5"/>' },
  leader: { color: "var(--coral)", name: "Leader", does: "Sets the dream, leads the way, pushes the team and carries the weight", icon: '<path d="M5 21V3.5M5 4h12l-2.5 4.5L17 13H5"/>' },
  planner: { color: "var(--sky)", name: "Planner", does: "Makes the plan from behind the scenes and keeps everyone in step", icon: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H13a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h4.8"/>' },
  champion: { color: "var(--gold)", name: "Storyteller", does: "Tells the story so people care, and brings the right people in", icon: '<path d="M4 9.5v5h3l7.5 4.5v-14L7 9.5z"/><path d="M18 9a4.2 4.2 0 0 1 0 6"/>' },
  checker: { color: "var(--lilac)", name: "Checker", does: "Checks the work, spots mistakes and keeps it safe and fair", icon: '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.2l2.6 2.6 4.8-5.3"/>' },
  patron: { color: "var(--teal)", name: "Patron", does: "Funds the work and helps wherever it's needed", icon: '<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.4c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1.1 1.6 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.1 0-2.1-.5-2.6-1.4M12 6.3v11.4"/>' },
};
export const roleColor = k => ROLES[k].color;
export const SIZE = { S: { label: "~15 min" }, M: { label: "~1 hr" }, L: { label: "~1 day" } };

export const GLYPHS = {
  helix: '<path d="M9 4c0 8 14 8 14 16s-14 8-14 8M23 4c0 8-14 8-14 16s14 8 14 8M11 10h10M11 22h10" stroke="var(--ink)" stroke-width="2.8" fill="none" stroke-linecap="round"/>',
  cube:  '<path d="M16 4 27 10v12l-11 6-11-6V10zM5 10l11 6 11-6M16 16v12" stroke="var(--ink)" stroke-width="2.8" fill="none" stroke-linejoin="round"/>',
  wave:  '<circle cx="16" cy="16" r="11" stroke="var(--ink)" stroke-width="2.8" fill="none"/><path d="M5.5 14c3-3 5-3 7 0s4 3 7 0 4-3 7 0M7 20c3-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="var(--ink)" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  book:  '<path d="M4 7c5-2 9-1 12 2 3-3 7-4 12-2v18c-5-2-9-1-12 2-3-3-7-4-12-2zM16 9v18" stroke="var(--ink)" stroke-width="2.8" fill="none" stroke-linejoin="round"/>',
  star:  '<path d="M16 4l3.6 7.6 8.4 1-6.2 5.8 1.6 8.2L16 22.6 8.6 26.6l1.6-8.2L4 12.6l8.4-1z" stroke="var(--ink)" stroke-width="2.8" fill="none" stroke-linejoin="round"/>',
};
// Medals: earned by playing, shown on the Profile
export const BADGES = {
  spark:   { name: "Spark",        desc: "Cleared our first quest",       icon: '<path d="M10 16.5l4 4 8-9" stroke-width="3"/>', rib: ["var(--blue)", "var(--green)"] },
  sync:    { name: "Hat Trick",    desc: "Cleared 3 quests",                icon: '<circle cx="12.5" cy="16" r="5"/><circle cx="19.5" cy="16" r="5"/>', rib: ["var(--pink)", "var(--blue)"] },
  slayer:  { name: "Heavy Lifter", desc: "Cleared a day-long quest",         icon: '<path d="M16 7l2.6 5.4 5.9.8-4.3 4.1 1 5.8L16 20.3 10.8 23l1-5.8-4.3-4.1 5.9-.8z"/>', rib: ["var(--green-d)", "var(--gold)"] },
  gate:    { name: "Finisher",     desc: "Helped clear a stage",           icon: '<path d="M9 24V12a7 7 0 0 1 14 0v12M9 24h14M16 13v6"/>', rib: ["var(--violet)", "var(--green)"] },
  founder: { name: "Founder",      desc: "Launched a mission",             icon: '<path d="M16 6c4 3 5 8 3 13h-6c-2-5-1-10 3-13zM13 19l-3 4M19 19l3 4M16 12v2"/>', rib: ["var(--blue)", "var(--red)"] },
  squad:   { name: "Squad Up",     desc: "Joined our first squad",     icon: '<circle cx="12" cy="13" r="3"/><circle cx="20" cy="13" r="3"/><path d="M7 23c1-4 3-5 5-5s4 1 5 5M15 23c1-4 3-5 5-5s4 1 5 5"/>', rib: ["var(--pink)", "var(--green)"] },
  mind:    { name: "First Try",    desc: "Approved with no fixes needed",        icon: '<path d="M6 16s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/><circle cx="16" cy="16" r="2.5"/>', rib: ["var(--violet)", "var(--gold)"] },
  trail:   { name: "Trailblazer",  desc: "Suggested a new plan",        icon: '<path d="M8 24l6-12 4 6 2-3 4 9z"/><circle cx="21" cy="9" r="2"/>', rib: ["var(--gold)", "var(--blue)"] },
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
export const SPLIT = [["Players, by XP", 70], ["Referees", 15], ["Mission creator", 10], ["Community fund", 5]];

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
      { name: "Recon", goal: "Map every open glioma dataset", tracks: ["Datasets", "Literature"] },
      { name: "Hypothesis", goal: "Rank the top 50 drug targets", tracks: ["Targets", "Pathways"] },
      { name: "Simulate", goal: "Test 1 million molecules on computers" },
      { name: "Wet Lab", goal: "Validate the top 10 in a partner lab", tracks: ["Basel lab", "Tox panel", "Chemist review"] },
      { name: "Trial", goal: "File for a Phase 0 trial", finish: true, tracks: ["Protocol", "Ethics board"] },
    ],
    rules: ["Top 10 compounds kill more than 60% of tumour cells in vitro", "3 independent Critics reproduce every result", "All data and code published open-access"],
    quests: [
      Q("g1", "Curate a 1M compound library from ZINC", "explorer", "M", 200, 20, [], null, { done: true, by: "Fold Gang" }),
      Q("g2", "Build the docking pipeline", "builder", "M", 300, 30, ["spinning up 8 GPUs…", "docking config drafted", "test run: 1,000 compounds ✓"],
        { q: "Which docking engine should we bet on?", opts: ["AutoDock Vina — fast and free", "Glide — slower, more accurate", "Run both on a sample and compare"] }),
      Q("g3", "Verify 20 docking results from Fold Gang", "checker", "S", 250, 25, ["re-running 20 results…", "17 match, 3 drift by >1 kcal", "verdict posted ✓"],
        { q: "3 results drift by more than 1 kcal/mol. What now?", opts: ["Flag them back to Fold Gang", "Re-run them on a finer grid", "Drop them from the shortlist"] }),
      Q("g4", "Recruit a medicinal chemist", "champion", "S", 150, 15, ["scanning 340 profiles…", "two chemists replied", "chemist joined the squad ✓"],
        { q: "Two chemists replied. Who do we bring in?", opts: ["Dr. Lin — brain-tumour pharmacology", "Dr. Rao — kinase inhibitors", "Invite both"] }),
      Q("g5", "Write this week's progress post", "champion", "S", 120, 10, ["pulling this week's numbers…", "draft ready", "posted to mission HQ ✓"],
        { q: "How should the post sound?", opts: ["Plain and factual", "Big and hopeful", "Charts first, few words"] }),
      Q("g6", "Test 1 million molecules against the tumour", "leader", "L", 1200, 150, ["you + 2 squadmates + 3 agents…", "docked 1,000,000 · 38 hits", "shortlist locked ✓"],
        { q: "38 hits. Which 10 go to the wet lab?", opts: ["Top 10 by docking score", "Top 10 by chemical diversity", "Let the chemist pick"] }, { needs: 3 }),
    ],
  },
  {
    id: "cad", title: "Open CAD that beats SolidWorks", tag: "Product", glyph: "cube", color: "var(--gold)",
    creator: "@kitbash", bounty: 40000, players: 412, squads: 12,
    pitch: "A free, browser-based parametric CAD tool that working mechanical engineers switch to.",
    current: 1,
    stages: [
      { name: "Spec", goal: "Interview 100 engineers", tracks: ["Interviews", "Teardowns"] },
      { name: "Kernel", goal: "Ship a working geometry kernel", tracks: ["Geometry", "STEP import"] },
      { name: "Sketcher", goal: "2D sketches with constraints", tracks: ["Sketch UI", "Constraint solver", "File import"] },
      { name: "Beta", goal: "500 weekly active engineers", tracks: ["Onboarding", "Cloud sync"] },
      { name: "Switch", goal: "One firm drops SolidWorks", finish: true, tracks: ["Pilot firm", "Migration tools"] },
    ],
    rules: ["500 engineers use it weekly for a month", "Opens 95% of STEP test files", "MIT licensed"],
    quests: [
      Q("c1", "Design the sketch toolbar", "creator", "M", 280, 25, ["pulling 12 CAD toolbars for reference…", "3 layouts mocked", "prototype shared ✓"],
        { q: "Which toolbar layout do we test?", opts: ["Left rail, like Fusion 360", "Top ribbon, like SolidWorks", "Radial menu on right-click"] }),
      Q("c2", "Test STEP import on 50 real files", "checker", "S", 160, 15, ["importing 50 files…", "46 open, 4 break on fillets", "bug report filed ✓"],
        { q: "4 files break on fillets. Priority?", opts: ["Blocker — fix before Sketcher", "Log it, keep moving", "Ask the 4 file owners for details"] }),
      Q("c3", "Fix boolean ops on curved faces", "builder", "M", 320, 30, ["reproducing the crash…", "found it: tolerance on NURBS", "patch merged ✓"],
        { q: "Two fixes work. Which one ships?", opts: ["Tighter tolerance — safe, slower", "New intersection algorithm — fast, riskier"] }),
      Q("c4", "Interview 5 engineers about pain points", "explorer", "S", 140, 10, ["booking 5 calls…", "transcripts summarised", "top 3 pains posted ✓"],
        { q: "Which pain should the squad chase first?", opts: ["Licence cost", "Slow on big assemblies", "Bad Mac support"] }),
      Q("c5", "Kernel passes the 1,000-shape test suite", "builder", "L", 1000, 120, ["you + squad + 4 agents…", "961 / 1,000 passing", "1,000 / 1,000 ✓"],
        { q: "39 shapes fail on one edge case. Ship anyway?", opts: ["No — fix all 39 first", "Ship, fix in Sketcher stage"] }, { needs: 3 }),
    ],
  },
  {
    id: "reef", title: "Map every coral reef from space", tag: "Planet", glyph: "wave", color: "var(--sky)",
    creator: "@bluecarbon", bounty: 85000, players: 903, squads: 21,
    pitch: "A live, open map of reef health from satellite imagery, updated weekly.",
    current: 3,
    stages: [
      { name: "Imagery", goal: "Collect 10 years of tiles", tracks: ["Tiles", "Cloud masks"] },
      { name: "Label", goal: "Label 50k reef patches", tracks: ["Volunteers", "AI pre-labels"] },
      { name: "Model", goal: "Train a bleaching classifier", tracks: ["Classifier", "Eval set"] },
      { name: "Ground truth", goal: "Check against 200 dive sites" },
      { name: "Live map", goal: "Weekly public map", finish: true, tracks: ["Pipeline", "Public API"] },
    ],
    rules: ["Classifier is 90% accurate on dive-site data", "Map refreshes weekly for 3 months", "Free public API"],
    quests: [
      Q("r1", "Match 40 dive logs to satellite tiles", "explorer", "M", 260, 25, ["parsing dive logs…", "38 matched, 2 unclear", "matches published ✓"],
        { q: "2 dive logs have no GPS. Keep them?", opts: ["Drop them", "Estimate from the dive shop's location"] }),
      Q("r2", "Book divers for 12 unchecked sites", "builder", "S", 150, 15, ["finding dive shops…", "9 shops replied", "12 dives booked ✓"],
        { q: "Budget covers 10 of the 12 sites. Which to skip?", opts: ["The two most remote", "The two already well-studied"] }),
      Q("r3", "Review the model's 50 worst misses", "checker", "S", 200, 20, ["loading misses…", "pattern: cloud shadow", "report posted ✓"],
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
      { name: "Tutor v1", goal: "Offline tutor on a $50 phone", tracks: ["Lessons", "Offline packs", "Voice"] },
      { name: "Pilot", goal: "Pilot with 20 schools", tracks: ["Schools", "Teacher training"] },
      { name: "Scale", goal: "Reach 1M kids", finish: true, tracks: ["Telcos", "Ministries"] },
    ],
    rules: ["Pilot kids gain one grade level in 6 months", "Runs fully offline on a $50 Android phone", "Free forever"],
    quests: [
      Q("t1", "Map Kenya's Grade 4 maths syllabus", "explorer", "S", 140, 10, ["finding the official syllabus…", "62 topics extracted", "map published ✓"],
        { q: "Some topics overlap with Grade 5. Where do they go?", opts: ["Keep them in Grade 4", "Move them to Grade 5"] }),
      Q("t2", "Sketch the first lesson screen", "creator", "M", 260, 25, ["looking at 8 kids' apps…", "2 sketches done", "posted for feedback ✓"],
        { q: "Kids read at different levels. How do we show questions?", opts: ["Big pictures, few words", "Read-aloud button on everything"] }),
      Q("t3", "Find 3 teachers to advise the squad", "champion", "S", 150, 15, ["reaching out via teacher forums…", "5 replies", "3 teachers onboarded ✓"],
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
