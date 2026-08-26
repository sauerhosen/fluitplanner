import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MatchTable } from "../match-table";
import type { MatchWithPoll } from "@/lib/actions/matches";
import { matchSyncDefaults } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/actions/matches", () => ({
  deleteMatch: vi.fn(),
  deleteMatches: vi.fn(),
  updateMatchNotes: vi.fn(),
}));

vi.mock("@/lib/actions/hockey-sync", () => ({
  clearMatchReviewFlags: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), warning: vi.fn() },
}));

import { updateMatchNotes } from "@/lib/actions/matches";
const mockUpdateMatchNotes = vi.mocked(updateMatchNotes);

const matches: MatchWithPoll[] = [
  {
    ...matchSyncDefaults,
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
    poll: null,
  },
  {
    ...matchSyncDefaults,
    id: "m2",
    date: "2026-03-15",
    start_time: "2026-03-15T14:30:00Z",
    home_team: "HC Utrecht",
    away_team: "HC Den Bosch",
    competition: null,
    venue: "Galgenwaard",
    field: "2",
    notes: null,
    required_level: 1,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    organization_id: "test-org-id",
    poll: null,
  },
];

function renderTable(onDeleted = vi.fn()) {
  return render(
    <MatchTable matches={matches} onEdit={vi.fn()} onDeleted={onDeleted} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateMatchNotes.mockResolvedValue({ id: "m2" } as never);
});

describe("MatchTable notes column", () => {
  it("renders a Notes column header", () => {
    renderTable();
    expect(
      screen.getByRole("columnheader", { name: "Notes" }),
    ).toBeInTheDocument();
  });

  it("surfaces an existing note through the row's note control", () => {
    renderTable();
    expect(
      screen.getByRole("button", {
        name: "Umpire X would like to be assigned",
      }),
    ).toBeInTheDocument();
  });

  it("offers an add-note control on matches without a note", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    renderTable(onDeleted);

    await user.click(screen.getByRole("button", { name: /add a note/i }));
    await user.type(screen.getByRole("textbox"), "Don't assign Y");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(mockUpdateMatchNotes).toHaveBeenCalledWith("m2", "Don't assign Y"),
    );
    // The table refetches so the saved note shows up on the next render.
    expect(onDeleted).toHaveBeenCalled();
  });
});
