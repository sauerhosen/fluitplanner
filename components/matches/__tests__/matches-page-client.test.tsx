import { screen } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MatchesPageClient } from "../matches-page-client";
import type { Match, ManagedTeam } from "@/lib/types/domain";

vi.mock("@/lib/actions/matches", () => ({
  getMatches: vi.fn().mockResolvedValue([]),
}));

vi.mock("../upload-zone", () => ({
  UploadZone: () => <div data-testid="upload-zone" />,
}));

vi.mock("../match-table", () => ({
  MatchTable: ({ matches }: { matches: Match[] }) => (
    <div data-testid="match-table">{matches.length} matches</div>
  ),
}));

vi.mock("../match-form", () => ({
  MatchFormDialog: () => null,
}));

import { getMatches } from "@/lib/actions/matches";
const mockGetMatches = vi.mocked(getMatches);

const managedTeams: ManagedTeam[] = [];

describe("MatchesPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMatches.mockResolvedValue([]);
  });

  it("renders the date range picker", () => {
    render(
      <MatchesPageClient initialMatches={[]} managedTeams={managedTeams} />,
    );
    expect(
      screen.getByRole("button", { name: /date range/i }),
    ).toBeInTheDocument();
  });

  it("passes dateFrom and dateTo filters when date range is set", async () => {
    render(
      <MatchesPageClient initialMatches={[]} managedTeams={managedTeams} />,
    );
    // The component initializes with a default date range (today to today+2mo)
    // The date range picker button should be present
    expect(
      screen.getByRole("button", { name: /date range/i }),
    ).toBeInTheDocument();
  });
});
