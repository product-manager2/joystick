import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

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
    await page.goto(baseURL);
    await expect(page.getByRole("heading", { name: "Start with a passkey." })).toBeVisible();
    await page.getByLabel("Your name").fill("Garden Builder");
    await page.getByLabel("Email").fill(`garden-${unique}@example.test`);
    await page.getByRole("button", { name: "Create account with passkey" }).click();
    await expect(page.getByText("Change the world. Multiplayer.")).toBeVisible();
    await page.getByRole("button", { name: "Skip setup" }).click();
    await expect(page.getByRole("heading", { name: "Missions" })).toBeVisible();
    await page.getByRole("button", { name: "+ New" }).click();
    await page.getByLabel("Mission name").fill(title);
    await page.getByLabel("The win").fill("A working open source garden planner.");
    await page.getByLabel("Stages: name | goal | approved tasks needed").fill("Research | Collect planting facts | 1\nBuild | Make the planner | 1");
    await page.getByLabel("Win rules, one per line").fill("Gardeners can plan a season");
    await page.getByRole("button", { name: "Publish mission" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByRole("button", { name: "Open stage 1" }).click();
    await page.getByRole("button", { name: "+ Plan" }).click();
    await page.getByLabel("Plan name").fill("Map the growing season");
    await page.getByRole("button", { name: "Save plan" }).click();
    await expect(page.getByText("Map the growing season")).toBeVisible();
    await page.getByRole("button", { name: "+ Task" }).click();
    await page.getByLabel("Task name").fill("List local planting dates");
    await page.getByLabel("What needs doing").fill("Research five crops and cite their planting dates.");
    await page.getByLabel("Plan", { exact: true }).selectOption({ label: "Map the growing season" });
    await page.getByRole("button", { name: "Save task" }).click();
    await page.getByRole("button", { name: /Map the growing season/ }).click();
    await page.getByRole("button", { name: /List local planting dates/ }).click();
    await page.getByRole("button", { name: "Claim task" }).click();
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
    await expect(page.getByText("Saved artifact history")).toBeVisible();
  } finally { await context.close(); }
});
