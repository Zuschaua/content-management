import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for Content Factory E2E tests.
 *
 * Tests run against the full stack: API (port 3001) + Web (port 3000).
 * For local development: start the stack with `pnpm docker:dev` first.
 * For CI: services are started by the e2e-tests workflow job.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // tests share API state; run sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // sequential to avoid auth state conflicts
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.API_URL ?? "http://localhost:3001",
    extraHTTPHeaders: {
      "Content-Type": "application/json",
    },
  },
  // No browser project needed — these are API-level E2E tests using the
  // Playwright `request` fixture. Add a browser project here when UI E2E
  // coverage is added.
  projects: [
    {
      name: "api",
      use: {},
    },
  ],
});
