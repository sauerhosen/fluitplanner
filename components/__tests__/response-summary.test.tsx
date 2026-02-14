import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
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
