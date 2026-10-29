// ===================== What finished work produced =====================
// Recaps for cleared stages and finished missions: what won, what came out of it, where the files live.
// The recap screens show this, and Pip uses the same data to explain what happened.

// Output kinds: dataset, code, model, report, live (a running service)
export const OUTPUT_KIND = {
  dataset: { icon: "▤", label: "Dataset" },
  code:    { icon: "</>", label: "Code" },
  model:   { icon: "◆", label: "Model" },
  report:  { icon: "✎", label: "Report" },
  live:    { icon: "●", label: "Live service" },
};

// Cleared stages of the missions still running, in stage order
export const STAGE_RECAPS = {
  glio: [
    { won: "Open data sweep", squad: "Fold Gang", days: 18, people: 212,
      result: "Found and checked 41 open glioma datasets covering 9,800 patient samples.",
      story: "Three squads raced. Fold Gang's agents crawled every public repository while Wet Hands phoned hospital labs. The crawl won on coverage, and the calls added 6 datasets nobody had published.",
      outputs: [["glioma-datasets-index.csv", "dataset", "Shared drive", "41 datasets, licences checked, 9,800 samples", "CC-BY 4.0"],
                ["recon-report.md", "report", "Shared drive", "What exists, what's missing, where the gaps are", "CC-BY 4.0"]] },
    { won: "Target ranking by evidence", squad: "Wet Hands", days: 26, people: 340,
      result: "Ranked the top 50 drug targets. EGFRvIII came out first.",
      story: "Wet Hands scored every target on evidence strength and how reachable it is in the brain. Two Critics re-ran the scoring and agreed on 48 of 50. EGFRvIII topped the list, which set up the docking stage.",
      outputs: [["top-50-targets.csv", "dataset", "Shared drive", "50 targets with evidence scores and sources", "CC-BY 4.0"],
                ["egfrviii-pocket.pdb", "model", "Shared drive", "3D binding pocket used for docking", "CC-BY 4.0"],
                ["target-scoring · GitHub", "code", "GitHub", "The scoring pipeline, so anyone can re-run it", "MIT"]] },
  ],
  cad: [
    { won: "Talk to 100 engineers", squad: "Field Team", days: 21, people: 96,
      result: "Interviewed 104 mechanical engineers. Top pains: licence cost, slow assemblies, bad Mac support.",
      story: "Field Team booked calls through engineering forums while their agents transcribed and tagged each one. 61% named licence cost first, which is why the kernel stage favours a free, browser-based build.",
      outputs: [["interviews-104.csv", "dataset", "Shared drive", "Tagged notes from 104 interviews, names removed", "CC-BY 4.0"],
                ["pain-points.md", "report", "Shared drive", "The ranked pains, with quotes", "CC-BY 4.0"]] },
  ],
  reef: [
    { won: "Ten years of tiles", squad: "Reef Ops", days: 15, people: 120,
      result: "Collected 10 years of satellite tiles for 2,300 reefs, with cloud masks.",
      story: "Reef Ops pulled free satellite archives and a second squad built cloud masks, so cloudy tiles get skipped instead of mislabelled.",
      outputs: [["reef-tiles-2015-2025 · Shared drive", "dataset", "Shared drive", "1.8 TB of tiles for 2,300 reefs", "CC-BY 4.0"],
                ["cloud-masks · GitHub", "code", "GitHub", "Cloud detection for reef tiles", "MIT"]] },
    { won: "Volunteers plus AI pre-labels", squad: "Bubble Club", days: 30, people: 640,
      result: "Labelled 52,000 reef patches as healthy, bleached or dead.",
      story: "An agent pre-labelled every patch and 640 volunteers fixed its mistakes. That was 4× faster than labelling from scratch, and each patch was checked by two people.",
      outputs: [["reef-labels-52k.csv", "dataset", "Shared drive", "52,000 labelled patches, each checked twice", "CC-BY 4.0"]] },
    { won: "Bleaching classifier", squad: "Reef Ops", days: 22, people: 180,
      result: "Trained a classifier that's 87% accurate on held-out reefs.",
      story: "Two model designs raced. The smaller one won because it runs on a laptop, so field teams can use it offline.",
      outputs: [["reef-classifier-v3", "model", "GitHub", "Open weights, 87% accuracy on held-out reefs", "MIT"],
                ["eval-report.md", "report", "Shared drive", "Where it's right, where it's wrong, and why", "CC-BY 4.0"]] },
  ],
};

// Missions that reached their final stage
export const FINISHED = [
  { id: "slicer", title: "Open 3D-print slicer", tag: "Product", glyph: "cube", color: "var(--peach)", creator: "@kitbash",
    took: "5 months", players: 640, squads: 14, bounty: 30000, yours: true,
    result: "A free slicer that's now the default for 85 printer models, with 120,000 monthly users.",
    stages: [["Spec", "Interview 50 makers", "Maker interviews", "Field Team"], ["Engine", "Slice 1,000 test models", "Rust slicing core", "Kernel Crew"],
             ["Profiles", "Profiles for 80 printers", "Crowdsourced profiles", "Bubble Club"], ["Launch", "10,000 weekly users", "Printer-maker partnerships", "Field Team"]],
    outputs: [["Slicer v1.0 · GitHub", "code", "GitHub", "The app itself, Windows, Mac and Linux", "MIT"],
              ["printer-profiles-85 · GitHub", "dataset", "GitHub", "Tested settings for 85 printers", "CC-BY 4.0"],
              ["benchmark-1200-prints.csv", "dataset", "Shared drive", "1,200 test prints scored for quality and time", "CC-BY 4.0"],
              ["launch-report.md", "report", "Shared drive", "What worked, what didn't, the numbers", "CC-BY 4.0"]],
    mine: { quests: ["Benchmark 40 test prints", "Review the Prusa profile"], earned: 140, tokens: 220, credit: "Named in the v1.0 release notes" } },
  { id: "flood", title: "Flood alerts for Dhaka", tag: "Planet", glyph: "wave", color: "var(--sky)", creator: "@delta.lab",
    took: "8 months", players: 1120, squads: 26, bounty: 90000,
    result: "SMS flood warnings 24 hours ahead, now reaching 1.2 million people.",
    stages: [["Data", "Collect 6 years of rain-gauge data", "Gauge digitising", "Delta Ops"], ["Model", "Predict floods 24h ahead", "Open flood model", "Riverwise"],
             ["Pilot", "Warn 3 districts", "SMS through local telcos", "Delta Ops"], ["Citywide", "Reach 1M people", "Telco partnership", "Signal Squad"]],
    outputs: [["rain-gauges-2019-2025.csv", "dataset", "Shared drive", "Digitised readings from 140 gauges", "CC-BY 4.0"],
              ["flood-model-v2", "model", "GitHub", "Open weights, 24h warnings, 91% recall", "MIT"],
              ["SMS alert service", "live", "Live service", "Running · 1.2M subscribers", "Public service"],
              ["three-monsoons-eval.md", "report", "Shared drive", "How the warnings did over three monsoons", "CC-BY 4.0"]] },
];
