import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "e2e-test@fluitplanner.test";

/**
 * Service-role client for the passkey admin API, used only to put the test user
 * back to a known state. GoTrue caps passkeys per user (10 by default), so a
 * test that enrolled one every run would eventually wedge itself.
 */
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        experimental: { passkey: true },
      },
    },
  );
}

async function testUserId(admin: ReturnType<typeof adminClient>) {
  const { data } = await admin.auth.admin.listUsers();
  const user = data?.users.find((u) => u.email === TEST_EMAIL);
  if (!user) throw new Error(`E2E user ${TEST_EMAIL} not found`);
  return user.id;
}

/** How many passkeys GoTrue holds for the test user. */
async function passkeyCount() {
  const admin = adminClient();
  const userId = await testUserId(admin);
  const { data } = await admin.auth.admin.passkey.listPasskeys({ userId });
  return (data ?? []).length;
}

/** Remove every passkey the test user has, so each run starts from zero. */
async function clearPasskeys() {
  const admin = adminClient();
  const userId = await testUserId(admin);
  const { data } = await admin.auth.admin.passkey.listPasskeys({ userId });
  for (const passkey of data ?? []) {
    await admin.auth.admin.passkey.deletePasskey({
      userId,
      passkeyId: passkey.id,
    });
  }
}

/**
 * A CDP virtual authenticator is bound to its page target, so the resident
 * credential vanishes with the page. Enrolment and sign-in therefore have to
 * happen in one linear test on one page.
 */
async function attachVirtualAuthenticator(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable");
  const { authenticatorId } = await client.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        // Discoverable credentials are what let sign-in work with no email typed.
        hasResidentKey: true,
        hasUserVerification: true,
        // Without this the ceremony waits forever for a user gesture.
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  return { client, authenticatorId };
}

/**
 * Runs on localhost, where the ceremony is same-origin (rp_id "localhost") and
 * nothing is redirected. The cross-origin bounce that a club subdomain takes
 * needs wildcard DNS and TLS to exercise for real, so it is covered by the unit
 * tests over `passkeyCeremonyOrigin` and `safePasskeyReturnUrl` instead.
 */
test.describe("Passkeys", () => {
  test.describe.configure({ mode: "serial" });

  // Per test, not per file: each test enrols its own passkey, and GoTrue caps
  // how many a user may have.
  test.beforeEach(clearPasskeys);
  test.afterAll(clearPasskeys);

  test("a passkey can be enrolled and then used to sign in", async ({
    page,
  }) => {
    const { client, authenticatorId } = await attachVirtualAuthenticator(page);

    await page.goto("/protected/account");
    await expect(
      page.getByRole("heading", { name: "Account", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("You have no passkeys yet.")).toBeVisible();

    await page.getByRole("button", { name: "Add a passkey" }).click();

    await expect(page.getByRole("listitem")).toHaveCount(1, { timeout: 15000 });
    const { credentials } = await client.send("WebAuthn.getCredentials", {
      authenticatorId,
    });
    expect(credentials).toHaveLength(1);

    // Drop only this browser's auth cookies rather than clicking Logout:
    // supabase signOut defaults to global scope, which would revoke the shared
    // E2E user's refresh tokens and sign every other spec out too. The x-tenant
    // cookie has to survive, since localhost resolves its club from it.
    await page.context().clearCookies({ name: /^sb-/ });

    await page.goto("/auth/login");
    await expect(page.getByLabel("Email")).toBeVisible();

    // No email, no password — a discoverable credential identifies the user.
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();

    await page.waitForURL(/\/protected/, { timeout: 15000 });
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
    // And the session really is usable, not just a redirect that landed.
    await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
  });

  test("a passkey can be removed again", async ({ page }) => {
    await attachVirtualAuthenticator(page);

    await page.goto("/protected/account");
    await page.getByRole("button", { name: "Add a passkey" }).click();
    await expect(page.getByRole("listitem")).toHaveCount(1, { timeout: 15000 });

    await page.getByRole("button", { name: /^Remove / }).click();
    await expect(
      page.getByRole("heading", { name: "Remove this passkey?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("You have no passkeys yet.")).toBeVisible({
      timeout: 15000,
    });
    // Gone from GoTrue, not just from the rendered list.
    expect(await passkeyCount()).toBe(0);
  });

  test("the auth cookie stays host-only on localhost", async ({ page }) => {
    await page.goto("/protected");

    const authCookies = (await page.context().cookies()).filter((c) =>
      c.name.startsWith("sb-"),
    );

    expect(authCookies.length).toBeGreaterThan(0);
    for (const cookie of authCookies) {
      // A leading dot marks a domain-scoped cookie. e2e/global-setup.ts seeds a
      // host-only cookie and the whole suite depends on that scope.
      expect(cookie.domain.startsWith(".")).toBe(false);
    }
  });
});
