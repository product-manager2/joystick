import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { createAccountFromHero, stubAgentDraft } from "./helpers/onboarding.mjs";

const baseURL = process.env.JOYSTICK_E2E_URL || "http://localhost:5173";

function sentRoomMessages(page) {
  const messages = [];
  page.on("websocket", socket => {
    socket.on("framesent", frame => {
      try {
        const payload = typeof frame.payload === "string" ? frame.payload : frame.payload.toString();
        const data = JSON.parse(payload);
        if (data.type === "message.send") messages.push(data);
      } catch { /* Ignore non-JSON frames. */ }
    });
  });
  return messages;
}

async function passkey(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "internal", hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  } });
}

async function createAccount(browser, name, email) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const websocketMessages = sentRoomMessages(page);
  await passkey(context, page);
  await createAccountFromHero(page, name, email);
  return { context, page, websocketMessages };
}

async function clickTab(page, name) {
  await page.getByRole("tab", { name, exact: true }).click();
}

test("multiplayer artifact reviews, simulated funding, and stage history", async ({ browser }) => {
  test.setTimeout(150_000);
  const suffix = randomUUID().slice(0, 8);
  const missionTitle = `QA Review Funding ${suffix}`;
  const accounts = [];

  try {
    const owner = await createAccount(browser, "QA Owner", `qa-owner-${suffix}@example.test`);
    accounts.push(owner);
    const maker = await createAccount(browser, "QA Maker", `qa-maker-${suffix}@example.test`);
    accounts.push(maker);
    const reviewer = await createAccount(browser, "QA Reviewer", `qa-reviewer-${suffix}@example.test`);
    accounts.push(reviewer);

    const ownerPage = owner.page;
    const makerPage = maker.page;
    const reviewerPage = reviewer.page;

    await stubAgentDraft(ownerPage, "mission", { title: missionTitle, pitch: "Complete one reviewed task and open the next stage.", tag: "Community", stages: [{ name: "Research", goal: "Review the artifact", target: 1000, gateTarget: 1, unit: "users" }, { name: "Delivery", goal: "Continue the work", target: 1, unit: "approved tasks" }], rules: ["Two members approve the latest artifact"] });
    await ownerPage.getByRole("button", { name: "+ New" }).click();
    await ownerPage.getByRole("button", { name: "Build a product" }).click();
    await ownerPage.getByLabel("Mission name").fill(missionTitle);
    await ownerPage.getByLabel("What changes if you win?").fill("Complete one reviewed task and open the next stage.");
    await ownerPage.getByRole("button", { name: "Looks good" }).click();
    await ownerPage.locator('[name="stage-name-0"]').fill("Research");
    await ownerPage.locator('[name="stage-goal-0"]').fill("Review the artifact");
    await ownerPage.locator('[name="stage-name-1"]').fill("Delivery");
    await ownerPage.locator('[name="stage-goal-1"]').fill("Continue the work");
    await ownerPage.getByRole("button", { name: "These are the stages" }).click();
    await ownerPage.getByRole("button", { name: "Two members approve the latest artifact" }).click();
    await ownerPage.getByRole("button", { name: "These are the rules" }).click();
    await ownerPage.getByRole("button", { name: "Review mission" }).click();
    await ownerPage.getByRole("button", { name: "Publish mission" }).click();
    await expect(ownerPage.getByRole("heading", { name: missionTitle })).toBeVisible();

    await clickTab(ownerPage, "Money");
    await ownerPage.getByRole("button", { name: "Reserve credits" }).click();
    await ownerPage.getByLabel("Credits").fill("50");
    await ownerPage.getByRole("button", { name: "Reserve", exact: true }).click();
    await expect(ownerPage.getByText("50 credits reserved", { exact: true })).toBeVisible();

    for (const page of [makerPage, reviewerPage]) {
      await clickTab(page, "Explore");
      await page.getByRole("button", { name: new RegExp(missionTitle) }).click();
      await page.getByRole("button", { name: "Join mission", exact: true }).first().click();
      await page.getByRole("button", { name: "Join mission", exact: true }).last().click();
      await expect(page.getByText("Joined mission", { exact: true })).toBeVisible();
    }

    const makerSentFrames = maker.websocketMessages;
    const ownerSentFrames = owner.websocketMessages;
    await clickTab(ownerPage, "About");
    await ownerPage.getByRole("button", { name: "Mission chat" }).click();
    await clickTab(makerPage, "About");
    await makerPage.getByRole("button", { name: "Mission chat" }).click();

    const makerMessage = `Maker room message ${suffix}`;
    const ownerMessage = `Owner room reply ${suffix}`;
    await makerPage.getByPlaceholder("Message this room…").fill(makerMessage);
    await makerPage.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => makerSentFrames.some(frame => frame.text === makerMessage), { timeout: 10_000 }).toBe(true);
    await expect(ownerPage.getByText(makerMessage, { exact: true })).toBeVisible({ timeout: 12_000 });

    await ownerPage.getByPlaceholder("Message this room…").fill(ownerMessage);
    await ownerPage.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => ownerSentFrames.some(frame => frame.text === ownerMessage), { timeout: 10_000 }).toBe(true);
    await expect(makerPage.getByText(ownerMessage, { exact: true })).toBeVisible({ timeout: 12_000 });

    await ownerPage.reload();
    await expect(ownerPage.getByRole("heading", { name: "Missions" })).toBeVisible();
    await ownerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await clickTab(ownerPage, "About");
    await ownerPage.getByRole("button", { name: "Mission chat" }).click();
    await expect(ownerPage.getByText(makerMessage, { exact: true })).toBeVisible();
    await ownerPage.getByRole("button", { name: "Back", exact: true }).click();
    await makerPage.getByRole("button", { name: "Back", exact: true }).click();
    await ownerPage.getByRole("button", { name: "Back", exact: true }).click();

    await makerPage.getByRole("button", { name: /Open stage 1/ }).click();
    await expect(makerPage.locator(".chat-head")).toContainText("Research");
    await stubAgentDraft(makerPage, "plan", { name: "Evidence plan", squad: "Evidence makers", bet: "Collect and review clear evidence." });
    await makerPage.getByRole("button", { name: "+ Suggest one" }).click();
    await makerPage.getByRole("button", { name: "Research first" }).click();
    await makerPage.getByLabel("Plan name").fill("Evidence plan");
    await makerPage.getByLabel("Squad name").fill("Evidence makers");
    await makerPage.getByLabel("How will this win the stage?").fill("Collect and review clear evidence.");
    await makerPage.getByRole("button", { name: "Review plan" }).click();
    await makerPage.getByRole("button", { name: "Create plan" }).click();
    await expect(makerPage.getByRole("button", { name: /Evidence plan/ })).toBeVisible();

    await ownerPage.reload();
    await ownerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await ownerPage.getByRole("button", { name: /Open stage 1/ }).click();
    await ownerPage.getByRole("button", { name: /Evidence plan/ }).click();
    await expect(ownerPage.getByRole("button", { name: "Approve plan" })).toBeVisible();
    await ownerPage.getByRole("button", { name: "Approve plan" }).click();

    await ownerPage.getByRole("button", { name: "Back", exact: true }).click();
    await stubAgentDraft(ownerPage, "quest", { title: "Review funding flow", description: "Submit an artifact, respond to review feedback, and revise it.", size: "S" });
    await ownerPage.getByRole("button", { name: "+ Task" }).click();
    await ownerPage.getByRole("button", { name: "Research" }).click();
    await ownerPage.getByLabel("Task name").fill("Review funding flow");
    await ownerPage.getByLabel("What needs doing?").fill("Submit an artifact, respond to review feedback, and revise it.");
    await ownerPage.getByRole("button", { name: "Task options" }).click();
    await ownerPage.getByRole("button", { name: "10 credits" }).click();
    await ownerPage.getByRole("button", { name: "Review task" }).click();
    await ownerPage.getByRole("button", { name: "Create task" }).click();
    await expect(ownerPage.getByText("Tasks outside a plan")).toBeVisible();
    await expect(ownerPage.getByRole("button", { name: /Review funding flow/ })).toBeVisible();

    await makerPage.reload();
    await makerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await makerPage.getByRole("button", { name: /Open stage 1/ }).click();
    await makerPage.getByRole("button", { name: /Review funding flow/ }).click();
    await makerPage.getByRole("button", { name: "Start task" }).click();
    await makerPage.getByRole("button", { name: "Submit work" }).click();
    await makerPage.getByLabel("Artifact title").fill("Evidence v1");
    await makerPage.getByLabel("Work and evidence").fill("Version 1: initial evidence, awaiting reviewer feedback.");
    await makerPage.getByRole("button", { name: "Submit for review" }).click();
    await expect(makerPage.getByText("Waiting for two independent reviews")).toBeVisible();

    await reviewerPage.reload();
    await reviewerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await reviewerPage.getByRole("button", { name: /Open stage 1/ }).click();
    await reviewerPage.getByRole("button", { name: /Review funding flow/ }).click();
    await reviewerPage.getByRole("button", { name: "Review this work" }).click();
    await reviewerPage.getByLabel("Verdict").selectOption("changes_requested");
    await reviewerPage.getByLabel("Review notes").fill("Please include a concrete source in the revised artifact.");
    await reviewerPage.getByRole("button", { name: "Save review" }).click();
    await makerPage.reload();
    await expect(makerPage.getByRole("heading", { name: "Missions" })).toBeVisible();
    await makerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await makerPage.getByRole("button", { name: /Open stage 1/ }).click();
    await makerPage.getByRole("button", { name: /Review funding flow/ }).click();
    await expect(makerPage.getByRole("button", { name: "Revise and resubmit" })).toBeVisible({ timeout: 12_000 });

    await makerPage.getByRole("button", { name: "Revise and resubmit" }).click();
    await makerPage.getByLabel("Artifact title").fill("Evidence v2");
    await makerPage.getByLabel("Work and evidence").fill("Version 2: revised with concrete source evidence.");
    await makerPage.getByRole("button", { name: "Submit for review" }).click();
    await expect(makerPage.getByText("Waiting for two independent reviews")).toBeVisible();
    await expect(makerPage.getByText("Saved artifacts", { exact: true })).toBeVisible();
    await expect(makerPage.getByText("Evidence v1")).toBeVisible();
    await expect(makerPage.getByText("Evidence v2")).toBeVisible();

    await ownerPage.reload();
    await ownerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await ownerPage.getByRole("button", { name: /Open stage 1/ }).click();
    await ownerPage.getByRole("button", { name: /Review funding flow/ }).click();
    await ownerPage.getByRole("button", { name: "Review this work" }).click();
    await ownerPage.getByLabel("Verdict").selectOption("approve");
    await ownerPage.getByLabel("Review notes").fill("Latest revision approved by the owner.");
    await ownerPage.getByRole("button", { name: "Save review" }).click();

    await reviewerPage.reload();
    await reviewerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await reviewerPage.getByRole("button", { name: /Open stage 1/ }).click();
    await reviewerPage.getByRole("button", { name: /Review funding flow/ }).click();
    await reviewerPage.getByRole("button", { name: "Review this work" }).click();
    await reviewerPage.getByLabel("Verdict").selectOption("approve");
    await reviewerPage.getByLabel("Review notes").fill("Latest revision approved by a second member.");
    await reviewerPage.getByRole("button", { name: "Save review" }).click();
    await expect(makerPage.getByText("✓ Approved by two members")).toBeVisible({ timeout: 12_000 });

    await ownerPage.reload();
    await ownerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await ownerPage.getByRole("button", { name: /Open stage 1/ }).click();
    await ownerPage.locator(".stage-goal").click();
    const goalDialog = ownerPage.getByRole("dialog", { name: "Stage goal" });
    await expect(goalDialog.getByText("1000 users is the mission's outcome target.")).toBeVisible();
    await expect(goalDialog.getByText(/At least 1 approved tasks are needed/)).toBeVisible();
    await goalDialog.getByRole("button", { name: "×" }).click();
    await ownerPage.getByRole("button", { name: "Approve completed stage" }).click();
    await expect(ownerPage.getByText("Stage approved")).toBeVisible();

    await makerPage.getByRole("button", { name: "Back", exact: true }).click();
    await makerPage.getByRole("button", { name: "Profile" }).click();
    await makerPage.getByText("Wallet history and actions").click();
    const walletHistory = makerPage.locator(".wallet-details");
    await expect(walletHistory.getByText("earning", { exact: true })).toBeVisible();
    await expect(walletHistory).toContainText(/\+10/);
    await makerPage.getByRole("button", { name: "Record payout · Review funding flow" }).click();
    await expect(makerPage.getByText("Payout recorded")).toBeVisible();

    const downloadPromise = makerPage.waitForEvent("download");
    await makerPage.getByRole("button", { name: "Export credits CSV" }).click();
    const download = await downloadPromise;
    const csv = await readFile(await download.path(), "utf8");
    expect(csv).toContain("earning");
    expect(csv).toContain("payout_simulation");

    await ownerPage.reload();
    await ownerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await ownerPage.getByRole("button", { name: /Open stage 1/ }).click();
    await expect(ownerPage.getByRole("button", { name: "Advance to next stage" })).toBeVisible({ timeout: 12_000 });
    await ownerPage.getByRole("button", { name: "Advance to next stage" }).click();
    await ownerPage.getByRole("button", { name: "Back", exact: true }).click();
    await ownerPage.getByRole("button", { name: /Open stage 2/ }).click();
    await expect(ownerPage.locator(".chat-head")).toContainText("Delivery");

    await ownerPage.getByRole("button", { name: "Back", exact: true }).click();
    await clickTab(ownerPage, "About");
    await ownerPage.getByRole("button", { name: "Story & outputs" }).click();
    await expect(ownerPage.getByText("Stage history", { exact: true })).toBeVisible();
    await expect(ownerPage.getByText("approved", { exact: true })).toBeVisible();
    await expect(ownerPage.getByText(/version 1/i)).toBeVisible();
    await expect(ownerPage.getByText(/version 2/i)).toBeVisible();
  } finally {
    await Promise.all(accounts.map(({ context }) => context.close()));
  }
});
