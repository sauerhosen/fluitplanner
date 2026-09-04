import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { PasskeyButton } from "@/components/passkey/passkey-button";

const signInWithPasskey = vi.fn();
const registerPasskey = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPasskey: (...args: unknown[]) => signInWithPasskey(...args),
      registerPasskey: (...args: unknown[]) => registerPasskey(...args),
    },
  }),
}));

const assign = vi.fn();
const replace = vi.fn();

/** Point jsdom at a host and give us spies on the navigation it would do. */
function setHost(host: string, pathname = "/auth/login") {
  const protocol = host.startsWith("localhost") ? "http:" : "https:";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      host,
      hostname: host.split(":")[0],
      pathname,
      protocol,
      origin: `${protocol}//${host}`,
      href: `${protocol}//${host}${pathname}`,
      assign,
      replace,
    },
  });
}

const ORIGINAL_LOCATION = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_DOMAIN = "fluiten.org";
  // jsdom has no WebAuthn; the button hides itself without this.
  (window as unknown as { PublicKeyCredential: unknown }).PublicKeyCredential =
    class {};
  signInWithPasskey.mockResolvedValue({ data: {}, error: null });
  registerPasskey.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
  delete (window as unknown as { PublicKeyCredential?: unknown })
    .PublicKeyCredential;
});

describe("PasskeyButton", () => {
  // Local development and the master admin surface are both already on the
  // ceremony origin, so there is nothing to redirect to.
  it("runs the ceremony inline when already on the ceremony origin", async () => {
    setHost("localhost:3000");
    render(<PasskeyButton mode="signin" />);

    await userEvent.click(
      screen.getByRole("button", { name: /sign in with a passkey/i }),
    );

    await waitFor(() => expect(signInWithPasskey).toHaveBeenCalledTimes(1));
    expect(assign).not.toHaveBeenCalled();
    // replace, not assign: Back must not return here and re-run the ceremony.
    expect(replace).toHaveBeenCalledWith("http://localhost:3000/protected");
  });

  // A club subdomain is not in rp_origins, so the ceremony has to happen on the
  // apex and come back.
  it("bounces to the apex from a club subdomain instead of running locally", async () => {
    setHost("hic.fluiten.org");
    render(<PasskeyButton mode="signin" />);

    await userEvent.click(
      screen.getByRole("button", { name: /sign in with a passkey/i }),
    );

    expect(signInWithPasskey).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledTimes(1);
    const url = new URL(assign.mock.calls[0][0]);
    expect(url.origin).toBe("https://fluiten.org");
    expect(url.pathname).toBe("/auth/passkey");
    expect(url.searchParams.get("mode")).toBe("signin");
    expect(url.searchParams.get("next")).toBe(
      "https://hic.fluiten.org/protected",
    );
  });

  it("carries the caller's destination through the bounce", async () => {
    setHost("hic.fluiten.org");
    render(<PasskeyButton mode="signin" returnPath="/protected/polls" />);

    await userEvent.click(
      screen.getByRole("button", { name: /sign in with a passkey/i }),
    );

    expect(new URL(assign.mock.calls[0][0]).searchParams.get("next")).toBe(
      "https://hic.fluiten.org/protected/polls",
    );
  });

  it("enrols and calls back without navigating away", async () => {
    setHost("localhost:3000", "/protected/account");
    const onEnrolled = vi.fn();
    render(<PasskeyButton mode="enroll" onEnrolled={onEnrolled} />);

    await userEvent.click(
      screen.getByRole("button", { name: /add a passkey/i }),
    );

    await waitFor(() => expect(registerPasskey).toHaveBeenCalledTimes(1));
    expect(onEnrolled).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("surfaces a ceremony failure", async () => {
    setHost("localhost:3000");
    signInWithPasskey.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("No passkey found"), {
        name: "AuthError",
      }),
    });
    render(<PasskeyButton mode="signin" />);

    await userEvent.click(
      screen.getByRole("button", { name: /sign in with a passkey/i }),
    );

    expect(await screen.findByText("No passkey found")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  // Dismissing the system sheet is not a failure worth shouting about.
  it("stays quiet when the user cancels the system prompt", async () => {
    setHost("localhost:3000");
    signInWithPasskey.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("The operation was aborted"), {
        name: "NotAllowedError",
      }),
    });
    render(<PasskeyButton mode="signin" />);

    await userEvent.click(
      screen.getByRole("button", { name: /sign in with a passkey/i }),
    );

    await waitFor(() => expect(signInWithPasskey).toHaveBeenCalled());
    expect(screen.queryByText(/aborted/i)).toBeNull();
  });

  /**
   * Regression: the ceremony page used to redirect like any other host. When
   * the configured origin disagreed with the deployment's canonical one, the
   * redirect landed on a host that redirected back and the page bounced
   * forever, showing nothing. Running here surfaces a real error instead.
   */
  it("never redirects away from the ceremony page itself", async () => {
    setHost("www.fluiten.org", "/auth/passkey");
    render(<PasskeyButton mode="enroll" forceInline />);

    await userEvent.click(
      screen.getByRole("button", { name: /add a passkey/i }),
    );

    expect(assign).not.toHaveBeenCalled();
    await waitFor(() => expect(registerPasskey).toHaveBeenCalledTimes(1));
  });

  it("surfaces a rejected origin instead of bouncing", async () => {
    setHost("www.fluiten.org", "/auth/passkey");
    registerPasskey.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("Origin not allowed"), {
        name: "AuthApiError",
      }),
    });
    render(<PasskeyButton mode="enroll" forceInline />);

    await userEvent.click(
      screen.getByRole("button", { name: /add a passkey/i }),
    );

    expect(await screen.findByText("Origin not allowed")).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  // A cancelled ceremony shows no message, but must still leave a trace:
  // NotAllowedError is also what the browser throws when it refuses one.
  it("logs even a silent cancellation", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    setHost("localhost:3000");
    signInWithPasskey.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("aborted"), { name: "NotAllowedError" }),
    });
    render(<PasskeyButton mode="signin" />);

    await userEvent.click(
      screen.getByRole("button", { name: /sign in with a passkey/i }),
    );

    await waitFor(() => expect(logged).toHaveBeenCalled());
    expect(screen.queryByText(/aborted/i)).toBeNull();
    logged.mockRestore();
  });

  // A preview deployment can never match the production rp_origins list.
  it("renders nothing on a Vercel preview host", () => {
    setHost("fluitplanner-abc123.vercel.app");
    const { container } = render(<PasskeyButton mode="signin" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the browser has no WebAuthn", () => {
    setHost("localhost:3000");
    delete (window as unknown as { PublicKeyCredential?: unknown })
      .PublicKeyCredential;

    const { container } = render(<PasskeyButton mode="signin" />);

    expect(container).toBeEmptyDOMElement();
  });
});
