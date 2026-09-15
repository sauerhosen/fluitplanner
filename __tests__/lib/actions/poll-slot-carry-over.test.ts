import { describe, it, expect, vi, beforeEach } from "vitest";
import { groupMatchesIntoSlots } from "@/lib/domain/slots";

/* ------------------------------------------------------------------ */
/*  A recording PostgREST fake                                         */
/* ------------------------------------------------------------------ */

type Op = {
  table: string;
  kind: "select" | "insert" | "delete";
  filters: Record<string, unknown>;
  payload?: unknown;
};

type Reply = { data?: unknown; error?: { message: string } | null };

const state = vi.hoisted(() => ({
  ops: [] as Op[],
  respond: (() => ({})) as (op: Op) => Reply,
}));

function from(table: string) {
  const op: Op = { table, kind: "select", filters: {} };
  const settle = () => {
    state.ops.push(op);
    const reply = state.respond(op);
    return { data: reply.data ?? null, error: reply.error ?? null };
  };
  const builder = {
    // insert(...).select() still writes; it only asks for the rows back.
    select() {
      return builder;
    },
    insert(payload: unknown) {
      op.kind = "insert";
      op.payload = payload;
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
    in(key: string, value: unknown) {
      op.filters[key] = value;
      return builder;
    },
    order() {
      return builder;
    },
    range() {
      return builder;
    },
    single() {
      const settled = settle();
      const rows = settled.data as unknown[] | null;
      return Promise.resolve({ data: rows?.[0] ?? null, error: settled.error });
    },
    then<T>(onOk: (v: ReturnType<typeof settle>) => T) {
      return Promise.resolve(settle()).then(onOk);
    },
  };
  return builder;
}

vi.mock("@/lib/auth", async () =>
  (await import("@/__tests__/helpers/auth-gate")).authGateMock(),
);

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "org-1"),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from,
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { updatePollMatches } = await import("@/lib/actions/polls");

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

// The reported case (UTC+2): placeholder at 12:20 → slot 12:00–14:00; the
// real match at 12:10 merges both into 11:45–14:00.
const PLACEHOLDER = {
  id: "m-temp",
  start_time: "2026-10-03T10:20:00Z",
  featured_by_default: false,
};
const REAL = {
  id: "m-real",
  start_time: "2026-10-03T10:10:00Z",
  featured_by_default: false,
};

const [placeholderWindow] = groupMatchesIntoSlots([PLACEHOLDER]);
const OLD_SLOT = {
  id: "slot-old",
  poll_id: "poll-1",
  start_time: placeholderWindow.start.toISOString(),
  end_time: placeholderWindow.end.toISOString(),
};

const ANSWERS = ["u1", "u2"].map((umpireId) => ({
  id: `r-${umpireId}`,
  poll_id: "poll-1",
  slot_id: OLD_SLOT.id,
  umpire_id: umpireId,
  participant_name: `Umpire ${umpireId}`,
  response: "yes",
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-02T10:00:00Z",
}));

function scenario(opts: { failResponsesInsert?: boolean } = {}) {
  state.ops = [];
  state.respond = (op) => {
    if (op.table === "polls") return { data: [{ id: "poll-1" }] };
    if (op.table === "matches") return { data: [PLACEHOLDER, REAL] };
    if (op.table === "poll_slots" && op.kind === "select") {
      return { data: [OLD_SLOT] };
    }
    if (op.table === "poll_slots" && op.kind === "insert") {
      const rows = op.payload as Record<string, unknown>[];
      return { data: rows.map((r, i) => ({ ...r, id: `slot-new-${i}` })) };
    }
    if (op.table === "availability_responses" && op.kind === "select") {
      const ids = (op.filters["slot_id"] as string[]) ?? [];
      return { data: ANSWERS.filter((a) => ids.includes(a.slot_id)) };
    }
    if (op.table === "availability_responses" && op.kind === "insert") {
      return opts.failResponsesInsert
        ? { error: { message: "copying answers failed" } }
        : {};
    }
    if (op.table === "poll_matches" && op.kind === "select") {
      return { data: [{ match_id: PLACEHOLDER.id, featured: false }] };
    }
    return {};
  };
}

const writes = () =>
  state.ops
    .filter((o) => o.kind !== "select")
    .map((o) => `${o.table} ${o.kind}`);

/* ------------------------------------------------------------------ */

describe("updatePollMatches slot changes", () => {
  beforeEach(() => scenario());

  it("carries answers onto a slot whose window only shifted", async () => {
    await updatePollMatches("poll-1", [PLACEHOLDER.id, REAL.id]);

    const copy = state.ops.find(
      (o) => o.table === "availability_responses" && o.kind === "insert",
    );
    const rows = copy?.payload as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.slot_id === "slot-new-0")).toBe(true);
    expect(rows.some((r) => "id" in r)).toBe(false);
    expect(rows[0]).toMatchObject({
      poll_id: "poll-1",
      umpire_id: "u1",
      response: "yes",
      created_at: "2026-09-01T10:00:00Z",
    });
  });

  it("copies answers before it deletes the replaced slot", async () => {
    await updatePollMatches("poll-1", [PLACEHOLDER.id, REAL.id]);

    const slotWrites = writes().filter((w) => !w.startsWith("poll_matches"));
    expect(slotWrites).toEqual([
      "poll_slots insert",
      "availability_responses insert",
      "poll_slots delete",
    ]);
  });

  it("keeps the old slot and its answers when copying fails", async () => {
    scenario({ failResponsesInsert: true });

    await expect(
      updatePollMatches("poll-1", [PLACEHOLDER.id, REAL.id]),
    ).rejects.toThrow(/copying answers failed/);

    expect(writes()).not.toContain("poll_slots delete");
  });
});
