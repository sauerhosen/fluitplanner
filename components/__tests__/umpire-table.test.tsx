import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi } from "vitest";
import { UmpireTable } from "@/components/umpires/umpire-table";
import type { RosteredUmpire } from "@/lib/types/domain";

vi.mock("@/lib/actions/umpires", () => ({
  deleteUmpire: vi.fn(),
  deleteUmpires: vi.fn().mockResolvedValue(undefined),
  updateUmpireNotes: vi.fn(),
}));

const mockUmpires: RosteredUmpire[] = [
  {
    id: "1",
    auth_user_id: "auth-1",
    name: "Jan de Vries",
    email: "jan@example.com",
    level: 2,
    notes: "Father of a player in D1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "2",
    auth_user_id: null,
    name: "Piet Bakker",
    email: "piet@example.com",
    level: 1,
    notes: null,
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
  {
    id: "3",
    auth_user_id: "auth-3",
    name: "Klaas Jansen",
    email: "klaas@example.com",
    level: 3,
    notes: null,
    created_at: "2026-01-03T00:00:00Z",
    updated_at: "2026-01-03T00:00:00Z",
  },
];

describe("UmpireTable", () => {
  it("renders umpire rows with name and email", () => {
    render(
      <UmpireTable
        umpires={mockUmpires}
        onEdit={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
    expect(screen.getByText("jan@example.com")).toBeInTheDocument();
    expect(screen.getByText("Piet Bakker")).toBeInTheDocument();
    expect(screen.getByText("piet@example.com")).toBeInTheDocument();
    expect(screen.getByText("Klaas Jansen")).toBeInTheDocument();
  });

  it("renders level badges", () => {
    render(
      <UmpireTable
        umpires={mockUmpires}
        onEdit={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.getByText("Experienced")).toBeInTheDocument();
    expect(screen.getByText("Any")).toBeInTheDocument();
    expect(screen.getByText("Top")).toBeInTheDocument();
  });

  it("shows empty state when no umpires", () => {
    render(<UmpireTable umpires={[]} onEdit={vi.fn()} onDeleted={vi.fn()} />);

    expect(screen.getByText(/no umpires yet/i)).toBeInTheDocument();
  });

  it("renders checkboxes for each row", () => {
    render(
      <UmpireTable
        umpires={mockUmpires}
        onEdit={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    // 1 header checkbox + 3 row checkboxes
    expect(checkboxes).toHaveLength(4);
  });

  it("clicking a row checkbox toggles selection", async () => {
    const user = userEvent.setup();
    render(
      <UmpireTable
        umpires={mockUmpires}
        onEdit={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Jan de Vries" });
    await user.click(checkbox);

    expect(screen.getByText("1 item selected")).toBeInTheDocument();
  });

  it("header checkbox selects all", async () => {
    const user = userEvent.setup();
    render(
      <UmpireTable
        umpires={mockUmpires}
        onEdit={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    const headerCheckbox = screen.getByRole("checkbox", {
      name: "Select all",
    });
    await user.click(headerCheckbox);

    expect(screen.getByText("3 items selected")).toBeInTheDocument();
  });

  it("selection toolbar appears when items are selected", async () => {
    const user = userEvent.setup();
    render(
      <UmpireTable
        umpires={mockUmpires}
        onEdit={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.queryByText("Delete selected")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Jan de Vries" }));

    expect(screen.getByText("Delete selected")).toBeInTheDocument();
    expect(screen.getByText("Clear selection")).toBeInTheDocument();
  });

  it("clear selection button deselects all", async () => {
    const user = userEvent.setup();
    render(
      <UmpireTable
        umpires={mockUmpires}
        onEdit={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Jan de Vries" }));
    expect(screen.getByText("1 item selected")).toBeInTheDocument();

    await user.click(screen.getByText("Clear selection"));
    expect(screen.queryByText("1 item selected")).not.toBeInTheDocument();
  });

  it("shows a note icon carrying the note for an umpire that has one", () => {
    render(
      <UmpireTable
        umpires={mockUmpires}
        onEdit={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Father of a player in D1" }),
    ).toBeInTheDocument();
  });

  it("offers an add-a-note affordance for umpires without one", () => {
    render(
      <UmpireTable
        umpires={mockUmpires}
        onEdit={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    // Two of the three fixtures carry no note.
    expect(screen.getAllByRole("button", { name: /add a note/i })).toHaveLength(
      2,
    );
  });

  it("refetches through onNoteSaved once a note is written", async () => {
    const user = userEvent.setup();
    const onNoteSaved = vi.fn();
    render(
      <UmpireTable
        umpires={mockUmpires}
        onEdit={vi.fn()}
        onDeleted={vi.fn()}
        onNoteSaved={onNoteSaved}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Father of a player in D1" }),
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onNoteSaved).toHaveBeenCalled());
  });
});
