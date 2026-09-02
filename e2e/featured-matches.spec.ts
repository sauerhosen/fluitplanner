import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { pollHeading, pollOverflowAction } from "./helpers/poll-detail";

/**
 * Featured matches: the planner reveals one match's teams inside an otherwise
 * anonymous poll, and an umpire sees them on the slot that match falls in.
 *
 * Driven end to end because the value of the feature is precisely that a
 * planner-side toggle changes what an unauthenticated visitor sees — the two
 * halves are only meaningful together. The suppression rules (past slots,
 * assigned slots, locked slots) are covered by component tests, which can set
 * up assignment state far more cheaply than this flow could.
 *
 * The spec creates its own match so it does not depend on seed data.
 */
test.describe("Featured matches", () => {
  test.describe.configure({ mode: "serial" });

  const uniqueId = Date.now();
  const homeTeam = `E2E Featured Home ${uniqueId}`;
  const awayTeam = `E2E Featured Away ${uniqueId}`;
  const featuredLabel = `${homeTeam} – ${awayTeam}`;
  const pollTitle = `E2E Featured Poll ${uniqueId}`;
  const umpireEmail = `e2e-featured-${uniqueId}@test.com`;
  const umpireName = `E2E Featured Umpire ${uniqueId}`;

  /** Tomorrow, so the slot is in the future and stays answerable. */
  const matchDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let matchCreated = false;
  let pollCreated = false;
  let pollToken = "";

  let umpireContext: BrowserContext;
  let umpirePage: Page;

  test.afterAll(async () => {
    await umpireContext?.close();
  });

  test("planner creates a match and a poll containing it", async ({ page }) => {
    await page.goto("/protected/matches");
    await page.getByRole("button", { name: /add match/i }).click();

    const form = page.getByRole("dialog");
    await form.getByLabel("Date").fill(matchDate);
    await form.getByLabel("Time").fill("12:45");
    await form.getByLabel("Home Team").fill(homeTeam);
    await form.getByLabel("Away Team").fill(awayTeam);
    await form.getByRole("button", { name: /^add$/i }).click();
    await expect(form).toBeHidden({ timeout: 10_000 });
    matchCreated = true;

    await page.goto("/protected/polls/new");
    await page.getByLabel("Poll Title").fill(pollTitle);
    await page
      .locator("label", { hasText: homeTeam })
      .getByRole("checkbox")
      .click();
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

  test("a new poll starts with the match not featured", async ({ page }) => {
    test.skip(!pollCreated, "Poll was not created");
    await page.goto(`/protected/polls`);
    await page.getByText(pollTitle).click();
    await page.waitForURL(/\/protected\/polls\//);

    await expect(
      page.getByRole("button", { name: /show this match to umpires/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("an umpire sees only the slot time before the match is featured", async ({
    browser,
  }) => {
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

    await expect(
      umpirePage.getByRole("button", { name: "Yes" }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(umpirePage.getByText(featuredLabel)).toBeHidden();
  });

  test("the planner features the match", async ({ page }) => {
    test.skip(!pollCreated, "Poll was not created");
    await page.goto(`/protected/polls`);
    await page.getByText(pollTitle).click();
    await page.waitForURL(/\/protected\/polls\//);

    await page
      .getByRole("button", { name: /show this match to umpires/i })
      .click();

    // The star is optimistic, so its label flips before the server action
    // resolves — asserting on it would pass while the write is still in
    // flight, and ending the test would abort the request. Reload and read
    // the label back from the database instead.
    await page.reload();
    await expect(
      page.getByRole("button", { name: /hide this match from umpires/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("the umpire now sees the match teams on its slot", async ({}) => {
    test.skip(!pollCreated, "Poll was not created");

    await umpirePage.reload();
    await expect(umpirePage.getByText(featuredLabel)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("the choice survives an edit to the poll's match list", async ({
    page,
  }) => {
    test.skip(!pollCreated, "Poll was not created");
    // poll_matches is replaced wholesale on this path, so the flag has to be
    // carried across it — otherwise editing the match list silently unfeatures.
    await page.goto(`/protected/polls`);
    await page.getByText(pollTitle).click();
    await page.waitForURL(/\/protected\/polls\//);

    await page.getByRole("button", { name: /edit matches/i }).click();
    await page.getByRole("button", { name: /save match changes/i }).click();

    await expect(
      page.getByRole("button", { name: /hide this match from umpires/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("the planner hides the match again", async ({ page }) => {
    test.skip(!pollCreated, "Poll was not created");
    await page.goto(`/protected/polls`);
    await page.getByText(pollTitle).click();
    await page.waitForURL(/\/protected\/polls\//);

    await page
      .getByRole("button", { name: /hide this match from umpires/i })
      .click();

    // Read back from the database, not from the optimistic star.
    await page.reload();
    await expect(
      page.getByRole("button", { name: /show this match to umpires/i }),
    ).toBeVisible({ timeout: 10_000 });

    await umpirePage.reload();
    await expect(umpirePage.getByText(featuredLabel)).toBeHidden({
      timeout: 10_000,
    });
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

  test("cleanup: delete the test match", async ({ page }) => {
    test.skip(!matchCreated, "Match was not created");
    await page.goto("/protected/matches");
    await page.getByPlaceholder(/search teams/i).fill(homeTeam);
    await expect(page.getByText(homeTeam)).toBeVisible({ timeout: 10_000 });

    const row = page.locator("tr", { hasText: homeTeam });
    await row.getByRole("button").last().click();
    await page.getByRole("menuitem", { name: /delete/i }).click();

    await expect(page.getByText(homeTeam)).toBeHidden({ timeout: 10_000 });
  });
});
