import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MatchCenterImportDialog } from "../match-center-import-dialog";

vi.mock("@/lib/actions/hockey-teams", () => ({
  searchClubs: vi.fn(),
  getClubTeams: vi.fn(),
}));

vi.mock("@/lib/actions/hockey-import", () => ({
  getTeamFixtures: vi.fn(),
  importTeamFixtures: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { searchClubs, getClubTeams } from "@/lib/actions/hockey-teams";
import {
  getTeamFixtures,
  importTeamFixtures,
} from "@/lib/actions/hockey-import";
import { toast } from "sonner";

const mockSearchClubs = vi.mocked(searchClubs);
const mockGetClubTeams = vi.mocked(getClubTeams);
const mockGetTeamFixtures = vi.mocked(getTeamFixtures);
const mockImportTeamFixtures = vi.mocked(importTeamFixtures);

const FIXTURE = {
  matchId: 2079156,
  date: "2099-09-27",
  start: "2099-09-27T12:45:00+02:00",
  timeConfirmed: true,
  homeTeam: "VVV D3",
  awayTeam: "AMVJ D3",
  competition: "3e klasse D",
  venue: "Sportpark Kees Boekelaan",
  field: "Veld 2",
  alreadyImported: false,
};

/** Walk the dialog from the club search to a team's fixture list. */
async function openTeam() {
  fireEvent.change(screen.getByPlaceholderText(/search clubs/i), {
    target: { value: "vvv" },
  });
  await screen.findByText("Amstelveen");
  fireEvent.click(screen.getByRole("button", { name: /VVV/ }));
  fireEvent.click(await screen.findByRole("button", { name: "VVV D3" }));
}

describe("MatchCenterImportDialog", () => {
  const onImported = vi.fn();
  const onOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchClubs.mockResolvedValue([
      { id: "VVV", name: "VVV", city: "Amstelveen" },
    ]);
    mockGetClubTeams.mockResolvedValue([
      {
        teamId: 774,
        name: "VVV D3",
        hockeyType: "VE",
        recentPouleId: 180863,
        tracked: false,
      },
    ]);
    mockGetTeamFixtures.mockResolvedValue([FIXTURE]);
    mockImportTeamFixtures.mockResolvedValue({
      imported: 1,
      updated: 0,
      skipped: 0,
      errors: [],
    });
  });

  function renderDialog() {
    render(
      <MatchCenterImportDialog
        open={true}
        onOpenChange={onOpenChange}
        onImported={onImported}
      />,
    );
  }

  it("imports the fixtures the planner ticks", async () => {
    renderDialog();
    await openTeam();

    expect(await screen.findByText("VVV D3 – AMVJ D3")).toBeInTheDocument();
    expect(mockGetTeamFixtures).toHaveBeenCalledWith({
      clubId: "VVV",
      teamId: 774,
    });

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /import 1 match/i }));

    await waitFor(() => {
      expect(mockImportTeamFixtures).toHaveBeenCalledWith({
        clubId: "VVV",
        teamId: 774,
        matchIds: [2079156],
      });
    });
    expect(onImported).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the import button disabled until something is selected", async () => {
    renderDialog();
    await openTeam();
    await screen.findByText("VVV D3 – AMVJ D3");

    expect(screen.getByRole("button", { name: /^import$/i })).toBeDisabled();
  });

  it("cannot re-import a fixture the club already has", async () => {
    mockGetTeamFixtures.mockResolvedValue([
      { ...FIXTURE, alreadyImported: true },
    ]);
    renderDialog();
    await openTeam();
    await screen.findByText("VVV D3 – AMVJ D3");

    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByText(/already added/)).toBeInTheDocument();
  });

  it("marks a fixture whose kick-off time is not set yet", async () => {
    mockGetTeamFixtures.mockResolvedValue([
      { ...FIXTURE, start: null, timeConfirmed: false },
    ]);
    renderDialog();
    await openTeam();

    expect(await screen.findByText(/time TBD/)).toBeInTheDocument();
  });

  it("reports an upstream failure and returns to the team list", async () => {
    mockGetTeamFixtures.mockRejectedValue(new Error("digest"));
    renderDialog();
    await openTeam();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(
      await screen.findByRole("button", { name: "VVV D3" }),
    ).toBeInTheDocument();
  });

  it("says so when the team has no upcoming home matches", async () => {
    mockGetTeamFixtures.mockResolvedValue([]);
    renderDialog();
    await openTeam();

    expect(
      await screen.findByText(/no upcoming home matches/i),
    ).toBeInTheDocument();
  });
});
