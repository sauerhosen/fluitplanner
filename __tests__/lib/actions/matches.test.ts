import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

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

const validMatch = {
  date: "2026-09-27",
  start_time: "2026-09-27T12:45:00+02:00",
  home_team: "VVV D1",
  away_team: "AMVJ D1",
  competition: null,
  venue: null,
  field: null,
  required_level: 1 as const,
};

// Server actions are network endpoints: a hostile caller can send fields the
// TypeScript signature does not declare.
const hostileExtras = {
  external_id: 999,
  source: "hockey_sync",
  cancelled_upstream: true,
  needs_review: true,
  review_reasons: ["cancelled"],
  last_synced_at: "2026-01-01T00:00:00Z",
  organization_id: "other-org",
  created_by: "attacker",
};

beforeEach(() => {
  vi.resetAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  const single = vi
    .fn()
    .mockResolvedValue({ data: { id: "m-1" }, error: null });
  const select = vi.fn().mockReturnValue({ single });
  mockInsert.mockReturnValue({ select });
  const eqOrg = vi.fn().mockReturnValue({ select });
  const eqId = vi.fn().mockReturnValue({ eq: eqOrg });
  mockUpdate.mockReturnValue({ eq: eqId });
});

describe("createMatch", () => {
  it("strips sync-managed and ownership fields from hostile payloads", async () => {
    const { createMatch } = await import("@/lib/actions/matches");
    await createMatch({ ...validMatch, ...hostileExtras } as never);

    expect(mockInsert).toHaveBeenCalledWith({
      ...validMatch,
      created_by: "user-1",
      organization_id: "test-org-id",
    });
  });
});

describe("updateMatch", () => {
  it("strips sync-managed fields and passes only declared form fields", async () => {
    const { updateMatch } = await import("@/lib/actions/matches");
    await updateMatch("m-1", {
      start_time: "2026-09-27T14:00:00+02:00",
      ...hostileExtras,
    } as never);

    expect(mockUpdate).toHaveBeenCalledWith({
      start_time: "2026-09-27T14:00:00+02:00",
    });
  });
});
