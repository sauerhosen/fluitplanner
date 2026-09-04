import { screen } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi } from "vitest";
import { MatchTable } from "@/components/matches/match-table";
import type { MatchWithPoll } from "@/lib/actions/matches";
import { matchColumnDefaults } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/actions/matches", () => ({
  deleteMatch: vi.fn(),
  deleteMatches: vi.fn().mockResolvedValue(undefined),
  updateMatchNotes: vi.fn(),
}));

vi.mock("@/lib/actions/hockey-sync", () => ({
  clearMatchReviewFlags: vi.fn(),
}));

vi.mock("@/lib/actions/featured-matches", () => ({
  setMatchFeaturedByDefault: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockMatches: MatchWithPoll[] = [
  {
    ...matchColumnDefaults,
    id: "m1",
    date: "2026-03-15",
    start_time: "2026-03-15T11:00:00Z",
    home_team: "HC Amsterdam",
    away_team: "HC Rotterdam",
    competition: "Hoofdklasse",
    venue: "Wagener",
    field: "1",
    notes: "Bring spare cards",
    required_level: 2,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    organization_id: "test-org-id",
    poll: { id: "p1", title: "Week 11" },
  },
  {
    ...matchColumnDefaults,
    id: "m2",
    date: "2026-03-15",
    start_time: "2026-03-15T14:30:00Z",
    home_team: "HC Utrecht",
    away_team: "HC Den Bosch",
    competition: "Eerste Klasse",
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

const baseProps = {
  matches: mockMatches,
  onEdit: vi.fn(),
  onDeleted: vi.fn(),
};

describe("MatchTable", () => {
  it("renders match rows", () => {
    render(<MatchTable {...baseProps} />);
    expect(screen.getByText("HC Amsterdam")).toBeInTheDocument();
    expect(screen.getByText("HC Den Bosch")).toBeInTheDocument();
  });

  it("gives a planner selection checkboxes and per-row controls", () => {
    render(<MatchTable {...baseProps} />);
    // Header + date group + 2 rows
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    // Feature star, note editor and row menu per match
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(6);
    expect(
      screen.getByRole("button", { name: /add a note/i }),
    ).toBeInTheDocument();
  });

  describe("as a viewer", () => {
    it("shows the matches without any way to change them", () => {
      render(<MatchTable {...baseProps} />, { role: "viewer" });

      expect(screen.getByText("HC Amsterdam")).toBeInTheDocument();
      expect(screen.getByText("Week 11")).toBeInTheDocument();
      expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
      expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /add a note/i }),
      ).not.toBeInTheDocument();
    });

    it("still shows an existing note, but only to read", () => {
      render(<MatchTable {...baseProps} />, { role: "viewer" });

      // The only interactive element left is the note indicator, and it
      // opens nothing.
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveAccessibleName("Bring spare cards");
    });

    it("hides the toolbar actions even with a selection callback given", () => {
      const toolbarActions = vi.fn(() => <button>Create poll</button>);
      render(<MatchTable {...baseProps} toolbarActions={toolbarActions} />, {
        role: "viewer",
      });
      expect(toolbarActions).not.toHaveBeenCalled();
    });
  });
});
