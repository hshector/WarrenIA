import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// E2E runs against the production build in local mode (no login) with the
// engine's synthetic DEMO data in ../data and a throw-away user store.
const store = path.resolve(process.cwd(), "test-results", "e2e-user.json");

export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    launchOptions: process.env.CI ? {} : { executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /responsive\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next start -p 3100`,
    port: 3100,
    reuseExistingServer: false,
    env: { WARRENIA_LOCAL_MODE: "1", WARRENIA_LOCAL_STORE: store, WARRENIA_DATA_DIR: path.resolve(process.cwd(), "..", "data") },
  },
});
