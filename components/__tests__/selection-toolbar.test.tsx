import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi } from "vitest";
import { SelectionToolbar } from "@/components/shared/selection-toolbar";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

describe("SelectionToolbar", () => {
  it("renders nothing when selectedCount is 0", () => {
    const { container } = render(
      <SelectionToolbar
        selectedCount={0}
        onDelete={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows selected count and buttons when items are selected", () => {
    render(
      <SelectionToolbar
        selectedCount={3}
        onDelete={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );
    expect(screen.getByText("3 items selected")).toBeInTheDocument();
    expect(screen.getByText("Delete selected")).toBeInTheDocument();
    expect(screen.getByText("Clear selection")).toBeInTheDocument();
  });

  it("shows singular text for 1 item", () => {
    render(
      <SelectionToolbar
        selectedCount={1}
        onDelete={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );
    expect(screen.getByText("1 item selected")).toBeInTheDocument();
  });

  it("opens AlertDialog when delete button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <SelectionToolbar
        selectedCount={2}
        onDelete={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Delete selected"));
    expect(
      screen.getByText("Delete 2 items? This cannot be undone."),
    ).toBeInTheDocument();
  });

  it("calls onDelete when confirmed", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <SelectionToolbar
        selectedCount={2}
        onDelete={onDelete}
        onClearSelection={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Delete selected"));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
  });

  it("does not call onDelete when cancelled", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <SelectionToolbar
        selectedCount={2}
        onDelete={onDelete}
        onClearSelection={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Delete selected"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("shows error toast when onDelete throws", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockRejectedValue(new Error("fail"));
    render(
      <SelectionToolbar
        selectedCount={2}
        onDelete={onDelete}
        onClearSelection={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Delete selected"));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to delete items. Please try again.",
      ),
    );
  });

  it("calls onClearSelection when clear button is clicked", async () => {
    const user = userEvent.setup();
    const onClearSelection = vi.fn();
    render(
      <SelectionToolbar
        selectedCount={2}
        onDelete={vi.fn()}
        onClearSelection={onClearSelection}
      />,
    );

    await user.click(screen.getByText("Clear selection"));
    expect(onClearSelection).toHaveBeenCalledOnce();
  });
});
