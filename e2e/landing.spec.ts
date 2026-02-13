import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("shows branding and sign-in link", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /fluitplanner/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign up/i })).toBeVisible();
  });

  test("sign in link navigates to login page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
