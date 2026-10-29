import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { enterSignup, finishSetup, stubAgentDraft, failAfterCommitOnce, delayAndFailAfterCommitOnce } from "./helpers/onboarding.mjs";

const baseURL = process.env.JOYSTICK_E2E_URL || "http://localhost:5173";

async function passkey(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "internal", hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  } });
}

test("mission, plan, task, submission, and account state survive reload", async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await passkey(context, page);
  const unique = randomUUID().slice(0, 8);
  const title = `Open garden ${unique}`;
  try {
    await enterSignup(page, "Garden Builder", `garden-${unique}@example.test`);
    await page.locator('[data-live="onboard-role"][data-id="maker"]').click();
    await page.getByRole("button", { name: /That's me/ }).click();
    await page.getByRole("heading", { name: "Meet your agent." }).waitFor();
    await page.getByLabel("Name it").fill("Sprout");
    await page.locator('[data-live="onboard-shape"][data-id="star"]').click();
    await page.getByRole("button", { name: /Team up with Sprout/ }).click();
    await page.getByRole("heading", { name: "What do you care about?" }).waitFor();
    await page.locator('[data-live="onboard-pick"]').first().click();
    await page.getByRole("button", { name: "Let's play" }).click();
    await expect(page.getByRole("heading", { name: "Missions" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Missions" })).toBeVisible();
    await page.getByRole("button", { name: "Profile" }).click();
    await expect(page.getByText("Sprout · star")).toBeVisible();
    await expect(page.getByText("Maker", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Missions" }).click();
    const missionDraft = await stubAgentDraft(page, "mission", { title: "Agent's first cut", pitch: "A working open source garden planner.", tag: "Community", stages: [{ name: "Research", goal: "Collect planting facts", target: 1000, gateTarget: 1, unit: "users" }, { name: "Build", goal: "Make the planner", target: 1, unit: "approved tasks" }], rules: ["Gardeners can plan a season"] });
    await page.getByRole("button", { name: "+ New" }).click();
    await page.getByRole("button", { name: "Build a product" }).click();
    await page.getByLabel("Mission name").fill(title);
    await page.getByLabel("What changes if you win?").fill("A working open source garden planner.");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('#nav button[data-x="play"]').click();
    await expect(page.getByRole("heading", { name: "Play" })).toBeVisible();
    await page.locator('#nav button[data-x="lobby"]').click();
    await page.getByRole("button", { name: "Resume draft" }).click();
    await expect(page.getByLabel("Mission name")).toHaveValue(title);
    await expect(page.getByLabel("What changes if you win?")).toHaveValue("A working open source garden planner.");
    await page.waitForTimeout(2_000);
    await expect(page.getByLabel("Mission name")).toHaveValue(title);
    expect(missionDraft.detailReads()).toBe(1);
    await page.getByRole("button", { name: "Looks good" }).click();
    await page.locator('[name="stage-name-0"]').fill("Research");
    await page.locator('[name="stage-goal-0"]').fill("Collect planting facts");
    await page.locator('[name="stage-name-1"]').fill("Build");
    await page.locator('[name="stage-goal-1"]').fill("Make the planner");
    await page.getByRole("button", { name: "These are the stages" }).click();
    await page.getByRole("button", { name: "Gardeners can plan a season" }).click();
    await page.getByRole("button", { name: "These are the rules" }).click();
    await page.getByRole("button", { name: "100 credits" }).click();
    await page.getByRole("button", { name: "Review mission" }).click();
    const missionRetry = await delayAndFailAfterCommitOnce(page, "mission.create");
    await page.getByRole("button", { name: "Publish mission" }).click();
    await missionRetry.ready;
    await expect(page.getByRole("button", { name: "← Back" })).toBeDisabled();
    missionRetry.release();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Publish mission" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    expect(missionRetry.requests).toHaveLength(2);
    expect(missionRetry.requests[1]).toBe(missionRetry.requests[0]);
    await missionRetry.unroute();
    const missionCount = await page.evaluate(async missionTitle => {
      const snapshot = await (await fetch("/api/v1/game", { credentials: "include" })).json();
      return snapshot.missions.filter(mission => mission.title === missionTitle).length;
    }, title);
    expect(missionCount).toBe(1);
    await page.getByRole("tab", { name: "Money", exact: true }).click();
    await page.getByRole("button", { name: "Reserve credits" }).click();
    await page.getByLabel("Credits").fill("50");
    const fundingRetry = await failAfterCommitOnce(page, "funding.reserve");
    await page.getByRole("button", { name: "Reserve", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Simulated lost response after commit");
    await expect(page.getByLabel("Credits")).toBeDisabled();
    await page.getByRole("button", { name: "Retry reservation" }).click();
    expect(fundingRetry.requests).toHaveLength(2);
    expect(fundingRetry.requests[1]).toBe(fundingRetry.requests[0]);
    await fundingRetry.unroute();
    const reservation = await page.evaluate(async missionTitle => {
      const snapshot = await (await fetch("/api/v1/game", { credentials: "include" })).json();
      const mission = snapshot.missions.find(item => item.title === missionTitle);
      return { reserved: mission.funding.reserved, reserveRows: snapshot.wallet.ledger.filter(row => row.mission_id === mission.id && row.kind === "reserve").length };
    }, title);
    expect(reservation).toEqual({ reserved: 50, reserveRows: 1 });
    await page.getByRole("button", { name: "Missions" }).click();
    const mineCard = page.locator(".card.mine").filter({ hasText: title });
    await expect(mineCard.getByRole("button", { name: /Continue stage 1/ })).toBeVisible();
    await mineCard.getByRole("button", { name: /Continue stage 1/ }).click();
    await expect(page.locator(".chat-head")).toContainText(title);
    await stubAgentDraft(page, "plan", { name: "Map the growing season", squad: "Garden crew", bet: "Collect reliable planting dates." });
    await page.getByRole("button", { name: "+ Suggest one" }).click();
    await page.getByRole("button", { name: "Research first" }).click();
    await page.getByLabel("Plan name").fill("Map the growing season");
    await page.getByLabel("How will this win the stage?").fill("Collect reliable planting dates.");
    await page.getByRole("button", { name: "Review plan" }).click();
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("heading", { name: "Map the growing season" })).toBeVisible();
    await stubAgentDraft(page, "quest", { title: "List local planting dates", description: "Research five crops and cite their planting dates.", size: "S" });
    await page.getByRole("button", { name: "+ Task" }).click();
    await page.getByRole("button", { name: "Research" }).click();
    await page.getByLabel("Task name").fill("List local planting dates");
    await page.getByLabel("What needs doing?").fill("Research five crops and cite their planting dates.");
    await page.getByRole("button", { name: "Map the growing season" }).click();
    await page.getByRole("button", { name: "Task options" }).click();
    await page.getByLabel("Decision question, if needed").fill("Which planting calendar should we use?");
    await page.getByLabel("Decision choices, one per line").fill("Local extension guide\nOpen source calendar");
    await page.getByRole("button", { name: "Review task" }).click();
    await page.getByRole("button", { name: "Create task" }).click();
    for (let backCount = 0; backCount < 3 && !(await page.locator("#nav").isVisible()); backCount++) {
      await page.getByRole("button", { name: "Back", exact: true }).first().click();
    }
    await page.locator('#nav button[data-x="lobby"]').click();
    const mineWithPlan = page.locator(".card.mine").filter({ hasText: title });
    await mineWithPlan.getByRole("button", { name: /Continue stage 1/ }).click();
    await stubAgentDraft(page, "quest", { title: "Unplanned grower outreach", description: "Ask local gardeners which planting needs matter most.", size: "S" });
    await page.getByRole("button", { name: "+ Task" }).click();
    await page.getByRole("button", { name: "Research" }).click();
    await page.getByLabel("Task name").fill("Unplanned grower outreach");
    await page.getByLabel("What needs doing?").fill("Ask local gardeners which planting needs matter most.");
    await page.getByRole("button", { name: "Review task" }).click();
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByRole("button", { name: /Map the growing season/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Unplanned grower outreach/ })).toBeVisible();
    await page.getByRole("button", { name: /Map the growing season/ }).click();
    await page.getByRole("button", { name: /List local planting dates/ }).click();
    await page.getByRole("button", { name: "Start task" }).click();
    await page.getByRole("button", { name: "Submit work" }).click();
    await page.getByLabel("Work and evidence").fill("Tomatoes: March; beans: April. Source: local gardening guide.");
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Waiting for two independent reviews")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await page.getByRole("button", { name: "Open stage 1" }).click();
    await page.getByRole("button", { name: /Map the growing season/ }).click();
    await page.getByRole("button", { name: /List local planting dates/ }).click();
    await expect(page.getByText("Waiting for two independent reviews")).toBeVisible();
    await expect(page.getByText("Saved artifacts", { exact: true })).toBeVisible();
  } finally { await context.close(); }
});
