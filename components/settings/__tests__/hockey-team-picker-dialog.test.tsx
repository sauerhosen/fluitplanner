import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HockeyTeamPickerDialog } from "../hockey-team-picker-dialog";

vi.mock("@/lib/actions/hockey-teams", () => ({
  searchClubs: vi.fn(),
  getClubTeams: vi.fn(),
  trackTeam: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  searchClubs,
  getClubTeams,
  trackTeam,
} from "@/lib/actions/hockey-teams";

const mockSearchClubs = vi.mocked(searchClubs);
const mockGetClubTeams = vi.mocked(getClubTeams);
const mockTrackTeam = vi.mocked(trackTeam);

const TEAM = {
  teamId: 774,
  name: "VVV D3",
  hockeyType: "VE",
  recentPouleId: 180863,
  tracked: false,
};

async function browseToTeams() {
  fireEvent.change(screen.getByPlaceholderText(/search clubs/i), {
    target: { value: "vvv" },
  });
  fireEvent.click(await screen.findByText("Amstelveen"));
  await screen.findByRole("button", { name: /^Track$/ });
}

describe("HockeyTeamPickerDialog", () => {
  const onTracked = vi.fn();
  const onOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchClubs.mockResolvedValue([
      { id: "VVV", name: "VVV", city: "Amstelveen" },
    ]);
    mockGetClubTeams.mockResolvedValue([TEAM]);
    mockTrackTeam.mockResolvedValue({ id: "tracked-1" } as never);
  });

  it("tracks a team and marks it as tracked", async () => {
    render(
      <HockeyTeamPickerDialog
        open={true}
        onOpenChange={onOpenChange}
        onTracked={onTracked}
      />,
    );
    await browseToTeams();

    fireEvent.click(screen.getByRole("button", { name: /^Track$/ }));

    await waitFor(() =>
      expect(mockTrackTeam).toHaveBeenCalledWith({
        clubId: "VVV",
        clubName: "VVV",
        teamId: 774,
        teamName: "VVV D3",
        hockeyType: "VE",
        recentPouleId: 180863,
      }),
    );
    expect(await screen.findByText("Tracked")).toBeInTheDocument();
    expect(onTracked).toHaveBeenCalled();
  });

  it("starts clean when reopened, so an untrack behind it is not masked", async () => {
    const { rerender } = render(
      <HockeyTeamPickerDialog
        open={true}
        onOpenChange={onOpenChange}
        onTracked={onTracked}
      />,
    );
    await browseToTeams();
    fireEvent.click(screen.getByRole("button", { name: /^Track$/ }));
    await screen.findByText("Tracked");

    rerender(
      <HockeyTeamPickerDialog
        open={false}
        onOpenChange={onOpenChange}
        onTracked={onTracked}
      />,
    );
    rerender(
      <HockeyTeamPickerDialog
        open={true}
        onOpenChange={onOpenChange}
        onTracked={onTracked}
      />,
    );

    // The search starts over, and the team offers Track again rather than
    // remembering a tracking the planner may since have undone.
    expect(screen.getByPlaceholderText(/search clubs/i)).toHaveValue("");
    await browseToTeams();
    expect(screen.getByRole("button", { name: /^Track$/ })).toBeInTheDocument();
    expect(screen.queryByText("Tracked")).not.toBeInTheDocument();
  });
});
