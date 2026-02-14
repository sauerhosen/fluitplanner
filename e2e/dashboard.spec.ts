import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("shows dashboard with stats and sections", async ({ page }) => {
    await page.goto("/protected");

    // Should show dashboard heading
    await expect(
      page.getByRole("heading", { name: /dashboard/i }),
    ).toBeVisible();

    // Should show stat cards
    await expect(page.getByText("Upcoming matches")).toBeVisible();
    await expect(page.getByText("Open polls")).toBeVisible();
    await expect(page.getByText("Unassigned")).toBeVisible();
    await expect(page.getByText("Active umpires")).toBeVisible();

    // Should show action items section
    await expect(page.getByText("Needs attention")).toBeVisible();

    // Should show recent activity section
    await expect(page.getByText("Recent activity")).toBeVisible();
  });

  test("navigation links work from dashboard", async ({ page }) => {
    await page.goto("/protected");
    await page.getByRole("link", { name: "Matches", exact: true }).click();
    await expect(page).toHaveURL(/\/protected\/matches/);
  });
});
