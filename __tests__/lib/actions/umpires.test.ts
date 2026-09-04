import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gate } from "@/__tests__/helpers/auth-gate";
import { MAX_NOTE_LENGTH } from "@/lib/domain/notes";

const mockGetUser = vi.fn();
/** Captures the payload of every `.update()` on a table, keyed by table name. */
const tableUpdates = new Map<string, unknown[]>();
/** Rows the mocked roster query returns; the tests set this per case. */
let rosterRows: { umpire_id: string; notes: string | null }[] = [];
let umpireRows: Record<string, unknown>[] = [];
/** Roster rows a scoped `.update()` claims to have matched. */
let rosterUpdateMatches: { umpire_id: string }[] = [];
/** Errors to inject, keyed `table.kind` (e.g. "umpires.update"). */
let injectedErrors = new Map<string, { message: string }>();

// The write actions gate through requirePlanner(); flip `gate.role` to
// "viewer" to make the caller read-only for one test.
vi.mock("@/lib/auth", async () =>
  (await import("@/__tests__/helpers/auth-gate")).authGateMock(),
);

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
  getTenantId: vi.fn(async () => "test-org-id"),
  getTenantSlug: vi.fn(async () => "test"),
  isRootDomain: vi.fn(async () => false),
}));

/**
 * A chainable stub: every PostgREST builder method returns the same object, so
 * the action can chain freely. `.single()`/`.maybeSingle()` resolve to the
 * first row, awaiting the builder resolves to the list — matching PostgREST.
 * Writes and `.eq()` filters are recorded so the tests can assert what was
 * written and how it was scoped.
 */
function makeQuery(table: string) {
  const eqCalls: [string, unknown][] = [];
  let didUpdate = false;

  function rows(): unknown[] {
    if (table === "organization_umpires") {
      // A note write selects back the roster rows it matched; a plain read
      // returns the roster itself.
      return didUpdate ? rosterUpdateMatches : rosterRows;
    }
    return umpireRows;
  }

  /** The error injected for this builder's write, if the test asked for one. */
  function writeError() {
    for (const kind of ["insert", "update", "upsert"]) {
      const err = injectedErrors.get(`${table}.${kind}`);
      if (err && tableUpdates.has(`${table}.${kind}`)) return err;
    }
    return null;
  }

  const builder: Record<string, unknown> = {
    eqCalls,
    select: vi.fn(() => builder),
    insert: vi.fn((payload: unknown) => {
      pushCall(table, "insert", payload);
      return builder;
    }),
    update: vi.fn((payload: unknown) => {
      didUpdate = true;
      pushCall(table, "update", payload);
      return builder;
    }),
    upsert: vi.fn((payload: unknown) => {
      pushCall(table, "upsert", payload);
      return builder;
    }),
    delete: vi.fn(() => builder),
    eq: vi.fn((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return builder;
    }),
    in: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data: rows()[0] ?? null,
      error: writeError(),
    })),
    single: vi.fn(async () => ({
      data: rows()[0] ?? null,
      error: writeError(),
    })),
    // Awaiting the builder itself (list queries, and the note update's
    // select-back) yields the full row set.
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: writeError() }).then(onFulfilled),
  };
  return builder;
}

function pushCall(table: string, kind: string, payload: unknown) {
  const key = `${table}.${kind}`;
  if (!tableUpdates.has(key)) tableUpdates.set(key, []);
  tableUpdates.get(key)!.push(payload);
}

/** The last query builder created per table, for asserting `.eq()` scoping. */
const lastQuery = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      const q = makeQuery(table);
      lastQuery.set(table, q);
      return q;
    }),
    auth: { getUser: mockGetUser },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  tableUpdates.clear();
  lastQuery.clear();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  injectedErrors = new Map();
  rosterRows = [{ umpire_id: "u-1", notes: "Father of a player" }];
  rosterUpdateMatches = [{ umpire_id: "u-1" }];
  umpireRows = [
    {
      id: "u-1",
      auth_user_id: null,
      name: "Jan de Vries",
      email: "jan@example.com",
      level: 2,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];
});

describe("getUmpires", () => {
  it("merges the organization's roster note onto each umpire", async () => {
    const { getUmpires } = await import("@/lib/actions/umpires");

    const [umpire] = await getUmpires();

    expect(umpire).toMatchObject({
      id: "u-1",
      name: "Jan de Vries",
      notes: "Father of a player",
    });
  });

  it("reports no note for an umpire whose roster row carries none", async () => {
    rosterRows = [{ umpire_id: "u-1", notes: null }];
    const { getUmpires } = await import("@/lib/actions/umpires");

    const [umpire] = await getUmpires();

    expect(umpire.notes).toBeNull();
  });
});

describe("updateUmpireNotes", () => {
  it("writes the note to the roster row, not to the shared umpire record", async () => {
    const { updateUmpireNotes } = await import("@/lib/actions/umpires");

    await updateUmpireNotes("u-1", "  Not yet ready for this level  ");

    expect(tableUpdates.get("organization_umpires.update")).toEqual([
      { notes: "Not yet ready for this level" },
    ]);
    // The umpires table is shared between organizations — a note must never
    // land there, where every org (and `anon`) can read it.
    expect(tableUpdates.has("umpires.update")).toBe(false);
  });

  it("scopes the write to the caller's organization", async () => {
    const { updateUmpireNotes } = await import("@/lib/actions/umpires");

    await updateUmpireNotes("u-1", "Not yet ready");

    expect(lastQuery.get("organization_umpires")!.eqCalls).toEqual([
      ["organization_id", "test-org-id"],
      ["umpire_id", "u-1"],
    ]);
  });

  it("clears a blanked note to NULL rather than an empty string", async () => {
    const { updateUmpireNotes } = await import("@/lib/actions/umpires");

    await updateUmpireNotes("u-1", "   ");

    expect(tableUpdates.get("organization_umpires.update")).toEqual([
      { notes: null },
    ]);
  });

  it("rejects an over-long note before writing", async () => {
    const { updateUmpireNotes } = await import("@/lib/actions/umpires");

    await expect(
      updateUmpireNotes("u-1", "x".repeat(MAX_NOTE_LENGTH + 1)),
    ).rejects.toThrow(/2000 characters/);
    expect(tableUpdates.has("organization_umpires.update")).toBe(false);
  });

  it("fails when the umpire is not on this organization's roster", async () => {
    rosterUpdateMatches = [];
    const { updateUmpireNotes } = await import("@/lib/actions/umpires");

    await expect(
      updateUmpireNotes("other-org-umpire", "Sneaky"),
    ).rejects.toThrow(/not in this organization/i);
  });
});

describe("updateUmpire", () => {
  it("leaves the note alone when the caller does not send one", async () => {
    const { updateUmpire } = await import("@/lib/actions/umpires");

    const result = await updateUmpire("u-1", { level: 3 });

    expect(tableUpdates.has("organization_umpires.update")).toBe(false);
    expect(tableUpdates.get("umpires.update")).toEqual([{ level: 3 }]);
    // The existing note is reported back rather than dropped.
    expect(result.notes).toBe("Father of a player");
  });

  it("writes a note sent alongside other fields", async () => {
    const { updateUmpire } = await import("@/lib/actions/umpires");

    const result = await updateUmpire("u-1", {
      level: 3,
      notes: "Not yet ready for this team level",
    });

    expect(tableUpdates.get("organization_umpires.update")).toEqual([
      { notes: "Not yet ready for this team level" },
    ]);
    expect(result.notes).toBe("Not yet ready for this team level");
  });

  it("does not commit the note when the umpire record fails to save", async () => {
    // A planner edits the note and the email at once, and the email collides
    // with another umpire. The note must not survive a save that failed.
    injectedErrors.set("umpires.update", { message: "duplicate key value" });
    const { updateUmpire } = await import("@/lib/actions/umpires");

    await expect(
      updateUmpire("u-1", {
        email: "taken@example.com",
        notes: "Not yet ready for this team level",
      }),
    ).rejects.toThrow(/duplicate key/);

    expect(tableUpdates.has("organization_umpires.update")).toBe(false);
  });

  it("rejects an over-long note without touching the umpire record", async () => {
    const { updateUmpire } = await import("@/lib/actions/umpires");

    await expect(
      updateUmpire("u-1", { notes: "x".repeat(MAX_NOTE_LENGTH + 1) }),
    ).rejects.toThrow(/2000 characters/);
    expect(tableUpdates.has("umpires.update")).toBe(false);
  });
});

describe("createUmpire", () => {
  it("rejects an over-long note before creating anything", async () => {
    const { createUmpire } = await import("@/lib/actions/umpires");

    await expect(
      createUmpire({
        name: "Nieuwe Scheids",
        email: "nieuw@example.com",
        notes: "x".repeat(MAX_NOTE_LENGTH + 1),
      }),
    ).rejects.toThrow(/2000 characters/);
    expect(tableUpdates.has("umpires.insert")).toBe(false);
    expect(tableUpdates.has("organization_umpires.upsert")).toBe(false);
  });

  it("reports the note the roster actually holds, not the one it was sent", async () => {
    // Re-adding a rostered umpire with an empty note leaves their existing
    // note in place, so the returned record must show that note.
    const { createUmpire } = await import("@/lib/actions/umpires");

    const result = await createUmpire({
      name: "Jan de Vries",
      email: "jan@example.com",
      notes: "",
    });

    expect(tableUpdates.has("organization_umpires.update")).toBe(false);
    expect(result.notes).toBe("Father of a player");
  });

  it("does not blank an existing note when no note is given", async () => {
    const { createUmpire } = await import("@/lib/actions/umpires");

    await createUmpire({ name: "Jan de Vries", email: "jan@example.com" });

    // Re-adding a rostered umpire must not wipe the note they already carry.
    expect(tableUpdates.has("organization_umpires.update")).toBe(false);
  });

  it("stores a note given at creation time on the roster row", async () => {
    const { createUmpire } = await import("@/lib/actions/umpires");

    await createUmpire({
      name: "Jan de Vries",
      email: "jan@example.com",
      notes: "Father of a player",
    });

    expect(tableUpdates.get("organization_umpires.update")).toEqual([
      { notes: "Father of a player" },
    ]);
    expect(tableUpdates.has("umpires.insert")).toBe(false);
  });
});

describe("viewer role", () => {
  afterEach(() => {
    gate.role = "planner";
  });

  it("refuses every umpire write with NOT_PLANNER", async () => {
    gate.role = "viewer";
    const { createUmpire, updateUmpire, updateUmpireNotes, deleteUmpire } =
      await import("@/lib/actions/umpires");
    await expect(
      createUmpire({ name: "X", email: "x@example.com" }),
    ).rejects.toThrow("NOT_PLANNER");
    await expect(updateUmpire("u1", { name: "Y" })).rejects.toThrow(
      "NOT_PLANNER",
    );
    await expect(updateUmpireNotes("u1", "note")).rejects.toThrow(
      "NOT_PLANNER",
    );
    await expect(deleteUmpire("u1")).rejects.toThrow("NOT_PLANNER");
  });
});
