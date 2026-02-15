import { test, expect } from "@playwright/test";

test.use({
  storageState: {
    cookies: [],
    origins: [],
  },
});

test.describe("Landing page", () => {
  test("shows branding and auth buttons", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /fluitplanner/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign up/i })).toBeVisible();
  });

  test("sign in navigates to login page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
