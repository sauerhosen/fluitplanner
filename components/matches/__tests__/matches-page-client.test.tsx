import { screen } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MatchesPageClient } from "../matches-page-client";
import type { MatchWithPoll } from "@/lib/actions/matches";
import type { ManagedTeam } from "@/lib/types/domain";

vi.mock("@/lib/actions/matches", () => ({
  getMatches: vi.fn().mockResolvedValue([]),
}));

vi.mock("../upload-zone", () => ({
  UploadZone: () => <div data-testid="upload-zone" />,
}));

vi.mock("../match-table", () => ({
  MatchTable: ({ matches }: { matches: MatchWithPoll[] }) => (
    <div data-testid="match-table">{matches.length} matches</div>
  ),
}));

vi.mock("../match-form", () => ({
  MatchFormDialog: () => null,
}));

import { getMatches } from "@/lib/actions/matches";
const mockGetMatches = vi.mocked(getMatches);

const managedTeams: ManagedTeam[] = [];
const polls: { id: string; title: string | null }[] = [];

describe("MatchesPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMatches.mockResolvedValue([]);
  });

  it("renders the date range picker", () => {
    render(
      <MatchesPageClient
        initialMatches={[]}
        managedTeams={managedTeams}
        polls={polls}
      />,
    );
    expect(
      screen.getByRole("button", { name: /date range/i }),
    ).toBeInTheDocument();
  });

  it("initializes with default date range filters", () => {
    render(
      <MatchesPageClient
        initialMatches={[]}
        managedTeams={managedTeams}
        polls={polls}
      />,
    );
    // The component sets a default date range (today → today+2mo)
    // which should be reflected in the button text (not "All matches")
    const button = screen.getByRole("button", { name: /date range/i });
    expect(button).not.toHaveTextContent(/all matches/i);
  });

  it("renders the poll filter dropdown", () => {
    render(
      <MatchesPageClient
        initialMatches={[]}
        managedTeams={managedTeams}
        polls={[{ id: "poll-1", title: "Weekend Feb 15" }]}
      />,
    );
    expect(screen.getByText("All polls")).toBeInTheDocument();
  });
});
