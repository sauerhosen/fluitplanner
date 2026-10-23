import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { ResponseSummary } from "@/components/polls/response-summary";
import type { PollSlot, AvailabilityResponse } from "@/lib/types/domain";

// Mock server action
vi.mock("@/lib/actions/poll-responses", () => ({
  updatePollResponse: vi.fn(async () => ({})),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { updatePollResponse } from "@/lib/actions/poll-responses";
import { toast } from "sonner";

const SLOTS: PollSlot[] = [
  {
    id: "slot-1",
    poll_id: "poll-1",
    start_time: "2026-03-01T10:00:00Z",
    end_time: "2026-03-01T12:00:00Z",
  },
];

const RESPONSES: AvailabilityResponse[] = [
  {
    id: "resp-1",
    poll_id: "poll-1",
    slot_id: "slot-1",
    participant_name: "Alice",
    response: "yes",
    umpire_id: "umpire-1",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  },
];

describe("ResponseSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders response cells as buttons", () => {
    render(
      <ResponseSummary slots={SLOTS} responses={RESPONSES} pollId="poll-1" />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("cycles yes → if_need_be on click", async () => {
    render(
      <ResponseSummary slots={SLOTS} responses={RESPONSES} pollId="poll-1" />,
    );
    // Find button by aria-label containing "Alice"
    const button = screen.getByRole("button", { name: /alice/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(updatePollResponse).toHaveBeenCalledWith(
        "poll-1",
        "slot-1",
        "umpire-1",
        "if_need_be",
      );
    });
  });

  it("cycles no → null (none) on click", async () => {
    const responses: AvailabilityResponse[] = [
      { ...RESPONSES[0], response: "no" },
    ];
    render(
      <ResponseSummary slots={SLOTS} responses={responses} pollId="poll-1" />,
    );
    const button = screen.getByRole("button", { name: /alice/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(updatePollResponse).toHaveBeenCalledWith(
        "poll-1",
        "slot-1",
        "umpire-1",
        null,
      );
    });
  });

  it("shows toast on server error", async () => {
    vi.mocked(updatePollResponse).mockResolvedValueOnce({
      error: "Something failed",
    });
    render(
      <ResponseSummary slots={SLOTS} responses={RESPONSES} pollId="poll-1" />,
    );
    const button = screen.getByRole("button", { name: /alice/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Something failed"),
      );
    });
  });

  it("shows empty state when no responses", () => {
    render(<ResponseSummary slots={SLOTS} responses={[]} pollId="poll-1" />);
    expect(screen.getByText(/no responses yet/i)).toBeInTheDocument();
  });
});

const ROSTER = [
  { id: "umpire-1", name: "Alice" },
  { id: "umpire-2", name: "Bob" },
  { id: "umpire-3", name: "Carol" },
];

describe("ResponseSummary adding an umpire who has not answered", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers only rostered umpires without a row yet", async () => {
    const user = userEvent.setup();
    render(
      <ResponseSummary
        slots={SLOTS}
        responses={RESPONSES}
        roster={ROSTER}
        pollId="poll-1"
      />,
    );

    await user.click(screen.getByTestId("add-respondent-menu"));

    expect(screen.getByRole("menuitem", { name: "Bob" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Carol" })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Alice" }),
    ).not.toBeInTheDocument();
  });

  it("adds an empty row whose cells record an answer for that umpire", async () => {
    const user = userEvent.setup();
    const onResponseSaved = vi.fn();
    render(
      <ResponseSummary
        slots={SLOTS}
        responses={RESPONSES}
        roster={ROSTER}
        pollId="poll-1"
        onResponseSaved={onResponseSaved}
      />,
    );

    await user.click(screen.getByTestId("add-respondent-menu"));
    await user.click(screen.getByRole("menuitem", { name: "Bob" }));

    const cell = screen.getByRole("button", { name: /bob.*no response/i });
    await user.click(cell);

    await waitFor(() => {
      expect(updatePollResponse).toHaveBeenCalledWith(
        "poll-1",
        "slot-1",
        "umpire-2",
        "yes",
      );
      expect(onResponseSaved).toHaveBeenCalledWith("umpire-2");
    });
  });

  it("offers the picker on an empty poll too", async () => {
    const user = userEvent.setup();
    render(
      <ResponseSummary
        slots={SLOTS}
        responses={[]}
        roster={ROSTER}
        pollId="poll-1"
      />,
    );

    expect(screen.getByText(/no responses yet/i)).toBeInTheDocument();
    await user.click(screen.getByTestId("add-respondent-menu"));
    await user.click(screen.getByRole("menuitem", { name: "Carol" }));

    expect(
      screen.getByRole("button", { name: /carol.*no response/i }),
    ).toBeInTheDocument();
  });
});

describe("ResponseSummary fed live responses by its parent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The poll page passes back every optimistic edit as the `responses` prop,
  // the way PollDetailClient's handleResponseChange does.
  function LiveHarness({ initial }: { initial: AvailabilityResponse[] }) {
    const [responses, setResponses] = useState(initial);
    return (
      <ResponseSummary
        slots={SLOTS}
        responses={responses}
        pollId="poll-1"
        onResponseChange={(slotId, umpireId, response) =>
          setResponses((prev) => {
            const rest = prev.filter(
              (r) => !(r.slot_id === slotId && r.umpire_id === umpireId),
            );
            if (response === null) return rest;
            return [...rest, { ...initial[0], slot_id: slotId, response }];
          })
        }
      />
    );
  }

  it("keeps a respondent's row when their last answer is cleared", async () => {
    const user = userEvent.setup();
    render(<LiveHarness initial={[{ ...RESPONSES[0], response: "no" }]} />);

    await user.click(screen.getByRole("button", { name: /alice/i }));

    const cell = screen.getByRole("button", { name: /alice.*no response/i });
    await user.click(cell);
    await waitFor(() => {
      expect(updatePollResponse).toHaveBeenLastCalledWith(
        "poll-1",
        "slot-1",
        "umpire-1",
        "yes",
      );
    });
  });
});

describe("ResponseSummary as a viewer", () => {
  it("shows every response as a reading rather than a button", () => {
    render(
      <ResponseSummary slots={SLOTS} responses={RESPONSES} pollId="poll-1" />,
      { role: "viewer" },
    );

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    const cell = screen.getByRole("img", { name: /alice/i });
    expect(cell).toHaveAccessibleName(/available/i);

    fireEvent.click(cell);
    expect(updatePollResponse).not.toHaveBeenCalled();
  });

  it("does not offer to add an umpire", () => {
    render(
      <ResponseSummary
        slots={SLOTS}
        responses={RESPONSES}
        roster={ROSTER}
        pollId="poll-1"
      />,
      { role: "viewer" },
    );

    expect(screen.queryByTestId("add-respondent-menu")).not.toBeInTheDocument();
  });
});
