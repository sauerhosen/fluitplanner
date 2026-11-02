import type { Page } from "@playwright/test";

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
  await page
    .getByTestId("view-matches")
    .waitFor({ state: "visible", timeout: 10000 });
  if (await back.isVisible()) await back.click();
}

/**
 * Day sheets and exports live in the header's Share menu (Export, for a
 * viewer). Opens it.
 */
export async function openShareMenu(page: Page) {
  await page.getByTestId("poll-share-menu").click();
}
