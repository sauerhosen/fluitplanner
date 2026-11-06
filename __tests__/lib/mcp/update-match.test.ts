import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpPlannerContext } from "@/lib/mcp/auth";

const { mockReslot, pollLinks, row } = vi.hoisted(() => ({
  mockReslot: vi.fn(),
  pollLinks: [] as Array<{ poll_id: string }>,
  row: {
    id: "m-1",
    organization_id: "org-1",
    date: "2026-11-14",
    start_time: "2026-11-14T11:10:00+00:00",
    home_team: "VVV HC MO16-2",
    away_team: "FIT MO16-1",
    venue: null,
    field: null,
    competition: null,
    required_level: 1,
    notes: null,
  } as Record<string, unknown>,
}));

vi.mock("@/lib/polls/reslot", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/polls/reslot")>()),
  reslotPollsForMatches: mockReslot,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "poll_matches") {
        const links: Record<string, unknown> = {
          select: () => links,
          eq: () => links,
          then: (ok: (v: unknown) => unknown) =>
            Promise.resolve({ data: pollLinks, error: null }).then(ok),
        };
        return links;
      }
      let updates: Record<string, unknown> | null = null;
      const builder = {
        select: () => builder,
        eq: () => builder,
        update: (u: Record<string, unknown>) => {
          updates = u;
          return builder;
        },
        maybeSingle: async () => ({ data: row, error: null }),
        single: async () => ({ data: { ...row, ...updates }, error: null }),
      };
      return builder;
    },
  }),
}));

const { updateMatchForPlanner } = await import("@/lib/mcp/data");

const ctx = { organizationId: "org-1" } as McpPlannerContext;

beforeEach(() => {
  mockReslot.mockReset();
  pollLinks.length = 0;
});

describe("updateMatchForPlanner — poll slots", () => {
  it("recomputes open polls when the kick-off moves and says what changed", async () => {
    mockReslot.mockResolvedValue([
      {
        pollId: "poll-1",
        slotsAdded: 1,
        slotsRemoved: 1,
        carriedResponses: 0,
        discardedResponses: 2,
      },
    ]);

    const result = await updateMatchForPlanner(ctx, "m-1", { time: "15:50" });

    expect(mockReslot).toHaveBeenCalledWith(expect.anything(), "org-1", [
      "m-1",
    ]);
    expect(result.caution).toMatch(/recalculated in 1 open poll/);
    expect(result.caution).toMatch(/1 new slot/);
    expect(result.caution).toMatch(/2 answer\(s\).*discarded/);
  });

  it("explains a poll left waiting for another match's kick-off", async () => {
    mockReslot.mockResolvedValue([
      { pollId: "poll-1", skipped: "match_without_time" },
    ]);

    const result = await updateMatchForPlanner(ctx, "m-1", { time: "15:50" });

    expect(result.caution).toMatch(/left unchanged/);
  });

  it("names the match's own missing kick-off when the move cleared it", async () => {
    mockReslot.mockResolvedValue([
      { pollId: "poll-1", skipped: "match_without_time" },
    ]);

    const result = await updateMatchForPlanner(ctx, "m-1", { time: "" });

    expect(result.caution).toMatch(/This match no longer has a kick-off/);
  });

  it("warns when the match is only in closed polls, which are not recomputed", async () => {
    mockReslot.mockResolvedValue([]);
    pollLinks.push({ poll_id: "closed-poll" });

    const result = await updateMatchForPlanner(ctx, "m-1", { time: "15:50" });

    expect(result.caution).toMatch(/only in closed polls/);
  });

  it("says nothing when the match is in no poll", async () => {
    mockReslot.mockResolvedValue([]);

    const result = await updateMatchForPlanner(ctx, "m-1", { time: "15:50" });

    expect(result.caution).toBeUndefined();
  });

  it("does not touch polls for a change that is not the schedule", async () => {
    const result = await updateMatchForPlanner(ctx, "m-1", { venue: "Elders" });

    expect(mockReslot).not.toHaveBeenCalled();
    expect(result.caution).toBeUndefined();
  });
});
