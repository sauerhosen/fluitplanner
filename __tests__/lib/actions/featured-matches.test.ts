import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gate } from "@/__tests__/helpers/auth-gate";

/* ------------------------------------------------------------------ */
/*  A recording PostgREST fake                                         */
/* ------------------------------------------------------------------ */

type RecordedOp = {
  table: string;
  kind: "select" | "update";
  filters: Record<string, unknown>;
  payload?: unknown;
};

type Reply = { data?: unknown[] | null };

type Responder = (op: RecordedOp) => Reply;

const state = {
  respond: (() => ({})) as Responder,
  ops: [] as RecordedOp[],
};

function from(table: string) {
  const op: RecordedOp = { table, kind: "select", filters: {} };

  const settle = () => {
    state.ops.push(op);
    const reply = state.respond(op);
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
    single() {
      const settled = settle();
      const row = (settled.data as unknown[])?.[0] ?? null;
      return Promise.resolve({
        data: row,
        error: row ? null : { message: "not found" },
      });
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

// The write actions gate through requirePlanner(); flip `gate.role` to
// "viewer" to make the caller read-only for one test.
vi.mock("@/lib/auth", async () =>
  (await import("@/__tests__/helpers/auth-gate")).authGateMock(),
);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "org-1"),
  getTenantId: vi.fn(async () => "org-1"),
  getTenantSlug: vi.fn(async () => "test"),
  isRootDomain: vi.fn(async () => false),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u1" } } })) },
  })),
}));

const { setPollMatchFeatured, setMatchFeaturedByDefault } =
  await import("@/lib/actions/featured-matches");

const POLL = { id: "poll-1" };
const WITH_KICKOFF = { start_time: "2026-03-15T11:15:00Z" };
const NO_KICKOFF = { start_time: null };

function respondWith(handlers: {
  poll?: unknown[] | null;
  match?: unknown[] | null;
  pollMatches?: unknown[] | null;
  /** Rows the update reports back; [] models a write RLS silently dropped. */
  updatedRows?: unknown[] | null;
  /** Rows the matches update reports back; [] models a vanished match. */
  matchUpdated?: unknown[] | null;
}) {
  state.respond = (op) => {
    if (op.table === "polls") return { data: handlers.poll ?? [POLL] };
    if (op.table === "matches" && op.kind === "select") {
      return { data: handlers.match ?? [WITH_KICKOFF] };
    }
    if (op.table === "matches" && op.kind === "update") {
      // The default write reads the row back to prove it landed.
      return { data: handlers.matchUpdated ?? [{ id: "m1" }] };
    }
    if (op.table === "poll_matches" && op.kind === "select") {
      return { data: handlers.pollMatches ?? [] };
    }
    if (op.table === "poll_matches" && op.kind === "update") {
      if (handlers.updatedRows !== undefined) {
        return { data: handlers.updatedRows };
      }
      // Mirror PostgREST: the changed rows come back. A row per targeted id,
      // which is what the actions check against.
      const pollIds = op.filters["poll_id"];
      if (Array.isArray(pollIds)) {
        return { data: pollIds.map((id) => ({ poll_id: id })) };
      }
      return { data: [{ match_id: op.filters["match_id"] }] };
    }
    return {};
  };
}

beforeEach(() => {
  state.ops = [];
  respondWith({});
});

describe("setPollMatchFeatured", () => {
  it("writes the flag scoped to the one poll and match", async () => {
    await setPollMatchFeatured("poll-1", "m1", true);

    const update = state.ops.find((op) => op.kind === "update");
    expect(update?.table).toBe("poll_matches");
    expect(update?.payload).toEqual({ featured: true });
    expect(update?.filters).toEqual({ poll_id: "poll-1", match_id: "m1" });
  });

  it("refuses a match with no kick-off time, explaining why", async () => {
    respondWith({ match: [NO_KICKOFF] });

    // Returned, not thrown: Next.js masks a thrown Server Action error, so a
    // reason has to travel back as a value to reach the planner at all.
    await expect(setPollMatchFeatured("poll-1", "m1", true)).resolves.toEqual({
      ok: false,
      reason: "no_kickoff",
    });
    expect(state.ops.some((op) => op.kind === "update")).toBe(false);
  });

  it("skips the kick-off check when hiding a match", async () => {
    respondWith({ match: [NO_KICKOFF] });

    await setPollMatchFeatured("poll-1", "m1", false);

    const update = state.ops.find((op) => op.kind === "update");
    expect(update?.payload).toEqual({ featured: false });
  });

  it("fails loudly when the write changes no rows", async () => {
    // The regression this guards: poll_matches had select/insert/delete
    // policies but no UPDATE policy, so RLS dropped the write and PostgREST
    // reported success having changed nothing. The star then showed the match
    // as featured when it was not.
    respondWith({ updatedRows: [] });

    await expect(setPollMatchFeatured("poll-1", "m1", true)).resolves.toEqual({
      ok: false,
      reason: "not_in_poll",
    });
  });

  it("refuses a poll outside the planner's organization", async () => {
    respondWith({ poll: [] });

    await expect(setPollMatchFeatured("poll-1", "m1", true)).resolves.toEqual({
      ok: false,
      reason: "not_in_poll",
    });
    expect(state.ops.some((op) => op.kind === "update")).toBe(false);
  });
});

describe("setMatchFeaturedByDefault", () => {
  it("reports how many open polls the retroactive change touched", async () => {
    // The blast radius matters: these are links umpires may already hold.
    respondWith({
      pollMatches: [
        { poll_id: "poll-a", featured: false },
        { poll_id: "poll-b", featured: false },
      ],
    });

    const result = await setMatchFeaturedByDefault("m1", true);

    expect(result).toEqual({ ok: true, featured: true, openPollsUpdated: 2 });

    const propagation = state.ops.find(
      (op) => op.table === "poll_matches" && op.kind === "update",
    );
    expect(propagation?.payload).toEqual({ featured: true });
    expect(propagation?.filters).toMatchObject({
      match_id: "m1",
      poll_id: ["poll-a", "poll-b"],
    });
  });

  it("fails loudly when propagation reaches fewer polls than expected", async () => {
    respondWith({
      pollMatches: [
        { poll_id: "poll-a", featured: false },
        { poll_id: "poll-b", featured: false },
      ],
      updatedRows: [{ poll_id: "poll-a" }],
    });

    await expect(setMatchFeaturedByDefault("m1", true)).rejects.toThrow(
      /1 of 2 open polls/,
    );
  });

  it("does not count or rewrite polls that already agree", async () => {
    respondWith({
      pollMatches: [
        { poll_id: "poll-a", featured: true },
        { poll_id: "poll-b", featured: false },
      ],
    });

    const result = await setMatchFeaturedByDefault("m1", true);

    expect(result).toMatchObject({ ok: true, openPollsUpdated: 1 });
    const propagation = state.ops.find(
      (op) => op.table === "poll_matches" && op.kind === "update",
    );
    expect(propagation?.filters).toMatchObject({ poll_id: ["poll-b"] });
  });

  it("still updates the match default when no poll contains it", async () => {
    respondWith({ pollMatches: [] });

    const result = await setMatchFeaturedByDefault("m1", true);

    expect(result).toEqual({ ok: true, featured: true, openPollsUpdated: 0 });
    const matchUpdate = state.ops.find(
      (op) => op.table === "matches" && op.kind === "update",
    );
    expect(matchUpdate?.payload).toEqual({ featured_by_default: true });
    expect(matchUpdate?.filters).toEqual({
      id: "m1",
      organization_id: "org-1",
    });
  });

  it("restricts propagation to open polls in the planner's organization", async () => {
    respondWith({ pollMatches: [] });

    await setMatchFeaturedByDefault("m1", true);

    const lookup = state.ops.find(
      (op) => op.table === "poll_matches" && op.kind === "select",
    );
    expect(lookup?.filters).toMatchObject({
      match_id: "m1",
      "polls.status": "open",
      "polls.organization_id": "org-1",
    });
  });

  it("does not record the default when propagation fails", async () => {
    // Ordering guarantee: the publish to open polls happens first, so a
    // failure leaves nothing changed and a retry is clean, rather than
    // persisting a default that would seed every future poll.
    respondWith({
      pollMatches: [
        { poll_id: "poll-a", featured: false },
        { poll_id: "poll-b", featured: false },
      ],
      updatedRows: [{ poll_id: "poll-a" }],
    });

    await expect(setMatchFeaturedByDefault("m1", true)).rejects.toThrow();

    expect(
      state.ops.some((op) => op.table === "matches" && op.kind === "update"),
    ).toBe(false);
  });

  it("refuses a vanished match before touching any poll", async () => {
    respondWith({
      match: [],
      pollMatches: [{ poll_id: "poll-a", featured: false }],
    });

    await expect(setMatchFeaturedByDefault("m1", false)).resolves.toEqual({
      ok: false,
      reason: "match_not_found",
    });
    // Nothing published: refusing after propagation would leave polls
    // changed while telling the planner the match was not found.
    expect(state.ops.some((op) => op.kind === "update")).toBe(false);
  });

  it("allows hiding a match whose kick-off time was cleared", async () => {
    // Upstream sync can clear a kick-off after the match was featured; the
    // planner must still be able to take it back down.
    respondWith({
      match: [NO_KICKOFF],
      pollMatches: [{ poll_id: "poll-a", featured: true }],
    });

    const result = await setMatchFeaturedByDefault("m1", false);

    expect(result).toEqual({
      ok: true,
      featured: false,
      openPollsUpdated: 1,
    });
  });

  it("refuses to set the default on a match with no kick-off time", async () => {
    respondWith({ match: [NO_KICKOFF] });

    await expect(setMatchFeaturedByDefault("m1", true)).resolves.toEqual({
      ok: false,
      reason: "no_kickoff",
    });
    expect(state.ops.some((op) => op.kind === "update")).toBe(false);
  });
});

describe("viewer role", () => {
  afterEach(() => {
    gate.role = "planner";
  });

  it("refuses to feature a match with NOT_PLANNER", async () => {
    gate.role = "viewer";
    const { setPollMatchFeatured, setMatchFeaturedByDefault } =
      await import("@/lib/actions/featured-matches");
    await expect(setPollMatchFeatured("p1", "m1", true)).rejects.toThrow(
      "NOT_PLANNER",
    );
    await expect(setMatchFeaturedByDefault("m1", true)).rejects.toThrow(
      "NOT_PLANNER",
    );
  });
});
