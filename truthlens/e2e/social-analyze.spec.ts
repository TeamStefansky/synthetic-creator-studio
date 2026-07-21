import { test, expect } from "@playwright/test";

// [3] Social Analyze smoke (offline via route interception): pasting a profile
// link auto-detects the Social Analyze type; the result shows the frozen band
// ceiling, the seed narrative, the authenticity panel, and the attribution box.

const FIXTURE = {
  version: "social-analyze-v1",
  profile: {
    platform: "bluesky", handle: "seedacct.bsky.social", accountId: "did:plc:seed",
    followers: 80, follows: 2100, posts: 40, createdAt: "2024-03-01T00:00:00Z",
    collectedAt: "2024-06-01T00:00:00Z", connected: true,
  },
  ownPosts: 3,
  authenticity: {
    account: "seedacct.bsky.social", suspicion_score: 58.3, confidence: 0.62, band: "elevated",
    signals: [{
      key: "follower_following_ratio", layer: "account", weight: 5, computed: true,
      subscore: 1, contribution: 5, evidence: { followers: 80, follows: 2100 },
      alternative: "New or niche accounts naturally follow many more than follow back.",
    }],
    missing_signals: ["suspicious_follower_pct"],
    assessed_at: "2024-06-01T00:00:00Z", model_version: "authenticity-v1",
    note: "Probabilistic assessment of an ACCOUNT's behavior — never a claim about a person.",
  },
  seeds: [{ text: "the secret ballot machines were rigged overnight", posts: 3, query: "machines rigged secret ballot" }],
  expansion: {
    entity: "seedacct.bsky.social", likelihood: "Strong", totalItems: 7, accounts: 5,
    signals: [], clusters: [], collectionGaps: [],
    attribution: "Actor is UNDETERMINED. Coordination is a behavioural pattern, not proof of state sponsorship or of who is behind it.",
    nextSteps: [], generatedAt: "2024-06-01T00:00:00Z",
    sources: [{ source: "bluesky", connected: true, count: 4 }, { source: "gdelt", connected: true, count: 0 }],
    authenticity: [],
  },
  networkMap: {
    version: "network-map-v1",
    insufficient: false,
    observedEdgeKinds: ["co-citation"],
    nodes: [
      { id: "seedacct.bsky.social", label: "seedacct.bsky.social", kind: "account", platform: "bluesky", influence: 1, cluster: 0, earliestObservable: true },
      { id: "amp1", label: "amp1", kind: "account", platform: "bluesky", influence: 0.6, cluster: 0, flaggedInauthentic: true },
      { id: "amp2", label: "amp2", kind: "account", platform: "bluesky", influence: 0.5, cluster: 0 },
      { id: "domain:propsite.example", label: "propsite.example", kind: "domain" },
    ],
    edges: [
      { source: "seedacct.bsky.social", target: "amp1", reason: "identical content",
        evidence: { mode: "inferred", kind: "identical-content", signals: ["3 near-identical posts"], alternative: "Wire copy / syndication.", confidence: "High" } },
      { source: "amp1", target: "domain:propsite.example", reason: "cites propsite.example",
        evidence: { mode: "observed", kind: "co-citation", signals: ["links propsite.example"], alternative: "Ordinary sourcing.", confidence: "High" } },
    ],
    clusters: [{ id: 0, size: 3, dominantEdgeKinds: ["identical-content"], languages: ["en"], multiLanguage: false, confidence: "High" }],
    core: [{ id: "seedacct.bsky.social", label: "seedacct.bsky.social", influence: 1, bridges: 0, signals: ["influence 1"], alternative: "A popular hub is naturally central." }],
    bridges: [],
  },
  band: "Strong coordination — actor UNDETERMINED",
  attribution: "Actor is UNDETERMINED. Coordination is a behavioural pattern, not proof of state sponsorship or of who is behind it. These are hypotheses for a human to evaluate — not a verdict.",
  collectionGaps: [],
  generatedAt: "2024-06-01T00:00:00Z",
};

test("profile link auto-detects Social Analyze and renders band + seed + authenticity + attribution", async ({ page }) => {
  await page.route("**/api/social-analyze**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE) }),
  );

  await page.goto("/check");
  await page.locator("textarea").fill("https://bsky.app/profile/seedacct.bsky.social");

  // Auto-detection picks the new category — no manual override needed.
  await expect(page.getByText(/Detected:/)).toContainText(/Social Analyze/);

  await page.getByRole("button", { name: /Run check/i }).click();

  // Band headline with the FROZEN ceiling string.
  await expect(page.getByText(/Strong coordination — actor UNDETERMINED/).first()).toBeVisible({ timeout: 20_000 });

  // Stage 1 — profile summary + authenticity panel.
  await expect(page.getByText("seedacct.bsky.social", { exact: true })).toBeVisible();
  await expect(page.getByText("Account authenticity")).toBeVisible();
  await expect(page.getByText(/suspicion 58\.3\/100/)).toBeVisible();

  // Stage 2 — the seed narrative.
  await expect(page.getByText(/Seed narrative/)).toBeVisible();
  await expect(page.getByText(/ballot machines were rigged/).first()).toBeVisible();

  // Sources line honest about connected vs not; attribution box present.
  await expect(page.getByText(/bluesky \(4\)/)).toBeVisible();
  await expect(page.getByText(/Attribution & limitations/)).toBeVisible();

  // Influence-network map: heading, the observed/inferred legend, and a cluster.
  await expect(page.getByText(/Influence-network map/)).toBeVisible();
  await expect(page.getByText(/Observed \(real interaction/)).toBeVisible();
  await expect(page.getByText(/Inferred \(co-behavior\)/)).toBeVisible();
  await expect(page.getByText(/Coordination clusters/)).toBeVisible();
  await expect(page.getByText(/Cluster 1 · 3 accounts/)).toBeVisible();
});
