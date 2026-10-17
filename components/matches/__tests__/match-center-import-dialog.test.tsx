import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { MatchCenterImportDialog } from "../match-center-import-dialog";

vi.mock("@/lib/actions/hockey-teams", () => ({
  searchClubs: vi.fn(),
  getClubTeams: vi.fn(),
}));

vi.mock("@/lib/actions/hockey-import", () => ({
  getTeamFixtures: vi.fn(),
  importTeamFixtures: vi.fn(),
  getClubDayFixtures: vi.fn(),
  importClubDayFixtures: vi.fn(),
}));

vi.mock("@/lib/actions/matches", () => ({
  deleteMatch: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { searchClubs, getClubTeams } from "@/lib/actions/hockey-teams";
import {
  getTeamFixtures,
  importTeamFixtures,
  getClubDayFixtures,
  importClubDayFixtures,
} from "@/lib/actions/hockey-import";
import { deleteMatch } from "@/lib/actions/matches";
import { toast } from "sonner";

const mockSearchClubs = vi.mocked(searchClubs);
const mockGetClubTeams = vi.mocked(getClubTeams);
const mockGetTeamFixtures = vi.mocked(getTeamFixtures);
const mockImportTeamFixtures = vi.mocked(importTeamFixtures);
const mockGetClubDayFixtures = vi.mocked(getClubDayFixtures);
const mockImportClubDayFixtures = vi.mocked(importClubDayFixtures);
const mockDeleteMatch = vi.mocked(deleteMatch);

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
  existingMatchId: null,
};

const ADDED = { ...FIXTURE, alreadyImported: true, existingMatchId: "match-1" };

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
  const originalTz = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTz;
  });

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

  it("shows a fixture the club already has as ticked", async () => {
    mockGetTeamFixtures.mockResolvedValue([ADDED]);
    renderDialog();
    await openTeam();
    await screen.findByText("VVV D3 – AMVJ D3");

    expect(screen.getByText(/already added/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("re-reads ticked fixtures the club has, to collect a time set since", async () => {
    // Nothing else syncs this untracked team, so re-importing is how a match
    // imported before its kick-off time was set collects that time.
    mockGetTeamFixtures.mockResolvedValue([ADDED]);
    mockImportTeamFixtures.mockResolvedValue({
      imported: 0,
      updated: 1,
      skipped: 0,
      errors: [],
    });
    renderDialog();
    await openTeam();
    await screen.findByText("VVV D3 – AMVJ D3");

    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));

    await waitFor(() => {
      expect(mockImportTeamFixtures).toHaveBeenCalledWith({
        clubId: "VVV",
        teamId: 774,
        matchIds: [2079156],
      });
    });
  });

  it("counts only the new fixtures on the import button", async () => {
    mockGetTeamFixtures.mockResolvedValue([
      ADDED,
      { ...FIXTURE, matchId: 2079157, awayTeam: "HIC D3" },
    ]);
    renderDialog();
    await openTeam();
    await screen.findByText("VVV D3 – HIC D3");

    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    expect(
      screen.getByRole("button", { name: /import 1 match/i }),
    ).toBeInTheDocument();
  });

  it("asks before unticking removes a match the club has", async () => {
    mockGetTeamFixtures.mockResolvedValue([ADDED]);
    mockDeleteMatch.mockResolvedValue(undefined);
    renderDialog();
    await openTeam();
    await screen.findByText("VVV D3 – AMVJ D3");

    fireEvent.click(screen.getByRole("checkbox"));
    expect(mockDeleteMatch).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: /^remove$/i }));

    await waitFor(() =>
      expect(mockDeleteMatch).toHaveBeenCalledWith("match-1"),
    );
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(screen.queryByText(/already added/i)).not.toBeInTheDocument();
    expect(onImported).toHaveBeenCalled();
  });

  it("keeps the match when the removal is cancelled", async () => {
    mockGetTeamFixtures.mockResolvedValue([ADDED]);
    renderDialog();
    await openTeam();
    await screen.findByText("VVV D3 – AMVJ D3");

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(await screen.findByRole("button", { name: /^cancel$/i }));

    expect(mockDeleteMatch).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("keeps the fixture ticked when the removal fails", async () => {
    mockGetTeamFixtures.mockResolvedValue([ADDED]);
    mockDeleteMatch.mockRejectedValue(new Error("boom"));
    renderDialog();
    await openTeam();
    await screen.findByText("VVV D3 – AMVJ D3");

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(await screen.findByRole("button", { name: /^remove$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("shows the fixture's own date, whatever zone the viewer's browser is in", async () => {
    // A calendar date read as a local instant lands a day early east of
    // Amsterdam, which is the app's formatting zone.
    process.env.TZ = "Pacific/Auckland";
    renderDialog();
    await openTeam();

    expect(await screen.findByText(/Sun, Sep 27/)).toBeInTheDocument();
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

describe("MatchCenterImportDialog — by day", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchClubs.mockResolvedValue([
      { id: "VVV", name: "VVV", city: "Amstelveen" },
    ]);
    mockGetClubTeams.mockResolvedValue([]);
    mockGetClubDayFixtures.mockResolvedValue([FIXTURE]);
    mockImportClubDayFixtures.mockResolvedValue({
      imported: 1,
      updated: 0,
      skipped: 0,
      errors: [],
    });
  });

  async function openDayView() {
    render(
      <MatchCenterImportDialog
        open={true}
        onOpenChange={vi.fn()}
        onImported={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/search clubs/i), {
      target: { value: "vvv" },
    });
    await screen.findByText("Amstelveen");
    fireEvent.click(screen.getByRole("button", { name: /VVV/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: /all home matches on a day/i }),
    );
  }

  it("lists the club's home matches once a date is picked, and imports the ticked ones", async () => {
    await openDayView();
    expect(mockGetClubDayFixtures).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/date/i), {
      target: { value: "2099-09-27" },
    });
    expect(await screen.findByText("VVV D3 – AMVJ D3")).toBeInTheDocument();
    expect(mockGetClubDayFixtures).toHaveBeenCalledWith({
      clubId: "VVV",
      date: "2099-09-27",
    });

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /import 1 match/i }));

    await waitFor(() => {
      expect(mockImportClubDayFixtures).toHaveBeenCalledWith({
        clubId: "VVV",
        date: "2099-09-27",
        matchIds: [2079156],
      });
    });
    expect(mockImportTeamFixtures).not.toHaveBeenCalled();
  });

  it("says so when the club plays no home match that day", async () => {
    mockGetClubDayFixtures.mockResolvedValue([]);
    await openDayView();

    fireEvent.change(screen.getByLabelText(/date/i), {
      target: { value: "2099-09-28" },
    });
    expect(
      await screen.findByText(/no home matches for this club on that day/i),
    ).toBeInTheDocument();
  });
});
