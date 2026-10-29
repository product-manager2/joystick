import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { enterSignup, finishSetup } from "./helpers/onboarding.mjs";

const baseURL = process.env.JOYSTICK_E2E_URL || "http://localhost:5173";
const apiOrigin = process.env.JOYSTICK_E2E_API_ORIGIN || "http://localhost:3001";
const actionTimeout = 10_000;

// Recovery codes must never be written to trace, screenshot, or test output.
test.use({ trace: "off", screenshot: "off" });

async function addVirtualAuthenticator(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "internal", hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  } });
  return { cdp, authenticatorId };
}

async function click(locator) { await locator.click({ timeout: actionTimeout }); }

async function openSecurity(page) {
  await page.locator("#nav").waitFor({ state: "visible", timeout: actionTimeout });
  await click(page.locator('#nav [data-x="profile"]'));
  await click(page.getByRole("button", { name: "Account security" }));
  await expect(page.getByRole("heading", { name: "Account security" })).toBeVisible({ timeout: actionTimeout });
}

async function listPasskeyIds(page) {
  return page.evaluate(async origin => {
    const response = await fetch(`${origin}/api/v1/auth/passkeys`, { credentials: "include" });
    const body = await response.json();
    return { status: response.status, ids: (body.passkeys || []).map(key => key.id) };
  }, apiOrigin);
}

test("account security passkey and recovery lifecycle", async ({ browser }) => {
  test.setTimeout(90_000);
  const email = `security-${randomUUID()}@example.test`;
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  pageA.setDefaultTimeout(actionTimeout);
  const authA = await addVirtualAuthenticator(contextA, pageA);
  let contextB, contextC, contextD;

  try {
    await enterSignup(pageA, "Account Security Test", email);
    await finishSetup(pageA);
    await pageA.locator("#nav").waitFor({ state: "visible", timeout: actionTimeout });

    await openSecurity(pageA);
    const initial = await listPasskeyIds(pageA);
    expect(initial.status).toBe(200);
    expect(initial.ids).toHaveLength(1);
    const originalId = initial.ids[0];

    await click(pageA.getByRole("button", { name: "Verify with passkey" }));
    await expect(pageA.getByText("Passkey verified")).toBeVisible({ timeout: actionTimeout });
    await click(pageA.getByRole("button", { name: "Generate recovery codes" }));
    const codeBlock = pageA.locator("pre.live-artifact");
    await codeBlock.waitFor({ state: "visible", timeout: actionTimeout });
    const codes = (await codeBlock.innerText()).trim().split(/\s+/).filter(Boolean);
    expect(codes.length).toBe(10);
    const recoveryCode = codes[0];

    // Copy the current session into a separate context with a separate authenticator.
    contextB = await browser.newContext();
    await contextB.addCookies(await contextA.cookies());
    const pageB = await contextB.newPage();
    pageB.setDefaultTimeout(actionTimeout);
    await addVirtualAuthenticator(contextB, pageB);
    await pageB.goto(baseURL, { waitUntil: "domcontentloaded", timeout: actionTimeout });
    await openSecurity(pageB);
    await click(pageB.getByRole("button", { name: "Add passkey" }));
    await expect(pageB.getByText("Passkey added")).toBeVisible({ timeout: actionTimeout });

    let listed = await listPasskeyIds(pageB);
    expect(listed.status).toBe(200);
    expect(listed.ids).toHaveLength(2);
    const spareId = listed.ids.find(id => id !== originalId);
    expect(spareId).toBeTruthy();

    await click(pageB.locator(`[data-live="passkey-remove"][data-id="${spareId}"]`));
    await expect(pageB.getByText("Passkey removed")).toBeVisible({ timeout: actionTimeout });
    listed = await listPasskeyIds(pageA);
    expect(listed.status).toBe(200);
    expect(listed.ids).toEqual([originalId]);

    const lastRemoval = await pageA.evaluate(async ({ origin, id }) => {
      const response = await fetch(`${origin}/api/v1/auth/passkeys/${encodeURIComponent(id)}/remove`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const body = await response.json();
      return { status: response.status, code: body.error?.code };
    }, { origin: apiOrigin, id: originalId });
    expect(lastRemoval).toEqual({ status: 409, code: "last_passkey" });

    await click(pageA.locator('#main [data-a="back"]'));
    await click(pageA.locator('#nav [data-x="profile"]'));
    await click(pageA.getByRole("button", { name: "Sign out" }));
    await pageA.getByRole("button", { name: "I've played before" }).click();
    await expect(pageA.getByRole("heading", { name: "Welcome back." })).toBeVisible({ timeout: actionTimeout });
    await pageA.getByLabel("Email").fill(email);
    await click(pageA.getByRole("button", { name: "Sign in with passkey" }));
    await pageA.locator("#nav").waitFor({ state: "visible", timeout: actionTimeout });

    const oldCredentials = await authA.cdp.send("WebAuthn.getCredentials", { authenticatorId: authA.authenticatorId });
    const oldCredentialId = oldCredentials.credentials?.[0]?.credentialId;
    expect(oldCredentialId).toBeTruthy();

    contextC = await browser.newContext();
    const pageC = await contextC.newPage();
    pageC.setDefaultTimeout(actionTimeout);
    await addVirtualAuthenticator(contextC, pageC);
    await pageC.goto(baseURL, { waitUntil: "domcontentloaded", timeout: actionTimeout });
    await click(pageC.getByRole("button", { name: "I've played before" }));
    await click(pageC.getByRole("button", { name: "Use a recovery code" }));
    await expect(pageC.getByRole("heading", { name: "Recover your account." })).toBeVisible({ timeout: actionTimeout });
    await pageC.getByLabel("Email").fill(email);
    await pageC.getByLabel("Recovery code").fill(recoveryCode);
    await pageC.getByRole("button", { name: "Create new passkey" }).click();
    await pageC.locator("#nav").waitFor({ state: "visible", timeout: actionTimeout });

    const oldSession = await pageA.evaluate(async origin => {
      const response = await fetch(`${origin}/api/v1/me`, { credentials: "include" });
      const body = await response.json();
      return { status: response.status, hasUser: Boolean(body.user) };
    }, apiOrigin);
    expect(oldSession).toEqual({ status: 200, hasUser: false });

    await pageA.reload({ waitUntil: "domcontentloaded", timeout: actionTimeout });
    await pageA.getByRole("button", { name: "I've played before" }).click();
    await expect(pageA.getByRole("heading", { name: "Welcome back." })).toBeVisible({ timeout: actionTimeout });
    await click(pageA.getByRole("button", { name: "Sign in", exact: true }));
    await pageA.getByLabel("Email").fill(email);
    await pageA.route("**/api/v1/auth/login/options", async route => {
      const response = await route.fetch();
      const payload = await response.json();
      if (payload.options) payload.options.allowCredentials = [{ id: oldCredentialId, type: "public-key", transports: ["internal"] }];
      await route.fulfill({ response, body: JSON.stringify(payload) });
    });
    const oldKeyVerify = pageA.waitForResponse(response => response.url().includes("/api/v1/auth/login/verify") && response.request().method() === "POST", { timeout: actionTimeout });
    await click(pageA.getByRole("button", { name: "Sign in with passkey" }));
    const oldKeyResponse = await oldKeyVerify;
    expect(oldKeyResponse.status()).toBe(400);
    expect((await oldKeyResponse.json()).error?.code).toBe("invalid_passkey");
    await pageA.waitForFunction(() => Boolean(document.querySelector("#auth-error")?.textContent?.trim()), undefined, { timeout: actionTimeout });
    const oldKeyError = (await pageA.getByRole("alert").innerText()).trim();
    expect(oldKeyError).not.toBe("");
    expect(oldKeyError).not.toContain("Too many authentication attempts");

    contextD = await browser.newContext();
    const pageD = await contextD.newPage();
    pageD.setDefaultTimeout(actionTimeout);
    await pageD.goto(baseURL, { waitUntil: "domcontentloaded", timeout: actionTimeout });
    await click(pageD.getByRole("button", { name: "I've played before" }));
    await click(pageD.getByRole("button", { name: "Use a recovery code" }));
    await expect(pageD.getByRole("heading", { name: "Recover your account." })).toBeVisible({ timeout: actionTimeout });
    await pageD.getByLabel("Email").fill(email);
    await pageD.getByLabel("Recovery code").fill(recoveryCode);
    const reusedCodeOptions = pageD.waitForResponse(response => response.url().includes("/api/v1/auth/recovery/options") && response.request().method() === "POST", { timeout: actionTimeout });
    await pageD.getByLabel("Recovery code").press("Enter");
    const reusedCodeResponse = await reusedCodeOptions;
    expect(reusedCodeResponse.status()).toBe(400);
    expect((await reusedCodeResponse.json()).error?.code).toBe("invalid_recovery");
    await pageD.waitForFunction(() => Boolean(document.querySelector("#auth-error")?.textContent?.trim()), undefined, { timeout: actionTimeout });
    const reuseError = (await pageD.getByRole("alert").innerText()).trim();
    expect(reuseError).not.toBe("");
    expect(reuseError).not.toContain("Too many authentication attempts");
  } finally {
    await contextA.close();
    await contextB?.close();
    await contextC?.close();
    await contextD?.close();
  }
});
