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

import { PollDetailClient } from "@/components/polls/poll-detail-client";
import { getPoll } from "@/lib/actions/polls";
import { getUmpiresForPoll } from "@/lib/actions/assignments";
import { setPollMatchesHidden } from "@/lib/actions/hidden-matches";
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

  it("keeps answers entered after the first save across a tab switch", async () => {
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

    await user.click(screen.getByRole("tab", { name: /responses/i }));
    await user.click(screen.getByTestId("add-respondent-menu"));
    await user.click(screen.getByRole("menuitem", { name: "Bob" }));

    // no response → yes (saved, starts the refresh) → if need be
    await user.click(screen.getByRole("button", { name: /bob/i }));
    await waitFor(() => expect(getUmpiresForPoll).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /bob/i }));
    resolveUmpires([ALICE, BOB]);

    await user.click(screen.getByRole("tab", { name: /assignments/i }));
    await user.click(screen.getByRole("tab", { name: /responses/i }));

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
});
