import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { pollHeading, pollOverflowAction } from "./helpers/poll-detail";

test.describe("Poll response page", () => {
  test("shows not found for invalid token", async ({ browser }) => {
    // Poll pages are public — test without auth to match real umpire usage
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/poll/nonexistent-token-xyz");
    await expect(
      page.getByRole("heading", { name: "Poll not found" }),
    ).toBeVisible();
    await context.close();
  });

  test.describe("full poll response flow", () => {
    test.describe.configure({ mode: "serial" });

    const uniqueId = Date.now();
    const pollTitle = `E2E Response Poll ${uniqueId}`;
    const umpireEmail = `e2e-${uniqueId}@test.com`;
    const umpireName = `E2E Umpire ${uniqueId}`;
    let pollToken = "";
    let pollCreated = false;

    // Shared unauthenticated context for umpire tests (preserves cookies)
    let umpireContext: BrowserContext;
    let umpirePage: Page;

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
      await expect(pollHeading(page, pollTitle)).toBeVisible();

      // Grant clipboard permissions and get the poll URL
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"]);
      // Copy Link now lives inside the header's Share menu
      await page.getByRole("button", { name: /^Share/ }).click();
      await page.getByRole("menuitem", { name: "Copy Link" }).click();

      // Read from clipboard
      pollToken = await page.evaluate(async () => {
        const text = await navigator.clipboard.readText();
        const match = text.match(/\/poll\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : "";
      });

      expect(pollToken).not.toBe("");
      pollCreated = true;
    });

    test("umpire can fill out availability via poll link", async ({
      browser,
    }) => {
      test.skip(!pollCreated, "Poll was not created");

      // Create unauthenticated context that will persist across serial tests
      umpireContext = await browser.newContext();
      umpirePage = await umpireContext.newPage();

      await umpirePage.goto(`/poll/${pollToken}`);
      await expect(
        umpirePage.getByRole("heading", { name: pollTitle }),
      ).toBeVisible();

      // Enter email (new umpire)
      await umpirePage.getByLabel("Your email").fill(umpireEmail);
      await umpirePage.getByRole("button", { name: "Continue" }).click();

      // Should ask for name (new umpire)
      await expect(umpirePage.getByLabel("Your name")).toBeVisible();
      await umpirePage.getByLabel("Your name").fill(umpireName);
      await umpirePage.getByRole("button", { name: "Continue" }).click();

      // Should show availability form with umpire name
      await expect(
        umpirePage.getByText(`Responding as ${umpireName}`),
      ).toBeVisible();

      // Click Yes on the first slot
      const yesButtons = umpirePage.getByRole("button", { name: "Yes" });
      await yesButtons.first().click();

      // Save
      await umpirePage.getByRole("button", { name: /save/i }).click();
      await expect(umpirePage.getByText(/saved/i)).toBeVisible();
    });

    test("returning umpire sees existing responses", async () => {
      test.skip(!pollCreated, "Poll was not created");

      // Re-use the same context so the umpire cookie persists
      await umpirePage.goto(`/poll/${pollToken}`);

      await expect(
        umpirePage.getByText(`Responding as ${umpireName}`),
      ).toBeVisible({ timeout: 10000 });
    });

    test("closed poll shows closed message", async ({ page }) => {
      test.skip(!pollCreated, "Poll was not created");

      // Close the poll via planner (authenticated context)
      await page.goto("/protected/polls");
      await page.getByText(pollTitle).click();
      await pollOverflowAction(page, /close poll/i);
      await expect(page.getByText("Closed")).toBeVisible();

      // Visit the public poll link using the umpire context
      await umpirePage.goto(`/poll/${pollToken}`);
      await expect(umpirePage.getByText("Poll closed")).toBeVisible();

      // Cleanup umpire context
      await umpireContext.close();

      // Cleanup: reopen and delete
      await page.goto("/protected/polls");
      await page.getByText(pollTitle).click();
      await pollOverflowAction(page, /reopen/i);
      page.on("dialog", (dialog) => dialog.accept());
      await pollOverflowAction(page, /delete/i);
      await page.waitForURL(/\/protected\/polls$/);
    });
  });
});
