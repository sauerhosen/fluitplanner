import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { PollToolbarMenu } from "@/components/polls/poll-toolbar-menu";

const baseProps = {
  pollTitle: "Season poll",
  slots: [],
  matches: [],
  responses: [],
  assignments: [],
  umpires: [],
  dateRange: undefined,
  tentativeMode: false,
  focusedUmpireId: null,
};

function setup(
  overrides: Partial<React.ComponentProps<typeof PollToolbarMenu>> = {},
) {
  const onDateRangeChange = vi.fn();
  const onTentativeModeChange = vi.fn();
  const onSwapAxes = vi.fn();
  const onFocusedUmpireChange = vi.fn();
  render(
    <PollToolbarMenu
      {...baseProps}
      activeTab="assignments"
      onDateRangeChange={onDateRangeChange}
      onTentativeModeChange={onTentativeModeChange}
      onSwapAxes={onSwapAxes}
      onFocusedUmpireChange={onFocusedUmpireChange}
      {...overrides}
    />,
  );
  return {
    onDateRangeChange,
    onTentativeModeChange,
    onSwapAxes,
    onFocusedUmpireChange,
  };
}

describe("PollToolbarMenu", () => {
  beforeEach(() => {
    // Radix measures its popover; jsdom reports nothing without this.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("keeps the grid tools one tap away", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId("poll-tools-menu"));

    expect(screen.getByText("Date range")).toBeInTheDocument();
    expect(screen.getByText("Export")).toBeInTheDocument();
    expect(screen.getByText("Tentative mode")).toBeInTheDocument();
    expect(screen.getByText("Swap axes")).toBeInTheDocument();
    expect(screen.getByText("One umpire")).toBeInTheDocument();
  });

  it("names the focused umpire, so a phone can see the grid is filtered", async () => {
    const user = userEvent.setup();
    setup({
      umpires: [{ id: "u1", name: "Caroline Michels" }] as never,
      focusedUmpireId: "u1",
    });

    await user.click(screen.getByTestId("poll-tools-menu"));

    expect(screen.getByTestId("umpire-focus-menu-item")).toHaveTextContent(
      "Caroline Michels",
    );
  });

  it("leaves out the assignment tools on the other tabs", async () => {
    const user = userEvent.setup();
    setup({ activeTab: "matches" });

    await user.click(screen.getByTestId("poll-tools-menu"));

    expect(screen.queryByText("Tentative mode")).not.toBeInTheDocument();
    expect(screen.queryByText("Swap axes")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("umpire-focus-menu-item"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Date range")).toBeInTheDocument();
  });

  it("reports a swap back to the page", async () => {
    const user = userEvent.setup();
    const { onSwapAxes } = setup();

    await user.click(screen.getByTestId("poll-tools-menu"));
    await user.click(screen.getByText("Swap axes"));

    expect(onSwapAxes).toHaveBeenCalledTimes(1);
  });

  it("reports a tentative-mode toggle back to the page", async () => {
    const user = userEvent.setup();
    const { onTentativeModeChange } = setup();

    await user.click(screen.getByTestId("poll-tools-menu"));
    await user.click(screen.getByTestId("tentative-mode-menu-item"));

    expect(onTentativeModeChange).toHaveBeenCalledWith(true);
  });
});
