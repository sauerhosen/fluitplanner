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
});
