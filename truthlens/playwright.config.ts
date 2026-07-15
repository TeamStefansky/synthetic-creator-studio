import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";

// Use the pre-installed Chromium if present (its revision may differ from the
// @playwright/test build); on CI where the matching browser is installed, this
// resolves to undefined and Playwright uses its own.
function localChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    const dir = fs.readdirSync(root).find((d) => /^chromium-\d+$/.test(d));
    if (!dir) return undefined;
    const bin = path.join(root, dir, "chrome-linux", "chrome");
    return fs.existsSync(bin) ? bin : undefined;
  } catch { return undefined; }
}
const executablePath = localChromium();

// E2E config. Chromium is pre-installed at PLAYWRIGHT_BROWSERS_PATH.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3000", trace: "off",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
