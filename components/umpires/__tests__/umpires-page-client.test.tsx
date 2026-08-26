import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UmpiresPageClient } from "../umpires-page-client";
import type { RosteredUmpire } from "@/lib/types/domain";

vi.mock("@/lib/actions/umpires", () => ({
  getUmpires: vi.fn(),
  createUmpire: vi.fn(),
  updateUmpire: vi.fn(),
  updateUmpireNotes: vi.fn(),
  deleteUmpire: vi.fn(),
  deleteUmpires: vi.fn(),
}));

import { createUmpire, getUmpires } from "@/lib/actions/umpires";
const mockCreateUmpire = vi.mocked(createUmpire);
const mockGetUmpires = vi.mocked(getUmpires);

const umpire: RosteredUmpire = {
  id: "u-1",
  auth_user_id: null,
  name: "Jan de Vries",
  email: "jan@example.com",
  level: 2,
  notes: "Father of a player in D1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUmpires.mockResolvedValue([umpire]);
  mockCreateUmpire.mockResolvedValue(umpire);
});

describe("UmpiresPageClient add dialog", () => {
  it("starts blank each time it is reopened", async () => {
    // A note is confidential to the umpire it was written about, so it must
    // never be left sitting in the form for the next umpire added.
    const user = userEvent.setup();
    render(<UmpiresPageClient initialUmpires={[umpire]} />);

    await user.click(screen.getByRole("button", { name: "Add Umpire" }));
    await user.type(screen.getByLabelText("Name"), "Nieuwe Scheids");
    await user.type(screen.getByLabelText("Email"), "nieuw@example.com");
    await user.type(
      screen.getByLabelText("Notes"),
      "Not yet ready for this team level",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(mockCreateUmpire).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Add Umpire" }));

    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByLabelText("Notes")).toHaveValue("");
  });
});
