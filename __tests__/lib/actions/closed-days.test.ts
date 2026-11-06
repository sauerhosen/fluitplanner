import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gate } from "@/__tests__/helpers/auth-gate";

/* ------------------------------------------------------------------ */
/*  A recording PostgREST fake                                         */
/* ------------------------------------------------------------------ */

type RecordedOp = {
  table: string;
  kind: "select" | "upsert" | "delete";
  filters: Record<string, unknown>;
  payload?: unknown;
  options?: unknown;
};

const state = {
  pollRows: [{ id: "poll-1" }] as unknown[],
  ops: [] as RecordedOp[],
};

function from(table: string) {
  const op: RecordedOp = { table, kind: "select", filters: {} };

  const settle = () => {
    state.ops.push(op);
    const data = table === "polls" ? state.pollRows : [];
    return { data, error: null };
  };

  const builder = {
    select() {
      return builder;
    },
    upsert(payload: unknown, options: unknown) {
      op.kind = "upsert";
      op.payload = payload;
      op.options = options;
      return builder;
    },
    delete() {
      op.kind = "delete";
      return builder;
    },
    eq(key: string, value: unknown) {
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

const { setPollDayClosed } = await import("@/lib/actions/closed-days");

beforeEach(() => {
  state.ops = [];
  state.pollRows = [{ id: "poll-1" }];
});

afterEach(() => {
  gate.role = "planner";
});

describe("setPollDayClosed", () => {
  it("closes a day with an idempotent upsert", async () => {
    await expect(
      setPollDayClosed("poll-1", "2026-09-05", true),
    ).resolves.toEqual({ ok: true });

    const write = state.ops.find((op) => op.table === "poll_closed_days");
    expect(write?.kind).toBe("upsert");
    expect(write?.payload).toEqual({ poll_id: "poll-1", day: "2026-09-05" });
    expect(write?.options).toMatchObject({ ignoreDuplicates: true });
  });

  it("reopens a day by deleting its row", async () => {
    await setPollDayClosed("poll-1", "2026-09-05", false);

    const write = state.ops.find((op) => op.table === "poll_closed_days");
    expect(write?.kind).toBe("delete");
    expect(write?.filters).toEqual({ poll_id: "poll-1", day: "2026-09-05" });
  });

  it("checks the poll belongs to the planner's organization", async () => {
    await setPollDayClosed("poll-1", "2026-09-05", true);

    const pollRead = state.ops.find((op) => op.table === "polls");
    expect(pollRead?.filters).toEqual({
      id: "poll-1",
      organization_id: "org-1",
    });
  });

  it("refuses a poll outside the planner's organization", async () => {
    state.pollRows = [];

    await expect(
      setPollDayClosed("poll-1", "2026-09-05", true),
    ).resolves.toEqual({ ok: false, reason: "not_found" });
    expect(state.ops.some((op) => op.table === "poll_closed_days")).toBe(false);
  });

  it("rejects a malformed day before touching the database", async () => {
    await expect(
      setPollDayClosed("poll-1", "5 September", true),
    ).rejects.toThrow("Invalid day");
    expect(state.ops).toEqual([]);
  });

  it("rejects viewers", async () => {
    gate.role = "viewer";
    await expect(
      setPollDayClosed("poll-1", "2026-09-05", true),
    ).rejects.toThrow("NOT_PLANNER");
    expect(state.ops.some((op) => op.table === "poll_closed_days")).toBe(false);
  });
});
