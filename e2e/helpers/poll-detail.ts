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
