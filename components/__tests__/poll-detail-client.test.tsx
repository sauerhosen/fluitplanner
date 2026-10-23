import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { PollDetailClient } from "@/components/polls/poll-detail-client";
import { getPoll } from "@/lib/actions/polls";
import { getUmpiresForPoll } from "@/lib/actions/assignments";

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
};

describe("PollDetailClient answering for a new respondent", () => {
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
