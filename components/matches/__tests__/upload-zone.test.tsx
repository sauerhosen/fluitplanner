import { screen } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UploadZone } from "../upload-zone";
import type { ManagedTeam } from "@/lib/types/domain";

vi.mock("@/lib/actions/matches", () => ({
  upsertMatches: vi.fn().mockResolvedValue({ inserted: 2, updated: 0 }),
}));

vi.mock("@/lib/parsers/knhb-mapper", () => ({
  mapKNHBRows: vi
    .fn()
    .mockReturnValue({ matches: [], skippedCount: 0, errors: [] }),
  extractHomeTeams: vi.fn().mockReturnValue(["Team A", "Team B", "Team C"]),
}));

vi.mock("@/lib/parsers/csv", () => ({
  parseCSV: vi.fn().mockReturnValue([]),
}));

const managedTeams: ManagedTeam[] = [
  {
    id: "1",
    name: "Team A",
    required_level: 1,
    created_by: "u1",
    created_at: "2026-01-01",
    organization_id: null,
  },
];

describe("UploadZone", () => {
  const onImportComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders import mode toggle with Quick and Advanced options", () => {
    render(
      <UploadZone
        managedTeams={managedTeams}
        onImportComplete={onImportComplete}
      />,
    );
    expect(
      screen.getByRole("radio", { name: /quick import/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /advanced import/i }),
    ).toBeInTheDocument();
  });

  it("defaults to quick import mode", () => {
    render(
      <UploadZone
        managedTeams={managedTeams}
        onImportComplete={onImportComplete}
      />,
    );
    expect(screen.getByRole("radio", { name: /quick import/i })).toBeChecked();
  });
});
