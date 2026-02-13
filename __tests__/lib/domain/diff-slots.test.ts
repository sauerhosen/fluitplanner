import { describe, it, expect } from "vitest";
import { diffSlots } from "@/lib/domain/diff-slots";
import type { PollSlot } from "@/lib/types/domain";
import type { TimeSlot } from "@/lib/types/domain";

function makeSlot(id: string, startIso: string, endIso: string): PollSlot {
  return { id, poll_id: "poll-1", start_time: startIso, end_time: endIso };
}

function makeTimeSlot(startIso: string, endIso: string): TimeSlot {
  return { start: new Date(startIso), end: new Date(endIso) };
}

describe("diffSlots", () => {
  it("returns all new slots as toAdd when existing is empty", () => {
    const existing: PollSlot[] = [];
    const desired: TimeSlot[] = [
      makeTimeSlot("2026-02-15T10:45:00Z", "2026-02-15T12:45:00Z"),
    ];
    const result = diffSlots(existing, desired);
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0].start.toISOString()).toBe(
      "2026-02-15T10:45:00.000Z",
    );
    expect(result.toRemove).toHaveLength(0);
    expect(result.toKeep).toHaveLength(0);
  });

  it("returns all existing slots as toRemove when desired is empty", () => {
    const existing = [
      makeSlot("s1", "2026-02-15T10:45:00Z", "2026-02-15T12:45:00Z"),
    ];
    const desired: TimeSlot[] = [];
    const result = diffSlots(existing, desired);
    expect(result.toAdd).toHaveLength(0);
    expect(result.toRemove).toHaveLength(1);
    expect(result.toRemove[0].id).toBe("s1");
    expect(result.toKeep).toHaveLength(0);
  });

  it("keeps matching slots and identifies adds and removes", () => {
    const existing = [
      makeSlot("s1", "2026-02-15T10:45:00Z", "2026-02-15T12:45:00Z"),
      makeSlot("s2", "2026-02-15T14:00:00Z", "2026-02-15T16:00:00Z"),
    ];
    const desired: TimeSlot[] = [
      makeTimeSlot("2026-02-15T10:45:00Z", "2026-02-15T12:45:00Z"),
      makeTimeSlot("2026-02-16T09:00:00Z", "2026-02-16T11:00:00Z"),
    ];
    const result = diffSlots(existing, desired);
    expect(result.toKeep).toHaveLength(1);
    expect(result.toKeep[0].id).toBe("s1");
    expect(result.toRemove).toHaveLength(1);
    expect(result.toRemove[0].id).toBe("s2");
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0].start.toISOString()).toBe(
      "2026-02-16T09:00:00.000Z",
    );
  });

  it("returns empty arrays when both inputs are empty", () => {
    const result = diffSlots([], []);
    expect(result.toAdd).toHaveLength(0);
    expect(result.toRemove).toHaveLength(0);
    expect(result.toKeep).toHaveLength(0);
  });

  it("keeps all when existing matches desired exactly", () => {
    const existing = [
      makeSlot("s1", "2026-02-15T10:45:00Z", "2026-02-15T12:45:00Z"),
    ];
    const desired: TimeSlot[] = [
      makeTimeSlot("2026-02-15T10:45:00Z", "2026-02-15T12:45:00Z"),
    ];
    const result = diffSlots(existing, desired);
    expect(result.toAdd).toHaveLength(0);
    expect(result.toRemove).toHaveLength(0);
    expect(result.toKeep).toHaveLength(1);
  });
});
