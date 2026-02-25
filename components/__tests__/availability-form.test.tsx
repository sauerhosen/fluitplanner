import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AvailabilityForm } from "@/components/poll-response/availability-form";
import type {
  PollSlot,
  AvailabilityResponse,
  PollAssignmentContext,
} from "@/lib/types/domain";

vi.mock("@/lib/actions/public-polls", () => ({
  submitResponses: vi.fn(),
}));

import { submitResponses } from "@/lib/actions/public-polls";

const mockSubmit = vi.mocked(submitResponses);

const slots: PollSlot[] = [
  {
    id: "slot-1",
    poll_id: "poll-1",
    start_time: "2030-02-15T10:00:00Z",
    end_time: "2030-02-15T12:00:00Z",
  },
  {
    id: "slot-2",
    poll_id: "poll-1",
    start_time: "2030-02-15T14:00:00Z",
    end_time: "2030-02-15T16:00:00Z",
  },
];

const defaultProps = {
  pollId: "poll-1",
  umpireId: "ump-1",
  umpireName: "Jan",
  slots,
  existingResponses: [] as AvailabilityResponse[],
};

describe("AvailabilityForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a slot row for each slot", () => {
    render(<AvailabilityForm {...defaultProps} />);
    // Each slot renders 3 buttons (Yes, If need be, No)
    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    expect(yesButtons).toHaveLength(2);
  });

  it("save button is disabled when no selections made", () => {
    render(<AvailabilityForm {...defaultProps} />);
    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    expect(saveBtn).toBeDisabled();
  });

  it("save button enables after selecting a response", () => {
    render(<AvailabilityForm {...defaultProps} />);
    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    fireEvent.click(yesButtons[0]);
    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    expect(saveBtn).not.toBeDisabled();
  });

  it("submits selected responses", async () => {
    mockSubmit.mockResolvedValue({ status: "saved" });
    render(<AvailabilityForm {...defaultProps} />);

    // Select Yes for slot 1
    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    fireEvent.click(yesButtons[0]);

    // Select No for slot 2
    const noButtons = screen.getAllByRole("button", { name: "No" });
    fireEvent.click(noButtons[1]);

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith("poll-1", "ump-1", "Jan", [
        { slotId: "slot-1", response: "yes" },
        { slotId: "slot-2", response: "no" },
      ]);
    });
  });

  it("shows success message after save", async () => {
    mockSubmit.mockResolvedValue({ status: "saved" });
    render(<AvailabilityForm {...defaultProps} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Yes" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(
        screen.getByText("Your availability has been saved!"),
      ).toBeTruthy();
    });
  });

  it("shows error message on submit failure", async () => {
    mockSubmit.mockRejectedValue(new Error("Poll is closed"));
    render(<AvailabilityForm {...defaultProps} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Yes" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.getByText("Poll is closed")).toBeTruthy();
    });
  });

  it("pre-fills from existing responses and bar is hidden when clean", () => {
    const existing: AvailabilityResponse[] = [
      {
        id: "resp-1",
        poll_id: "poll-1",
        slot_id: "slot-1",
        participant_name: "Jan",
        response: "if_need_be",
        umpire_id: "ump-1",
        created_at: "2030-02-01T00:00:00Z",
        updated_at: "2030-02-01T00:00:00Z",
      },
    ];

    render(<AvailabilityForm {...defaultProps} existingResponses={existing} />);

    // Bar should be hidden when responses match baseline
    const bar = screen.getByRole("status");
    expect(bar.className).toContain("translate-y-full");
  });

  it("bar is hidden initially with no selections", () => {
    render(<AvailabilityForm {...defaultProps} />);
    const bar = screen.getByRole("status");
    expect(bar.className).toContain("translate-y-full");
  });

  it("bar appears when user makes a change", () => {
    render(<AvailabilityForm {...defaultProps} />);
    const bar = screen.getByRole("status");
    expect(bar.className).toContain("translate-y-full");

    fireEvent.click(screen.getAllByRole("button", { name: "Yes" })[0]);

    expect(bar.className).not.toContain("translate-y-full");
    expect(screen.getByText("You have unsaved changes")).toBeTruthy();
  });

  it("bar hides when user reverts change back to baseline", () => {
    render(<AvailabilityForm {...defaultProps} />);
    const yesButtons = screen.getAllByRole("button", { name: "Yes" });

    // Select (dirty)
    fireEvent.click(yesButtons[0]);
    const bar = screen.getByRole("status");
    expect(bar.className).not.toContain("translate-y-full");

    // Deselect (back to baseline)
    fireEvent.click(yesButtons[0]);
    expect(bar.className).toContain("translate-y-full");
  });

  it("returning user: bar appears when changing an existing response", () => {
    const existing: AvailabilityResponse[] = [
      {
        id: "resp-1",
        poll_id: "poll-1",
        slot_id: "slot-1",
        participant_name: "Jan",
        response: "yes",
        umpire_id: "ump-1",
        created_at: "2030-02-01T00:00:00Z",
        updated_at: "2030-02-01T00:00:00Z",
      },
    ];

    render(<AvailabilityForm {...defaultProps} existingResponses={existing} />);
    const bar = screen.getByRole("status");

    // Initially clean
    expect(bar.className).toContain("translate-y-full");

    // Change slot-1 from yes to no
    fireEvent.click(screen.getAllByRole("button", { name: "No" })[0]);
    expect(bar.className).not.toContain("translate-y-full");
  });

  it("shows retry button when save fails", async () => {
    mockSubmit.mockRejectedValue(new Error("Poll is closed"));
    render(<AvailabilityForm {...defaultProps} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Yes" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
      expect(screen.getByText("Poll is closed")).toBeTruthy();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Past / future partitioning                                         */
/* ------------------------------------------------------------------ */

// Fixed time: 2026-02-16T12:00:00Z
const NOW = new Date("2026-02-16T12:00:00Z");

const pastSlot1: PollSlot = {
  id: "past-1",
  poll_id: "poll-1",
  start_time: "2026-02-14T10:00:00Z",
  end_time: "2026-02-14T12:00:00Z",
};

const pastSlot2: PollSlot = {
  id: "past-2",
  poll_id: "poll-1",
  start_time: "2026-02-15T14:00:00Z",
  end_time: "2026-02-15T16:00:00Z",
};

const futureSlot1: PollSlot = {
  id: "future-1",
  poll_id: "poll-1",
  start_time: "2026-02-17T10:00:00Z",
  end_time: "2026-02-17T12:00:00Z",
};

const futureSlot2: PollSlot = {
  id: "future-2",
  poll_id: "poll-1",
  start_time: "2026-02-18T14:00:00Z",
  end_time: "2026-02-18T16:00:00Z",
};

const pastFutureProps = {
  pollId: "poll-1",
  umpireId: "ump-1",
  umpireName: "Jan",
  existingResponses: [] as AvailabilityResponse[],
};

describe("AvailabilityForm – past/future partitioning", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders only future slots when all slots are in the future", () => {
    render(
      <AvailabilityForm
        {...pastFutureProps}
        slots={[futureSlot1, futureSlot2]}
      />,
    );

    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    expect(yesButtons).toHaveLength(2);

    // No past dates toggle
    expect(screen.queryByText(/past date/i)).toBeNull();
  });

  it("shows 'all dates in past' message when all slots are past", () => {
    render(
      <AvailabilityForm {...pastFutureProps} slots={[pastSlot1, pastSlot2]} />,
    );

    expect(
      screen.getByText(
        "All dates in this poll have passed. Your previous responses are shown below.",
      ),
    ).toBeTruthy();

    // All buttons should be disabled
    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    for (const btn of yesButtons) {
      expect(btn).toBeDisabled();
    }
  });

  it("does not show save bar when all slots are past", () => {
    render(
      <AvailabilityForm {...pastFutureProps} slots={[pastSlot1, pastSlot2]} />,
    );

    expect(screen.queryByText("Save changes")).toBeNull();
    expect(screen.queryByText("You have unsaved changes")).toBeNull();
  });

  it("shows past dates toggle when there are both past and future slots", () => {
    render(
      <AvailabilityForm
        {...pastFutureProps}
        slots={[pastSlot1, pastSlot2, futureSlot1]}
      />,
    );

    // Only future slots visible initially
    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    expect(yesButtons).toHaveLength(1);
    expect(yesButtons[0]).not.toBeDisabled();

    // Past dates toggle visible
    expect(screen.getByText("2 past dates")).toBeTruthy();
  });

  it("reveals past slots as disabled when toggle is clicked", () => {
    render(
      <AvailabilityForm
        {...pastFutureProps}
        slots={[pastSlot1, futureSlot1]}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Yes" })).toHaveLength(1);

    fireEvent.click(screen.getByText("1 past date"));

    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    expect(yesButtons).toHaveLength(2);
    // Future slot = enabled, past slot = disabled
    expect(yesButtons[0]).not.toBeDisabled();
    expect(yesButtons[1]).toBeDisabled();
  });

  it("shows existing responses on read-only past slots", () => {
    const existingResponses: AvailabilityResponse[] = [
      {
        id: "resp-1",
        poll_id: "poll-1",
        slot_id: "past-1",
        participant_name: "Jan",
        response: "yes",
        umpire_id: "ump-1",
        created_at: "2026-02-13T00:00:00Z",
        updated_at: "2026-02-13T00:00:00Z",
      },
    ];

    render(
      <AvailabilityForm
        {...pastFutureProps}
        slots={[pastSlot1, futureSlot1]}
        existingResponses={existingResponses}
      />,
    );

    fireEvent.click(screen.getByText("1 past date"));

    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    expect(yesButtons).toHaveLength(2);
    expect(yesButtons[1]).toBeDisabled();
  });

  it("does not include past slot responses in submission", async () => {
    mockSubmit.mockResolvedValue({ status: "saved" });

    const existingResponses: AvailabilityResponse[] = [
      {
        id: "resp-1",
        poll_id: "poll-1",
        slot_id: "past-1",
        participant_name: "Jan",
        response: "no",
        umpire_id: "ump-1",
        created_at: "2026-02-13T00:00:00Z",
        updated_at: "2026-02-13T00:00:00Z",
      },
    ];

    render(
      <AvailabilityForm
        {...pastFutureProps}
        slots={[pastSlot1, futureSlot1]}
        existingResponses={existingResponses}
      />,
    );

    // Click "Yes" on the future slot
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith("poll-1", "ump-1", "Jan", [
        { slotId: "future-1", response: "yes" },
      ]);
    });
  });

  it("uses singular form for 1 past date", () => {
    render(
      <AvailabilityForm
        {...pastFutureProps}
        slots={[pastSlot1, futureSlot1]}
      />,
    );

    expect(screen.getByText("1 past date")).toBeTruthy();
  });

  it("uses plural form for multiple past dates", () => {
    render(
      <AvailabilityForm
        {...pastFutureProps}
        slots={[pastSlot1, pastSlot2, futureSlot1]}
      />,
    );

    expect(screen.getByText("2 past dates")).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  Warn / Lock mode behavior                                          */
/* ------------------------------------------------------------------ */

describe("AvailabilityForm – warn mode", () => {
  const assignmentContext: PollAssignmentContext = {
    lockMode: "warn",
    assignedSlots: [
      {
        slotId: "slot-1",
        matches: [{ matchId: "m1", homeTeam: "Team A", awayTeam: "Team B" }],
      },
    ],
  };

  const existingYes: AvailabilityResponse[] = [
    {
      id: "resp-1",
      poll_id: "poll-1",
      slot_id: "slot-1",
      participant_name: "Jan",
      response: "yes",
      umpire_id: "ump-1",
      created_at: "2030-02-01T00:00:00Z",
      updated_at: "2030-02-01T00:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows confirmation dialog when downgrading assigned slot to no", async () => {
    render(
      <AvailabilityForm
        {...defaultProps}
        existingResponses={existingYes}
        assignmentContext={assignmentContext}
      />,
    );

    // Change slot-1 from yes to no
    fireEvent.click(screen.getAllByRole("button", { name: "No" })[0]);

    // Try to save — should show the dialog instead
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(
        screen.getByText("Changing availability for assigned matches"),
      ).toBeTruthy();
    });

    // Should list the affected match
    expect(screen.getByText("Team A vs Team B")).toBeTruthy();
    expect(
      screen.getByText("The planner will be notified of this change."),
    ).toBeTruthy();
  });

  it("submits after confirming the warning dialog", async () => {
    mockSubmit.mockResolvedValue({ status: "saved" });

    render(
      <AvailabilityForm
        {...defaultProps}
        existingResponses={existingYes}
        assignmentContext={assignmentContext}
      />,
    );

    // Change slot-1 from yes to no
    fireEvent.click(screen.getAllByRole("button", { name: "No" })[0]);

    // Try to save
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    // Wait for dialog
    await waitFor(() => {
      expect(screen.getByText("Proceed anyway")).toBeTruthy();
    });

    // Confirm
    fireEvent.click(screen.getByText("Proceed anyway"));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalled();
    });
  });

  it("shows inline warning on assigned slot when changed to no", () => {
    render(
      <AvailabilityForm
        {...defaultProps}
        existingResponses={existingYes}
        assignmentContext={assignmentContext}
      />,
    );

    // Change slot-1 from yes to no
    fireEvent.click(screen.getAllByRole("button", { name: "No" })[0]);

    // Should show the warning text inline
    expect(
      screen.getByText("You are assigned to Team A vs Team B"),
    ).toBeTruthy();
  });
});

describe("AvailabilityForm – lock mode", () => {
  const lockContext: PollAssignmentContext = {
    lockMode: "lock",
    assignedSlots: [
      {
        slotId: "slot-1",
        matches: [{ matchId: "m1", homeTeam: "Team A", awayTeam: "Team B" }],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables all buttons on locked/assigned slots", () => {
    const existingYes: AvailabilityResponse[] = [
      {
        id: "resp-1",
        poll_id: "poll-1",
        slot_id: "slot-1",
        participant_name: "Jan",
        response: "yes",
        umpire_id: "ump-1",
        created_at: "2030-02-01T00:00:00Z",
        updated_at: "2030-02-01T00:00:00Z",
      },
    ];

    render(
      <AvailabilityForm
        {...defaultProps}
        existingResponses={existingYes}
        assignmentContext={lockContext}
      />,
    );

    // Slot-1 buttons should all be disabled (locked)
    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    const noButtons = screen.getAllByRole("button", { name: "No" });
    expect(yesButtons[0]).toBeDisabled(); // slot-1: locked
    expect(noButtons[0]).toBeDisabled(); // slot-1: locked

    // Slot-2 buttons should NOT be disabled (not assigned)
    expect(yesButtons[1]).not.toBeDisabled();
    expect(noButtons[1]).not.toBeDisabled();
  });

  it("shows lock indicator text on assigned slots", () => {
    render(
      <AvailabilityForm
        {...defaultProps}
        existingResponses={[]}
        assignmentContext={lockContext}
      />,
    );

    expect(
      screen.getByText("Locked — you're assigned to a match"),
    ).toBeTruthy();
  });

  it("handles partial_saved result from server", async () => {
    mockSubmit.mockResolvedValue({
      status: "partial_saved",
      blockedSlots: [{ slotId: "slot-1", matchLabels: ["Team A vs Team B"] }],
    });

    // With lock mode, no assignment context is needed for the test
    // because the server handles the blocking
    render(
      <AvailabilityForm
        {...defaultProps}
        existingResponses={[]}
        assignmentContext={null}
      />,
    );

    // Select yes for both
    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    fireEvent.click(yesButtons[0]);
    fireEvent.click(yesButtons[1]);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalled();
    });

    // Should show partial save error
    await waitFor(() => {
      expect(screen.getByText(/Some changes were blocked/)).toBeTruthy();
    });
  });
});
