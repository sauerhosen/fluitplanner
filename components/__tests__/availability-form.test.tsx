import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AvailabilityForm } from "@/components/poll-response/availability-form";
import type { PollSlot, AvailabilityResponse } from "@/lib/types/domain";

vi.mock("@/lib/actions/public-polls", () => ({
  submitResponses: vi.fn(),
}));

import { submitResponses } from "@/lib/actions/public-polls";

const mockSubmit = vi.mocked(submitResponses);

const slots: PollSlot[] = [
  {
    id: "slot-1",
    poll_id: "poll-1",
    start_time: "2026-02-15T10:00:00Z",
    end_time: "2026-02-15T12:00:00Z",
  },
  {
    id: "slot-2",
    poll_id: "poll-1",
    start_time: "2026-02-15T14:00:00Z",
    end_time: "2026-02-15T16:00:00Z",
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
    const saveBtn = screen.getByRole("button", { name: "Save availability" });
    expect(saveBtn).toBeDisabled();
  });

  it("save button enables after selecting a response", () => {
    render(<AvailabilityForm {...defaultProps} />);
    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    fireEvent.click(yesButtons[0]);
    const saveBtn = screen.getByRole("button", { name: "Save availability" });
    expect(saveBtn).not.toBeDisabled();
  });

  it("submits selected responses", async () => {
    mockSubmit.mockResolvedValue(undefined);
    render(<AvailabilityForm {...defaultProps} />);

    // Select Yes for slot 1
    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    fireEvent.click(yesButtons[0]);

    // Select No for slot 2
    const noButtons = screen.getAllByRole("button", { name: "No" });
    fireEvent.click(noButtons[1]);

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith("poll-1", "ump-1", "Jan", [
        { slotId: "slot-1", response: "yes" },
        { slotId: "slot-2", response: "no" },
      ]);
    });
  });

  it("shows success message after save", async () => {
    mockSubmit.mockResolvedValue(undefined);
    render(<AvailabilityForm {...defaultProps} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Yes" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));

    await waitFor(() => {
      expect(screen.getByText("Poll is closed")).toBeTruthy();
    });
  });

  it("pre-fills from existing responses", () => {
    const existing: AvailabilityResponse[] = [
      {
        id: "resp-1",
        poll_id: "poll-1",
        slot_id: "slot-1",
        participant_name: "Jan",
        response: "if_need_be",
        umpire_id: "ump-1",
        created_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-02-01T00:00:00Z",
      },
    ];

    render(<AvailabilityForm {...defaultProps} existingResponses={existing} />);

    // Save button should be enabled since there's a pre-filled response
    const saveBtn = screen.getByRole("button", { name: /save/i });
    expect(saveBtn).not.toBeDisabled();
  });

  it("changes button text to Save changes after successful save", async () => {
    mockSubmit.mockResolvedValue(undefined);
    render(<AvailabilityForm {...defaultProps} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Yes" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    });
  });
});
