import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ManagedTeamsList } from "@/components/settings/managed-teams-list";
import type { ManagedTeam } from "@/lib/types/domain";

const mockCreateManagedTeam = vi.fn();
const mockUpdateManagedTeam = vi.fn();
const mockDeleteManagedTeam = vi.fn();

vi.mock("@/lib/actions/managed-teams", () => ({
  createManagedTeam: (...args: unknown[]) => mockCreateManagedTeam(...args),
  updateManagedTeam: (...args: unknown[]) => mockUpdateManagedTeam(...args),
  deleteManagedTeam: (...args: unknown[]) => mockDeleteManagedTeam(...args),
}));

const mockTeams: ManagedTeam[] = [
  {
    id: "1",
    name: "Heren 01",
    required_level: 2,
    created_by: "user-1",
    created_at: "2026-01-01",
    organization_id: "org-1",
  },
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ManagedTeamsList", () => {
  it("renders team rows", () => {
    render(<ManagedTeamsList initialTeams={mockTeams} />);
    expect(screen.getByText("Heren 01")).toBeInTheDocument();
  });

  it("shows duplicate team name error when adding a duplicate", async () => {
    const user = userEvent.setup();
    mockCreateManagedTeam.mockRejectedValue(new Error("DUPLICATE_TEAM_NAME"));

    render(<ManagedTeamsList initialTeams={mockTeams} />);

    const input = screen.getByPlaceholderText("Team name (e.g. Heren 01)");
    await user.type(input, "Heren 01");
    // Click the add button (last icon button with Plus)
    const addButton = screen.getByRole("button", { name: /add team/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(
        screen.getByText("A team with this name already exists"),
      ).toBeInTheDocument();
    });
  });

  it("shows generic error when add fails for other reasons", async () => {
    const user = userEvent.setup();
    mockCreateManagedTeam.mockRejectedValue(new Error("Network error"));

    render(<ManagedTeamsList initialTeams={mockTeams} />);

    const input = screen.getByPlaceholderText("Team name (e.g. Heren 01)");
    await user.type(input, "New Team");
    const addButton = screen.getByRole("button", { name: /add team/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeInTheDocument();
    });
  });

  it("clears error when a new action succeeds", async () => {
    const user = userEvent.setup();
    mockCreateManagedTeam
      .mockRejectedValueOnce(new Error("DUPLICATE_TEAM_NAME"))
      .mockResolvedValueOnce({
        id: "2",
        name: "Dames 01",
        required_level: 1,
        created_by: "user-1",
        created_at: "2026-01-01",
        organization_id: "org-1",
      });

    render(<ManagedTeamsList initialTeams={mockTeams} />);

    const input = screen.getByPlaceholderText("Team name (e.g. Heren 01)");
    const addButton = screen.getByRole("button", { name: /add team/i });

    // First attempt: duplicate error
    await user.type(input, "Heren 01");
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/already exists/)).toBeInTheDocument();
    });

    // Second attempt: success - error should clear
    await user.clear(input);
    await user.type(input, "Dames 01");
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
    });
  });
});
