import { screen, fireEvent } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi } from "vitest";
import { MatchSelector } from "@/components/polls/match-selector";
import type { Match } from "@/lib/types/domain";

const mockMatches: Match[] = [
  {
    id: "m1",
    date: "2026-02-15",
    start_time: "2026-02-15T11:00:00Z",
    home_team: "HC Amsterdam",
    away_team: "HC Rotterdam",
    competition: "Hoofdklasse",
    venue: "Wagener",
    field: "1",
    required_level: 2,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "m2",
    date: "2026-02-15",
    start_time: "2026-02-15T14:30:00Z",
    home_team: "HC Utrecht",
    away_team: "HC Den Bosch",
    competition: "Eerste Klasse",
    venue: "Galgenwaard",
    field: "2",
    required_level: 1,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "m3",
    date: "2026-02-22",
    start_time: "2026-02-22T12:00:00Z",
    home_team: "HC Bloemendaal",
    away_team: "Kampong",
    competition: "Hoofdklasse",
    venue: "Bloemendaal",
    field: null,
    required_level: 3,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
  },
];

describe("MatchSelector", () => {
  it("renders matches grouped by date", () => {
    render(
      <MatchSelector
        matches={mockMatches}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(screen.getByText("HC Amsterdam")).toBeInTheDocument();
    expect(screen.getByText("HC Rotterdam")).toBeInTheDocument();
    expect(screen.getByText("HC Bloemendaal")).toBeInTheDocument();
  });

  it("shows checkboxes that reflect selected state", () => {
    render(
      <MatchSelector
        matches={mockMatches}
        selectedIds={["m1"]}
        onSelectionChange={vi.fn()}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("calls onSelectionChange when checkbox toggled", () => {
    const onChange = vi.fn();
    render(
      <MatchSelector
        matches={mockMatches}
        selectedIds={["m1"]}
        onSelectionChange={onChange}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    expect(onChange).toHaveBeenCalledWith(["m1", "m2"]);
  });

  it("shows empty state when no matches", () => {
    render(
      <MatchSelector
        matches={[]}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/no matches available/i)).toBeInTheDocument();
  });
});
