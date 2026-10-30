import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createAccountFromHero } from "./helpers/onboarding.mjs";

async function passkey(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "internal", hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  } });
}

test("Pip's question can be answered in your own words", async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await passkey(context, page);
  const unique = randomUUID().slice(0, 8), id = randomUUID(), decisionId = randomUUID();
  let phase = "needs_input", answered = null, prompt = "";
  try {
    await createAccountFromHero(page, "Problem Finder", `problem-${unique}@example.test`);
    await page.route("**/api/v1/agent/runs", async route => {
      if (route.request().method() !== "POST") return route.fallback();
      prompt = route.request().postDataJSON().prompt;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: { id, kind: "mission-draft", status: "queued" } }) });
    });
    await page.route(`**/api/v1/agent/runs/${id}`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      run: { id, kind: "mission-draft", status: phase, missionId: null, planId: null, questId: null, response: null, error: null },
      decisions: phase === "needs_input" ? [{ id: decisionId, prompt: "Which health problem?", options: [{ id: "notes", label: "Small clinics lose patient notes" }, { id: "queues", label: "Patients wait hours to be seen" }] }] : [],
      drafts: phase === "completed" ? [{ id: randomUUID(), kind: "mission", data: { title: "Insulin in every village pharmacy", pitch: "Rural pharmacies run out of insulin.", tag: "Science", stages: [{ name: "Map", goal: "100 pharmacies checked", target: 100, unit: "pharmacies" }], rules: ["Stock checked monthly"] } }] : [],
      artifacts: [],
    }) }));
    await page.route(`**/api/v1/agent/runs/${id}/decisions`, async route => {
      answered = route.request().postDataJSON();
      phase = "completed";
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.getByRole("button", { name: "+ New" }).click();
    await expect(page.getByText("What problem do you want to fix?")).toBeVisible();
    await page.getByRole("button", { name: "A health problem" }).click();
    await expect(page.getByText("Which health problem?")).toBeVisible();
    expect(prompt).toMatch(/problem/);
    await page.getByLabel("Answer in your own words").fill("Rural pharmacies run out of insulin");
    await page.getByLabel("Answer in your own words").press("Enter");
    await expect(page.getByLabel("Mission name")).toHaveValue("Insulin in every village pharmacy");
    expect(answered.optionId).toBe("own_words");
    expect(answered.answer).toBe("Rural pharmacies run out of insulin");
    expect(answered.decisionId).toBe(decisionId);
  } finally {
    await context.close();
  }
});
