import { test, expect } from "@playwright/test";

test.use({
  storageState: {
    cookies: [
      {
        name: "x-tenant",
        value: "default",
        domain: "localhost",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  },
});

test("home page shows Fluitplanner branding", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /fluitplanner/i }),
  ).toBeVisible();
});
