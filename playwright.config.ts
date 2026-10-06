// Playwright verifications for browser samples (samples/<id>/verify/*.spec.mjs).
// scripts/run-samples.mjs runs one sample's specs at a time through this
// config; see docs/browser-verification/README.md for local runs.
//
// The gallery smokes (scripts/smoke-*.mjs) drive Playwright's library API
// directly and do not use this file.

import { defineConfig, devices } from "@playwright/test";

const allBrowsers = process.env.HONUA_PW_ALL_BROWSERS === "1";

export default defineConfig({
  testDir: "samples",
  testMatch: "*/verify/*.spec.mjs",
  // Every spec serves its page from the one origin the composed server's CORS
  // policy allows (http://localhost:3000), so specs never run concurrently.
  workers: 1,
  fullyParallel: false,
  // A failed spec is a failed sample: nothing is retried to green.
  retries: 0,
  forbidOnly: true,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: process.env.HONUA_PW_OUTPUT_DIR ?? "results/browser-verification/artifacts",
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(allBrowsers
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
        ]
      : []),
  ],
});
