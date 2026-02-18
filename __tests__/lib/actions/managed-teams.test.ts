import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
  getTenantId: vi.fn(async () => "test-org-id"),
  getTenantSlug: vi.fn(async () => "test"),
  isRootDomain: vi.fn(async () => false),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      insert: mockInsert,
      update: mockUpdate,
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
      {
        name: "Team A",
        required_level: 1,
        created_by: "user-1",
        organization_id: "test-org-id",
      },
      {
        name: "Team B",
        required_level: 2,
        created_by: "user-1",
        organization_id: "test-org-id",
      },
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

  it("throws DUPLICATE_TEAM_NAME on unique constraint violation", async () => {
    mockSelect.mockResolvedValue({
      data: null,
      error: {
        message: "duplicate key value violates unique constraint",
        code: "23505",
      },
    });

    const { batchCreateManagedTeams } =
      await import("@/lib/actions/managed-teams");
    await expect(
      batchCreateManagedTeams([{ name: "Dup", requiredLevel: 1 }]),
    ).rejects.toThrow("DUPLICATE_TEAM_NAME");
  });
});

describe("createManagedTeam", () => {
  it("throws DUPLICATE_TEAM_NAME on unique constraint violation", async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: "duplicate key value violates unique constraint",
        code: "23505",
      },
    });
    const mockChainSelect = vi.fn().mockReturnValue({ single: mockSingle });
    mockInsert.mockReturnValue({ select: mockChainSelect });

    const { createManagedTeam } = await import("@/lib/actions/managed-teams");
    await expect(createManagedTeam("DuplicateTeam", 1)).rejects.toThrow(
      "DUPLICATE_TEAM_NAME",
    );
  });

  it("throws original error message for non-duplicate errors", async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "some other error", code: "42P01" },
    });
    const mockChainSelect = vi.fn().mockReturnValue({ single: mockSingle });
    mockInsert.mockReturnValue({ select: mockChainSelect });

    const { createManagedTeam } = await import("@/lib/actions/managed-teams");
    await expect(createManagedTeam("Team", 1)).rejects.toThrow(
      "some other error",
    );
  });
});

describe("updateManagedTeam", () => {
  it("throws DUPLICATE_TEAM_NAME on unique constraint violation", async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: "duplicate key value violates unique constraint",
        code: "23505",
      },
    });
    const mockChainSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockEq2 = vi.fn().mockReturnValue({ select: mockChainSelect });
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
    mockUpdate.mockReturnValue({ eq: mockEq1 });

    const { updateManagedTeam } = await import("@/lib/actions/managed-teams");
    await expect(
      updateManagedTeam("some-id", "DuplicateTeam", 1),
    ).rejects.toThrow("DUPLICATE_TEAM_NAME");
  });
});
