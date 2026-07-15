import { test, expect } from "@playwright/test";

// End-to-end, offline: the Log Analyzer runs locally (no external network), so
// this exercises the whole Check → result → History flow deterministically.
test("log check runs end-to-end, is confidence-badged, and lands in History", async ({ page }) => {
  await page.goto("/check");

  // Framing is always present.
  await expect(page.getByText(/not a verdict/i).first()).toBeVisible();

  const logs = [
    '8.8.8.8 - - [10/Oct/2024:00:00:00] "GET /a HTTP/1.1" 200 100',
    '8.8.4.4 - - [10/Oct/2024:00:00:01] "POST /b HTTP/1.1" 404 100',
    '1.1.1.1 - - [10/Oct/2024:00:00:02] "GET /c HTTP/1.1" 200 100',
    '9.9.9.9 - - [10/Oct/2024:00:00:03] "GET /d HTTP/1.1" 200 100',
  ].join("\n");

  await page.locator("textarea").fill(logs);
  await expect(page.getByText(/Detected:/)).toContainText(/Log Analyzer/);

  await page.getByRole("button", { name: /Run check/i }).click();

  // A confidence-badged result appears (Coordination Low/Medium/High/Unknown).
  await expect(page.getByText(/Coordination/i).first()).toBeVisible({ timeout: 45_000 });

  // Auto-saved to History and re-openable.
  await page.goto("/history");
  await expect(page.getByText(/Log Analyzer/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Reopen/i }).first()).toBeVisible();
});

test("Brand Watch keeps the not-a-verdict framing", async ({ page }) => {
  await page.goto("/platform");
  await expect(page.getByText(/not a verdict/i).first()).toBeVisible();
});
