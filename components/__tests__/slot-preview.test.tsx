import { screen } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect } from "vitest";
import { SlotPreview } from "@/components/polls/slot-preview";
import type { TimeSlot } from "@/lib/types/domain";

describe("SlotPreview", () => {
  it("renders time slots with formatted times", () => {
    // Use explicit UTC timestamps — the test render helper formats in Europe/Amsterdam (UTC+1 in winter)
    const slots: TimeSlot[] = [
      {
        start: new Date("2026-02-15T09:45:00Z"),
        end: new Date("2026-02-15T11:45:00Z"),
      },
      {
        start: new Date("2026-02-16T13:00:00Z"),
        end: new Date("2026-02-16T15:00:00Z"),
      },
    ];

    render(<SlotPreview slots={slots} />);

    // Displayed in Europe/Amsterdam: UTC+1
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
