import { screen, fireEvent } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TeamSelector } from "../team-selector";

const allTeams = ["Team A", "Team B", "Team C", "Team D"];
const managedTeamNames = ["Team A", "Team B"];

describe("TeamSelector", () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all teams with checkboxes", () => {
    render(
      <TeamSelector
        teams={allTeams}
        managedTeamNames={managedTeamNames}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });

  it("pre-checks managed teams", () => {
    render(
      <TeamSelector
        teams={allTeams}
        managedTeamNames={managedTeamNames}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked(); // Team A - managed
    expect(checkboxes[1]).toBeChecked(); // Team B - managed
    expect(checkboxes[2]).not.toBeChecked(); // Team C
    expect(checkboxes[3]).not.toBeChecked(); // Team D
  });

  it("shows 'Managed' badge on managed teams", () => {
    render(
      <TeamSelector
        teams={allTeams}
        managedTeamNames={managedTeamNames}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const badges = screen.getAllByText("Managed");
    expect(badges).toHaveLength(2);
  });

  it("calls onConfirm with selected team names", () => {
    render(
      <TeamSelector
        teams={allTeams}
        managedTeamNames={managedTeamNames}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    // Check Team C additionally
    fireEvent.click(screen.getAllByRole("checkbox")[2]);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith(["Team A", "Team B", "Team C"]);
  });

  it("select all checks all teams", () => {
    render(
      <TeamSelector
        teams={allTeams}
        managedTeamNames={managedTeamNames}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^select all$/i }));
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect(cb).toBeChecked());
  });

  it("deselect all unchecks all teams", () => {
    render(
      <TeamSelector
        teams={allTeams}
        managedTeamNames={managedTeamNames}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /deselect all/i }));
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
  });

  it("disables continue when no teams selected", () => {
    render(
      <TeamSelector
        teams={allTeams}
        managedTeamNames={managedTeamNames}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /deselect all/i }));
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });
});
