import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UploadZone } from "../upload-zone";
import type { ManagedTeam } from "@/lib/types/domain";

const { sampleRows } = vi.hoisted(() => ({
  sampleRows: [{ home: "Team A", away: "Team X", date: "2026-03-01" }],
}));

vi.mock("@/lib/actions/matches", () => ({
  upsertMatches: vi.fn().mockResolvedValue({ inserted: 2, updated: 0 }),
}));

vi.mock("@/lib/parsers/knhb-mapper", () => ({
  mapKNHBRows: vi
    .fn()
    .mockReturnValue({ matches: [{ id: "1" }], skippedCount: 0, errors: [] }),
  extractHomeTeams: vi.fn().mockReturnValue(["Team A", "Team B", "Team C"]),
}));

vi.mock("@/lib/parsers/csv", () => ({
  parseCSV: vi.fn().mockReturnValue(sampleRows),
}));

vi.mock("@/lib/parsers/paste", () => ({
  parsePaste: vi.fn().mockReturnValue(sampleRows),
}));

const managedTeams: ManagedTeam[] = [
  {
    id: "1",
    name: "Team A",
    required_level: 1,
    created_by: "u1",
    created_at: "2026-01-01",
    organization_id: "test-org-id",
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

  it("switches from Quick to Advanced after paste shows TeamSelector", async () => {
    const user = userEvent.setup();
    render(
      <UploadZone
        managedTeams={managedTeams}
        onImportComplete={onImportComplete}
      />,
    );

    // Paste data in Quick mode
    await user.click(screen.getByRole("button", { name: /paste/i }));
    await user.type(
      screen.getByPlaceholderText(/paste spreadsheet/i),
      "some data",
    );
    await user.click(screen.getByRole("button", { name: /^parse$/i }));

    // Preview should be visible in Quick mode
    await waitFor(() => {
      expect(screen.getByText(/ready to import/i)).toBeInTheDocument();
    });

    // Switch to Advanced
    await user.click(screen.getByRole("radio", { name: /advanced import/i }));

    // TeamSelector should appear, preview should be gone
    await waitFor(() => {
      expect(screen.getByText(/select teams to import/i)).toBeInTheDocument();
      expect(screen.queryByText(/ready to import/i)).not.toBeInTheDocument();
    });
  });

  it("switches from Advanced to Quick after paste shows preview", async () => {
    const user = userEvent.setup();
    render(
      <UploadZone
        managedTeams={managedTeams}
        onImportComplete={onImportComplete}
      />,
    );

    // Switch to Advanced first
    await user.click(screen.getByRole("radio", { name: /advanced import/i }));

    // Paste data
    await user.click(screen.getByRole("button", { name: /paste/i }));
    await user.type(
      screen.getByPlaceholderText(/paste spreadsheet/i),
      "some data",
    );
    await user.click(screen.getByRole("button", { name: /^parse$/i }));

    // TeamSelector should be visible in Advanced mode
    await waitFor(() => {
      expect(screen.getByText(/select teams to import/i)).toBeInTheDocument();
    });

    // Switch to Quick
    await user.click(screen.getByRole("radio", { name: /quick import/i }));

    // Preview should appear, TeamSelector should be gone
    await waitFor(() => {
      expect(screen.getByText(/ready to import/i)).toBeInTheDocument();
      expect(
        screen.queryByText(/select teams to import/i),
      ).not.toBeInTheDocument();
    });
  });

  it("switches back to Advanced after confirming teams shows TeamSelector again", async () => {
    const user = userEvent.setup();
    render(
      <UploadZone
        managedTeams={managedTeams}
        onImportComplete={onImportComplete}
      />,
    );

    // Start in Advanced mode, paste data
    await user.click(screen.getByRole("radio", { name: /advanced import/i }));
    await user.click(screen.getByRole("button", { name: /paste/i }));
    await user.type(
      screen.getByPlaceholderText(/paste spreadsheet/i),
      "some data",
    );
    await user.click(screen.getByRole("button", { name: /^parse$/i }));

    // Confirm team selection
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /continue/i }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // Preview should be visible after team confirmation
    await waitFor(() => {
      expect(screen.getByText(/ready to import/i)).toBeInTheDocument();
    });

    // Switch to Quick mode
    await user.click(screen.getByRole("radio", { name: /quick import/i }));

    // Preview should still show (re-processed as Quick)
    await waitFor(() => {
      expect(screen.getByText(/ready to import/i)).toBeInTheDocument();
    });

    // Switch back to Advanced
    await user.click(screen.getByRole("radio", { name: /advanced import/i }));

    // TeamSelector should reappear
    await waitFor(() => {
      expect(screen.getByText(/select teams to import/i)).toBeInTheDocument();
    });
  });
});
