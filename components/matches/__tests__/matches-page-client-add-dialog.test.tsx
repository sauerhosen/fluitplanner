import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MatchesPageClient } from "../matches-page-client";
import type { ManagedTeam } from "@/lib/types/domain";

/**
 * Kept apart from matches-page-client.test.tsx, which stubs MatchFormDialog
 * out — this spec needs the real form to reach its fields.
 */
vi.mock("@/lib/actions/matches", () => ({
  getMatches: vi.fn(),
  createMatch: vi.fn(),
  updateMatch: vi.fn(),
  updateMatchNotes: vi.fn(),
}));

vi.mock("../upload-zone", () => ({
  UploadZone: () => <div data-testid="upload-zone" />,
}));

vi.mock("../match-table", () => ({
  MatchTable: () => <div data-testid="match-table" />,
}));

import { createMatch, getMatches } from "@/lib/actions/matches";
const mockCreateMatch = vi.mocked(createMatch);
const mockGetMatches = vi.mocked(getMatches);

const managedTeams: ManagedTeam[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMatches.mockResolvedValue([]);
  mockCreateMatch.mockResolvedValue({ id: "m-1" } as never);
});

describe("MatchesPageClient add dialog", () => {
  it("starts blank each time it is reopened", async () => {
    // A note is internal to the match it was written about, so it must never
    // be left sitting in the form for the next match added.
    const user = userEvent.setup();
    render(
      <MatchesPageClient
        initialMatches={[]}
        managedTeams={managedTeams}
        polls={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add match/i }));

    await user.type(screen.getByLabelText("Date"), "2026-09-27");
    await user.type(screen.getByLabelText("Home Team"), "VVV D1");
    await user.type(screen.getByLabelText("Away Team"), "AMVJ D1");
    await user.type(screen.getByLabelText("Notes"), "Don't assign Y");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(mockCreateMatch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /add match/i }));

    expect(screen.getByLabelText("Home Team")).toHaveValue("");
    expect(screen.getByLabelText("Away Team")).toHaveValue("");
    expect(screen.getByLabelText("Notes")).toHaveValue("");
  });
});
