import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MatchFormDialog } from "../match-form";
import type { Match } from "@/lib/types/domain";
import { matchColumnDefaults } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/actions/matches", () => ({
  createMatch: vi.fn(),
  updateMatch: vi.fn(),
}));

import { createMatch, updateMatch } from "@/lib/actions/matches";
const mockCreateMatch = vi.mocked(createMatch);
const mockUpdateMatch = vi.mocked(updateMatch);

const match: Match = {
  ...matchColumnDefaults,
  id: "m1",
  date: "2026-03-15",
  start_time: "2026-03-15T11:00:00Z",
  home_team: "HC Amsterdam",
  away_team: "HC Rotterdam",
  competition: null,
  venue: "Wagener",
  field: "1",
  notes: "Umpire X would like to be assigned",
  required_level: 2,
  created_by: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  organization_id: "test-org-id",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateMatch.mockResolvedValue(match);
  mockUpdateMatch.mockResolvedValue(match);
});

describe("MatchFormDialog notes", () => {
  it("omits notes when the field was not touched, so a note edited elsewhere survives", async () => {
    const user = userEvent.setup();
    render(
      <MatchFormDialog
        match={match}
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    // Edit an unrelated field and save.
    await user.clear(screen.getByLabelText("Venue"));
    await user.type(screen.getByLabelText("Venue"), "Nieuwe Locatie");
    await user.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => expect(mockUpdateMatch).toHaveBeenCalled());
    const payload = mockUpdateMatch.mock.calls[0][1];
    expect(payload).not.toHaveProperty("notes");
    expect(payload).toMatchObject({ venue: "Nieuwe Locatie" });
  });

  it("sends notes when the field was edited", async () => {
    const user = userEvent.setup();
    render(
      <MatchFormDialog
        match={match}
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("Notes"));
    await user.type(screen.getByLabelText("Notes"), "Don't assign Y");
    await user.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => expect(mockUpdateMatch).toHaveBeenCalled());
    expect(mockUpdateMatch.mock.calls[0][1]).toMatchObject({
      notes: "Don't assign Y",
    });
  });

  it("always sends notes when creating a match", async () => {
    const user = userEvent.setup();
    render(
      <MatchFormDialog
        match={null}
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Date"), "2026-03-15");
    await user.type(screen.getByLabelText("Home Team"), "HC A");
    await user.type(screen.getByLabelText("Away Team"), "HC B");
    await user.type(screen.getByLabelText("Notes"), "New note");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(mockCreateMatch).toHaveBeenCalled());
    expect(mockCreateMatch.mock.calls[0][0]).toMatchObject({
      notes: "New note",
    });
  });
});
