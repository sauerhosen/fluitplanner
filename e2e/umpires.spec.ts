import { test, expect } from "@playwright/test";

test.describe("Umpires page", () => {
  test.describe.configure({ mode: "serial" });

  test("shows umpires page", async ({ page }) => {
    await page.goto("/protected/umpires");
    await expect(page.getByRole("heading", { name: "Umpires" })).toBeVisible();
  });

  test("can add, edit, and delete an umpire", async ({ page }) => {
    await page.goto("/protected/umpires");
    await expect(page.getByRole("heading", { name: "Umpires" })).toBeVisible();

    // Use a unique email to avoid conflicts with leftover data
    const uniqueId = Date.now();
    const umpireName = `E2E Umpire ${uniqueId}`;
    const umpireEmail = `e2e-umpire-${uniqueId}@example.com`;

    // Add umpire
    await page.getByRole("button", { name: "Add Umpire" }).click();
    await page.getByLabel("Name").fill(umpireName);
    await page.getByLabel("Email").fill(umpireEmail);
    await page.getByRole("combobox", { name: "Level" }).click();
    await page.getByRole("option", { name: /Experienced/ }).click();
    await page.getByRole("button", { name: "Add" }).click();

    // Verify umpire appears in table
    const table = page.getByRole("table");
    const row = table.getByRole("row").filter({ hasText: umpireName });
    await expect(row.getByText(umpireName)).toBeVisible();
    await expect(row.getByText(umpireEmail)).toBeVisible();
    await expect(row.getByText("Experienced")).toBeVisible();
    await row.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await page.getByRole("combobox", { name: "Level" }).click();
    await page.getByRole("option", { name: /Top/ }).click();
    await page.getByRole("button", { name: "Update" }).click();

    // Verify level changed
    await expect(row.getByText("Top")).toBeVisible();

    // Delete umpire
    await row.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    // Verify umpire is gone
    await expect(table.getByText(umpireName)).not.toBeVisible();
  });
});
