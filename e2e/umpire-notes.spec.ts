import { test, expect } from "@playwright/test";

/**
 * Notes on umpires: written from the umpire form and from the Umpires screen,
 * then edited and cleared there.
 *
 * The assignment grid indicator is covered by the component tests instead —
 * its grid only renders once umpires have responded to a poll, which would
 * mean driving the whole public response flow to reach one icon.
 *
 * The spec creates its own umpire so it does not depend on seed data being
 * present in the signed-in user's organization.
 */
test.describe("Umpire notes", () => {
  test.describe.configure({ mode: "serial" });

  const uniqueId = Date.now();
  const umpireName = `E2E Note Umpire ${uniqueId}`;
  const umpireEmail = `e2e-note-umpire-${uniqueId}@example.com`;
  const formNote = `Father of a player (${uniqueId})`;
  const editedNote = `Not yet ready for this team level (${uniqueId})`;

  let umpireCreated = false;

  async function gotoUmpire(page: import("@playwright/test").Page) {
    await page.goto("/protected/umpires");
    await page.getByPlaceholder(/search name or email/i).fill(umpireName);
    await expect(page.getByText(umpireName)).toBeVisible({ timeout: 10_000 });
  }

  test("a note can be written in the umpire form", async ({ page }) => {
    await page.goto("/protected/umpires");
    await page.getByRole("button", { name: "Add Umpire" }).click();

    const form = page.getByRole("dialog");
    await form.getByLabel("Name").fill(umpireName);
    await form.getByLabel("Email").fill(umpireEmail);
    await form.getByLabel("Notes").fill(formNote);
    await form.getByRole("button", { name: /^add$/i }).click();

    // The dialog closes only once the server action resolves. Waiting for that
    // keeps the navigation below from aborting the in-flight request.
    await expect(form).toBeHidden({ timeout: 10_000 });

    await gotoUmpire(page);
    await expect(page.getByRole("button", { name: formNote })).toBeVisible({
      timeout: 10_000,
    });

    // Set last: the later tests skip rather than cascade if creation failed.
    umpireCreated = true;
  });

  test("the note is revealed on hover in the Umpires screen", async ({
    page,
  }) => {
    test.skip(!umpireCreated, "Umpire was not created");
    await gotoUmpire(page);

    await page.getByRole("button", { name: formNote }).hover();

    await expect(page.getByRole("tooltip")).toContainText(formNote);
  });

  test("the note can be edited from the Umpires screen", async ({ page }) => {
    test.skip(!umpireCreated, "Umpire was not created");
    await gotoUmpire(page);

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

  test("the note survives an edit of the umpire's other fields", async ({
    page,
  }) => {
    test.skip(!umpireCreated, "Umpire was not created");
    await gotoUmpire(page);

    const row = page.locator("tr", { hasText: umpireName });
    await row.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    const form = page.getByRole("dialog");
    await expect(form.getByLabel("Notes")).toHaveValue(editedNote);
    await form.getByRole("combobox", { name: "Level" }).click();
    await page.getByRole("option", { name: /Top/ }).click();
    await form.getByRole("button", { name: /^update$/i }).click();
    await expect(form).toBeHidden({ timeout: 10_000 });

    await expect(page.getByRole("button", { name: editedNote })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("the note can be cleared from the Umpires screen", async ({ page }) => {
    test.skip(!umpireCreated, "Umpire was not created");
    await gotoUmpire(page);

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

  test("cleanup: delete the test umpire", async ({ page }) => {
    test.skip(!umpireCreated, "Umpire was not created");
    await gotoUmpire(page);

    const row = page.locator("tr", { hasText: umpireName });
    await row.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("menuitem", { name: /delete/i }).click();

    await expect(page.getByText(umpireName)).toBeHidden({ timeout: 10_000 });
  });
});
