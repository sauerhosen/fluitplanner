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

const { setPollMatchesHidden } = await import("@/lib/actions/hidden-matches");

function respondWith(handlers: {
  poll?: unknown[] | null;
  /** Rows the update reports back; [] models a write RLS silently dropped. */
  updatedRows?: unknown[] | null;
}) {
  state.respond = (op) => {
    if (op.table === "polls")
      return { data: handlers.poll ?? [{ id: "poll-1" }] };
    if (op.table === "poll_matches" && op.kind === "update") {
      if (handlers.updatedRows !== undefined)
        return { data: handlers.updatedRows };
      const ids = op.filters["match_id"] as string[];
      return { data: ids.map((id) => ({ match_id: id })) };
    }
    return {};
  };
}

beforeEach(() => {
  state.ops = [];
  respondWith({});
});

afterEach(() => {
  gate.role = "planner";
});

describe("setPollMatchesHidden", () => {
  it("writes the flag scoped to the poll and the given matches", async () => {
    await expect(
      setPollMatchesHidden("poll-1", ["m1", "m2"], true),
    ).resolves.toEqual({ ok: true });

    const update = state.ops.find((op) => op.kind === "update");
    expect(update?.table).toBe("poll_matches");
    expect(update?.payload).toEqual({ hidden: true });
    expect(update?.filters).toEqual({
      poll_id: "poll-1",
      match_id: ["m1", "m2"],
    });
  });

  it("checks the poll belongs to the planner's organization", async () => {
    await setPollMatchesHidden("poll-1", ["m1"], false);

    const pollRead = state.ops.find((op) => op.table === "polls");
    expect(pollRead?.filters).toEqual({
      id: "poll-1",
      organization_id: "org-1",
    });
  });

  it("refuses a poll outside the planner's organization", async () => {
    respondWith({ poll: [] });

    await expect(setPollMatchesHidden("poll-1", ["m1"], true)).resolves.toEqual(
      { ok: false, reason: "not_in_poll" },
    );
    expect(state.ops.some((op) => op.kind === "update")).toBe(false);
  });

  it("reports a write that changed no rows", async () => {
    respondWith({ updatedRows: [] });

    await expect(setPollMatchesHidden("poll-1", ["m1"], true)).resolves.toEqual(
      { ok: false, reason: "not_in_poll" },
    );
  });

  it("reports a bulk write that changed only some of the matches", async () => {
    respondWith({ updatedRows: [{ match_id: "m1" }] });

    await expect(
      setPollMatchesHidden("poll-1", ["m1", "m2"], false),
    ).resolves.toEqual({ ok: false, reason: "not_in_poll" });
  });

  it("does nothing for an empty list", async () => {
    await expect(setPollMatchesHidden("poll-1", [], true)).resolves.toEqual({
      ok: true,
    });
    expect(state.ops).toEqual([]);
  });

  it("rejects viewers", async () => {
    gate.role = "viewer";
    await expect(setPollMatchesHidden("poll-1", ["m1"], true)).rejects.toThrow(
      "NOT_PLANNER",
    );
    expect(state.ops.some((op) => op.kind === "update")).toBe(false);
  });
});
