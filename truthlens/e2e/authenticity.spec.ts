import { test, expect } from "@playwright/test";

// Phase-3 smoke (offline): /api/cib is intercepted with a fixture, so this
// exercises Check → CIB result → Authenticity panel deterministically:
// score, band chip (risk-token colour class), confidence, evidence, and the
// probabilistic framing.

const FIXTURE = {
  entity: "acme",
  likelihood: "Moderate",
  totalItems: 5,
  accounts: 2,
  signals: [{
    name: "Content similarity (copypasta)", confidence: "Medium",
    evidence: ["2 near-identical posts"], alternative: "Wire copy / syndication.",
  }],
  clusters: [],
  collectionGaps: [],
  attribution: "Actor is UNDETERMINED. Coordination is a behavioural pattern, not proof of state sponsorship or of who is behind it.",
  nextSteps: ["Cross-check against platform disclosures."],
  generatedAt: "2024-06-01T00:00:00Z",
  authenticity: [{
    account: "amplifier_84729153",
    assessment: {
      account: "amplifier_84729153",
      suspicion_score: 62.5,
      confidence: 0.81,
      band: "elevated",
      signals: [{
        key: "follower_following_ratio", layer: "account", weight: 5, computed: true,
        subscore: 1, contribution: 5,
        evidence: { followers: 120, follows: 4800 },
        alternative: "New or niche accounts naturally follow many more than follow back.",
      }],
      missing_signals: ["growth_velocity"],
      assessed_at: "2024-06-01T00:00:00Z",
      model_version: "authenticity-v1",
      note: "Probabilistic assessment of an ACCOUNT's behavior - never a claim about a person.",
    },
  }],
};

test("CIB check renders the authenticity panel: band chip, score, confidence, evidence", async ({ page }) => {
  await page.route("**/api/cib**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE) }),
  );

  await page.goto("/check");
  await page.locator("textarea").fill("acme");
  await page.getByRole("button", { name: "CIB Analysis" }).click();
  await page.getByRole("button", { name: /Run check/i }).click();

  // Headline keeps the UNDETERMINED ceiling.
  await expect(page.getByText(/actor UNDETERMINED/i).first()).toBeVisible({ timeout: 20_000 });

  // Authenticity panel: account, band chip, score, confidence, evidence, alternative.
  await expect(page.getByText("Account authenticity")).toBeVisible();
  await expect(page.getByText("amplifier_84729153", { exact: true })).toBeVisible();
  const chip = page.getByText("Elevated - review");
  await expect(chip).toBeVisible();
  await expect(chip).toHaveClass(/text-risk-unknown/); // risk-token colour, never a red chip for non-high
  await expect(page.getByText(/suspicion 62\.5\/100/)).toBeVisible();
  await expect(page.getByText(/confidence 81%/)).toBeVisible();
  await expect(page.getByText(/followers: 120/)).toBeVisible();
  await expect(page.getByText(/Could also be:/).first()).toBeVisible();
  await expect(page.getByText(/1 signal\(s\) not collected/)).toBeVisible();
  await expect(page.getByText(/never a claim about a person/i).first()).toBeVisible();
});

test("insufficient data renders a gray chip and no score - never a risk label", async ({ page }) => {
  const poor = JSON.parse(JSON.stringify(FIXTURE));
  poor.authenticity[0].assessment = {
    ...poor.authenticity[0].assessment,
    suspicion_score: 30, confidence: 0.2, band: "insufficient_data",
    signals: [], missing_signals: ["a", "b", "c"],
  };
  await page.route("**/api/cib**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(poor) }),
  );

  await page.goto("/check");
  await page.locator("textarea").fill("acme");
  await page.getByRole("button", { name: "CIB Analysis" }).click();
  await page.getByRole("button", { name: /Run check/i }).click();

  const chip = page.getByText("Insufficient data");
  await expect(chip).toBeVisible({ timeout: 20_000 });
  await expect(chip).not.toHaveClass(/risk-high/);
  await expect(page.getByText(/suspicion 30\/100/)).toHaveCount(0); // no score shown without confidence
});
