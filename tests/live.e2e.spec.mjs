import { handleFor } from "./helpers/onboarding.mjs";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { resolveApiOrigin } from "../src/live/api-origin.js";

const baseURL = process.env.JOYSTICK_E2E_URL || "http://localhost:5173";
const apiOrigin = process.env.JOYSTICK_E2E_API_ORIGIN || baseURL;
const wsOrigin = process.env.JOYSTICK_E2E_WS_ORIGIN || apiOrigin;
const screenshots = process.env.JOYSTICK_E2E_OUTPUT || "/private/tmp/joystick-e2e-output";

test("public API origin accepts only an origin and requires HTTPS in production", () => {
  expect(resolveApiOrigin(undefined, "http://localhost:5173", false)).toBe("http://localhost:5173");
  expect(resolveApiOrigin("http://localhost:3001", "http://localhost:5173", false)).toBe("http://localhost:3001");
  expect(resolveApiOrigin("https://api.example.test", "https://app.example.test", true)).toBe("https://api.example.test");
  expect(() => resolveApiOrigin("http://localhost:3001", "https://app.example.test", true)).toThrow();
  expect(() => resolveApiOrigin("https://api.example.test/private", "https://app.example.test", true)).toThrow();
  expect(() => resolveApiOrigin("https://user:pass@api.example.test", "https://app.example.test", true)).toThrow();
});

async function enablePasskeys(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}

async function signup(page, name, email) {
  await page.goto(`${baseURL}/chat.html`);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Username").fill(handleFor(email));
  await page.getByRole("button", { name: "Create account with passkey" }).click();
  await expect(page.getByRole("heading", { name: "My agent" })).toBeVisible();
}

test("passkey account, durable chat, sign-in, account isolation, and responsive screens", async ({ browser }) => {
  test.setTimeout(90_000);
  await mkdir(screenshots, { recursive: true });
  const emailA = `e2e-${randomUUID()}@example.test`;
  const emailB = `e2e-${randomUUID()}@example.test`;
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageA = await contextA.newPage();
  await enablePasskeys(contextA, pageA);
  const apiRequests = new Set();
  pageA.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/v1/")) apiRequests.add(url.origin);
  });

  try {
    await signup(pageA, "Avery", emailA);
    if (process.env.JOYSTICK_E2E_API_ORIGIN) expect(apiRequests.has(apiOrigin)).toBe(true);
    const roomA = await pageA.evaluate(async origin => (await (await fetch(`${origin}/api/v1/rooms`, { credentials: "include" })).json()).rooms[0].id, apiOrigin);
    const message = `Avery's private note ${randomUUID()}`;
    await pageA.getByLabel("Message your agent").fill(message);
    await pageA.getByRole("button", { name: "Send message" }).click();
    await expect(pageA.locator(".live-message.mine", { hasText: message }).locator(".live-message-meta")).toHaveText("Saved");
    await pageA.screenshot({ path: `${screenshots}/chat-desktop.png`, fullPage: true });
    await pageA.setViewportSize({ width: 390, height: 844 });
    await pageA.screenshot({ path: `${screenshots}/chat-mobile.png` });

    // Multibyte input must fit the gateway frame and settle once without a retry loop.
    const unicodeMessage = "你".repeat(3000);
    await pageA.getByLabel("Message your agent").fill(unicodeMessage);
    await pageA.getByRole("button", { name: "Send message" }).click();
    await expect(pageA.locator(".live-message.mine", { hasText: unicodeMessage }).locator(".live-message-meta")).toHaveText("Saved");
    const mobileLayout = await pageA.evaluate(() => {
      const composer = document.querySelector(".live-composer").getBoundingClientRect();
      const messages = document.querySelector(".live-messages");
      return { composerTop: composer.top, composerBottom: composer.bottom, viewport: innerHeight,
        documentHeight: document.documentElement.scrollHeight, messageHeight: messages.scrollHeight, messageViewport: messages.clientHeight };
    });
    expect(mobileLayout.composerTop).toBeGreaterThanOrEqual(0);
    expect(mobileLayout.composerBottom).toBeLessThanOrEqual(mobileLayout.viewport + 2);
    expect(mobileLayout.documentHeight).toBeLessThanOrEqual(mobileLayout.viewport + 2);
    expect(mobileLayout.messageHeight).toBeGreaterThan(mobileLayout.messageViewport);

    let failedHistoryOnce = false;
    const historyFault = async route => {
      if (!failedHistoryOnce) {
        failedHistoryOnce = true;
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "temporary", message: "Try later" } }) });
      } else await route.continue();
    };
    const historyURL = url => url.pathname.endsWith("/messages") && url.searchParams.has("after");
    await pageA.route(historyURL, historyFault);

    await pageA.reload();
    await expect.poll(() => failedHistoryOnce).toBe(true);
    await pageA.unroute(historyURL, historyFault);
    await expect(pageA.getByRole("heading", { name: "My agent" })).toBeVisible();
    await expect(pageA.locator(".live-message.mine", { hasText: message })).toHaveCount(1);
    await expect(pageA.locator(".live-message.mine", { hasText: unicodeMessage })).toHaveCount(1);

    await pageA.getByRole("button", { name: "Sign out" }).click();
    await expect(pageA.getByRole("heading", { name: "Welcome back." })).toBeVisible();
    await expect(pageA.getByText(message)).toHaveCount(0);
    await pageA.reload();
    await expect(pageA.getByRole("heading", { name: "Start with a passkey." })).toBeVisible();
    await pageA.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(pageA.getByRole("heading", { name: "Welcome back." })).toBeVisible();

    await pageA.getByLabel("Username").fill(handleFor(`unknown-${randomUUID()}@example.test`));
    await pageA.getByRole("button", { name: "Sign in with passkey" }).click();
    await expect(pageA.getByRole("alert")).toContainText("No account found");
    await pageA.getByLabel("Username").fill(handleFor(emailA));
    await pageA.getByRole("button", { name: "Sign in with passkey" }).click();
    await expect(pageA.getByRole("heading", { name: "My agent" })).toBeVisible();
    await expect(pageA.locator(".live-message.mine", { hasText: message })).toHaveCount(1);

    const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pageB = await contextB.newPage();
    await enablePasskeys(contextB, pageB);
    try {
      await signup(pageB, "Blair", emailB);
      await expect(pageB.getByText(message)).toHaveCount(0);
      const forbidden = await pageB.evaluate(async ({ id, origin }) => {
        const response = await fetch(`${origin}/api/v1/rooms/${id}/messages?after=0`, { credentials: "include" });
        return { status: response.status, body: await response.json() };
      }, { id: roomA, origin: apiOrigin });
      expect(forbidden.status).toBe(404);
      expect(JSON.stringify(forbidden.body)).not.toContain(message);
      const wsError = await pageB.evaluate(async ({ id, httpOrigin, socketOrigin }) => {
        const ticketResponse = await fetch(`${httpOrigin}/api/v1/ws-ticket`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
        if (!ticketResponse.ok) throw new Error(`Ticket request failed: ${ticketResponse.status}`);
        const { ticket } = await ticketResponse.json();
        return new Promise((resolve, reject) => {
        const endpoint = new URL("/api/v1/ws", socketOrigin);
        endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(endpoint);
        const timer = setTimeout(() => { socket.close(); reject(new Error("WebSocket access check timed out")); }, 5_000);
        socket.onopen = () => socket.send(JSON.stringify({ type: "authenticate", ticket }));
        socket.onmessage = event => {
          const frame = JSON.parse(event.data);
          if (frame.type === "ready") socket.send(JSON.stringify({ type: "subscribe", roomId: id, after: 0 }));
          if (frame.type === "error") { clearTimeout(timer); socket.close(); resolve(frame.code); }
        };
        socket.onerror = () => { clearTimeout(timer); reject(new Error("WebSocket connection failed")); };
        });
      }, { id: roomA, httpOrigin: apiOrigin, socketOrigin: wsOrigin });
      expect(wsError).toBe("room_not_found");
    } finally {
      await contextB.close();
    }
  } finally {
    await contextA.close();
  }
});
