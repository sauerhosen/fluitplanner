import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  PasskeySettings,
  type PasskeyInfo,
} from "@/components/account/passkey-settings";

const deletePasskey = vi.fn();
const refresh = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      passkey: { delete: (...args: unknown[]) => deletePasskey(...args) },
      signInWithPasskey: vi.fn(),
      registerPasskey: vi.fn(),
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

const PASSKEYS: PasskeyInfo[] = [
  {
    id: "pk-1",
    friendly_name: "Work laptop",
    created_at: "2026-08-01T10:00:00Z",
  },
  { id: "pk-2", created_at: "2026-08-02T10:00:00Z" },
];

const ORIGINAL_LOCATION = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_DOMAIN = "fluiten.org";
  (window as unknown as { PublicKeyCredential: unknown }).PublicKeyCredential =
    class {};
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      host: "localhost:3000",
      hostname: "localhost",
      pathname: "/protected/account",
      protocol: "http:",
      origin: "http://localhost:3000",
      href: "http://localhost:3000/protected/account",
      assign: vi.fn(),
      replace: vi.fn(),
    },
  });
  deletePasskey.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
  delete (window as unknown as { PublicKeyCredential?: unknown })
    .PublicKeyCredential;
});

describe("PasskeySettings", () => {
  it("lists the enrolled passkeys, naming the unnamed one", () => {
    render(<PasskeySettings passkeys={PASSKEYS} />);

    expect(screen.getByText("Work laptop")).toBeTruthy();
    expect(screen.getByText("Passkey")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("says so when there are none", () => {
    render(<PasskeySettings passkeys={[]} />);

    expect(screen.getByText("You have no passkeys yet.")).toBeTruthy();
  });

  // Removing a sign-in method is worth a deliberate second step.
  it("asks for confirmation before removing", async () => {
    render(<PasskeySettings passkeys={PASSKEYS} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Work laptop" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Remove this passkey?" }),
    ).toBeTruthy();
    expect(deletePasskey).not.toHaveBeenCalled();
  });

  it("removes the chosen passkey and re-reads the list", async () => {
    render(<PasskeySettings passkeys={PASSKEYS} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Work laptop" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(deletePasskey).toHaveBeenCalledWith({ passkeyId: "pk-1" }),
    );
    // The list is server-rendered, so it has to be re-fetched, not patched.
    expect(refresh).toHaveBeenCalled();
  });

  it("cancelling removes nothing", async () => {
    render(<PasskeySettings passkeys={PASSKEYS} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Work laptop" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deletePasskey).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports a failure instead of pretending it worked", async () => {
    deletePasskey.mockResolvedValue({
      data: null,
      error: new Error("nope"),
    });
    render(<PasskeySettings passkeys={PASSKEYS} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Work laptop" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });
});
