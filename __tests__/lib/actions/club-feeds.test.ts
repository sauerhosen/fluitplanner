import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClubFeedError } from "@/lib/club-feed/fetch";

const mockRequirePlanner = vi.fn();
const mockRequireMember = vi.fn();
// Hoisted: the static ClubFeedError import loads the mocked module early.
const { mockResolveClubFeed } = vi.hoisted(() => ({
  mockResolveClubFeed: vi.fn(),
}));

const mockCountEq = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();

const serviceClient = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({ eq: mockCountEq })),
    insert: mockInsert,
    delete: mockDelete,
  })),
};

vi.mock("@/lib/auth", () => ({
  requirePlanner: mockRequirePlanner,
  requireMember: mockRequireMember,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

vi.mock("@/lib/club-feed/fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/club-feed/fetch")>()),
  resolveClubFeed: mockResolveClubFeed,
}));

const FEED = {
  id: "feed-1",
  organization_id: "test-org-id",
  host: "www.hockeyclubvvv.nl",
  site_alias: "d8ca7649",
};

function insertReturning(result: { data?: unknown; error?: unknown }) {
  const single = vi
    .fn()
    .mockResolvedValue({ data: null, error: null, ...result });
  mockInsert.mockReturnValue({ select: vi.fn(() => ({ single })) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePlanner.mockResolvedValue({
    supabase: {},
    user: { id: "user-1" },
    tenantId: "test-org-id",
  });
  mockCountEq.mockResolvedValue({ count: 0, error: null });
  mockResolveClubFeed.mockResolvedValue({
    host: FEED.host,
    siteAlias: FEED.site_alias,
  });
  insertReturning({ data: FEED });
});

describe("addClubFeed", () => {
  it("resolves the site and stores the feed for the current club", async () => {
    const { addClubFeed } = await import("@/lib/actions/club-feeds");
    await expect(addClubFeed("hockeyclubvvv.nl")).resolves.toEqual({
      status: "added",
      feed: FEED,
    });
    expect(mockResolveClubFeed).toHaveBeenCalledWith("hockeyclubvvv.nl");
    expect(mockCountEq).toHaveBeenCalledWith("organization_id", "test-org-id");
    expect(mockInsert).toHaveBeenCalledWith({
      organization_id: "test-org-id",
      host: FEED.host,
      site_alias: FEED.site_alias,
      created_by: "user-1",
    });
  });

  it("returns the resolver's failure as a status", async () => {
    mockResolveClubFeed.mockRejectedValue(
      new ClubFeedError("not_lisa", "No LISA schedule"),
    );
    const { addClubFeed } = await import("@/lib/actions/club-feeds");
    await expect(addClubFeed("www.amvj.nl")).resolves.toEqual({
      status: "not_lisa",
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("reports a site the club already watches as a duplicate", async () => {
    insertReturning({ error: { code: "23505", message: "duplicate key" } });
    const { addClubFeed } = await import("@/lib/actions/club-feeds");
    await expect(addClubFeed("hockeyclubvvv.nl")).resolves.toEqual({
      status: "duplicate",
    });
  });

  it("stops at the per-club limit before fetching anything", async () => {
    mockCountEq.mockResolvedValue({ count: 5, error: null });
    const { addClubFeed } = await import("@/lib/actions/club-feeds");
    await expect(addClubFeed("hockeyclubvvv.nl")).resolves.toEqual({
      status: "limit",
    });
    expect(mockResolveClubFeed).not.toHaveBeenCalled();
  });

  it("rejects non-planners before fetching anything", async () => {
    mockRequirePlanner.mockRejectedValue(new Error("NOT_PLANNER"));
    const { addClubFeed } = await import("@/lib/actions/club-feeds");
    await expect(addClubFeed("hockeyclubvvv.nl")).rejects.toThrow(
      "NOT_PLANNER",
    );
    expect(mockResolveClubFeed).not.toHaveBeenCalled();
  });
});

describe("removeClubFeed", () => {
  it("deletes only within the current club", async () => {
    const mockEqOrg = vi.fn().mockResolvedValue({ error: null });
    const mockEqId = vi.fn(() => ({ eq: mockEqOrg }));
    mockDelete.mockReturnValue({ eq: mockEqId });

    const { removeClubFeed } = await import("@/lib/actions/club-feeds");
    await removeClubFeed("feed-1");
    expect(mockEqId).toHaveBeenCalledWith("id", "feed-1");
    expect(mockEqOrg).toHaveBeenCalledWith("organization_id", "test-org-id");
  });

  it("rejects non-planners", async () => {
    mockRequirePlanner.mockRejectedValue(new Error("NOT_PLANNER"));
    const { removeClubFeed } = await import("@/lib/actions/club-feeds");
    await expect(removeClubFeed("feed-1")).rejects.toThrow("NOT_PLANNER");
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe("getClubFeeds", () => {
  it("reads the current club's feeds as a member", async () => {
    const order = vi.fn().mockResolvedValue({ data: [FEED], error: null });
    const eq = vi.fn(() => ({ order }));
    mockRequireMember.mockResolvedValue({
      supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })) },
      tenantId: "test-org-id",
    });
    const { getClubFeeds } = await import("@/lib/actions/club-feeds");
    await expect(getClubFeeds()).resolves.toEqual([FEED]);
    expect(eq).toHaveBeenCalledWith("organization_id", "test-org-id");
  });
});
