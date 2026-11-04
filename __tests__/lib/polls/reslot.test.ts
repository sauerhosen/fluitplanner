import { describe, it, expect, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { groupMatchesIntoSlots } from "@/lib/domain/slots";
import {
  changedPolls,
  reslotOpenPolls,
  reslotPollsForMatches,
} from "@/lib/polls/reslot";

/* ------------------------------------------------------------------ */
/*  An in-memory PostgREST fake: eq / in filters, select / insert /    */
/*  delete, range paging.                                              */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let nextId = 0;

function fakeClient(): SupabaseClient {
  function from(table: string) {
    let kind: "select" | "insert" | "delete" = "select";
    let payload: Row[] = [];
    const preds: Array<(r: Row) => boolean> = [];
    let range: [number, number] | null = null;

    const run = () => {
      const rows = (tables[table] ??= []);
      if (kind === "insert") {
        const inserted = payload.map((r) => ({ id: `new-${nextId++}`, ...r }));
        rows.push(...inserted);
        return { data: inserted, error: null };
      }
      const hit = rows.filter((r) => preds.every((p) => p(r)));
      if (kind === "delete") {
        tables[table] = rows.filter((r) => !hit.includes(r));
        if (table === "poll_slots") {
          const gone = new Set(hit.map((r) => r.id));
          tables.availability_responses = (
            tables.availability_responses ?? []
          ).filter((a) => !gone.has(a.slot_id));
        }
        return { data: hit, error: null };
      }
      return {
        data: range ? hit.slice(range[0], range[1] + 1) : hit,
        error: null,
      };
    };

    const builder = {
      select: () => builder,
      insert: (rows: Row | Row[]) => {
        kind = "insert";
        payload = Array.isArray(rows) ? rows : [rows];
        return builder;
      },
      delete: () => {
        kind = "delete";
        return builder;
      },
      eq: (key: string, value: unknown) => {
        preds.push((r) => r[key] === value);
        return builder;
      },
      in: (key: string, values: unknown[]) => {
        preds.push((r) => values.includes(r[key]));
        return builder;
      },
      order: () => builder,
      range: (a: number, b: number) => {
        range = [a, b];
        return builder;
      },
      then: <T>(ok: (v: ReturnType<typeof run>) => T) =>
        Promise.resolve(run()).then(ok),
    };
    return builder;
  }
  return { from } as unknown as SupabaseClient;
}

/* ------------------------------------------------------------------ */
/*  Fixtures: the reported poll (Saturday 14 Nov, UTC+1). VVV HC        */
/*  MO16-2 was polled at 12:10 and Hockey.nl later moved it to 15:50.   */
/* ------------------------------------------------------------------ */

const ORG = "org-1";
const POLL = "poll-1";

const matchesNow = [
  { id: "jo12", start_time: "2026-11-14T07:30:00.000Z" }, // 08:30
  { id: "jo14", start_time: "2026-11-14T09:10:00.000Z" }, // 10:10
  { id: "mo12", start_time: "2026-11-14T09:15:00.000Z" }, // 10:15
  { id: "mo14", start_time: "2026-11-14T09:20:00.000Z" }, // 10:20
  { id: "mo18", start_time: "2026-11-14T13:00:00.000Z" }, // 14:00
  { id: "jo18", start_time: "2026-11-14T14:30:00.000Z" }, // 15:30
  { id: "mo16", start_time: "2026-11-14T14:50:00.000Z" }, // 15:50 (moved)
];
const asPolled = matchesNow.map((m) =>
  m.id === "mo16" ? { ...m, start_time: "2026-11-14T11:10:00.000Z" } : m,
);

function slotRows(pollId: string, matches: { start_time: string }[]) {
  return groupMatchesIntoSlots(matches).map((s, i) => ({
    id: `${pollId}-slot-${i}`,
    poll_id: pollId,
    start_time: s.start.toISOString(),
    end_time: s.end.toISOString(),
  }));
}

const iso = (s: string) => new Date(s).toISOString();

function seed(opts: { status?: string; org?: string } = {}) {
  const slots = slotRows(POLL, asPolled);
  tables = {
    polls: [
      {
        id: POLL,
        organization_id: opts.org ?? ORG,
        status: opts.status ?? "open",
      },
    ],
    matches: matchesNow.map((m) => ({ ...m, organization_id: ORG })),
    poll_matches: matchesNow.map((m) => ({ poll_id: POLL, match_id: m.id })),
    poll_slots: slots,
    availability_responses: slots.map((s, i) => ({
      id: `r-${i}`,
      poll_id: POLL,
      slot_id: s.id,
      umpire_id: "u1",
      participant_name: "Umpire 1",
      response: "no",
      created_at: "2026-11-01T10:00:00Z",
      updated_at: "2026-11-01T10:00:00Z",
    })),
  };
}

const windows = () =>
  (tables.poll_slots as { start_time: string; end_time: string }[])
    .map((s) => `${s.start_time}–${s.end_time}`)
    .sort();

beforeEach(() => {
  nextId = 0;
  seed();
});

describe("reslotPollsForMatches", () => {
  it("drops the slot a moved match left behind and asks about its new window", async () => {
    // Sanity: the stale poll still asks about 11:45–13:45 local.
    expect(windows()).toContain(
      `${iso("2026-11-14T10:45:00Z")}–${iso("2026-11-14T12:45:00Z")}`,
    );

    const results = await reslotPollsForMatches(fakeClient(), ORG, ["mo16"]);

    expect(results).toEqual([
      {
        pollId: POLL,
        slotsAdded: 1,
        slotsRemoved: 1,
        carriedResponses: 0,
        discardedResponses: 1,
      },
    ]);
    expect(windows()).toEqual(
      slotRows(POLL, matchesNow)
        .map((s) => `${s.start_time}–${s.end_time}`)
        .sort(),
    );
    expect(windows()).toContain(
      `${iso("2026-11-14T14:30:00Z")}–${iso("2026-11-14T16:30:00Z")}`,
    );
    // Answers on the untouched slots survive.
    expect(tables.availability_responses).toHaveLength(4);
  });

  it("carries answers onto a window that only shifted a quarter hour", async () => {
    // mo16 moves from 12:10 to 12:25 local: its window shifts 11:45 → 12:00.
    tables.matches = tables.matches.map((m) =>
      m.id === "mo16" ? { ...m, start_time: "2026-11-14T11:25:00.000Z" } : m,
    );

    const [result] = await reslotPollsForMatches(fakeClient(), ORG, ["mo16"]);

    expect(result).toMatchObject({
      slotsAdded: 1,
      slotsRemoved: 1,
      carriedResponses: 1,
      discardedResponses: 0,
    });
    expect(tables.availability_responses).toHaveLength(5);
  });

  it("is a no-op when the slots already match the kick-offs", async () => {
    tables.matches = tables.matches.map((m) =>
      m.id === "mo16" ? { ...m, start_time: "2026-11-14T11:10:00.000Z" } : m,
    );
    const before = windows();

    const results = await reslotPollsForMatches(fakeClient(), ORG, ["mo16"]);

    expect(changedPolls(results)).toEqual([]);
    expect(windows()).toEqual(before);
    expect(tables.availability_responses).toHaveLength(5);
  });

  it("leaves a closed poll as umpires answered it", async () => {
    seed({ status: "closed" });
    const before = windows();

    expect(await reslotPollsForMatches(fakeClient(), ORG, ["mo16"])).toEqual(
      [],
    );
    expect(windows()).toEqual(before);
  });

  it("never touches another organization's poll", async () => {
    seed({ org: "org-2" });
    const before = windows();

    expect(await reslotPollsForMatches(fakeClient(), ORG, ["mo16"])).toEqual(
      [],
    );
    expect(windows()).toEqual(before);
  });

  it("waits while a match in the poll has no kick-off", async () => {
    tables.matches = tables.matches.map((m) =>
      m.id === "jo12" ? { ...m, start_time: null } : m,
    );
    const before = windows();

    expect(await reslotPollsForMatches(fakeClient(), ORG, ["mo16"])).toEqual([
      { pollId: POLL, skipped: "match_without_time" },
    ]);
    expect(windows()).toEqual(before);
  });
});

describe("reslotOpenPolls", () => {
  it("drops the slot of a deleted match", async () => {
    tables.matches = tables.matches.filter((m) => m.id !== "mo18");
    tables.poll_matches = tables.poll_matches.filter(
      (pm) => pm.match_id !== "mo18",
    );

    const [result] = await reslotOpenPolls(fakeClient(), ORG, [POLL]);

    expect(result).toMatchObject({ slotsAdded: 1, slotsRemoved: 2 });
    expect(windows()).toEqual(
      slotRows(
        POLL,
        matchesNow.filter((m) => m.id !== "mo18"),
      )
        .map((s) => `${s.start_time}–${s.end_time}`)
        .sort(),
    );
  });

  it("clears the slots of a poll whose matches are all gone", async () => {
    tables.poll_matches = [];

    const [result] = await reslotOpenPolls(fakeClient(), ORG, [POLL]);

    expect(result).toMatchObject({ slotsAdded: 0, slotsRemoved: 5 });
    expect(tables.poll_slots).toEqual([]);
    expect(tables.availability_responses).toEqual([]);
  });
});
