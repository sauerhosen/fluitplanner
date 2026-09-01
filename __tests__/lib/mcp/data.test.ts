import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { groupMatchesIntoSlots } from "@/lib/domain/slots";
import type { McpPlannerContext } from "@/lib/mcp/auth";

const hoisted = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => hoisted.client as SupabaseClient,
}));

const { addMatchesToPollForPlanner } = await import("@/lib/mcp/data");

/* ------------------------------------------------------------------ */
/*  A fake PostgREST builder                                           */
/* ------------------------------------------------------------------ */

type RecordedOp = {
  table: string;
  kind: "select" | "insert" | "delete";
  filters: Record<string, unknown>;
  payload?: unknown;
  counting: boolean;
};

type Reply = {
  data?: unknown[] | null;
  error?: { message: string } | null;
  count?: number | null;
};

type Settled = {
  data: unknown[] | null;
  error: { message: string } | null;
  count: number | null;
};

type Builder = {
  select: (cols?: string, opts?: { count?: string; head?: boolean }) => Builder;
  insert: (payload: unknown) => Builder;
  delete: () => Builder;
  eq: (key: string, value: unknown) => Builder;
  neq: (key: string, value: unknown) => Builder;
  in: (key: string, value: unknown[]) => Builder;
  maybeSingle: () => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
  then: <T>(
    onOk: (value: Settled) => T,
    onErr?: (e: unknown) => T,
  ) => Promise<T>;
};

/**
 * Records every query the data layer issues, in the order it is awaited, and
 * answers it from `respond`. The op order is the point: these tests are about
 * what has already been destroyed when a later write fails.
 */
function makeClient(respond: (op: RecordedOp) => Reply) {
  const ops: RecordedOp[] = [];

  function from(table: string): Builder {
    const op: RecordedOp = {
      table,
      kind: "select",
      filters: {},
      counting: false,
    };

    const settle = (): Settled => {
      ops.push(op);
      const reply = respond(op);
      return {
        data: reply.data ?? null,
        error: reply.error ?? null,
        count: reply.count ?? null,
      };
    };

    const builder: Builder = {
      select(_cols, opts) {
        op.kind = "select";
        if (opts?.count) op.counting = true;
        return builder;
      },
      insert(payload) {
        op.kind = "insert";
        op.payload = payload;
        return builder;
      },
      delete() {
        op.kind = "delete";
        return builder;
      },
      eq(key, value) {
        op.filters[key] = value;
        return builder;
      },
      neq(key, value) {
        op.filters[`neq:${key}`] = value;
        return builder;
      },
      in(key, value) {
        op.filters[key] = value;
        return builder;
      },
      maybeSingle() {
        const settled = settle();
        return Promise.resolve({
          data: settled.data?.[0] ?? null,
          error: settled.error,
        });
      },
      then(onOk, onErr) {
        return Promise.resolve(settle()).then(onOk, onErr);
      },
    };
    return builder;
  }

  return { client: { from } as unknown as SupabaseClient, ops };
}

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

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

// 11:15 → slot 10:45–12:45. 11:20 → slot 11:00–13:00, which merges with it
// into 10:45–13:00 — so adding m3 REPLACES m1's slot and discards its answers.
const M1 = { id: "m1", start_time: "2026-03-15T11:15:00Z" };
const M3 = { id: "m3", start_time: "2026-03-15T11:20:00Z" };

type SlotRow = {
  id: string;
  poll_id: string;
  start_time: string;
  end_time: string;
};

function slotsFor(matches: { id: string; start_time: string }[]): SlotRow[] {
  return groupMatchesIntoSlots(matches).map((s, i) => ({
    id: `s${i + 1}`,
    poll_id: poll.id,
    start_time: s.start.toISOString(),
    end_time: s.end.toISOString(),
  }));
}

function scenario(opts: {
  pollMatchIds: string[];
  allMatches: { id: string; start_time: string | null }[];
  existingSlots: SlotRow[];
  discardedPerBatch?: number;
  failPollMatchesInsert?: boolean;
}) {
  return makeClient((op): Reply => {
    if (op.table === "polls") return { data: [poll] };
    if (op.table === "matches") {
      const ids = (op.filters["id"] as string[]) ?? [];
      return { data: opts.allMatches.filter((m) => ids.includes(m.id)) };
    }
    if (op.table === "poll_matches" && op.kind === "insert") {
      return opts.failPollMatchesInsert
        ? {
            error: {
              message: 'duplicate key value violates "poll_matches_pkey"',
            },
          }
        : {};
    }
    if (op.table === "poll_matches") {
      // The other-open-poll probe filters on match_id; membership on poll_id.
      if (op.filters["match_id"]) return { data: [] };
      return { data: opts.pollMatchIds.map((id) => ({ match_id: id })) };
    }
    if (op.table === "poll_slots" && op.kind === "select") {
      return { data: opts.existingSlots };
    }
    if (op.table === "poll_slots") return {};
    if (op.table === "availability_responses") {
      return { count: opts.discardedPerBatch ?? 0 };
    }
    return { data: [] };
  });
}

const writes = (ops: RecordedOp[]) =>
  ops
    .filter((o) => o.kind === "insert" || o.kind === "delete")
    .map((o) => `${o.table} ${o.kind}`);

/* ------------------------------------------------------------------ */

describe("addMatchesToPollForPlanner", () => {
  beforeEach(() => {
    hoisted.client = null;
  });

  it("destroys no answers when the poll_matches insert fails", async () => {
    const { client, ops } = scenario({
      pollMatchIds: ["m1"],
      allMatches: [M1, M3],
      existingSlots: slotsFor([M1]),
      discardedPerBatch: 4,
      failPollMatchesInsert: true,
    });
    hoisted.client = client;

    await expect(
      addMatchesToPollForPlanner(ctx, poll.id, ["m3"]),
    ).rejects.toThrow(/poll_matches_pkey/);

    // The old ordering deleted the slots first, so a failure here left the
    // planner with neither the answers nor the match.
    expect(writes(ops)).not.toContain("poll_slots delete");
  });

  it("inserts before it deletes, so a failure is never destructive", async () => {
    const { client, ops } = scenario({
      pollMatchIds: ["m1"],
      allMatches: [M1, M3],
      existingSlots: slotsFor([M1]),
      discardedPerBatch: 4,
    });
    hoisted.client = client;

    const result = await addMatchesToPollForPlanner(ctx, poll.id, ["m3"]);

    expect(result.added).toBe(1);
    expect(writes(ops)).toEqual([
      "poll_matches insert",
      "poll_slots insert",
      "poll_slots delete",
    ]);
    expect(result.answers_discarded?.count).toBe(4);
  });

  it("does not blame the added matches for discarded answers", async () => {
    const { client } = scenario({
      pollMatchIds: ["m1"],
      allMatches: [M1, M3],
      existingSlots: slotsFor([M1]),
      discardedPerBatch: 4,
    });
    hoisted.client = client;

    const result = await addMatchesToPollForPlanner(ctx, poll.id, ["m3"]);
    const caution = result.answers_discarded?.caution ?? "";

    // Slots are recomputed from every match in the poll, so a kick-off that
    // moved after the poll was built discards answers here too.
    expect(caution).not.toMatch(/Adding these matches shifted/);
    expect(caution).toMatch(/changed since the poll was built/);
  });

  it("repairs drifted slots even when every match is already in the poll", async () => {
    const { client } = scenario({
      pollMatchIds: ["m1"],
      allMatches: [M1],
      // m1 wants 10:45–12:45; this poll still has the window it got when the
      // match had a different kick-off.
      existingSlots: [
        {
          id: "s-stale",
          poll_id: poll.id,
          start_time: "2026-03-15T09:00:00Z",
          end_time: "2026-03-15T11:00:00Z",
        },
      ],
    });
    hoisted.client = client;

    const result = await addMatchesToPollForPlanner(ctx, poll.id, ["m1"]);

    expect(result.added).toBe(0);
    expect(result.slots_added).toBe(1);
    expect(result.slots_replaced).toBe(1);
    expect(result.note).toMatch(/recomputed/);
    expect(result.note).not.toMatch(/nothing changed/);
  });

  it("reports nothing changed only when the slots are already correct", async () => {
    const { client, ops } = scenario({
      pollMatchIds: ["m1"],
      allMatches: [M1],
      existingSlots: slotsFor([M1]),
    });
    hoisted.client = client;

    const result = await addMatchesToPollForPlanner(ctx, poll.id, ["m1"]);

    expect(result.added).toBe(0);
    expect(result.note).toMatch(/nothing changed/);
    expect(writes(ops)).toEqual([]);
  });

  it("batches the slot delete and the answer count past the URL limit", async () => {
    // Distinct windows: diffSlots keys slots by start/end, so repeated
    // timestamps would collapse into far fewer rows to remove.
    const stale: SlotRow[] = Array.from({ length: 250 }, (_, i) => {
      const start = Date.UTC(2026, 0, 1) + i * 60 * 60 * 1000;
      return {
        id: `stale-${i}`,
        poll_id: poll.id,
        start_time: new Date(start).toISOString(),
        end_time: new Date(start + 2 * 60 * 60 * 1000).toISOString(),
      };
    });
    const { client, ops } = scenario({
      pollMatchIds: ["m1"],
      allMatches: [M1],
      existingSlots: stale,
      discardedPerBatch: 2,
    });
    hoisted.client = client;

    const result = await addMatchesToPollForPlanner(ctx, poll.id, ["m1"]);

    const deletes = ops.filter(
      (o) => o.table === "poll_slots" && o.kind === "delete",
    );
    const counts = ops.filter((o) => o.table === "availability_responses");

    expect(deletes).toHaveLength(3);
    expect(counts).toHaveLength(3);
    for (const d of deletes) {
      expect((d.filters["id"] as string[]).length).toBeLessThanOrEqual(100);
    }
    expect(deletes.flatMap((d) => d.filters["id"] as string[])).toHaveLength(
      250,
    );
    // Counted per batch, not just the first one.
    expect(result.answers_discarded?.count).toBe(6);
  });
});
