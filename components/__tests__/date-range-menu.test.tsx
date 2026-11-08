import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { DateRangeMenu } from "@/components/polls/date-range-menu";

describe("DateRangeMenu", () => {
  it("offers the date presets and reports a pick back to the page", async () => {
    const user = userEvent.setup();
    const onDateRangeChange = vi.fn();
    render(
      <DateRangeMenu
        dateRange={undefined}
        onDateRangeChange={onDateRangeChange}
      />,
    );

    await user.click(screen.getByTestId("date-range-menu"));
    const items = screen.getAllByRole("menuitemcheckbox");
    expect(items.length).toBeGreaterThan(1);

    await user.click(items[0]);
    expect(onDateRangeChange).toHaveBeenCalledTimes(1);
  });

  it("checks the day filter, and no date preset, while it is active", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DateRangeMenu
        dateRange={undefined}
        onDateRangeChange={vi.fn()}
        dayFilter={{ label: "Open days only", active: true, onSelect }}
      />,
    );

    await user.click(screen.getByTestId("date-range-menu"));
    const checked = screen
      .getAllByRole("menuitemcheckbox")
      .filter((item) => item.getAttribute("aria-checked") === "true");
    expect(checked.map((item) => item.textContent)).toEqual(["Open days only"]);

    await user.click(
      screen.getByRole("menuitemcheckbox", { name: "Open days only" }),
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
