import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PollActionButtons } from "../poll-action-buttons";
import type { MatchWithPoll } from "@/lib/actions/matches";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/lib/actions/polls", () => ({
  createPoll: vi.fn(),
  addMatchesToPoll: vi.fn(),
  removeMatchesFromPolls: vi.fn(),
}));

import {
  createPoll,
  addMatchesToPoll,
  removeMatchesFromPolls,
} from "@/lib/actions/polls";

const mockCreatePoll = vi.mocked(createPoll);
const mockAddMatchesToPoll = vi.mocked(addMatchesToPoll);
const mockRemoveMatchesFromPolls = vi.mocked(removeMatchesFromPolls);

const matchBase: Omit<MatchWithPoll, "id" | "poll"> = {
  date: "2026-02-15",
  start_time: "2026-02-15T14:00:00Z",
  home_team: "Team A",
  away_team: "Team B",
  venue: "Field 1",
  field: "1",
  competition: null,
  required_level: 1,
  created_by: "user-1",
  created_at: "2026-01-01",
  organization_id: "org-1",
};

const matchWithPoll: MatchWithPoll = {
  ...matchBase,
  id: "m1",
  poll: { id: "poll-1", title: "Weekend Poll" },
};

const matchWithoutPoll: MatchWithPoll = {
  ...matchBase,
  id: "m2",
  poll: null,
};

const polls = [
  { id: "poll-1", title: "Weekend Poll", status: "open" },
  { id: "poll-2", title: "Midweek Poll", status: "open" },
  { id: "poll-3", title: "Old Poll", status: "closed" },
];

function renderButtons({
  selectedIds = new Set(["m1", "m2"]),
  matches = [matchWithPoll, matchWithoutPoll],
  onComplete = vi.fn(),
  clearSelection = vi.fn(),
}: {
  selectedIds?: Set<string>;
  matches?: MatchWithPoll[];
  onComplete?: () => void;
  clearSelection?: () => void;
} = {}) {
  return render(
    <PollActionButtons
      selectedIds={selectedIds}
      matches={matches}
      polls={polls}
      onComplete={onComplete}
      clearSelection={clearSelection}
    />,
  );
}

/** Opens the "Add to poll" dialog and clicks the Select combobox to open it */
async function openAddDialogAndSelect(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(screen.getByText("Add to poll"));
  await user.click(screen.getByRole("combobox"));
}

describe("PollActionButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreatePoll.mockResolvedValue({
      id: "new-poll",
      title: "New",
      token: "abc",
      status: "open",
      created_by: "user-1",
      created_at: "2026-01-01",
      organization_id: "org-1",
    });
    mockAddMatchesToPoll.mockResolvedValue(undefined);
    mockRemoveMatchesFromPolls.mockResolvedValue(undefined);
  });

  it("renders both action buttons", () => {
    renderButtons();
    expect(screen.getByText("Add to poll")).toBeInTheDocument();
    expect(screen.getByText("Remove from poll")).toBeInTheDocument();
  });

  it("disables remove button when no selected matches are in a poll", () => {
    renderButtons({
      selectedIds: new Set(["m2"]),
      matches: [matchWithoutPoll],
    });
    const removeBtn = screen.getByText("Remove from poll").closest("button");
    expect(removeBtn).toBeDisabled();
  });

  it("enables remove button when selected matches have a poll", () => {
    renderButtons({
      selectedIds: new Set(["m1"]),
      matches: [matchWithPoll],
    });
    const removeBtn = screen.getByText("Remove from poll").closest("button");
    expect(removeBtn).not.toBeDisabled();
  });

  describe("Add to Poll dialog", () => {
    it("opens dialog when add button is clicked", async () => {
      const user = userEvent.setup();
      renderButtons();

      await user.click(screen.getByText("Add to poll"));
      expect(screen.getByText("Add to Poll")).toBeInTheDocument();
      expect(screen.getByText("Add 2 matches to a poll.")).toBeInTheDocument();
    });

    it("shows only open polls in the dropdown", async () => {
      const user = userEvent.setup();
      renderButtons();

      await openAddDialogAndSelect(user);

      // Should show open polls and create new option
      const listbox = screen.getByRole("listbox");
      expect(within(listbox).getByText("Create new poll")).toBeInTheDocument();
      expect(within(listbox).getByText("Weekend Poll")).toBeInTheDocument();
      expect(within(listbox).getByText("Midweek Poll")).toBeInTheDocument();
      // Closed poll should not appear
      expect(within(listbox).queryByText("Old Poll")).not.toBeInTheDocument();
    });

    it("shows title input when create new poll is selected", async () => {
      const user = userEvent.setup();
      renderButtons();

      await openAddDialogAndSelect(user);
      await user.click(screen.getByText("Create new poll"));

      expect(screen.getByLabelText("Poll title")).toBeInTheDocument();
    });

    it("calls createPoll when new poll is submitted", async () => {
      const user = userEvent.setup();
      const onComplete = vi.fn();
      const clearSelection = vi.fn();
      renderButtons({ onComplete, clearSelection });

      await openAddDialogAndSelect(user);
      await user.click(screen.getByText("Create new poll"));

      await user.type(screen.getByLabelText("Poll title"), "My New Poll");
      await user.click(screen.getByText("Create poll"));

      await waitFor(() => {
        expect(mockCreatePoll).toHaveBeenCalledWith("My New Poll", [
          "m1",
          "m2",
        ]);
      });
      await waitFor(() => expect(clearSelection).toHaveBeenCalled());
      await waitFor(() => expect(onComplete).toHaveBeenCalled());
    });

    it("calls addMatchesToPoll when existing poll is selected", async () => {
      const user = userEvent.setup();
      const onComplete = vi.fn();
      const clearSelection = vi.fn();
      renderButtons({ onComplete, clearSelection });

      await openAddDialogAndSelect(user);
      await user.click(screen.getByText("Midweek Poll"));

      // After selecting a poll, the dialog footer has the submit button
      await user.click(screen.getByRole("button", { name: "Add to poll" }));

      await waitFor(() => {
        expect(mockAddMatchesToPoll).toHaveBeenCalledWith("poll-2", [
          "m1",
          "m2",
        ]);
      });
      await waitFor(() => expect(clearSelection).toHaveBeenCalled());
      await waitFor(() => expect(onComplete).toHaveBeenCalled());
    });

    it("shows error toast when createPoll fails", async () => {
      mockCreatePoll.mockRejectedValue(new Error("fail"));
      const user = userEvent.setup();
      renderButtons();

      await openAddDialogAndSelect(user);
      await user.click(screen.getByText("Create new poll"));
      await user.type(screen.getByLabelText("Poll title"), "Test");
      await user.click(screen.getByText("Create poll"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Failed to create poll");
      });
    });

    it("shows error toast when addMatchesToPoll fails", async () => {
      mockAddMatchesToPoll.mockRejectedValue(new Error("fail"));
      const user = userEvent.setup();
      renderButtons();

      await openAddDialogAndSelect(user);
      await user.click(screen.getByText("Midweek Poll"));
      await user.click(screen.getByRole("button", { name: "Add to poll" }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Failed to add matches to poll",
        );
      });
    });
  });

  describe("Remove from Poll dialog", () => {
    it("shows confirmation dialog when remove button is clicked", async () => {
      const user = userEvent.setup();
      renderButtons({ selectedIds: new Set(["m1"]) });

      await user.click(screen.getByText("Remove from poll"));
      expect(screen.getByText("Remove from Poll")).toBeInTheDocument();
      expect(
        screen.getByText(/Remove 1 match from 1 poll\?/),
      ).toBeInTheDocument();
    });

    it("shows keep empty polls checkbox", async () => {
      const user = userEvent.setup();
      renderButtons({ selectedIds: new Set(["m1"]) });

      await user.click(screen.getByText("Remove from poll"));
      expect(
        screen.getByLabelText("Keep polls with no remaining matches"),
      ).toBeInTheDocument();
    });

    it("shows delete warning when keep checkbox is unchecked", async () => {
      const user = userEvent.setup();
      renderButtons({ selectedIds: new Set(["m1"]) });

      await user.click(screen.getByText("Remove from poll"));
      expect(
        screen.getByText("Polls left with no matches will be deleted."),
      ).toBeInTheDocument();
    });

    it("calls removeMatchesFromPolls when confirmed", async () => {
      const user = userEvent.setup();
      const onComplete = vi.fn();
      const clearSelection = vi.fn();
      renderButtons({
        selectedIds: new Set(["m1"]),
        onComplete,
        clearSelection,
      });

      await user.click(screen.getByText("Remove from poll"));
      const dialog = screen.getByRole("alertdialog");
      await user.click(
        within(dialog).getByRole("button", { name: "Remove from poll" }),
      );

      await waitFor(() => {
        expect(mockRemoveMatchesFromPolls).toHaveBeenCalledWith(["m1"], false);
      });
      await waitFor(() => expect(clearSelection).toHaveBeenCalled());
      await waitFor(() => expect(onComplete).toHaveBeenCalled());
    });

    it("passes keepEmptyPolls=true when checkbox is checked", async () => {
      const user = userEvent.setup();
      renderButtons({ selectedIds: new Set(["m1"]) });

      await user.click(screen.getByText("Remove from poll"));
      const dialog = screen.getByRole("alertdialog");
      await user.click(
        screen.getByLabelText("Keep polls with no remaining matches"),
      );

      await user.click(
        within(dialog).getByRole("button", { name: "Remove from poll" }),
      );

      await waitFor(() => {
        expect(mockRemoveMatchesFromPolls).toHaveBeenCalledWith(["m1"], true);
      });
    });

    it("shows error toast when removeMatchesFromPolls fails", async () => {
      mockRemoveMatchesFromPolls.mockRejectedValue(new Error("fail"));
      const user = userEvent.setup();
      renderButtons({ selectedIds: new Set(["m1"]) });

      await user.click(screen.getByText("Remove from poll"));
      const dialog = screen.getByRole("alertdialog");
      await user.click(
        within(dialog).getByRole("button", { name: "Remove from poll" }),
      );

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Failed to remove matches from poll",
        );
      });
    });
  });
});
