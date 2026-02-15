import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { mkdir } from "fs/promises";

/**
 * E2E global setup: ensures an authenticated session is saved for tests.
 *
 * Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in .env.local to use a specific
 * test account. If not set, falls back to creating a new test user via the
 * Supabase auth API.
 */
async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL ?? "http://localhost:3000";

  // Load .env.local so Supabase env vars are available
  loadEnvConfig(process.cwd());

  await mkdir("e2e/.auth", { recursive: true });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  const testEmail = process.env.E2E_TEST_EMAIL ?? "e2e-test@fluitplanner.test";
  const testPassword =
    process.env.E2E_TEST_PASSWORD ?? "e2e-test-password-2026!";

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Try to sign in first
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (signInError) {
    // User doesn't exist — try to create via signUp API
    const { error: signUpError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
    });

    if (signUpError) {
      throw new Error(
        `Could not sign in or create test user (${testEmail}): ${signInError.message} / ${signUpError.message}\n` +
          `Hint: set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in .env.local to use an existing account.`,
      );
    }

    // Sign in after creating
    const { error: retryError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    if (retryError) {
      throw new Error(
        `Created test user but failed to sign in: ${retryError.message}\n` +
          `The account may require email confirmation. Confirm it in the Supabase dashboard, then re-run.`,
      );
    }
  }

  // Use browser to log in and capture authenticated state (cookies/localStorage)
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Set tenant cookie before navigating so middleware can resolve the org
  await context.addCookies([
    {
      name: "x-tenant",
      value: "default",
      domain: "localhost",
      path: "/",
    },
  ]);

  await page.goto(`${baseURL}/auth/login`);
  await page.getByLabel("Email").fill(testEmail);
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/protected/, { timeout: 10000 });

  // Save authenticated state (includes x-tenant cookie)
  await context.storageState({ path: "e2e/.auth/state.json" });
  await browser.close();
}

export default globalSetup;
