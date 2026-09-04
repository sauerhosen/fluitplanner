import { screen } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { LoginForm } from "@/components/login-form";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signInWithPassword: vi.fn() },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const ORIGINAL_LOCATION = window.location;

beforeEach(() => {
  process.env.NEXT_PUBLIC_BASE_DOMAIN = "fluiten.org";
  (window as unknown as { PublicKeyCredential: unknown }).PublicKeyCredential =
    class {};
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      host: "localhost:3000",
      hostname: "localhost",
      pathname: "/auth/login",
      protocol: "http:",
      origin: "http://localhost:3000",
      href: "http://localhost:3000/auth/login",
      assign: vi.fn(),
      replace: vi.fn(),
    },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
  delete (window as unknown as { PublicKeyCredential?: unknown })
    .PublicKeyCredential;
});

describe("LoginForm", () => {
  it("offers a passkey alongside the password form", () => {
    render(<LoginForm />);

    expect(
      screen.getByRole("button", { name: "Sign in with a passkey" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  /**
   * e2e/global-setup.ts drives this form by accessible name for the entire E2E
   * suite. Playwright matches names by substring, so a second button whose name
   * contains "Login" would make `getByRole("button", { name: "Login" })`
   * ambiguous and break every authenticated test.
   */
  it("keeps exactly one button matching the E2E login selector", () => {
    render(<LoginForm />);

    const loginButtons = screen
      .getAllByRole("button")
      .filter((button) =>
        (button.textContent ?? "").toLowerCase().includes("login"),
      );

    expect(loginButtons).toHaveLength(1);
  });
});
