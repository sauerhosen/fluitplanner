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
});
