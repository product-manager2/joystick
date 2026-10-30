import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createAccountFromHero } from "./helpers/onboarding.mjs";

async function passkey(context, page) {
  const cdp=await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{
    protocol:"ctap2",transport:"internal",hasResidentKey:true,
    hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,
  }});
}
const recommendationRoute="**/api/v1/game/recommendations";
const cards=page=>page.locator('.poster-list [data-live="mission"]');
const cardIds=page=>cards(page).evaluateAll(nodes=>nodes.map(node=>node.dataset.id));
const aiLabel=page=>page.getByText("AI-prioritized",{exact:true});

async function signedInPage(browser) {
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();
  await passkey(context,page);
  await createAccountFromHero(page,"Recommendation Test",`recommendation-${randomUUID()}@example.test`);
  await expect(page.getByRole("heading",{name:"Missions"})).toBeVisible();
  return {context,page};
}

test("untouched Explore adopts mocked scores, preserves 4/8 disclosure, and leaves Mine quiet",async({browser})=>{
  test.setTimeout(90_000);
  const {context,page}=await signedInPage(browser);
  let requests=0,started,release;
  const intercepted=new Promise(resolve=>{started=resolve;});
  const released=new Promise(resolve=>{release=resolve;});
  let selectedId;
  try {
    await page.route(recommendationRoute,async route=>{
      requests++;
      expect(route.request().postDataJSON()).toEqual({kind:"missions"});
      started();await released;
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
        source:"jev",scores:{[selectedId]:1},expiresAt:Date.now()+60_000,
      })});
    });
    await expect(page.getByRole("tab",{name:/My missions/})).toBeVisible();
    await page.waitForTimeout(100);
    expect(requests).toBe(0);
    await page.getByRole("tab",{name:"Explore"}).click();
    await intercepted;
    const before=await cardIds(page);
    expect(before.length).toBe(4);
    selectedId=before[1];
    const response=page.waitForResponse(r=>r.url().includes("/api/v1/game/recommendations")&&r.request().method()==="POST");
    release();await response;
    await expect(aiLabel(page)).toBeVisible();
    await expect.poll(async()=> (await cardIds(page))[0]).toBe(selectedId);
    await page.locator('.poster-list [data-live="list-more"]').click();
    await expect(cards(page)).toHaveCount(12);
    await expect(page.locator('.poster-list [data-live="list-more"]')).toContainText(/left/);
    expect(requests).toBe(1);
  } finally {release();await context.close();}
});

test("interaction defers mocked scores until navigation; fallback never claims AI priority",async({browser})=>{
  test.setTimeout(90_000);
  const {context,page}=await signedInPage(browser);
  let mode="jev",started,release,selectedId,requests=0;
  const intercepted=new Promise(resolve=>{started=resolve;});
  const released=new Promise(resolve=>{release=resolve;});
  try {
    await page.route(recommendationRoute,async route=>{
      requests++;
      expect(route.request().postDataJSON()).toEqual({kind:"missions"});
      if(mode==="jev") {started();await released;}
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(mode==="jev"
        ? {source:"jev",scores:{[selectedId]:1},expiresAt:Date.now()+60_000}
        : {source:"fallback",scores:{},expiresAt:Date.now()+30_000})});
    });
    await page.getByRole("tab",{name:"Explore"}).click();
    await intercepted;
    const before=await cardIds(page);
    expect(before.length).toBe(4);
    selectedId=before[1];
    const rect=await cards(page).first().boundingBox();
    await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
    const response=page.waitForResponse(r=>r.url().includes("/api/v1/game/recommendations")&&r.request().method()==="POST");
    release();await response;
    await expect(aiLabel(page)).toHaveCount(0);
    expect(await cardIds(page)).toEqual(before);
    await page.getByRole("tab",{name:/My missions/}).click();
    await page.getByRole("tab",{name:"Explore"}).click();
    await expect(aiLabel(page)).toBeVisible();
    await expect.poll(async()=> (await cardIds(page))[0]).toBe(selectedId);
    expect(requests).toBe(1);

    mode="fallback";
    await page.reload();
    await expect(page.getByRole("heading",{name:"Missions"})).toBeVisible();
    await page.getByRole("tab",{name:"Explore"}).click();
    await expect.poll(()=>requests).toBe(2);
    await expect(aiLabel(page)).toHaveCount(0);
  } finally {release();await context.close();}
});
