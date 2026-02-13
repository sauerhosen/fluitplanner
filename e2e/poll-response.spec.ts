import { test, expect } from "@playwright/test";

test.describe("Poll response page", () => {
  test("shows not found for invalid token", async ({ page }) => {
    await page.goto("/poll/nonexistent-token-xyz");
    await expect(page.getByText("Poll not found")).toBeVisible();
  });

  test.describe("full poll response flow", () => {
    test.describe.configure({ mode: "serial" });

    const uniqueId = Date.now();
    const pollTitle = `E2E Response Poll ${uniqueId}`;
    const umpireEmail = `e2e-${uniqueId}@test.com`;
    const umpireName = `E2E Umpire ${uniqueId}`;
    let pollToken = "";
    let pollCreated = false;

    test("planner creates a poll and gets share link", async ({ page }) => {
      await page.goto("/protected/polls/new");
      await page.getByLabel("Poll Title").fill(pollTitle);

      const checkboxes = page.getByRole("checkbox");
      const count = await checkboxes.count();
      if (count === 0) {
        test.skip(true, "No matches available to create a poll");
        return;
      }

      await checkboxes.first().click();
      await page.getByRole("button", { name: "Create Poll" }).click();

      // Should redirect to detail page
      await expect(page.getByText(pollTitle)).toBeVisible();

      // Grant clipboard permissions and get the poll URL
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.getByRole("button", { name: "Copy Link" }).click();

      // Read from clipboard
      pollToken = await page.evaluate(async () => {
        const text = await navigator.clipboard.readText();
        const match = text.match(/\/poll\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : "";
      });

      expect(pollToken).not.toBe("");
      pollCreated = true;
    });

    test("umpire can fill out availability via poll link", async ({ page }) => {
      test.skip(!pollCreated, "Poll was not created");

      await page.goto(`/poll/${pollToken}`);
      await expect(page.getByText(pollTitle)).toBeVisible();

      // Enter email (new umpire)
      await page.getByLabel("Your email").fill(umpireEmail);
      await page.getByRole("button", { name: "Continue" }).click();

      // Should ask for name (new umpire)
      await expect(page.getByLabel("Your name")).toBeVisible();
      await page.getByLabel("Your name").fill(umpireName);
      await page.getByRole("button", { name: "Continue" }).click();

      // Should show availability form
      await expect(page.getByText("Responding as:")).toBeVisible();
      await expect(page.getByText(umpireName)).toBeVisible();

      // Click Yes on the first slot
      const yesButtons = page.getByRole("button", { name: "Yes" });
      await yesButtons.first().click();

      // Save
      await page.getByRole("button", { name: /save/i }).click();
      await expect(page.getByText(/saved/i)).toBeVisible();
    });

    test("returning umpire sees existing responses", async ({ page }) => {
      test.skip(!pollCreated, "Poll was not created");

      // Visit same poll (cookie should still be set from previous test)
      await page.goto(`/poll/${pollToken}`);

      await expect(page.getByText(umpireName)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText("Responding as:")).toBeVisible();
    });

    test("closed poll shows closed message", async ({ page }) => {
      test.skip(!pollCreated, "Poll was not created");

      // Close the poll via planner
      await page.goto("/protected/polls");
      await page.getByText(pollTitle).click();
      await page.getByRole("button", { name: /close poll/i }).click();
      await expect(page.getByText("Closed")).toBeVisible();

      // Visit the public poll link
      await page.goto(`/poll/${pollToken}`);
      await expect(page.getByText("This poll is closed")).toBeVisible();

      // Cleanup: reopen and delete
      await page.goto("/protected/polls");
      await page.getByText(pollTitle).click();
      await page.getByRole("button", { name: /reopen/i }).click();
      page.on("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: /delete/i }).click();
      await page.waitForURL(/\/protected\/polls$/);
    });
  });
});
