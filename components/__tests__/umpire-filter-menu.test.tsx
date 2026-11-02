import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { UmpireFilterMenu } from "@/components/polls/umpire-filter-menu";

const umpires = [
  { id: "u1", name: "Bart Postema" },
  { id: "u2", name: "Caroline Michels" },
];

function setup(
  overrides: Partial<React.ComponentProps<typeof UmpireFilterMenu>> = {},
) {
  const onFocusedUmpireIdsChange = vi.fn();
  const onHideSilentUmpiresChange = vi.fn();
  render(
    <UmpireFilterMenu
      umpires={umpires}
      focusedUmpireIds={[]}
      onFocusedUmpireIdsChange={onFocusedUmpireIdsChange}
      hideSilentUmpires={false}
      onHideSilentUmpiresChange={onHideSilentUmpiresChange}
      {...overrides}
    />,
  );
  return { onFocusedUmpireIdsChange, onHideSilentUmpiresChange };
}

describe("UmpireFilterMenu", () => {
  it("offers every umpire alongside the unfiltered grid", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId("umpire-filter-menu"));

    expect(screen.getByText("All umpires")).toBeInTheDocument();
    expect(screen.getByText("Bart Postema")).toBeInTheDocument();
    expect(screen.getByText("Caroline Michels")).toBeInTheDocument();
  });

  it("adds a picked umpire to the selection and stays open for the next", async () => {
    const user = userEvent.setup();
    const { onFocusedUmpireIdsChange } = setup({ focusedUmpireIds: ["u1"] });

    await user.click(screen.getByTestId("umpire-filter-menu"));
    await user.click(screen.getByText("Caroline Michels"));

    expect(onFocusedUmpireIdsChange).toHaveBeenCalledWith(["u1", "u2"]);
    expect(screen.getByText("Bart Postema")).toBeInTheDocument();
  });

  it("drops an umpire that is picked again", async () => {
    const user = userEvent.setup();
    const { onFocusedUmpireIdsChange } = setup({
      focusedUmpireIds: ["u1", "u2"],
    });

    await user.click(screen.getByTestId("umpire-filter-menu"));
    await user.click(screen.getByText("Bart Postema"));

    expect(onFocusedUmpireIdsChange).toHaveBeenCalledWith(["u2"]);
  });

  it("goes back to the whole roster", async () => {
    const user = userEvent.setup();
    const { onFocusedUmpireIdsChange } = setup({ focusedUmpireIds: ["u2"] });

    await user.click(screen.getByTestId("umpire-filter-menu"));
    await user.click(screen.getByText("All umpires"));

    expect(onFocusedUmpireIdsChange).toHaveBeenCalledWith([]);
  });

  it("counts the picked umpires on the trigger", () => {
    setup({ focusedUmpireIds: ["u1", "u2"] });

    expect(screen.getByTestId("umpire-filter-menu")).toHaveTextContent("2");
  });

  it("toggles responders only and stays open for another change", async () => {
    const user = userEvent.setup();
    const { onHideSilentUmpiresChange } = setup();

    await user.click(screen.getByTestId("umpire-filter-menu"));
    await user.click(screen.getByTestId("hide-silent-umpires-toggle"));

    expect(onHideSilentUmpiresChange).toHaveBeenCalledWith(true);
    expect(screen.getByText("All umpires")).toBeInTheDocument();
  });

  it("counts an active filter on the trigger, so a narrowed grid says so", () => {
    setup({ hideSilentUmpires: true });

    expect(screen.getByTestId("umpire-filter-menu")).toHaveTextContent("1");
  });

  it("steps the responders filter aside while umpires are picked", async () => {
    const user = userEvent.setup();
    setup({ focusedUmpireIds: ["u1"], hideSilentUmpires: true });

    await user.click(screen.getByTestId("umpire-filter-menu"));

    expect(screen.getByTestId("hide-silent-umpires-toggle")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
