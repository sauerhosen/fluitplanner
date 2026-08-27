import { test, expect } from "@playwright/test";

/**
 * Merging a duplicate umpire — the record a mistyped email leaves behind — into
 * the one that survives.
 *
 * This is the only test that exercises the `merge_umpires` database function
 * for real: the merge rewrites five tables inside one transaction, so the parts
 * that matter (the duplicate's roster entry and note landing on the survivor,
 * the duplicate row disappearing) are not observable from a mocked client.
 *
 * Availability and appointments moving over are covered by the function's own
 * conflict rules rather than here, because reaching a responded-to poll slot
 * would mean driving the whole public response flow first.
 */
test.describe("Umpire merge", () => {
  test.describe.configure({ mode: "serial" });

  const uniqueId = Date.now();
  const survivorName = `E2E Merge Keep ${uniqueId}`;
  const survivorEmail = `e2e-merge-keep-${uniqueId}@example.com`;
  const duplicateName = `E2E Merge Drop ${uniqueId}`;
  // The typo that creates the duplicate in the first place.
  const duplicateEmail = `e2e-merge-kep-${uniqueId}@example.com`;
  const duplicateNote = `Reached us on the typo'd address (${uniqueId})`;

  let bothCreated = false;

  async function addUmpire(
    page: import("@playwright/test").Page,
    name: string,
    email: string,
    note?: string,
  ) {
    await page.goto("/protected/umpires");
    await page.getByRole("button", { name: "Add Umpire" }).click();
    const form = page.getByRole("dialog");
    await form.getByLabel("Name").fill(name);
    await form.getByLabel("Email").fill(email);
    if (note) await form.getByLabel("Notes").fill(note);
    await form.getByRole("button", { name: /^add$/i }).click();
    // The dialog closes only once the server action resolves; waiting for that
    // keeps the next navigation from aborting the in-flight request.
    await expect(form).toBeHidden({ timeout: 10_000 });
  }

  test("creates the pair to merge", async ({ page }) => {
    await addUmpire(page, survivorName, survivorEmail);
    await addUmpire(page, duplicateName, duplicateEmail, duplicateNote);

    await page.goto("/protected/umpires");
    await page.getByPlaceholder(/search name or email/i).fill("E2E Merge");
    await expect(page.getByText(survivorName)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(duplicateName)).toBeVisible();

    bothCreated = true;
  });

  test("folds the duplicate into the umpire the merge was opened from", async ({
    page,
  }) => {
    test.skip(!bothCreated, "The pair was not created");

    await page.goto("/protected/umpires");
    await page.getByPlaceholder(/search name or email/i).fill("E2E Merge");
    const survivorRow = page.getByRole("row").filter({ hasText: survivorName });
    await expect(survivorRow).toBeVisible({ timeout: 10_000 });
    // The search refetches the table on every keystroke, and a result landing
    // mid-click closes the row menu again. Both rows being on screen means the
    // last refetch has settled.
    await expect(
      page.getByRole("row").filter({ hasText: duplicateName }),
    ).toBeVisible({ timeout: 10_000 });

    await survivorRow.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("menuitem", { name: /merge duplicate/i }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill(duplicateName);
    await dialog
      .getByRole("button", { name: new RegExp(duplicateEmail) })
      .click();

    // The direction is what cannot be undone, so assert it before confirming.
    await expect(dialog.getByText("Kept", { exact: true })).toBeVisible();
    await expect(dialog.getByText(survivorEmail)).toBeVisible();
    await expect(dialog.getByText("Removed", { exact: true })).toBeVisible();
    await expect(dialog.getByText(duplicateEmail)).toBeVisible();

    await dialog.getByRole("button", { name: /^merge$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // The survivor keeps their own name and address; the duplicate is gone.
    const table = page.getByRole("table");
    await expect(table.getByText(survivorName)).toBeVisible();
    await expect(table.getByText(survivorEmail)).toBeVisible();
    await expect(table.getByText(duplicateName)).toHaveCount(0);
    await expect(table.getByText(duplicateEmail)).toHaveCount(0);
  });

  test("carries the duplicate's note onto the survivor", async ({ page }) => {
    test.skip(!bothCreated, "The pair was not created");

    await page.goto("/protected/umpires");
    await page.getByPlaceholder(/search name or email/i).fill(survivorName);
    await expect(page.getByText(survivorName)).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole("button", { name: duplicateNote }),
    ).toBeVisible();
  });

  test("cleans up the merged umpire", async ({ page }) => {
    test.skip(!bothCreated, "The pair was not created");

    await page.goto("/protected/umpires");
    await page.getByPlaceholder(/search name or email/i).fill(survivorName);
    const row = page.getByRole("row").filter({ hasText: survivorName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByText(survivorName)).toHaveCount(0);
  });
});
