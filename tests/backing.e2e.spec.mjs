import { test, expect } from "@playwright/test";
import { enterSignup, finishSetup } from "./helpers/onboarding.mjs";

test("a backing task backs the squad and hands in the receipt in one step", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await enterSignup(page, "Patron", `patron${Date.now()}@example.test`);
  await finishSetup(page);
  // Any seeded backing task that is ready to start.
  const pick = await page.evaluate(async () => {
    const { missions } = await (await fetch("/api/v1/game", { credentials: "include" })).json();
    for (const m of missions.filter(x => !x.joined)) for (const q of m.quests) {
      const p = m.strategies.find(x => x.id === q.strat), s = m.stages.find(x => x.id === q.stageId);
      const deps = (q.dependencies || []).every(id => m.quests.some(x => x.id === id && x.state === "approved"));
      if (q.role === "patron" && q.title.startsWith("Back ") && q.state === "open" && p?.status === "active" && p.stageId === q.stageId && ["active", "pending"].includes(s?.status) && deps && !m.quests.some(x => x.parent === q.id)) return { mission: m.title, squad: p.squad, task: q.title };
    }
  });
  expect(pick).toBeTruthy();
  await page.getByText("Explore", { exact: true }).click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  while (!(await page.getByText(pick.mission).count())) await page.getByRole("button", { name: /Show more/ }).first().click();
  await page.getByText(pick.mission).first().click();
  await page.locator(".tnode", { hasText: pick.squad }).click();
  await page.getByRole("button", { name: `Join ${pick.squad}` }).click();
  await expect(page.getByText("✓ Your squad")).toBeVisible();
  const task = page.getByRole("button", { name: pick.task });
  while (!(await task.count())) await page.getByRole("button", { name: /Show more/ }).first().click();
  await task.first().click();
  await page.getByRole("button", { name: `Back ${pick.squad}`, exact: true }).first().click();
  await page.getByLabel("Credits").fill("10");
  await page.getByRole("button", { name: "Back with 10 credits and hand in" }).click();
  await expect(page.getByText("Backed, and the receipt is handed in for review")).toBeVisible();
  await expect(page.getByText(`Backing receipt · ${pick.squad}`)).toBeVisible();
  await expect(page.getByText("Waiting for two independent reviews").first()).toBeVisible();
});
