import { test, expect } from "@playwright/test";

/**
 * Notes on matches: written from the match form and from the Matches screen,
 * then read back on the poll detail screen's Matches tab.
 *
 * The Assignments tab indicator is covered by the component tests instead —
 * its grid only renders once umpires have responded to the poll, which would
 * mean driving the whole public response flow to reach one icon.
 *
 * The spec creates its own match so it does not depend on seed data being
 * present in the signed-in user's organization.
 */
test.describe("Match notes", () => {
  test.describe.configure({ mode: "serial" });

  const uniqueId = Date.now();
  const homeTeam = `E2E Notes Home ${uniqueId}`;
  const awayTeam = `E2E Notes Away ${uniqueId}`;
  const formNote = `Umpire X would like to be assigned (${uniqueId})`;
  const editedNote = `Don't assign Y (${uniqueId})`;

  /** Tomorrow, so the match falls inside the page's default date range. */
  const matchDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const pollTitle = `E2E Notes Poll ${uniqueId}`;
  let matchCreated = false;
  let pollCreated = false;

  async function gotoMatch(page: import("@playwright/test").Page) {
    await page.goto("/protected/matches");
    await page.getByPlaceholder(/search teams/i).fill(homeTeam);
    await expect(page.getByText(homeTeam)).toBeVisible({ timeout: 10_000 });
  }

  test("a note can be written in the match form", async ({ page }) => {
    await page.goto("/protected/matches");
    await page.getByRole("button", { name: /add match/i }).click();

    // Scoped to the dialog: the page itself has a "Date range" filter.
    const form = page.getByRole("dialog");
    await form.getByLabel("Date").fill(matchDate);
    await form.getByLabel("Time").fill("12:45");
    await form.getByLabel("Home Team").fill(homeTeam);
    await form.getByLabel("Away Team").fill(awayTeam);
    await form.getByLabel("Notes").fill(formNote);
    await form.getByRole("button", { name: /^add$/i }).click();

    matchCreated = true;

    await gotoMatch(page);
    await expect(page.getByRole("button", { name: formNote })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("the note is revealed on hover in the Matches screen", async ({
    page,
  }) => {
    test.skip(!matchCreated, "Match was not created");
    await gotoMatch(page);

    await page.getByRole("button", { name: formNote }).hover();

    await expect(page.getByRole("tooltip")).toContainText(formNote);
  });

  test("the note can be edited from the Matches screen", async ({ page }) => {
    test.skip(!matchCreated, "Match was not created");
    await gotoMatch(page);

    await page.getByRole("button", { name: formNote }).click();
    const textbox = page.getByRole("dialog").getByRole("textbox");
    await expect(textbox).toHaveValue(formNote);
    await textbox.fill(editedNote);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^save$/i })
      .click();

    await expect(page.getByRole("button", { name: editedNote })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("the note can be cleared from the Matches screen", async ({ page }) => {
    test.skip(!matchCreated, "Match was not created");
    await gotoMatch(page);

    await page.getByRole("button", { name: editedNote }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^delete$/i })
      .click();

    await expect(page.getByRole("button", { name: editedNote })).toBeHidden({
      timeout: 10_000,
    });
    // The row falls back to the "add a note" affordance.
    await expect(
      page.getByRole("button", { name: /add a note/i }),
    ).toBeVisible();
  });

  test("the note is reachable from the poll's Matches tab", async ({
    page,
  }) => {
    test.skip(!matchCreated, "Match was not created");

    // Put the note back so there is something to find on the poll screen.
    await gotoMatch(page);
    await page.getByRole("button", { name: /add a note/i }).click();
    const textbox = page.getByRole("dialog").getByRole("textbox");
    await textbox.fill(editedNote);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^save$/i })
      .click();
    await expect(page.getByRole("button", { name: editedNote })).toBeVisible({
      timeout: 10_000,
    });

    await page.goto("/protected/polls/new");
    await page.getByLabel("Poll Title").fill(pollTitle);
    await page
      .locator("label", { hasText: homeTeam })
      .getByRole("checkbox")
      .click();
    await page.getByRole("button", { name: "Create Poll" }).click();
    await expect(page.getByText(pollTitle)).toBeVisible({ timeout: 10_000 });
    pollCreated = true;

    // The Matches tab lists the match inside its slot, with the note control.
    await expect(page.getByRole("button", { name: editedNote })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: editedNote }).hover();
    await expect(page.getByRole("tooltip")).toContainText(editedNote);
  });

  test("cleanup: delete the test poll", async ({ page }) => {
    test.skip(!pollCreated, "Poll was not created");
    await page.goto("/protected/polls");
    await page.getByText(pollTitle).click();
    await page.waitForURL(/\/protected\/polls\//);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /^delete$/i }).click();
    await page.waitForURL(/\/protected\/polls$/, { timeout: 10_000 });
  });

  test("cleanup: delete the test match", async ({ page }) => {
    test.skip(!matchCreated, "Match was not created");
    await gotoMatch(page);

    const row = page.locator("tr", { hasText: homeTeam });
    await row.getByRole("button").last().click();
    await page.getByRole("menuitem", { name: /delete/i }).click();

    await expect(page.getByText(homeTeam)).toBeHidden({ timeout: 10_000 });
  });
});
