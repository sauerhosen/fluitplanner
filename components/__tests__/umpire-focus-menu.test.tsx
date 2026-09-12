import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { UmpireFocusMenu } from "@/components/polls/umpire-focus-menu";

const umpires = [
  { id: "u1", name: "Bart Postema" },
  { id: "u2", name: "Caroline Michels" },
];

function setup(
  overrides: Partial<React.ComponentProps<typeof UmpireFocusMenu>> = {},
) {
  const onFocusedUmpireChange = vi.fn();
  render(
    <UmpireFocusMenu
      umpires={umpires}
      focusedUmpireId={null}
      onFocusedUmpireChange={onFocusedUmpireChange}
      {...overrides}
    />,
  );
  return { onFocusedUmpireChange };
}

describe("UmpireFocusMenu", () => {
  beforeEach(() => {
    // Radix measures its popover; jsdom reports nothing without this.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("offers every umpire alongside the unfiltered grid", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId("umpire-focus-menu"));

    expect(screen.getByText("All umpires")).toBeInTheDocument();
    expect(screen.getByText("Bart Postema")).toBeInTheDocument();
    expect(screen.getByText("Caroline Michels")).toBeInTheDocument();
  });

  it("reports the picked umpire back to the page", async () => {
    const user = userEvent.setup();
    const { onFocusedUmpireChange } = setup();

    await user.click(screen.getByTestId("umpire-focus-menu"));
    await user.click(screen.getByText("Caroline Michels"));

    expect(onFocusedUmpireChange).toHaveBeenCalledWith("u2");
  });

  it("names the focused umpire on the trigger, so a filtered grid says so", () => {
    setup({ focusedUmpireId: "u2" });

    expect(screen.getByTestId("umpire-focus-menu")).toHaveTextContent(
      "Caroline Michels",
    );
  });

  it("goes back to the whole roster", async () => {
    const user = userEvent.setup();
    const { onFocusedUmpireChange } = setup({ focusedUmpireId: "u2" });

    await user.click(screen.getByTestId("umpire-focus-menu"));
    await user.click(screen.getByText("All umpires"));

    expect(onFocusedUmpireChange).toHaveBeenCalledWith(null);
  });
});
