// ===================== Real-world detail =====================
// The game screens stay simple; these feed the drill-down sheets, quest gating and the economy.

// Other players: profiles, verified skills, which squad they race for
export const PEOPLE = {
  Rosa:      { color: "var(--pink)",  role: "critic",       squad: "Fold Gang", agent: "Dot",  rep: 4.9, quests: 41, bio: "Postdoc in structural biology, Lisbon", skills: [["Docking (Vina)", "verified · 12 quests"], ["Statistics", "self-reported"]] },
  Kenji:     { color: "var(--sky)",   role: "implementer",  squad: "Fold Gang", agent: "Byte", rep: 4.7, quests: 63, bio: "Backend engineer, Osaka", skills: [["Python", "verified · GitHub"], ["GPU ops", "verified · 20 quests"], ["Rust", "verified · GitHub"]] },
  Priya:     { color: "var(--red)",   role: "commander",    squad: "Fold Gang", agent: "Dock", rep: 4.9, quests: 88, bio: "Computational chemistry lead, Bangalore", skills: [["Docking (Vina)", "verified · 30 quests"], ["Med chem", "verified · ORCID"]] },
  "Dr. Lin": { color: "var(--pink)",  role: "critic",       squad: "Wet Hands", rep: 5.0, quests: 9, bio: "Brain-tumour pharmacologist, Singapore", skills: [["Med chem", "verified · licence"], ["Neuro-oncology", "verified · ORCID"]] },
  Ade:       { color: "var(--leaf)",  role: "investigator", squad: "Wet Hands", agent: "Moss", rep: 4.8, quests: 38, bio: "Pharmacologist, Lagos", skills: [["Pharmacology", "verified · ORCID"], ["Lab protocols", "verified · 6 quests"]] },
  Yuki:      { color: "var(--lilac)", role: "critic",       squad: "Swarm 404", agent: "Nori", rep: 4.8, quests: 57, bio: "Medicinal chemist, Kyoto", skills: [["Med chem", "verified · ORCID"], ["Docking (Vina)", "verified · 9 quests"]] },
  Mo:        { color: "var(--gold)",  role: "inventor",     squad: "Swarm 404", agent: "Fizz", rep: 4.4, quests: 22, bio: "ML student, Cairo", skills: [["ML", "verified · GitHub"], ["Chemistry", "self-reported"]] },
};

// Per-quest requirements, claims, dependencies and real-world steps (merged into quests at boot)
export const QX = {
  g2:  { skills: ["Python", "Docking (Vina)"], tools: ["GitHub", "GPU pool"], spend: 40, eta: "about 6h of agent time" },
  g6c: { skills: ["Docking (Vina)"], tools: ["GPU pool", "Shared drive"], spend: 60, eta: "about 40 min on 8 GPUs", reject: "2 of your hits don't reproduce at the −9 cutoff. Re-score with the shared config, please." },
  g6d: { skills: ["Docking (Vina)"], tools: ["GPU pool", "Shared drive"], spend: 60, eta: "about 40 min on 8 GPUs" },
  g3:  { skills: ["Docking (Vina)"], tools: ["Shared drive"], eta: "about 2h" },
  g4:  { human: true, evidence: ["Signed mission contract", "Intro call notes"], eta: "1–3 days · people reply slowly" },
  g8:  { skills: ["Pharmacology"], verified: true, tools: ["CNS database"], eta: "about 3h" },
  g9:  { claimed: ["Mo", "2d"], skills: ["ML"], tools: ["GPU pool"], spend: 120, safety: true },
  g10: { after: "g9", safety: true, skills: ["Med chem"] },
  g11: { human: true, blocked: "Basel lab slot · Thu 9am", tools: ["Lab portal"], evidence: ["Lab booking", "Run sheet"] },
  c2:  { tools: ["Kernel repo"], eta: "about 2h" },
  c3:  { skills: ["C++", "Geometry"], tools: ["Kernel repo"], eta: "about a day" },
  c5:  { after: "c3" },
  r2:  { human: true, evidence: ["Booking receipts", "Dive shop contacts"], eta: "2–4 days" },
};
export const TOOLS = { "GitHub": "Code, PRs and issues", "GPU pool": "Mission compute · billed to strategy budgets", "Shared drive": "Datasets and result files", "CNS database": "Licensed by Wet Hands · read-only", "Kernel repo": "github.com/opencad/kernel", "Lab portal": "Basel partner lab bookings", "ORCID": "Your research identity · used for credit" };
export const VERIFY = [["GitHub", "We read your public commits"], ["ORCID", "Your papers and peer reviews"], ["5-min test", "A short practical check"], ["Starter quest", "Clear one S quest, checked by a Critic"]];

// Who runs each mission, what's in escrow and what happens if it stops
export const TRUST = {
  glio:  { who: "Dr. Amara Osei", cred: "Neuro-oncologist · Charité Berlin", verified: ["ORCID", "Hospital email"], funders: [["Brain Tumour Trust", 150000], ["@dr.amara", 60000], ["412 backers", 40000]], record: "2 missions run · 1 won", safety: "Biosafety review passed · 2 reviewers · no dual-use flags", deliver: ["Open dataset of 10 verified candidates", "Preprint naming every contributor", "Phase 0 trial filing"], fail: "If the mission stops, unspent escrow goes back to funders pro-rata. Approved work stays paid." },
  cad:   { who: "Kit Bashford", cred: "Ex-Autodesk kernel engineer", verified: ["GitHub", "LinkedIn"], funders: [["@kitbash", 25000], ["Maker Fund", 15000]], record: "1 mission won (open slicer)", safety: "Auto-check passed", deliver: ["MIT-licensed CAD app", "Public STEP test suite"], fail: "Unspent escrow goes back to funders. Approved work stays paid." },
  reef:  { who: "Blue Carbon Lab", cred: "Marine NGO · registered charity", verified: ["Charity number", "Domain"], funders: [["Ocean Trust", 60000], ["@bluecarbon", 25000]], record: "First mission", safety: "Auto-check passed", deliver: ["Weekly public reef map", "Free API", "Labelled dataset"], fail: "Unspent escrow goes back to funders. Approved work stays paid." },
  tutor: { who: "Mrs. Chioma Okafor", cred: "Head teacher · Lagos", verified: ["School email"], funders: [["EdTech Grant", 100000], ["@mrs.okafor", 20000]], record: "First mission", safety: "Child-safety review passed", deliver: ["Offline tutor app", "Pilot results report"], fail: "Unspent escrow goes back to funders. Approved work stays paid." },
};
export const LEDGER = {
  glio:  [["GPU rental · parts 1–2", "Fold Gang", 1240, "2h ago"], ["Basel lab deposit", "Wet Hands", 2000, "1d ago"], ["Critic rewards · 14 reviews", "Referees", 310, "1d ago"], ["CNS database licence", "Wet Hands", 450, "3d ago"]],
  cad:   [["CI runners", "Kernel Crew", 180, "5h ago"], ["Interview gift cards", "Field Team", 250, "2d ago"]],
  reef:  [["Dive shop payments · 9 sites", "Reef Ops", 2700, "1d ago"], ["Satellite tiles", "Reef Ops", 900, "4d ago"]],
  tutor: [["Test phones · 5 × $50", "Chalk Squad", 250, "2d ago"]],
};

// Demand: people who have the problem add their voice (+1) or pledge money held until it ships
export const DEMAND = {
  glio:  { asks: 3120, pledged: 41000, revenue: 0 },
  cad:   { asks: 1240, pledged: 9000, revenue: 6000 },
  reef:  { asks: 860, pledged: 12000, revenue: 0 },
  tutor: { asks: 2210, pledged: 7000, revenue: 0 },
};

// Later: the game suggests teaming up when a fundraise stalls or efforts overlap (not shown yet)
export const MERGE = {
  cad: { from: "cad-users", to: "cad-occ", why: "is short on funds", gain: "Together they reach the checkpoint about 2× faster" },
};

// The current stage's goal in plain words: what counts, how it's checked, why it matters.
// "counts" are listed in the order they're usually finished; the first N tick off as the goal fills.
export const STAGE_BRIEF = {
  glio: { plain: "Find 10 drugs that might kill this brain tumour, and prove each one on real data.",
    counts: ["Binds the EGFRvIII pocket", "Gets past the blood–brain barrier", "Not toxic to healthy cells", "Result re-run by a second lab", "Safe dose is known"],
    item: "candidate", checked: "Each candidate needs a docking score, a blood–brain barrier check and a toxicity check. Two checkers re-run them; a lab confirms the top 3.",
    why: "Labs only have money to test about 10 drugs properly. Picking the right 10 is the whole game.", next: "Stage 3 tests the 10 drugs on real tumour cells." },
  cad: { plain: "Get the core of the CAD app (the kernel) doing 8 basic things without breaking.",
    counts: ["Draw a box, cylinder and sphere", "Cut one shape out of another", "Join two shapes", "Round off edges (fillets)", "Open STEP files from other CAD apps", "Save STEP files", "Handle curved surfaces", "Measure distances and angles"],
    item: "feature", checked: "Each feature has to pass the shared test suite: 1,000 real-world shapes. A feature counts when every test for it passes and 2 checkers agree.",
    why: "The kernel is the engine. Without these 8, nobody can draw a real part, so nothing else matters yet.", next: "Stage 3 puts a simple app on top so 50 engineers can try it." },
  reef: { plain: "Have someone check the health of 200 reefs, so we know where coral is dying.",
    counts: ["Photo of the reef", "GPS location", "Health score from 1 to 5", "Checked against satellite tiles"],
    item: "site", checked: "A site counts when it has a photo, a GPS point and a health score, and the classifier agrees with the diver.",
    why: "Satellites miss what's under the surface. Divers fill the gap.", next: "Stage 5 turns the checks into a live public map." },
  tutor: { plain: "Write down what kids learn in maths, year by year, in 10 countries.",
    counts: ["Topics for each school year", "Which topics come first", "Checked by a local teacher"],
    item: "country", checked: "A country counts when every school year is mapped and a local teacher signs off.",
    why: "The tutor can't help a kid if it doesn't know what their class is learning.", next: "Stage 3 builds lessons for the mapped topics." },
};
