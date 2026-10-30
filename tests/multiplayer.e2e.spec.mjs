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

async function openMissionFromExplore(page, title) {
  await clickTab(page, "Explore");
  await page.locator('.chips [data-live="filter"][data-id="All"]').click();
  const list = page.locator(".poster-list");
  const target = list.locator('[data-live="mission"]').filter({ hasText: title });
  for (let batch = 0; batch < 25 && await target.count() === 0; batch++) {
    const more = list.locator('[data-live="list-more"]');
    if (await more.count() === 0) throw new Error(`Mission ${title} was absent after revealing every Explore batch`);
    await more.click();
  }
  await expect(target).toBeVisible();
  await target.click();
}

async function holdActionAfterCommit(page, actionName) {
  let startedResolve, releaseResolve;
  const started = new Promise(resolve => { startedResolve = resolve; });
  const released = new Promise(resolve => { releaseResolve = resolve; });
  const pattern = "**/api/v1/game/actions";
  const handler = async route => {
    if (route.request().postDataJSON().action !== actionName) return route.fallback();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    startedResolve();
    await released;
    await route.fulfill({ response });
  };
  await page.route(pattern, handler);
  return { started, release: releaseResolve, unroute: () => page.unroute(pattern, handler) };
}

// A mission opens inside your squad once you have one; checkpoints live on the mission map.
async function openCheckpoint(page, n) {
  await page.locator(".plan-chat, #map, .live-segment-tabs").first().waitFor();
  const back = page.getByRole("button", { name: "Mission map" });
  if (await back.isVisible()) await back.click();
  const tab = page.getByRole("tab", { name: "Map" });
  if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
  await page.locator(`#c-${n - 1}`).click();
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
    await ownerPage.getByRole("button", { name: "A tool people badly need" }).click();
    await ownerPage.getByLabel("Mission name").fill(missionTitle);
    await ownerPage.getByLabel("Problem, people affected, and successful outcome").fill("Complete one reviewed task and open the next stage.");
    await ownerPage.getByRole("button", { name: "Review stages" }).click();
    await ownerPage.locator('[name="stage-name-0"]').fill("Research");
    await ownerPage.locator('[name="stage-goal-0"]').fill("Review the artifact");
    await ownerPage.locator('[name="stage-name-1"]').fill("Delivery");
    await ownerPage.locator('[name="stage-goal-1"]').fill("Continue the work");
    await ownerPage.getByRole("button", { name: "Review success criteria" }).click();
    await ownerPage.getByRole("button", { name: "Two members approve the latest artifact" }).click();
    await ownerPage.getByRole("button", { name: "Review team" }).click();
    await ownerPage.getByRole("button", { name: "Review mission" }).click();
    await ownerPage.getByRole("button", { name: "Publish mission" }).click();
    await expect(ownerPage.getByRole("heading", { name: missionTitle })).toBeVisible();

    await clickTab(ownerPage, "Funding");
    await ownerPage.getByRole("button", { name: "Reserve credits" }).click();
    await ownerPage.getByLabel("Credits").fill("50");
    await expect(ownerPage.locator(".token-preview")).toContainText(/Expected: 15 J[A-F0-9]{8}/);
    await ownerPage.getByRole("button", { name: "Reserve 50 credits", exact: true }).click();
    await expect(ownerPage.locator(".mission-money-overview")).toContainText("50 available funding");
    await expect(ownerPage.locator(".mission-personal-money .kvrow").filter({ hasText: "Reserved by you" })).toContainText("50");
    await expect(ownerPage.locator(".mission-token-card")).toContainText(/15.*J[A-F0-9]{8}|J[A-F0-9]{8}.*15/);

    for (const page of [makerPage, reviewerPage]) {
      await page.reload();
      await expect(page.getByRole("heading", { name: "Missions" })).toBeVisible();
      await openMissionFromExplore(page, missionTitle);
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
    await makerPage.locator('#live-composer [name="text"]').fill(makerMessage);
    await makerPage.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => makerSentFrames.some(frame => frame.text === makerMessage), { timeout: 10_000 }).toBe(true);
    await expect(ownerPage.getByText(makerMessage, { exact: true })).toBeVisible({ timeout: 12_000 });

    await ownerPage.locator('#live-composer [name="text"]').fill(ownerMessage);
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

    await openCheckpoint(makerPage, 1);
    await expect(makerPage.locator(".chat-head")).toContainText("Research");
    await stubAgentDraft(makerPage, "plan", { name: "Evidence plan", squad: "Evidence makers", bet: "Collect and review clear evidence." });
    await makerPage.getByRole("button", { name: "+ Suggest one" }).click();
    await makerPage.getByRole("button", { name: "Research first" }).click();
    await makerPage.getByLabel("Plan name").fill("Evidence plan");
    await makerPage.getByLabel("Squad name").fill("Evidence makers");
    await makerPage.getByLabel("Approach and expected result").fill("Collect and review clear evidence.");
    await makerPage.getByRole("button", { name: "Review plan" }).click();
    await makerPage.getByRole("button", { name: "Create plan" }).click();
    // Starting a squad opens it: it is the maker's squad now.
    await expect(makerPage.locator(".plan-chat .room-title")).toHaveText("Evidence plan");

    await ownerPage.reload();
    await ownerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await openCheckpoint(ownerPage, 1);
    await ownerPage.getByRole("button", { name: /Evidence plan/ }).click();
    await expect(ownerPage.getByRole("button", { name: "Approve plan" })).toBeVisible();
    const approval = await holdActionAfterCommit(ownerPage, "plan.approve");
    await ownerPage.getByRole("button", { name: "Approve plan" }).click();
    await approval.started;
    await ownerPage.getByRole("button", { name: "Mission map" }).click();
    await expect(ownerPage.locator(".chat-head")).toContainText("Evidence plan");
    await ownerPage.locator('#nav button[data-x="lobby"]').click();
    await expect(ownerPage.locator(".chat-head")).toContainText("Evidence plan");
    approval.release();
    await expect(ownerPage.getByRole("button", { name: "Approve plan" })).toHaveCount(0);
    await approval.unroute();
    await ownerPage.getByRole("button", { name: "Mission map" }).click();
    await openCheckpoint(ownerPage, 1);
    await expect(ownerPage.locator(".chat-head")).toContainText("Research");
    await stubAgentDraft(ownerPage, "quest", { title: "Review funding flow", description: "Submit an artifact, respond to review feedback, and revise it.", size: "S" });
    await ownerPage.getByRole("button", { name: "+ Task" }).click();
    await ownerPage.getByRole("button", { name: "Research" }).click();
    await ownerPage.getByLabel("Task name").fill("Review funding flow");
    await ownerPage.getByLabel("Deliverable and review guidance").fill("Submit an artifact, respond to review feedback, and revise it.");
    await ownerPage.getByRole("button", { name: "Task options" }).click();
    await ownerPage.getByRole("button", { name: "10 credits" }).click();
    await ownerPage.getByRole("button", { name: "Review task" }).click();
    await ownerPage.getByRole("button", { name: "Create task" }).click();
    await expect(ownerPage.getByText("Tasks outside a plan")).toBeVisible();
    await expect(ownerPage.getByRole("button", { name: /Review funding flow/ })).toBeVisible();

    await makerPage.reload();
    await makerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await openCheckpoint(makerPage, 1);
    await makerPage.getByRole("button", { name: /Review funding flow/ }).click();
    await expect(makerPage.locator(".task-token-reward").first()).toHaveText(/Expected 15 J[A-F0-9]{8}/);
    await makerPage.getByRole("button", { name: "Claim task" }).click();
    await makerPage.getByRole("button", { name: "Submit work" }).click();
    await makerPage.getByLabel("Work title").fill("Evidence v1");
    await makerPage.getByLabel("Work and evidence").fill("Version 1: initial evidence, awaiting reviewer feedback.");
    await makerPage.getByRole("button", { name: "Submit for review" }).click();
    await expect(makerPage.getByText("Waiting for two independent reviews")).toBeVisible();

    await reviewerPage.reload();
    await reviewerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await openCheckpoint(reviewerPage, 1);
    await reviewerPage.getByRole("button", { name: /Review funding flow/ }).click();
    await reviewerPage.getByRole("button", { name: "Review this work" }).click();
    await reviewerPage.getByLabel("Verdict").selectOption("changes_requested");
    await reviewerPage.getByLabel("Review notes").fill("Please include a concrete source in the revised artifact.");
    await reviewerPage.getByRole("button", { name: "Save review" }).click();
    await makerPage.reload();
    await expect(makerPage.getByRole("heading", { name: "Missions" })).toBeVisible();
    await makerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await openCheckpoint(makerPage, 1);
    await makerPage.getByRole("button", { name: /Review funding flow/ }).click();
    await expect(makerPage.getByRole("button", { name: "Revise and resubmit" })).toBeVisible({ timeout: 12_000 });

    await makerPage.getByRole("button", { name: "Revise and resubmit" }).click();
    await makerPage.getByLabel("Work title").fill("Evidence v2");
    await makerPage.getByLabel("Work and evidence").fill("Version 2: revised with concrete source evidence.");
    await makerPage.getByRole("button", { name: "Submit for review" }).click();
    await expect(makerPage.getByText("Waiting for two independent reviews")).toBeVisible();
    await expect(makerPage.getByText("Saved work", { exact: true })).toBeVisible();
    await expect(makerPage.getByText("Evidence v1")).toBeVisible();
    await expect(makerPage.getByText("Evidence v2")).toBeVisible();

    // Exercise the quick-check UI with a real submitted task and deterministic
    // snapshot overlays. The live server and player reviews remain unchanged.
    let checkStatus = "queued", checkArtifact = "latest", fixtureRevision = 1_000_000;
    await makerPage.route("**/api/v1/game", async route => {
      const response = await route.fetch();
      const snapshot = await response.json();
      const mission = snapshot.missions.find(m => m.title === missionTitle);
      const task = mission?.quests.find(q => q.title === "Review funding flow");
      if (!task || task.state !== "submitted") return route.fulfill({ response });
      const latest = task.artifacts.at(-1), previous = task.artifacts.at(-2);
      task.instantCheck = {
        artifactId: checkArtifact === "previous" ? previous.id : latest.id,
        status: checkStatus,
        source: checkStatus === "queued" ? null : "jev",
        feedback: checkStatus === "needs_attention" ? "Add a source for the date <script>alert(1)</script>" : "",
        provisionalTokens: checkStatus === "passed" ? 15 : 0,
      };
      snapshot.wallet.pendingMissionTokens = checkStatus === "passed" ? [{ missionId: mission.id, symbol: mission.token.symbol, amount: 15 }] : [];
      snapshot.revision = fixtureRevision++;
      await route.fulfill({ response, json: snapshot });
    });
    const refreshFixture = async () => {
      await makerPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    };
    await refreshFixture();
    await expect(makerPage.getByText("Checking your work…")).toBeVisible();
    checkStatus = "passed";
    await refreshFixture();
    await expect(makerPage.getByText("Looks ready!")).toBeVisible();
    await expect(makerPage.locator(".instant-check")).toContainText(/\+15 J[A-F0-9]{8} provisional/);
    await makerPage.getByRole("button", { name: "Profile" }).click();
    await makerPage.locator('[data-live="wallet-sheet"]').click();
    const pendingWallet = makerPage.getByRole("dialog", { name: "Wallet" });
    await expect(pendingWallet.locator(".wallet-pending-tokens")).toContainText(/\+15 J[A-F0-9]{8}/);
    await expect(pendingWallet.locator(".wallet-token-row").filter({ hasText: missionTitle })).toHaveCount(0);
    await expect(pendingWallet.locator(".mission-token-history")).toHaveCount(0);
    await pendingWallet.getByRole("button", { name: "×" }).focus();
    checkStatus = "unavailable";
    await refreshFixture();
    await expect(pendingWallet.locator(".wallet-pending-tokens")).toHaveCount(0);
    await expect(pendingWallet.getByRole("button", { name: "×" })).toBeFocused();
    checkStatus = "passed";
    await refreshFixture();
    await expect(pendingWallet.locator(".wallet-pending-tokens")).toBeVisible();
    await pendingWallet.getByRole("button", { name: "×" }).click();
    await makerPage.locator('#nav button[data-x="lobby"]').click();
    await makerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await openCheckpoint(makerPage, 1);
    await makerPage.getByRole("button", { name: /Review funding flow/ }).click();
    checkStatus = "needs_attention";
    await refreshFixture();
    await expect(makerPage.locator(".instant-check")).toContainText("Add a source for the date <script>alert(1)</script>");
    await expect(makerPage.locator(".instant-check script")).toHaveCount(0);
    await expect(makerPage.getByRole("button", { name: "Improve and resubmit" })).toBeVisible();
    checkStatus = "unavailable";
    await refreshFixture();
    await expect(makerPage.getByText("Work saved. Players can review it.")).toBeVisible();
    checkArtifact = "previous";
    await refreshFixture();
    await expect(makerPage.locator(".instant-check")).toHaveCount(0);
    await makerPage.unroute("**/api/v1/game");
    await makerPage.reload();
    await makerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await openCheckpoint(makerPage, 1);
    await makerPage.getByRole("button", { name: /Review funding flow/ }).click();

    await ownerPage.reload();
    await ownerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await openCheckpoint(ownerPage, 1);
    await ownerPage.getByRole("button", { name: /Review funding flow/ }).click();
    await ownerPage.getByRole("button", { name: "Review this work" }).click();
    await ownerPage.getByLabel("Verdict").selectOption("approve");
    await ownerPage.getByLabel("Review notes").fill("Latest revision approved by the owner.");
    await ownerPage.getByRole("button", { name: "Save review" }).click();

    await reviewerPage.reload();
    await reviewerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await openCheckpoint(reviewerPage, 1);
    await reviewerPage.getByRole("button", { name: /Review funding flow/ }).click();
    await reviewerPage.getByRole("button", { name: "Review this work" }).click();
    await reviewerPage.getByLabel("Verdict").selectOption("approve");
    await reviewerPage.getByLabel("Review notes").fill("Latest revision approved by a second member.");
    await reviewerPage.getByRole("button", { name: "Save review" }).click();
    await expect(makerPage.getByText("✓ Approved by two members")).toBeVisible({ timeout: 12_000 });
    await expect(makerPage.locator(".task-token-reward").first()).toHaveText(/Earned 15 J[A-F0-9]{8}/);

    await ownerPage.reload();
    await ownerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await openCheckpoint(ownerPage, 1);
    await ownerPage.locator(".stage-goal").click();
    const goalDialog = ownerPage.getByRole("dialog", { name: "Stage goal" });
    await expect(goalDialog.getByText("1000 users planned.")).toBeVisible();
    await expect(goalDialog.getByText("1 of 1 tasks approved · 1 required")).toBeVisible();
    await expect(goalDialog.getByRole("button", { name: /Review funding flow/ })).toBeVisible();
    await goalDialog.getByRole("button", { name: "×" }).click();
    await ownerPage.getByRole("button", { name: "Approve completed stage" }).click();
    await expect(ownerPage.getByText("Stage approved")).toBeVisible();

    await makerPage.reload();
    await makerPage.getByRole("button", { name: "Profile" }).click();
    await makerPage.locator('[data-live="wallet-sheet"]').click();
    const walletHistory = makerPage.getByRole("dialog", { name: "Wallet" });
    const missionHolding = walletHistory.locator(".wallet-token-row").filter({ hasText: missionTitle });
    await expect(missionHolding.locator("strong")).toHaveText(/15 J[A-F0-9]{8}/);
    await expect(walletHistory.locator(".wallet-token-entry").filter({ hasText: "Approved task" })).toContainText(/\+15 J[A-F0-9]{8}/);
    await expect(walletHistory.getByText("earning", { exact: true })).toBeVisible();
    await expect(walletHistory).toContainText(/\+10/);
    await walletHistory.getByRole("button", { name: "Record payout", exact: true }).click();
    await expect(walletHistory).toContainText("Payout recorded");

    const downloadPromise = makerPage.waitForEvent("download");
    await walletHistory.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;
    const csv = await readFile(await download.path(), "utf8");
    expect(csv).toContain("earning");
    expect(csv).toContain("payout_simulation");
    await missionHolding.click();
    await expect(makerPage.getByRole("dialog", { name: "Wallet" })).toHaveCount(0);
    await expect(makerPage.locator(".mission-token-card")).toContainText("15");
    await expect(makerPage.getByRole("heading", { name: missionTitle })).toBeVisible();

    await ownerPage.reload();
    await ownerPage.getByRole("button", { name: new RegExp(missionTitle) }).click();
    await openCheckpoint(ownerPage, 1);
    await expect(ownerPage.getByRole("button", { name: "Advance to next stage" })).toBeVisible({ timeout: 12_000 });
    await ownerPage.getByRole("button", { name: "Advance to next stage" }).click();
    await expect(ownerPage.locator(".chat-head")).toContainText("Delivery");

    await ownerPage.getByRole("button", { name: "Back", exact: true }).click();
    await clickTab(ownerPage, "About");
    await ownerPage.getByRole("button", { name: "Story & outputs" }).click();
    await expect(ownerPage.getByRole("heading", { name: "How it went" })).toBeVisible();
    const stageStory = ownerPage.locator(".mission-recap .mstones");
    await expect(stageStory.locator("li").filter({ hasText: "Research" })).toContainText("Approved · 1/1 tasks approved");
    await expect(stageStory.locator("li").filter({ hasText: "Delivery" })).toContainText("In progress");
    const outputs = ownerPage.locator(".mission-recap .recap-output-list");
    await expect(outputs.getByText("Evidence v1")).toBeVisible();
    await expect(outputs.getByText("Evidence v2")).toBeVisible();
    await expect(outputs.getByText(/version 1/i)).toBeVisible();
    await expect(outputs.getByText(/version 2/i)).toBeVisible();
  } finally {
    await Promise.all(accounts.map(({ context }) => context.close()));
  }
});
