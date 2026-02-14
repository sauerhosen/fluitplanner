import { test, expect } from "@playwright/test";

test.describe("i18n language toggle", () => {
  test("switches UI language from EN to NL and back", async ({ page }) => {
    await page.goto("/protected");

    // Verify English default
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("link", { name: "Matches", exact: true }),
    ).toBeVisible();

    // Click language toggle in nav (shows "NL" when currently in EN)
    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: "NL", exact: true }).click();

    // Verify Dutch
    await expect(page.locator("html")).toHaveAttribute("lang", "nl");
    await expect(
      page.getByRole("link", { name: "Wedstrijden", exact: true }),
    ).toBeVisible();

    // Toggle back
    await nav.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("link", { name: "Matches", exact: true }),
    ).toBeVisible();
  });
});
