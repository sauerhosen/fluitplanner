import { expect, type Page } from "@playwright/test";

/**
 * The default club has no seeded matches, so a spec that needs one creates its
 * own. Picking whatever match the new-poll form lists first borrows another
 * spec's match instead, and races that spec's own poll and cleanup when the
 * suite runs in parallel.
 */

/** "YYYY-MM-DD", `days` from today: future matches stay answerable. */
export function daysFromToday(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** Adds a match through the Matches screen's form. */
export async function createMatch(
  page: Page,
  match: { date: string; time?: string; home: string; away: string },
) {
  await page.goto("/protected/matches");
  await page.getByRole("button", { name: /add match/i }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Date").fill(match.date);
  await form.getByLabel("Time").fill(match.time ?? "12:45");
  await form.getByLabel("Home Team").fill(match.home);
  await form.getByLabel("Away Team").fill(match.away);
  await form.getByRole("button", { name: /^add$/i }).click();
  await expect(form).toBeHidden({ timeout: 10_000 });
}

/** Ticks a match by its home team in the new-poll / edit-matches selector. */
export async function selectMatch(page: Page, home: string) {
  await page.locator("label", { hasText: home }).getByRole("checkbox").click();
}

/** Deletes a match from the Matches screen, found by its home team. */
export async function deleteMatch(page: Page, home: string) {
  await page.goto("/protected/matches");
  await page.getByPlaceholder(/search teams/i).fill(home);
  // Scope to the row: the search filters on the server, so the unfiltered
  // list can still be on screen.
  const row = page.locator("tr", { hasText: home });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button").last().click();
  await page.getByRole("menuitem", { name: /delete/i }).click();
  await expect(page.getByText(home)).toBeHidden({ timeout: 10_000 });
}
