import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlotRow } from "@/components/poll-response/slot-row";

describe("SlotRow", () => {
  const defaultProps = {
    startTime: "2026-02-15T10:45:00Z",
    endTime: "2026-02-15T12:45:00Z",
    value: null as "yes" | "if_need_be" | "no" | null,
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders date and time", () => {
    render(<SlotRow {...defaultProps} />);
    expect(screen.getByText(/feb/i)).toBeTruthy();
  });

  it("renders three buttons", () => {
    render(<SlotRow {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Yes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "If need be" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No" })).toBeTruthy();
  });

  it("calls onChange when Yes clicked", () => {
    render(<SlotRow {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(defaultProps.onChange).toHaveBeenCalledWith("yes");
  });

  it("calls onChange with if_need_be when If need be clicked", () => {
    render(<SlotRow {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "If need be" }));
    expect(defaultProps.onChange).toHaveBeenCalledWith("if_need_be");
  });

  it("calls onChange with no when No clicked", () => {
    render(<SlotRow {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(defaultProps.onChange).toHaveBeenCalledWith("no");
  });
});
