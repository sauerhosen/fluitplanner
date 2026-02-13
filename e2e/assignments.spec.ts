import { test, expect } from "@playwright/test";

test.describe("Umpire Assignment", () => {
  test("planner can view assignment grid on poll detail page", async ({
    page,
  }) => {
    // Navigate to polls list
    await page.goto("/protected/polls");

    // Check if there are any polls
    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    if (rowCount === 0) {
      test.skip(true, "No polls available to test assignments");
      return;
    }

    // Click on first poll to go to detail
    await rows.first().click();

    // Click Assignments tab
    const assignmentsTab = page.getByRole("tab", { name: /assignments/i });
    await expect(assignmentsTab).toBeVisible();
    await assignmentsTab.click();

    // The assignment grid should now be visible (either with cells or empty message)
    const hasCells = await page
      .locator('[data-testid^="cell-"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmptyMessage = await page
      .getByText(/no umpire responses/i)
      .isVisible()
      .catch(() => false);

    expect(hasCells || hasEmptyMessage).toBeTruthy();
  });

  test("planner can assign and unassign umpires", async ({ page }) => {
    await page.goto("/protected/polls");

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    if (rowCount === 0) {
      test.skip(true, "No polls available to test assignments");
      return;
    }

    await rows.first().click();

    // Click Assignments tab
    await page.getByRole("tab", { name: /assignments/i }).click();

    // Check if there are any assignment cells
    const firstCell = page.locator('[data-testid^="cell-"]').first();
    const hasCells = await firstCell.isVisible().catch(() => false);

    if (!hasCells) {
      test.skip(true, "No umpire responses — cannot test assignment toggle");
      return;
    }

    // Click a cell to assign
    await firstCell.click();

    // Verify an icon appears (checkmark, ban, or warning)
    await expect(firstCell.locator("svg")).toBeVisible();

    // Click again to unassign
    await firstCell.click();

    // Verify icon is gone
    await expect(firstCell.locator("svg")).not.toBeVisible();
  });
});
