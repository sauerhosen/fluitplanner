import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Next.js/);
});
