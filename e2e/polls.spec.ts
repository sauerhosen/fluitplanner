import { test, expect } from "@playwright/test";

test.describe("Polls page", () => {
  test.describe.configure({ mode: "serial" });

  const uniqueId = Date.now();
  const pollTitle = `E2E Poll ${uniqueId}`;
  let pollCreated = false;

  test("shows polls page", async ({ page }) => {
    await page.goto("/protected/polls");
    await expect(page.getByRole("heading", { name: "Polls" })).toBeVisible();
  });

  test("can create a poll with matches", async ({ page }) => {
    // Navigate to create poll
    await page.goto("/protected/polls/new");
    await expect(page.getByRole("heading", { name: "New Poll" })).toBeVisible();

    // Fill title
    await page.getByLabel("Poll Title").fill(pollTitle);

    // Select first available match (if any)
    const checkboxes = page.getByRole("checkbox");
    const count = await checkboxes.count();
    if (count === 0) {
      test.skip(true, "No matches available to create a poll");
      return;
    }

    await checkboxes.first().click();

    // Verify slot preview appears
    await expect(page.getByText(/time slot/i).first()).toBeVisible();

    // Create poll
    await page.getByRole("button", { name: "Create Poll" }).click();

    // Should redirect to detail page
    await expect(page.getByText(pollTitle)).toBeVisible();
    pollCreated = true;
  });

  test("can view poll in list", async ({ page }) => {
    test.skip(!pollCreated, "Poll was not created — no matches available");
    await page.goto("/protected/polls");
    await expect(page.getByText(pollTitle)).toBeVisible({ timeout: 10000 });
  });

  test("can toggle poll status", async ({ page }) => {
    test.skip(!pollCreated, "Poll was not created — no matches available");
    await page.goto("/protected/polls");

    // Click on the poll title to go to detail
    await page.getByText(pollTitle).click();
    await expect(page.getByText(pollTitle)).toBeVisible();

    // Toggle status
    await page.getByRole("button", { name: /close poll/i }).click();
    await expect(page.getByText("Closed")).toBeVisible();

    // Toggle back
    await page.getByRole("button", { name: /reopen poll/i }).click();
    await expect(page.getByText("Open")).toBeVisible();
  });

  test("can delete poll", async ({ page }) => {
    test.skip(!pollCreated, "Poll was not created — no matches available");
    await page.goto("/protected/polls");
    await page.getByText(pollTitle).click();

    // Accept the confirmation dialog
    page.on("dialog", (dialog) => dialog.accept());

    await page.getByRole("button", { name: /delete/i }).click();

    // Should redirect to polls list
    await page.waitForURL(/\/protected\/polls$/);
    await expect(page.getByText(pollTitle)).not.toBeVisible();
  });
});
