import { screen, fireEvent } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import type { DateRange } from "react-day-picker";

describe("DateRangePicker", () => {
  const defaultRange: DateRange = {
    from: new Date(2026, 1, 15), // Feb 15
    to: new Date(2026, 3, 15), // Apr 15
  };
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a button with the date range text", () => {
    render(<DateRangePicker value={defaultRange} onChange={onChange} />);
    const button = screen.getByRole("button", { name: /date range/i });
    expect(button).toBeInTheDocument();
    // Should display formatted date range
    expect(button).toHaveTextContent(/feb/i);
    expect(button).toHaveTextContent(/apr/i);
  });

  it("opens a popover when clicked", async () => {
    render(<DateRangePicker value={defaultRange} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /date range/i }));
    // Preset buttons should be visible
    expect(
      screen.getByRole("button", { name: /this week/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
  });

  it("calls onChange with undefined range when 'All matches' is clicked", async () => {
    render(<DateRangePicker value={defaultRange} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /date range/i }));
    fireEvent.click(screen.getByRole("button", { name: /^all$/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("shows 'All matches' text when value is undefined", () => {
    render(<DateRangePicker value={undefined} onChange={onChange} />);
    const button = screen.getByRole("button", { name: /date range/i });
    expect(button).toHaveTextContent(/^all$/i);
  });
});
