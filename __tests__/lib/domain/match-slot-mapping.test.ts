import { describe, it, expect } from "vitest";
import { mapMatchesToSlots } from "@/lib/domain/match-slot-mapping";
import type { Match, PollSlot } from "@/lib/types/domain";

describe("mapMatchesToSlots", () => {
  const slots: PollSlot[] = [
    {
      id: "slot-1",
      poll_id: "poll-1",
      start_time: "2026-03-15T10:30:00Z",
      end_time: "2026-03-15T12:30:00Z",
    },
    {
      id: "slot-2",
      poll_id: "poll-1",
      start_time: "2026-03-15T14:00:00Z",
      end_time: "2026-03-15T16:00:00Z",
    },
  ];

  it("maps a match to the slot that contains its start time", () => {
    const result = mapMatchesToSlots(
      [{ id: "m1", start_time: "2026-03-15T11:00:00Z" } as Match],
      slots,
    );
    expect(result.get("m1")).toBe("slot-1");
  });

  it("maps a match to the correct slot when multiple slots exist", () => {
    const result = mapMatchesToSlots(
      [{ id: "m1", start_time: "2026-03-15T14:30:00Z" } as Match],
      slots,
    );
    expect(result.get("m1")).toBe("slot-2");
  });

  it("returns undefined for a match with no matching slot", () => {
    const result = mapMatchesToSlots(
      [{ id: "m1", start_time: "2026-03-16T11:00:00Z" } as Match],
      slots,
    );
    expect(result.get("m1")).toBeUndefined();
  });

  it("returns undefined for a match with no start_time", () => {
    const result = mapMatchesToSlots(
      [{ id: "m1", start_time: null } as Match],
      slots,
    );
    expect(result.get("m1")).toBeUndefined();
  });

  it("maps multiple matches correctly", () => {
    const result = mapMatchesToSlots(
      [
        { id: "m1", start_time: "2026-03-15T11:00:00Z" } as Match,
        { id: "m2", start_time: "2026-03-15T14:30:00Z" } as Match,
      ],
      slots,
    );
    expect(result.get("m1")).toBe("slot-1");
    expect(result.get("m2")).toBe("slot-2");
  });

  describe("with overlapping slots", () => {
    // Real poll, Sat 21 Nov (CET = UTC+1). Slots are 2h long but start
    // 15-45 min apart, so a match start falls inside several of them.
    const overlapping: PollSlot[] = [
      // 10:10 + 10:20 merged: 09:45-12:00
      {
        id: "s0945",
        poll_id: "p",
        start_time: "2026-11-21T08:45:00Z",
        end_time: "2026-11-21T11:00:00Z",
      },
      {
        id: "s1015",
        poll_id: "p",
        start_time: "2026-11-21T09:15:00Z",
        end_time: "2026-11-21T11:15:00Z",
      },
      {
        id: "s1100",
        poll_id: "p",
        start_time: "2026-11-21T10:00:00Z",
        end_time: "2026-11-21T12:00:00Z",
      },
      {
        id: "s1145",
        poll_id: "p",
        start_time: "2026-11-21T10:45:00Z",
        end_time: "2026-11-21T12:45:00Z",
      },
      {
        id: "s1530",
        poll_id: "p",
        start_time: "2026-11-21T14:30:00Z",
        end_time: "2026-11-21T16:30:00Z",
      },
    ];

    it("maps each match to the slot generated for it, not the first containing one", () => {
      const result = mapMatchesToSlots(
        [
          { id: "m1010", start_time: "2026-11-21T09:10:00Z" },
          { id: "m1020", start_time: "2026-11-21T09:20:00Z" },
          { id: "m1045", start_time: "2026-11-21T09:45:00Z" },
          { id: "m1130", start_time: "2026-11-21T10:30:00Z" },
          { id: "m1210", start_time: "2026-11-21T11:10:00Z" },
          { id: "m1550", start_time: "2026-11-21T14:50:00Z" },
        ],
        overlapping,
      );
      expect(Object.fromEntries(result)).toEqual({
        m1010: "s0945",
        m1020: "s0945",
        m1045: "s1015",
        m1130: "s1100",
        m1210: "s1145",
        m1550: "s1530",
      });
    });

    it("does not depend on the order slots are passed in", () => {
      const result = mapMatchesToSlots(
        [{ id: "m1045", start_time: "2026-11-21T09:45:00Z" }],
        [...overlapping].reverse(),
      );
      expect(result.get("m1045")).toBe("s1015");
    });

    it("falls back to the earliest containing slot when all start after the match's own slot", () => {
      // m1130's own slot starts 10:00 UTC, but these stale slots start later.
      const result = mapMatchesToSlots(
        [{ id: "m1130", start_time: "2026-11-21T10:30:00Z" }],
        [
          {
            id: "late",
            start_time: "2026-11-21T10:30:00Z",
            end_time: "2026-11-21T12:30:00Z",
          },
          {
            id: "early",
            start_time: "2026-11-21T10:15:00Z",
            end_time: "2026-11-21T12:15:00Z",
          },
        ],
      );
      expect(result.get("m1130")).toBe("early");
    });
  });
});
