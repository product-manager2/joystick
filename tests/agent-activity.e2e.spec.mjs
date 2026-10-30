import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { enterSignup, finishSetup } from "./helpers/onboarding.mjs";

test("private agent activity updates in place and opens an existing screen", async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({ viewport: {width:390,height:844} });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    window.__roomSockets = [];
    window.WebSocket = class extends NativeWebSocket {
      constructor(...args) { super(...args); window.__roomSockets.push(this); }
    };
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  const activityId = randomUUID();
  let activities = [];
  let reads = 0;
  await page.route(url => /\/api\/v1\/rooms\/[^/]+\/agent-activity$/.test(new URL(url).pathname), route => {
    reads++;
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({activities})});
  });
  try {
    const suffix = randomUUID().slice(0,8);
    await enterSignup(page,"Activity Player",`activity-${suffix}@example.test`);
    await finishSetup(page);
    await page.locator('#nav button[data-x="comms"]').click();
    await page.locator('[data-live="thread"]').first().click();
    await expect.poll(() => reads).toBeGreaterThan(0);
    const composer = page.locator('#live-composer input[name="text"]');
    await composer.fill("A draft I am still writing");
    await composer.focus();
    activities = [{id:activityId,command:"ui.open",summary:"Your profile is ready",status:"completed",createdAt:new Date().toISOString(),handoff:{type:"navigate",screen:"profile"}}];
    await expect(page.locator(`[data-activity-id="${activityId}"]`)).toBeVisible({timeout:15_000});
    await expect(page.locator(`[data-activity-id="${activityId}"]`)).toHaveCount(1);
    await expect(composer).toHaveValue("A draft I am still writing");
    await expect(composer).toBeFocused();
    await expect(page.locator('#msgs')).not.toContainText("ui.open");
    await expect.poll(() => page.evaluate(() => window.__roomSockets.some(socket => new URL(socket.url).pathname === "/api/v1/ws" && socket.readyState === WebSocket.OPEN))).toBe(true);
    const streamId = randomUUID(), savedId = randomUUID();
    await page.evaluate(({streamId,savedId}) => {
      const roomId = document.querySelector('#live-composer').dataset.scope.slice(3);
      const socket = window.__roomSockets.find(socket => new URL(socket.url).pathname === "/api/v1/ws" && socket.readyState === WebSocket.OPEN);
      const emit = frame => socket.dispatchEvent(new MessageEvent("message",{data:JSON.stringify(frame)}));
      emit({type:"message.delta",roomId,messageId:streamId,text:"Your "});
      emit({type:"message.delta",roomId,messageId:streamId,text:"plan is ready"});
      window.__finishStream = () => emit({type:"message.saved",message:{id:savedId,roomId,sequence:9999,role:"assistant",text:"Your plan is ready",providerEventId:streamId,createdAt:new Date().toISOString()}});
    }, {streamId,savedId});
    await expect(page.locator('#msgs .msg').filter({hasText:"Your plan is ready"})).toHaveCount(1);
    await page.evaluate(() => window.__finishStream());
    await expect(page.locator('#msgs .msg').filter({hasText:"Your plan is ready"})).toHaveCount(1);
    await expect(composer).toHaveValue("A draft I am still writing");
    await expect(composer).toBeFocused();
    await composer.fill("Pending order check");
    await page.locator('#live-composer button[type="submit"]').click();
    await expect(page.locator('#msgs .msg').last()).toContainText("Pending order check");
    await page.locator(`[data-activity-id="${activityId}"] button`).click();
    await expect(page.locator('.live-profile')).toBeVisible();
  } finally { await context.close(); }
});
