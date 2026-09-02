import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { McpPlannerContext } from "@/lib/mcp/auth";

const hoisted = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => hoisted.client as SupabaseClient,
}));

const { setFeaturedMatchesForPlanner } = await import("@/lib/mcp/data");

/* ------------------------------------------------------------------ */
/*  A fake PostgREST builder that records updates                      */
/* ------------------------------------------------------------------ */

type RecordedOp = {
  table: string;
  kind: "select" | "update";
  filters: Record<string, unknown>;
  payload?: unknown;
};

function makeClient(respond: (op: RecordedOp) => { data?: unknown[] | null }) {
  const ops: RecordedOp[] = [];

  function from(table: string) {
    const op: RecordedOp = { table, kind: "select", filters: {} };

    const settle = () => {
      ops.push(op);
      const reply = respond(op);
      return { data: reply.data ?? null, error: null };
    };

    const builder = {
      select() {
        // `.update(...).select(...)` reads the changed rows back; the update
        // must stay the recorded kind.
        if (op.kind !== "update") op.kind = "select";
        return builder;
      },
      update(payload: unknown) {
        op.kind = "update";
        op.payload = payload;
        return builder;
      },
      eq(key: string, value: unknown) {
        op.filters[key] = value;
        return builder;
      },
      in(key: string, value: unknown[]) {
        op.filters[key] = value;
        return builder;
      },
      maybeSingle() {
        const settled = settle();
        return Promise.resolve({
          data: (settled.data as unknown[])?.[0] ?? null,
          error: null,
        });
      },
      then<T>(onOk: (v: unknown) => T, onErr?: (e: unknown) => T) {
        return Promise.resolve(settle()).then(onOk, onErr);
      },
    };
    return builder;
  }

  return { client: { from } as unknown as SupabaseClient, ops };
}

const ctx: McpPlannerContext = {
  tokenId: "tok-1",
  userId: "user-1",
  organizationId: "org-1",
  organizationName: "HIC",
  organizationSlug: "hic",
};

const poll = {
  id: "poll-1",
  title: "Weekend 1",
  token: "share-token",
  status: "open",
  created_by: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  organization_id: "org-1",
};

const WITH_KICKOFF = {
  id: "m1",
  start_time: "2026-03-15T11:15:00Z",
  home_team: "HIC H1",
  away_team: "Bloemendaal H1",
};
const NO_KICKOFF = {
  id: "m2",
  start_time: null,
  home_team: "HIC D2",
  away_team: "Kampong D3",
};

function scenario(opts: {
  pollMatchIds: string[];
  matches: (typeof WITH_KICKOFF | typeof NO_KICKOFF)[];
}) {
  return makeClient((op) => {
    if (op.table === "polls") return { data: [poll] };
    if (op.table === "matches") {
      const ids = (op.filters["id"] as string[]) ?? [];
      return { data: opts.matches.filter((m) => ids.includes(m.id)) };
    }
    if (op.table === "poll_matches" && op.kind === "select") {
      const ids = (op.filters["match_id"] as string[]) ?? [];
      return {
        data: opts.pollMatchIds
          .filter((id) => ids.includes(id))
          .map((id) => ({ match_id: id })),
      };
    }
    if (op.table === "poll_matches" && op.kind === "update") {
      // Mirror PostgREST: the changed rows come back.
      const ids = (op.filters["match_id"] as string[]) ?? [];
      return { data: ids.map((id) => ({ match_id: id })) };
    }
    return {};
  });
}

describe("setFeaturedMatchesForPlanner", () => {
  it("features a match that is in the poll and has a kick-off time", async () => {
    const { client, ops } = scenario({
      pollMatchIds: ["m1"],
      matches: [WITH_KICKOFF],
    });
    hoisted.client = client;

    const result = await setFeaturedMatchesForPlanner(
      ctx,
      "poll-1",
      ["m1"],
      true,
    );

    expect(result.updated).toEqual([
      { match_id: "m1", label: "HIC H1 – Bloemendaal H1" },
    ]);
    expect(result.skipped_no_kickoff).toEqual([]);
    expect(result.skipped_not_in_poll).toEqual([]);

    const update = ops.find((op) => op.kind === "update");
    expect(update?.table).toBe("poll_matches");
    expect(update?.payload).toEqual({ featured: true });
    expect(update?.filters).toMatchObject({
      poll_id: "poll-1",
      match_id: ["m1"],
    });
  });

  it("reports a match with no kick-off time as skipped and never writes it", async () => {
    const { client, ops } = scenario({
      pollMatchIds: ["m2"],
      matches: [NO_KICKOFF],
    });
    hoisted.client = client;

    const result = await setFeaturedMatchesForPlanner(
      ctx,
      "poll-1",
      ["m2"],
      true,
    );

    expect(result.updated).toEqual([]);
    expect(result.skipped_no_kickoff).toEqual([
      { match_id: "m2", label: "HIC D2 – Kampong D3" },
    ]);
    expect(ops.some((op) => op.kind === "update")).toBe(false);
  });

  it("reports match ids that are not in the poll", async () => {
    const { client } = scenario({
      pollMatchIds: ["m1"],
      matches: [WITH_KICKOFF],
    });
    hoisted.client = client;

    const result = await setFeaturedMatchesForPlanner(
      ctx,
      "poll-1",
      ["m1", "not-in-poll"],
      true,
    );

    expect(result.skipped_not_in_poll).toEqual(["not-in-poll"]);
    expect(result.updated.map((m) => m.match_id)).toEqual(["m1"]);
  });

  it("unfeatures without the kick-off requirement", async () => {
    // Hiding a match must always work, even one whose kick-off was cleared
    // after it was featured — otherwise it could never be taken down again.
    const { client, ops } = scenario({
      pollMatchIds: ["m2"],
      matches: [NO_KICKOFF],
    });
    hoisted.client = client;

    const result = await setFeaturedMatchesForPlanner(
      ctx,
      "poll-1",
      ["m2"],
      false,
    );

    expect(result.updated.map((m) => m.match_id)).toEqual(["m2"]);
    expect(result.skipped_no_kickoff).toEqual([]);
    const update = ops.find((op) => op.kind === "update");
    expect(update?.payload).toEqual({ featured: false });
  });

  it("scopes the match lookup to the planner's organization", async () => {
    const { client, ops } = scenario({
      pollMatchIds: ["m1"],
      matches: [WITH_KICKOFF],
    });
    hoisted.client = client;

    await setFeaturedMatchesForPlanner(ctx, "poll-1", ["m1"], true);

    const matchSelect = ops.find((op) => op.table === "matches");
    expect(matchSelect?.filters).toMatchObject({ organization_id: "org-1" });
  });
});
