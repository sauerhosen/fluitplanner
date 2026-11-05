import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import type { PollDetail } from "@/lib/actions/polls";
import type { RosteredUmpire } from "@/lib/types/domain";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/actions/polls", () => ({
  getPoll: vi.fn(),
  updatePollTitle: vi.fn(),
  updatePollMatches: vi.fn(),
  togglePollStatus: vi.fn(),
  deletePoll: vi.fn(),
}));

vi.mock("@/lib/actions/assignments", () => ({
  getUmpiresForPoll: vi.fn(async () => []),
  createAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  updateAssignmentStatus: vi.fn(),
}));

vi.mock("@/lib/actions/poll-responses", () => ({
  updatePollResponse: vi.fn(async () => ({})),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/lib/actions/hidden-matches", () => ({
  setPollMatchesHidden: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/actions/closed-days", () => ({
  setPollDayClosed: vi.fn(async () => ({ ok: true })),
}));

import { PollDetailClient } from "@/components/polls/poll-detail-client";
import { getPoll } from "@/lib/actions/polls";
import { createAssignment, getUmpiresForPoll } from "@/lib/actions/assignments";
import { setPollMatchesHidden } from "@/lib/actions/hidden-matches";
import { setPollDayClosed } from "@/lib/actions/closed-days";
import { matchColumnDefaults } from "@/__tests__/helpers/fixtures";

function umpire(id: string, name: string): RosteredUmpire {
  return {
    id,
    name,
    auth_user_id: null,
    email: `${id}@example.com`,
    level: 1,
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    notes: null,
  };
}

const ALICE = umpire("umpire-1", "Alice");
const BOB = umpire("umpire-2", "Bob");

const POLL: PollDetail = {
  id: "poll-1",
  title: "March",
  token: "tok",
  status: "open",
  created_by: "user-1",
  created_at: "2026-03-01T00:00:00Z",
  organization_id: "org-1",
  matches: [],
  slots: [
    {
      id: "slot-1",
      poll_id: "poll-1",
      start_time: "2026-03-01T10:00:00Z",
      end_time: "2026-03-01T12:00:00Z",
    },
  ],
  responses: [
    {
      id: "resp-1",
      poll_id: "poll-1",
      slot_id: "slot-1",
      participant_name: "Alice",
      response: "yes",
      umpire_id: ALICE.id,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    },
  ],
  assignments: [],
  featuredMatchIds: [],
  hiddenMatchIds: [],
  closedDays: [],
};

describe("PollDetailClient answering for a new respondent", () => {
  // The page opens on the next two weeks; pin "today" next to the fixture's
  // match so it stays inside that window. Only Date is faked, so user-event's
  // timers keep running.
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-02-27T12:00:00Z"),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps answers entered after the first save across a view switch", async () => {
    // The first answer for Bob brings him onto the respondent list. A second
    // answer entered while that refresh is in flight must survive it.
    let resolveUmpires: (u: RosteredUmpire[]) => void = () => {};
    vi.mocked(getUmpiresForPoll).mockImplementationOnce(
      () => new Promise((resolve) => (resolveUmpires = resolve)),
    );
    // A stale poll snapshot, if anything refetched it, would drop Bob.
    vi.mocked(getPoll).mockResolvedValue(POLL);

    const user = userEvent.setup();
    render(
      <PollDetailClient
        initialPoll={POLL}
        availableMatches={[]}
        umpires={[ALICE]}
        roster={[ALICE, BOB]}
      />,
    );

    await user.click(screen.getByTestId("view-responses"));
    await user.click(screen.getByTestId("add-respondent-menu"));
    await user.click(screen.getByRole("menuitem", { name: "Bob" }));

    // no response → yes (saved, starts the refresh) → if need be
    await user.click(screen.getByRole("button", { name: /bob/i }));
    await waitFor(() => expect(getUmpiresForPoll).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /bob/i }));
    resolveUmpires([ALICE, BOB]);

    await user.click(screen.getByTestId("back-to-assignments"));
    await user.click(screen.getByTestId("view-responses"));

    expect(
      screen.getByRole("button", { name: /bob.*if need be/i }),
    ).toBeInTheDocument();
    expect(getPoll).not.toHaveBeenCalled();
  });
});

describe("PollDetailClient hiding a match", () => {
  const MATCH = {
    ...matchColumnDefaults,
    id: "m1",
    date: "2026-03-01",
    start_time: "2026-03-01T10:30:00Z",
    home_team: "Home",
    away_team: "Away",
    competition: null,
    venue: null,
    field: null,
    notes: null,
    required_level: 1,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    organization_id: "org-1",
  } as PollDetail["matches"][number];

  const withBooking = (status: "confirmed" | "tentative"): PollDetail => ({
    ...POLL,
    matches: [MATCH],
    assignments: [
      {
        id: "a1",
        poll_id: "poll-1",
        match_id: "m1",
        umpire_id: ALICE.id,
        status,
        created_at: "2026-03-01T00:00:00Z",
      } as PollDetail["assignments"][number],
    ],
  });

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-02-27T12:00:00Z"),
    });
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function renderPoll(poll: PollDetail) {
    render(
      <PollDetailClient
        initialPoll={poll}
        availableMatches={[]}
        umpires={[ALICE]}
        roster={[ALICE]}
      />,
    );
  }

  it("asks before hiding a match with a confirmed umpire, and stops on no", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPoll(withBooking("confirmed"));

    await userEvent.click(screen.getByTestId("hide-m1"));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringMatching(/confirmed umpire/),
    );
    expect(setPollMatchesHidden).not.toHaveBeenCalled();
    expect(screen.getByTestId("hide-m1")).toBeInTheDocument();
  });

  it("hides it once the planner agrees", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPoll(withBooking("confirmed"));

    await userEvent.click(screen.getByTestId("hide-m1"));

    expect(setPollMatchesHidden).toHaveBeenCalledWith("poll-1", ["m1"], true);
    expect(screen.getByTestId("hidden-matches-marker")).toBeInTheDocument();
  });

  it("hides a match with only a tentative umpire without asking", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    renderPoll(withBooking("tentative"));

    await userEvent.click(screen.getByTestId("hide-m1"));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(setPollMatchesHidden).toHaveBeenCalledWith("poll-1", ["m1"], true);
  });

  it("reads the stored state back when a hide fails", async () => {
    vi.mocked(setPollMatchesHidden).mockResolvedValueOnce({
      ok: false,
      reason: "not_in_poll",
    });
    vi.mocked(getPoll).mockResolvedValue({ ...POLL, matches: [MATCH] });
    renderPoll({ ...POLL, matches: [MATCH] });

    await userEvent.click(screen.getByTestId("hide-m1"));

    await waitFor(() => expect(getPoll).toHaveBeenCalledWith("poll-1"));
    expect(await screen.findByTestId("hide-m1")).toBeInTheDocument();
    expect(
      screen.queryByTestId("hidden-matches-marker"),
    ).not.toBeInTheDocument();
  });

  it("drops a match another editor removed when a hide is refused", async () => {
    vi.mocked(setPollMatchesHidden).mockResolvedValueOnce({
      ok: false,
      reason: "not_in_poll",
    });
    vi.mocked(getPoll).mockResolvedValue({ ...POLL, matches: [] });
    renderPoll({ ...POLL, matches: [MATCH] });

    await userEvent.click(screen.getByTestId("hide-m1"));

    await waitFor(() =>
      expect(screen.queryByTestId("hide-m1")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("hidden-matches-marker"),
    ).not.toBeInTheDocument();
  });
});

describe("PollDetailClient hiding umpires who have not answered", () => {
  const MATCH = {
    ...matchColumnDefaults,
    id: "m1",
    date: "2026-03-01",
    start_time: "2026-03-01T10:30:00Z",
    home_team: "Home",
    away_team: "Away",
    competition: null,
    venue: null,
    field: null,
    notes: null,
    required_level: 1,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    organization_id: "org-1",
  } as PollDetail["matches"][number];

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-02-27T12:00:00Z"),
    });
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("toggles the rows of umpires with no answer on the days shown", async () => {
    const user = userEvent.setup();
    render(
      <PollDetailClient
        initialPoll={{ ...POLL, matches: [MATCH] }}
        availableMatches={[]}
        umpires={[ALICE, BOB]}
        roster={[ALICE, BOB]}
      />,
    );

    expect(screen.getByTestId("cell-m1-umpire-2")).toBeInTheDocument();

    await user.click(screen.getByTestId("umpire-filter-menu"));
    const toggle = screen.getByTestId("hide-silent-umpires-toggle");
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("cell-m1-umpire-2")).not.toBeInTheDocument();
    expect(screen.getByTestId("cell-m1-umpire-1")).toBeInTheDocument();
    expect(screen.getByTestId("active-umpire-filter")).toHaveTextContent(
      "Responders only",
    );

    await user.click(toggle);
    expect(screen.getByTestId("cell-m1-umpire-2")).toBeInTheDocument();
  });

  it("narrows the grid to several picked umpires, with a chip for each", async () => {
    const CAROL = umpire("umpire-3", "Carol");
    const user = userEvent.setup();
    render(
      <PollDetailClient
        initialPoll={{ ...POLL, matches: [MATCH] }}
        availableMatches={[]}
        umpires={[ALICE, BOB, CAROL]}
        roster={[ALICE, BOB, CAROL]}
      />,
    );

    await user.click(screen.getByTestId("umpire-filter-menu"));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Alice" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Carol" }));
    await user.keyboard("{Escape}");

    expect(screen.getByTestId("cell-m1-umpire-1")).toBeInTheDocument();
    expect(screen.getByTestId("cell-m1-umpire-3")).toBeInTheDocument();
    expect(screen.queryByTestId("cell-m1-umpire-2")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("active-umpire-filter")).toHaveLength(2);

    await user.click(
      screen.getByRole("button", { name: "Remove filter: Alice" }),
    );
    expect(screen.queryByTestId("cell-m1-umpire-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("cell-m1-umpire-3")).toBeInTheDocument();
  });

  it("keeps a silent umpire's row after their appointment is cleared", async () => {
    const user = userEvent.setup();
    render(
      <PollDetailClient
        initialPoll={{
          ...POLL,
          matches: [MATCH],
          assignments: [
            {
              id: "a1",
              poll_id: "poll-1",
              match_id: "m1",
              umpire_id: BOB.id,
              created_at: "2026-02-01T00:00:00Z",
              organization_id: "org-1",
              status: "confirmed",
            },
          ],
        }}
        availableMatches={[]}
        umpires={[ALICE, BOB]}
        roster={[ALICE, BOB]}
      />,
    );

    await user.click(screen.getByTestId("umpire-filter-menu"));
    await user.click(screen.getByTestId("hide-silent-umpires-toggle"));
    await user.keyboard("{Escape}");
    const cell = screen.getByTestId("cell-m1-umpire-2");
    await user.click(cell);

    // The row stays, so the planner can click the cell again to undo.
    expect(screen.getByTestId("cell-m1-umpire-2")).toBeInTheDocument();
  });

  it("says nobody answered the days shown rather than that nobody answered", async () => {
    const user = userEvent.setup();
    render(
      <PollDetailClient
        initialPoll={{ ...POLL, matches: [MATCH] }}
        availableMatches={[]}
        umpires={[BOB]}
        roster={[ALICE, BOB]}
      />,
    );

    await user.click(screen.getByTestId("umpire-filter-menu"));
    await user.click(screen.getByTestId("hide-silent-umpires-toggle"));
    await user.keyboard("{Escape}");

    expect(screen.getByTestId("no-responders-in-range")).toBeInTheDocument();

    // The grid and its corner filter are gone, so the toolbar chip is the way
    // back out.
    await user.click(screen.getByRole("button", { name: "Remove filter" }));
    expect(screen.getByTestId("cell-m1-umpire-2")).toBeInTheDocument();
  });
});

describe("PollDetailClient views", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-02-27T12:00:00Z"),
    });
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens on the grid and reaches the side views from the counts by the title", async () => {
    const user = userEvent.setup();
    render(
      <PollDetailClient
        initialPoll={POLL}
        availableMatches={[]}
        umpires={[ALICE]}
        roster={[ALICE]}
      />,
    );

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByTestId("view-matches")).toHaveTextContent("0 matches");
    expect(screen.getByTestId("view-responses")).toHaveTextContent(
      "1 response",
    );

    await user.click(screen.getByTestId("view-matches"));
    expect(screen.getByTestId("view-matches")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /edit matches/i })).toBeVisible();

    // Clicking the open view again goes back to the grid.
    await user.click(screen.getByTestId("view-matches"));
    expect(screen.getByTestId("tentative-mode-toggle")).toBeInTheDocument();
  });

  it("switches between confirmed and tentative assigning", async () => {
    const user = userEvent.setup();
    render(
      <PollDetailClient
        initialPoll={POLL}
        availableMatches={[]}
        umpires={[ALICE]}
        roster={[ALICE]}
      />,
    );

    const confirmed = screen.getByTestId("confirmed-mode-toggle");
    const tentative = screen.getByTestId("tentative-mode-toggle");
    expect(confirmed).toHaveAttribute("aria-pressed", "true");

    await user.click(tentative);
    expect(tentative).toHaveAttribute("aria-pressed", "true");
    expect(confirmed).toHaveAttribute("aria-pressed", "false");
  });
});

describe("PollDetailClient keeps the poll's assignments across the page", () => {
  const MATCH = {
    ...matchColumnDefaults,
    id: "m1",
    date: "2026-03-01",
    start_time: "2026-03-01T10:30:00Z",
    home_team: "Home",
    away_team: "Away",
    competition: null,
    venue: null,
    field: null,
    notes: null,
    required_level: 1,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    organization_id: "org-1",
  } as PollDetail["matches"][number];

  const tentativeFor = (umpireId: string) =>
    ({
      id: `a-${umpireId}`,
      poll_id: "poll-1",
      match_id: "m1",
      umpire_id: umpireId,
      status: "tentative",
      created_at: "2026-03-01T00:00:00Z",
      organization_id: "org-1",
    }) as PollDetail["assignments"][number];

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-02-27T12:00:00Z"),
    });
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("brings the grid back from a side view with the assignments made before it", async () => {
    vi.mocked(createAssignment).mockResolvedValue({
      id: "a-new",
      poll_id: "poll-1",
      match_id: "m1",
      umpire_id: ALICE.id,
      status: "confirmed",
      created_at: "2026-03-01T00:00:00Z",
      organization_id: "org-1",
    });
    const user = userEvent.setup();
    render(
      <PollDetailClient
        initialPoll={{ ...POLL, matches: [MATCH] }}
        availableMatches={[]}
        umpires={[ALICE]}
        roster={[ALICE]}
      />,
    );

    await user.click(screen.getByTestId("cell-m1-umpire-1"));
    await waitFor(() =>
      expect(screen.getByTestId("cell-m1-umpire-1")).toHaveAttribute(
        "data-status",
        "confirmed",
      ),
    );

    await user.click(screen.getByTestId("view-responses"));
    await user.click(screen.getByTestId("back-to-assignments"));

    expect(screen.getByTestId("cell-m1-umpire-1")).toHaveAttribute(
      "data-status",
      "confirmed",
    );
  });

  it("keeps the tentative count in the toolbar when a filter empties the grid", async () => {
    const user = userEvent.setup();
    render(
      <PollDetailClient
        initialPoll={{
          ...POLL,
          matches: [MATCH],
          // Alice's sketch counts poll-wide but is not on Bob's row.
          assignments: [tentativeFor(ALICE.id)],
        }}
        availableMatches={[]}
        umpires={[BOB]}
        roster={[ALICE, BOB]}
      />,
    );

    expect(screen.getByTestId("tentative-summary")).toHaveTextContent("1");

    await user.click(screen.getByTestId("umpire-filter-menu"));
    await user.click(screen.getByTestId("hide-silent-umpires-toggle"));
    await user.keyboard("{Escape}");

    // Bob never answered, so the filter leaves the grid empty.
    expect(screen.getByTestId("no-responders-in-range")).toBeInTheDocument();
    expect(screen.getByTestId("tentative-summary")).toHaveTextContent("1");
    expect(screen.getByTestId("confirm-tentative")).toBeInTheDocument();
  });

  it("leaves the poll-wide tentative count out while umpires are picked", async () => {
    const user = userEvent.setup();
    render(
      <PollDetailClient
        initialPoll={{
          ...POLL,
          matches: [MATCH],
          assignments: [tentativeFor(ALICE.id)],
        }}
        availableMatches={[]}
        umpires={[ALICE, BOB]}
        roster={[ALICE, BOB]}
      />,
    );

    await user.click(screen.getByTestId("umpire-filter-menu"));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Bob" }));
    await user.keyboard("{Escape}");

    // It counts everyone's sketches and says they are hidden from umpires —
    // not something to paste into a message to one of them.
    expect(screen.queryByTestId("tentative-summary")).not.toBeInTheDocument();
  });

  it("tells apart two picked umpires who share a name", async () => {
    const JAN_1 = umpire("jan-1", "Jan de Vries");
    const JAN_2 = umpire("jan-2", "Jan de Vries");
    const user = userEvent.setup();
    render(
      <PollDetailClient
        initialPoll={{ ...POLL, matches: [MATCH] }}
        availableMatches={[]}
        umpires={[JAN_1, JAN_2]}
        roster={[JAN_1, JAN_2]}
      />,
    );

    await user.click(screen.getByTestId("umpire-filter-menu"));
    const items = screen.getAllByRole("menuitemcheckbox", {
      name: "Jan de Vries",
    });
    await user.click(items[0]);
    await user.click(items[1]);
    await user.keyboard("{Escape}");

    const removes = screen.getAllByRole("button", {
      name: "Remove filter: Jan de Vries",
    });
    expect(removes).toHaveLength(2);
    await user.click(removes[1]);

    expect(screen.getByTestId("cell-m1-jan-1")).toBeInTheDocument();
    expect(screen.queryByTestId("cell-m1-jan-2")).not.toBeInTheDocument();
  });
});

describe("PollDetailClient closing a day", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-02-27T12:00:00Z"),
    });
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderMatchesView(poll: PollDetail = POLL) {
    const user = userEvent.setup();
    render(
      <PollDetailClient
        initialPoll={poll}
        availableMatches={[]}
        umpires={[ALICE]}
      />,
    );
    return user;
  }

  it("closes a day from the match view", async () => {
    const user = renderMatchesView();
    await user.click(screen.getByTestId("view-matches"));
    await user.click(screen.getByTestId("toggle-day-closed-2026-03-01"));

    expect(setPollDayClosed).toHaveBeenCalledWith("poll-1", "2026-03-01", true);
    expect(screen.getByTestId("day-2026-03-01")).toHaveAttribute(
      "data-closed",
      "true",
    );
    expect(
      screen.getByTestId("toggle-day-closed-2026-03-01"),
    ).toHaveTextContent("Reopen day");
  });

  it("reopens a closed day", async () => {
    const user = renderMatchesView({ ...POLL, closedDays: ["2026-03-01"] });
    await user.click(screen.getByTestId("view-matches"));
    expect(screen.getByText("Closed")).toBeInTheDocument();

    await user.click(screen.getByTestId("toggle-day-closed-2026-03-01"));

    expect(setPollDayClosed).toHaveBeenCalledWith(
      "poll-1",
      "2026-03-01",
      false,
    );
    expect(screen.getByTestId("day-2026-03-01")).not.toHaveAttribute(
      "data-closed",
    );
  });

  it("reads the stored state back when the write fails", async () => {
    vi.mocked(setPollDayClosed).mockRejectedValueOnce(new Error("boom"));
    vi.mocked(getPoll).mockResolvedValueOnce(POLL);

    const user = renderMatchesView();
    await user.click(screen.getByTestId("view-matches"));
    await user.click(screen.getByTestId("toggle-day-closed-2026-03-01"));

    await waitFor(() =>
      expect(screen.getByTestId("day-2026-03-01")).not.toHaveAttribute(
        "data-closed",
      ),
    );
  });
});
