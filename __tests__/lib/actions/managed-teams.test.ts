import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
    auth: { getUser: mockGetUser },
  })),
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  mockInsert.mockReturnValue({
    select: mockSelect,
  });
  mockSelect.mockResolvedValue({ data: [], error: null });
});

describe("batchCreateManagedTeams", () => {
  it("inserts multiple teams in a single call", async () => {
    const teams = [
      { name: "Team A", requiredLevel: 1 as const },
      { name: "Team B", requiredLevel: 2 as const },
    ];
    mockSelect.mockResolvedValue({
      data: [
        {
          id: "1",
          name: "Team A",
          required_level: 1,
          created_by: "user-1",
          created_at: "2026-01-01",
        },
        {
          id: "2",
          name: "Team B",
          required_level: 2,
          created_by: "user-1",
          created_at: "2026-01-01",
        },
      ],
      error: null,
    });

    const { batchCreateManagedTeams } =
      await import("@/lib/actions/managed-teams");
    const result = await batchCreateManagedTeams(teams);

    expect(mockInsert).toHaveBeenCalledWith([
      { name: "Team A", required_level: 1, created_by: "user-1" },
      { name: "Team B", required_level: 2, created_by: "user-1" },
    ]);
    expect(result).toHaveLength(2);
  });

  it("throws when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { batchCreateManagedTeams } =
      await import("@/lib/actions/managed-teams");
    await expect(
      batchCreateManagedTeams([{ name: "X", requiredLevel: 1 }]),
    ).rejects.toThrow("Not authenticated");
  });
});
