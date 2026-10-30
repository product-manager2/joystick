import { test, expect } from "@playwright/test";

const json = value => ({ status: 200, contentType: "application/json", body: JSON.stringify(value) });

test("a stalled account check offers retry, and a late reply cannot replace the recovered page", async ({ page }) => {
  test.setTimeout(45_000);
  let reads = 0;
  let first;
  await page.route("**/api/v1/me", route => {
    if (++reads === 1) { first = route; return; }
    return route.fulfill(json({ user: null }));
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 18_000 });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Start playing" })).toBeVisible();
  await first.fulfill(json({ user: { id: "stale-account", name: "Stale" } })).catch(() => {});
  await expect(page.getByRole("button", { name: "Start playing" })).toBeVisible();
  expect(reads).toBe(2);
});

test("a stalled signed-in game load offers retry without sending the player to sign in", async ({ page }) => {
  test.setTimeout(45_000);
  let gameReads = 0;
  let first;
  let retrying = false;
  await page.route("**/api/v1/me", route => route.fulfill(json({ user: { id: "player", name: "Player" } })));
  await page.route("**/api/v1/game", route => {
    gameReads++;
    if (!retrying) { first ||= route; return; }
    return route.fulfill(json({ revision: 1, profile: { roles: [], preferences: {} }, missions: [], people: [], threads: [], notifications: [], wallet: { available: 0 } }));
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 18_000 });
  await expect(page.getByRole("heading", { name: "Welcome back." })).toHaveCount(0);
  retrying = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "How would you like to help?" })).toBeVisible();
  const revision = () => page.evaluate(async () => (await import("/src/live/game-client.js")).live.snapshot?.revision);
  expect(await revision()).toBe(1);
  await first.fulfill(json({ revision: 2, profile: { roles: [], preferences: {} }, missions: [], people: [], threads: [], notifications: [], wallet: { available: 0 } })).catch(() => {});
  expect(await revision()).toBe(1);
  expect(gameReads).toBeGreaterThan(1);
});

test("account and game share one startup deadline", async ({ page }) => {
  test.setTimeout(25_000);
  await page.route("**/api/v1/me", async route => {
    await new Promise(resolve => setTimeout(resolve, 5_000));
    await route.fulfill(json({ user: { id: "player", name: "Player" } }));
  });
  await page.route("**/api/v1/game", () => {});
  const started = Date.now();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 18_000 });
  expect(Date.now() - started).toBeLessThan(18_000);
});

test("startup works when AbortSignal.timeout is unavailable", async ({ page }) => {
  await page.addInitScript(() => { AbortSignal.timeout = undefined; });
  await page.route("**/api/v1/me", route => route.fulfill(json({ user: null })));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start playing" })).toBeVisible();
});
