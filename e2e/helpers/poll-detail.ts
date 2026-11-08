import { expect, type Page } from "@playwright/test";

/**
 * Close, reopen, rename and delete live behind the poll header's overflow
 * menu — see `docs/page-chrome.md`. Opens it and picks one entry.
 */
export async function pollOverflowAction(page: Page, name: RegExp | string) {
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name }).click();
}

/**
 * The poll title is on the page twice — the header's heading and the sticky
 * toolbar's compact identity — so a bare `getByText` is ambiguous. Match the
 * heading.
 */
export function pollHeading(page: Page, title: string) {
  return page.getByRole("heading", { name: title });
}

/**
 * The assignment grid is the poll page itself; a poll with no responses yet
 * opens on its match list instead, with a back button to the grid. Lands on
 * the grid either way.
 */
export async function openAssignments(page: Page) {
  const back = page.getByTestId("back-to-assignments");
  const confirmed = page.getByTestId("confirmed-mode-toggle");
  // Either the grid's toolbar or the side view's back button shows up first.
  await expect(back.or(confirmed).first()).toBeVisible({ timeout: 10000 });
  if (await back.isVisible()) {
    // The server-rendered button can be visible before hydration attaches its
    // handler, so retry the click until the side view actually leaves.
    await expect(async () => {
      if (await back.isVisible()) await back.click();
      await expect(back).toBeHidden({ timeout: 1000 });
    }).toPass({ timeout: 10000 });
  }
}

/**
 * Day sheets and exports live in the header's Share menu (Export, for a
 * viewer). Opens it.
 */
export async function openShareMenu(page: Page) {
  await page.getByTestId("poll-share-menu").click();
}

/**
 * Opens the poll's match list, from the grid or wherever the page landed.
 * The counts by the title toggle their view, so clicking "matches" while it is
 * already open would go back to the grid: only click from the grid.
 */
export async function openMatchList(page: Page) {
  await openAssignments(page);
  const link = page.getByTestId("view-matches");
  const back = page.getByTestId("back-to-assignments");
  await expect(async () => {
    if (!(await back.isVisible())) await link.click();
    await expect(back).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
}

/**
 * The poll page opens on open days only, which hides past and closed days.
 * Switches the date filter to every date, through the desktop picker.
 */
export async function showAllDates(page: Page) {
  const trigger = page.getByRole("button", { name: "Date range" });
  await trigger.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "All", exact: true })
    .click();
  await expect(trigger).toHaveText("All");
}
