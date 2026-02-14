import { screen } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi } from "vitest";
import { UmpireTable } from "@/components/umpires/umpire-table";
import type { Umpire } from "@/lib/types/domain";

vi.mock("@/lib/actions/umpires", () => ({
  deleteUmpire: vi.fn(),
}));

const mockUmpires: Umpire[] = [
  {
    id: "1",
    auth_user_id: "auth-1",
    name: "Jan de Vries",
    email: "jan@example.com",
    level: 2,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "2",
    auth_user_id: null,
    name: "Piet Bakker",
    email: "piet@example.com",
    level: 1,
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
  {
    id: "3",
    auth_user_id: "auth-3",
    name: "Klaas Jansen",
    email: "klaas@example.com",
    level: 3,
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
});
