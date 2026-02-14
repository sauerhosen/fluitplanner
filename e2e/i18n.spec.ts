import { test, expect } from "@playwright/test";

test.describe("i18n language toggle", () => {
  test("switches UI language from EN to NL and back", async ({ page }) => {
    await page.goto("/protected");

    // Verify English default
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("link", { name: "Matches" })).toBeVisible();

    // Click language toggle (shows "NL" when currently in EN)
    await page.getByRole("button", { name: "NL" }).click();

    // Verify Dutch
    await expect(page.locator("html")).toHaveAttribute("lang", "nl");
    await expect(page.getByRole("link", { name: "Wedstrijden" })).toBeVisible();

    // Toggle back
    await page.getByRole("button", { name: "EN" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("link", { name: "Matches" })).toBeVisible();
  });
});
