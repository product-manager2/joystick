import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

export async function enterSignup(page, name, email) {
  await page.goto(process.env.JOYSTICK_E2E_URL || "http://localhost:5173");
  await page.getByRole("button", { name: "Start playing" }).click();
  await expect(page.getByRole("heading", { name: "Start with a passkey." })).toBeVisible();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Create account with passkey" }).click();
  await expect(page.getByRole("heading", { name: "What are you great at?" })).toBeVisible();
}

export async function finishSetup(page, { selectMission = true } = {}) {
  await page.locator('[data-live="onboard-role"][data-id="maker"]').click();
  await page.getByRole("button", { name: /That's me/ }).click();
  await expect(page.getByRole("heading", { name: "Meet your agent." })).toBeVisible();
  await page.getByLabel("Name it").fill("Pip");
  await page.locator('[data-live="onboard-shape"][data-id="cube"]').click();
  await page.getByRole("button", { name: /Team up with Pip/ }).click();
  await expect(page.getByRole("heading", { name: "What do you care about?" })).toBeVisible();
  if (selectMission) {
    const missions = page.locator('[data-live="onboard-pick"]');
    await expect(missions.first()).toBeVisible();
    await missions.first().click();
    await page.getByRole("button", { name: "Let's play" }).click();
  } else {
    await page.getByRole("button", { name: "Skip setup" }).click();
  }
  await expect(page.getByRole("heading", { name: "Missions" })).toBeVisible();
}

export async function createAccountFromHero(page, name, email, options) {
  await enterSignup(page, name, email);
  await finishSetup(page, options);
}

export async function stubAgentDraft(page, kind, data) {
  const id = randomUUID();
  const draft = { id: randomUUID(), kind, data };
  let detailReads = 0;
  await page.route("**/api/v1/agent/runs", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const request = route.request().postDataJSON();
    expect(request.kind).toBe(`${kind}-draft`);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: {
      id, kind: request.kind, status: "queued", missionId: request.missionId || null,
      planId: request.planId || null, questId: null, roomId: null, prompt: request.prompt,
      response: null, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } }) });
  });
  await page.route(`**/api/v1/agent/runs/${id}`, route => { detailReads++; return route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      run: { id, kind: `${kind}-draft`, status: "completed", missionId: null, planId: null, questId: null, roomId: null,
        prompt: "Deterministic browser-test fixture", response: "Fixture draft ready for review", error: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      drafts: [draft], artifacts: [], decisions: [],
    }),
  }); });
  return { id, detailReads: () => detailReads };
}

export async function failAfterCommitOnce(page, actionName) {
  const requests = [];
  let failed = false;
  const routePattern = "**/api/v1/game/actions";
  const handler = async route => {
    const payload = route.request().postDataJSON();
    if (payload.action !== actionName || failed) {
      if (payload.action === actionName) requests.push(payload.requestId);
      return route.fallback();
    }
    requests.push(payload.requestId);
    const committed = await route.fetch();
    expect(committed.ok()).toBe(true);
    failed = true;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "proxy_error", message: "Simulated lost response after commit" } }) });
  };
  await page.route(routePattern, handler);
  return { requests, unroute: () => page.unroute(routePattern, handler) };
}

export async function delayAndFailAfterCommitOnce(page, actionName) {
  const requests = [];
  let startResolve, releaseResolve;
  const ready = new Promise(resolve => { startResolve = resolve; });
  const released = new Promise(resolve => { releaseResolve = resolve; });
  const routePattern = "**/api/v1/game/actions";
  const handler = async route => {
    const payload = route.request().postDataJSON();
    if (payload.action !== actionName) return route.fallback();
    requests.push(payload.requestId);
    if (requests.length > 1) return route.fallback();
    const committed = await route.fetch();
    expect(committed.ok()).toBe(true);
    startResolve();
    await released;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "proxy_error", message: "Simulated lost response after commit" } }) });
  };
  await page.route(routePattern, handler);
  return { requests, ready, release: releaseResolve, unroute: () => page.unroute(routePattern, handler) };
}
