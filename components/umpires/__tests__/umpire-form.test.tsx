import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UmpireFormDialog } from "../umpire-form";
import type { RosteredUmpire } from "@/lib/types/domain";

vi.mock("@/lib/actions/umpires", () => ({
  createUmpire: vi.fn(),
  updateUmpire: vi.fn(),
}));

import { createUmpire, updateUmpire } from "@/lib/actions/umpires";
const mockCreateUmpire = vi.mocked(createUmpire);
const mockUpdateUmpire = vi.mocked(updateUmpire);

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
  mockCreateUmpire.mockResolvedValue(umpire);
  mockUpdateUmpire.mockResolvedValue(umpire);
});

describe("UmpireFormDialog notes", () => {
  it("shows the existing note when editing", () => {
    render(
      <UmpireFormDialog
        umpire={umpire}
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Notes")).toHaveValue(
      "Father of a player in D1",
    );
  });

  it("omits notes when the field was not touched, so a note edited elsewhere survives", async () => {
    const user = userEvent.setup();
    render(
      <UmpireFormDialog
        umpire={umpire}
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    // Edit an unrelated field and save.
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Jan de Vries jr.");
    await user.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => expect(mockUpdateUmpire).toHaveBeenCalled());
    const payload = mockUpdateUmpire.mock.calls[0][1];
    expect(payload).not.toHaveProperty("notes");
    expect(payload).toMatchObject({ name: "Jan de Vries jr." });
  });

  it("sends notes when the field was edited", async () => {
    const user = userEvent.setup();
    render(
      <UmpireFormDialog
        umpire={umpire}
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("Notes"));
    await user.type(
      screen.getByLabelText("Notes"),
      "Not yet ready for this team level",
    );
    await user.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => expect(mockUpdateUmpire).toHaveBeenCalled());
    expect(mockUpdateUmpire.mock.calls[0][1]).toMatchObject({
      notes: "Not yet ready for this team level",
    });
  });

  it("sends a cleared note so the field can empty an existing one", async () => {
    const user = userEvent.setup();
    render(
      <UmpireFormDialog
        umpire={umpire}
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("Notes"));
    await user.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => expect(mockUpdateUmpire).toHaveBeenCalled());
    expect(mockUpdateUmpire.mock.calls[0][1]).toMatchObject({ notes: "" });
  });

  it("always sends notes when creating an umpire", async () => {
    const user = userEvent.setup();
    render(
      <UmpireFormDialog
        umpire={null}
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Name"), "Nieuwe Scheids");
    await user.type(screen.getByLabelText("Email"), "nieuw@example.com");
    await user.type(screen.getByLabelText("Notes"), "Father of a player");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(mockCreateUmpire).toHaveBeenCalled());
    expect(mockCreateUmpire.mock.calls[0][0]).toMatchObject({
      name: "Nieuwe Scheids",
      notes: "Father of a player",
    });
  });
});
