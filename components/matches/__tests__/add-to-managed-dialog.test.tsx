import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AddToManagedDialog } from "../add-to-managed-dialog";

vi.mock("@/lib/actions/managed-teams", () => ({
  batchCreateManagedTeams: vi.fn().mockResolvedValue([]),
}));

import { batchCreateManagedTeams } from "@/lib/actions/managed-teams";
const mockBatch = vi.mocked(batchCreateManagedTeams);

describe("AddToManagedDialog", () => {
  const onDone = vi.fn();
  const teams = ["Team C", "Team D"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockBatch.mockResolvedValue([]);
  });

  it("renders team names with level dropdowns", () => {
    render(<AddToManagedDialog open={true} teams={teams} onDone={onDone} />);
    expect(screen.getByText("Team C")).toBeInTheDocument();
    expect(screen.getByText("Team D")).toBeInTheDocument();
  });

  it("sends only selected teams on confirm", async () => {
    render(<AddToManagedDialog open={true} teams={teams} onDone={onDone} />);
    // Uncheck "Team D" — both are checked by default
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // uncheck Team D
    fireEvent.click(screen.getByRole("button", { name: /add to managed/i }));
    await waitFor(() => {
      expect(mockBatch).toHaveBeenCalledWith([
        { name: "Team C", requiredLevel: 1 },
      ]);
    });
    expect(onDone).toHaveBeenCalled();
  });

  it("disables confirm button when no teams selected", () => {
    render(<AddToManagedDialog open={true} teams={teams} onDone={onDone} />);
    const checkboxes = screen.getAllByRole("checkbox");
    // Uncheck both teams
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    expect(
      screen.getByRole("button", { name: /add to managed/i }),
    ).toBeDisabled();
  });

  it("calls onDone without adding when skip is clicked", () => {
    render(<AddToManagedDialog open={true} teams={teams} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(mockBatch).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });
});
