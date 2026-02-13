import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("home page shows Fluitplanner branding", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /fluitplanner/i }),
  ).toBeVisible();
});
