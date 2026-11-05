import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  openMatchList,
  pollHeading,
  pollOverflowAction,
} from "./helpers/poll-detail";

/**
 * Closed poll days: the planner closes one day of an open poll and it drops
 * off the umpire's poll page; reopening brings it back.
 *
 * Driven end to end for the same reason as featured matches: the feature is a
 * planner-side toggle changing what an unauthenticated visitor sees. Refusing
 * answers for a closed day is covered by the server action's unit tests.
 *
 * The spec creates its own matches, one on each of two days, so it does not
 * depend on seed data.
 */
test.describe("Closed poll days", () => {
  test.describe.configure({ mode: "serial" });

  const uniqueId = Date.now();
  const teams = [1, 2].map((n) => ({
    home: `E2E Closed Home ${n} ${uniqueId}`,
    away: `E2E Closed Away ${n} ${uniqueId}`,
  }));
  const pollTitle = `E2E Closed Days Poll ${uniqueId}`;
  const umpireEmail = `e2e-closed-${uniqueId}@test.com`;
  const umpireName = `E2E Closed Umpire ${uniqueId}`;

  /** Tomorrow and the day after: in the future, inside the default range. */
  const days = [1, 2].map((n) =>
    new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const closedDay = days[0];

  let matchesCreated = 0;
  let pollCreated = false;
  let pollToken = "";

  let umpireContext: BrowserContext;
  let umpirePage: Page;

  /** One slot per day, so the "Yes" buttons count the days on offer. */
  const yesButtons = () => umpirePage.getByRole("button", { name: "Yes" });

  async function openPoll(page: Page) {
    await page.goto("/protected/polls");
    await page.getByText(pollTitle).click();
    await page.waitForURL(/\/protected\/polls\//);
    await openMatchList(page);
  }

  /** Click the day toggle and wait for its Server Action to land. */
  async function toggleDay(page: Page) {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          r.url().includes("/protected/polls/"),
      ),
      page.getByTestId(`toggle-day-closed-${closedDay}`).click(),
    ]);
    expect(response.ok()).toBe(true);
  }

  test.afterAll(async () => {
    await umpireContext?.close();
  });

  test("planner creates two matches on two days and a poll", async ({
    page,
  }) => {
    for (const [i, t] of teams.entries()) {
      await page.goto("/protected/matches");
      await page.getByRole("button", { name: /add match/i }).click();
      const form = page.getByRole("dialog");
      await form.getByLabel("Date").fill(days[i]);
      await form.getByLabel("Time").fill("12:45");
      await form.getByLabel("Home Team").fill(t.home);
      await form.getByLabel("Away Team").fill(t.away);
      await form.getByRole("button", { name: /^add$/i }).click();
      await expect(form).toBeHidden({ timeout: 10_000 });
      matchesCreated++;
    }

    await page.goto("/protected/polls/new");
    await page.getByLabel("Poll Title").fill(pollTitle);
    for (const t of teams) {
      await page
        .locator("label", { hasText: t.home })
        .getByRole("checkbox")
        .click();
    }
    await page.getByRole("button", { name: "Create Poll" }).click();
    await expect(pollHeading(page, pollTitle)).toBeVisible({
      timeout: 10_000,
    });

    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: /^Share/ }).click();
    await page.getByRole("menuitem", { name: "Copy Link" }).click();
    pollToken = await page.evaluate(async () => {
      const text = await navigator.clipboard.readText();
      const match = text.match(/\/poll\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : "";
    });

    expect(pollToken).not.toBe("");
    pollCreated = true;
  });

  test("an umpire sees both days and answers them", async ({ browser }) => {
    test.skip(!pollCreated, "Poll was not created");

    umpireContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    umpirePage = await umpireContext.newPage();

    await umpirePage.goto(`/poll/${pollToken}`);
    await umpirePage.getByLabel("Your email").fill(umpireEmail);
    await umpirePage.getByRole("button", { name: "Continue" }).click();
    await umpirePage.getByLabel("Your name").fill(umpireName);
    await umpirePage.getByRole("button", { name: "Continue" }).click();

    await expect(yesButtons()).toHaveCount(2, { timeout: 10_000 });

    // Answers on both days: the grid needs a respondent to render, and the
    // closed day's answer must survive closing it.
    await yesButtons().nth(0).click();
    await yesButtons().nth(1).click();
    await umpirePage.getByRole("button", { name: /save/i }).click();
    await expect(umpirePage.getByText(/saved/i)).toBeVisible();
  });

  test("the planner closes the first day", async ({ page }) => {
    test.skip(!pollCreated, "Poll was not created");
    await openPoll(page);
    await toggleDay(page);

    // Read back from the database, not from the optimistic toggle.
    await page.reload();
    await openMatchList(page);
    await expect(page.getByTestId(`day-${closedDay}`)).toHaveAttribute(
      "data-closed",
      "true",
      { timeout: 10_000 },
    );
  });

  test("the umpire no longer sees the closed day", async () => {
    test.skip(!pollCreated, "Poll was not created");
    await umpirePage.reload();
    await expect(yesButtons()).toHaveCount(1, { timeout: 10_000 });
  });

  test("the grid marks the closed day", async ({ page }) => {
    test.skip(!pollCreated, "Poll was not created");
    await page.goto("/protected/polls");
    await page.getByText(pollTitle).click();
    await page.waitForURL(/\/protected\/polls\//);
    await openMatchList(page);
    await page.getByTestId("back-to-assignments").click();

    await expect(page.getByTestId(`closed-day-${closedDay}`)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("reopening brings the day back for the umpire", async ({ page }) => {
    test.skip(!pollCreated, "Poll was not created");
    await openPoll(page);
    await toggleDay(page);

    await page.reload();
    await openMatchList(page);
    await expect(page.getByTestId(`day-${closedDay}`)).not.toHaveAttribute(
      "data-closed",
      { timeout: 10_000 },
    );

    await umpirePage.reload();
    await expect(yesButtons()).toHaveCount(2, { timeout: 10_000 });
  });

  test("cleanup: delete the test poll", async ({ page }) => {
    test.skip(!pollCreated, "Poll was not created");
    await page.goto("/protected/polls");
    await page.getByText(pollTitle).click();
    await page.waitForURL(/\/protected\/polls\//);

    page.once("dialog", (dialog) => dialog.accept());
    await pollOverflowAction(page, /^delete$/i);
    await page.waitForURL(/\/protected\/polls$/, { timeout: 10_000 });
  });

  test("cleanup: delete the test matches", async ({ page }) => {
    test.skip(matchesCreated === 0, "No match was created");
    for (const t of teams.slice(0, matchesCreated)) {
      await page.goto("/protected/matches");
      await page.getByPlaceholder(/search teams/i).fill(t.home);
      const row = page.locator("tr", { hasText: t.home });
      await expect(row).toBeVisible({ timeout: 10_000 });
      await row.getByRole("button").last().click();
      await page.getByRole("menuitem", { name: /delete/i }).click();
      await expect(page.getByText(t.home)).toBeHidden({ timeout: 10_000 });
    }
  });
});
