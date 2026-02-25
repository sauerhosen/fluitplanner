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

    // Click on first poll title to go to detail (not the row — checkbox intercepts)
    await rows.first().locator("td").nth(1).click();
    await page.waitForURL(/\/protected\/polls\//);

    // Click Assignments tab
    const assignmentsTab = page.getByRole("tab", { name: /assignments/i });
    await expect(assignmentsTab).toBeVisible({ timeout: 10000 });
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

  test.describe("assign and unassign flow", () => {
    test.describe.configure({ mode: "serial" });

    const uniqueId = Date.now();
    const pollTitle = `E2E Assignment Poll ${uniqueId}`;
    let pollUrl = "";
    let pollCreated = false;

    test("create a poll owned by test user", async ({ page }) => {
      await page.goto("/protected/polls/new");
      await page.getByLabel("Poll Title").fill(pollTitle);

      const checkboxes = page.getByRole("checkbox");
      const count = await checkboxes.count();
      if (count === 0) {
        test.skip(true, "No matches available to create a poll");
        return;
      }

      // Select first match
      await checkboxes.first().click();
      await page.getByRole("button", { name: "Create Poll" }).click();

      // Should redirect to detail page
      await expect(page.getByText(pollTitle)).toBeVisible();
      pollUrl = page.url();
      pollCreated = true;
    });

    test("planner can assign and unassign umpires", async ({ page }) => {
      test.skip(!pollCreated, "Poll was not created");

      // Navigate to the poll we just created (owned by E2E test user)
      await page.goto(pollUrl);

      // Click Assignments tab
      await page
        .getByRole("tab", { name: /assignments/i })
        .click({ timeout: 10000 });

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

    test("cleanup: delete poll", async ({ page }) => {
      test.skip(!pollCreated, "Poll was not created");

      await page.goto(pollUrl);
      page.on("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: /delete/i }).click();
      await page.waitForURL(/\/protected\/polls$/);
    });
  });
});
