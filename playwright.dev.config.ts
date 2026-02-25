import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

/**
 * Dev-mode Playwright config for fast iteration when writing tests.
 * Uses `npm run dev` instead of a production build.
 *
 * Usage: npm run test:e2e:dev
 */
export default defineConfig({
  ...baseConfig,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
