import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  openMatchList,
  pollHeading,
  pollOverflowAction,
  showAllDates,
} from "./helpers/poll-detail";
import {
  createMatch,
  daysFromToday,
  deleteMatch,
  selectMatch,
} from "./helpers/matches";

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

  /** Tomorrow and the day after: in the future, so both start out open. */
  const days = [1, 2].map(daysFromToday);
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
    // The page opens on open days only; a closed day needs every date shown.
    await showAllDates(page);
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
      await createMatch(page, { date: days[i], home: t.home, away: t.away });
      matchesCreated++;
    }

    await page.goto("/protected/polls/new");
    await page.getByLabel("Poll Title").fill(pollTitle);
    for (const t of teams) await selectMatch(page, t.home);
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
    await showAllDates(page);
    await expect(page.getByTestId(`day-${closedDay}`)).toHaveAttribute(
      "data-closed",
      "true",
      { timeout: 10_000 },
    );
  });

  test("the umpire finds the closed day under closed dates", async () => {
    test.skip(!pollCreated, "Poll was not created");
    await umpirePage.reload();
    // Only the open day is answerable up front.
    await expect(yesButtons()).toHaveCount(1, { timeout: 10_000 });

    // The closed day sits with the closed dates, answer kept, read-only.
    await umpirePage.getByRole("button", { name: "1 closed date" }).click();
    await expect(yesButtons()).toHaveCount(2);
    await expect(yesButtons().nth(1)).toBeDisabled();
  });

  test("the grid marks the closed day", async ({ page }) => {
    test.skip(!pollCreated, "Poll was not created");
    await page.goto("/protected/polls");
    await page.getByText(pollTitle).click();
    await page.waitForURL(/\/protected\/polls\//);
    await openMatchList(page);
    await showAllDates(page);
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
    await expect(yesButtons().nth(0)).toBeEnabled();
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
      await deleteMatch(page, t.home);
    }
  });
});
