import { screen } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect } from "vitest";
import { SlotPreview } from "@/components/polls/slot-preview";
import type { TimeSlot } from "@/lib/types/domain";

describe("SlotPreview", () => {
  it("renders time slots with formatted times", () => {
    const slots: TimeSlot[] = [
      {
        start: new Date("2026-02-15T10:45:00"),
        end: new Date("2026-02-15T12:45:00"),
      },
      {
        start: new Date("2026-02-16T14:00:00"),
        end: new Date("2026-02-16T16:00:00"),
      },
    ];

    render(<SlotPreview slots={slots} />);

    expect(screen.getByText(/10:45/)).toBeInTheDocument();
    expect(screen.getByText(/12:45/)).toBeInTheDocument();
    expect(screen.getByText(/14:00/)).toBeInTheDocument();
    expect(screen.getByText(/16:00/)).toBeInTheDocument();
  });

  it("shows message when no slots", () => {
    render(<SlotPreview slots={[]} />);
    expect(
      screen.getByText(/select matches to see time slots/i),
    ).toBeInTheDocument();
  });
});
