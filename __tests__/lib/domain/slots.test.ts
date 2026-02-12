import { describe, it, expect } from "vitest";
import { calculateSlot, groupMatchesIntoSlots } from "@/lib/domain/slots";

describe("calculateSlot", () => {
  it("subtracts 30 min and rounds down to quarter hour (match at 11:15)", () => {
    const match = new Date("2025-03-15T11:15:00Z");
    const slot = calculateSlot(match);
    expect(slot.start).toEqual(new Date("2025-03-15T10:45:00Z"));
    expect(slot.end).toEqual(new Date("2025-03-15T12:45:00Z"));
  });

  it("rounds down when not on quarter hour (match at 12:05)", () => {
    const match = new Date("2025-03-15T12:05:00Z");
    const slot = calculateSlot(match);
    expect(slot.start).toEqual(new Date("2025-03-15T11:30:00Z"));
    expect(slot.end).toEqual(new Date("2025-03-15T13:30:00Z"));
  });

  it("handles match exactly on the hour (14:00)", () => {
    const match = new Date("2025-03-15T14:00:00Z");
    const slot = calculateSlot(match);
    expect(slot.start).toEqual(new Date("2025-03-15T13:30:00Z"));
    expect(slot.end).toEqual(new Date("2025-03-15T15:30:00Z"));
  });

  it("handles match at quarter past (10:15)", () => {
    const match = new Date("2025-03-15T10:15:00Z");
    const slot = calculateSlot(match);
    expect(slot.start).toEqual(new Date("2025-03-15T09:45:00Z"));
    expect(slot.end).toEqual(new Date("2025-03-15T11:45:00Z"));
  });

  it("rounds down 1 min past quarter hour (10:01)", () => {
    const match = new Date("2025-03-15T10:01:00Z");
    const slot = calculateSlot(match);
    expect(slot.start).toEqual(new Date("2025-03-15T09:30:00Z"));
    expect(slot.end).toEqual(new Date("2025-03-15T11:30:00Z"));
  });

  it("rounds down 14 min past quarter hour (10:44)", () => {
    const match = new Date("2025-03-15T10:44:00Z");
    const slot = calculateSlot(match);
    expect(slot.start).toEqual(new Date("2025-03-15T10:00:00Z"));
    expect(slot.end).toEqual(new Date("2025-03-15T12:00:00Z"));
  });

  it("handles midnight boundary (match at 00:15)", () => {
    const match = new Date("2025-03-15T00:15:00Z");
    const slot = calculateSlot(match);
    expect(slot.start).toEqual(new Date("2025-03-14T23:45:00Z"));
    expect(slot.end).toEqual(new Date("2025-03-15T01:45:00Z"));
  });
});

describe("groupMatchesIntoSlots", () => {
  it("returns empty array for empty input", () => {
    expect(groupMatchesIntoSlots([])).toEqual([]);
  });

  it("returns single slot for single match", () => {
    const matches = [{ start_time: new Date("2025-03-15T11:15:00Z") }];
    const slots = groupMatchesIntoSlots(matches);
    expect(slots).toHaveLength(1);
    expect(slots[0].start).toEqual(new Date("2025-03-15T10:45:00Z"));
    expect(slots[0].end).toEqual(new Date("2025-03-15T12:45:00Z"));
  });

  it("deduplicates exact same slots", () => {
    const matches = [
      { start_time: new Date("2025-03-15T11:15:00Z") },
      { start_time: new Date("2025-03-15T11:15:00Z") },
    ];
    const slots = groupMatchesIntoSlots(matches);
    expect(slots).toHaveLength(1);
  });

  it("merges slots with starts <= 15 min apart", () => {
    // Match A at 11:00 -> slot 10:30-12:30
    // Match B at 11:15 -> slot 10:45-12:45
    // Starts are 15 min apart -> merge to 10:30-12:45
    const matches = [
      { start_time: new Date("2025-03-15T11:00:00Z") },
      { start_time: new Date("2025-03-15T11:15:00Z") },
    ];
    const slots = groupMatchesIntoSlots(matches);
    expect(slots).toHaveLength(1);
    expect(slots[0].start).toEqual(new Date("2025-03-15T10:30:00Z"));
    expect(slots[0].end).toEqual(new Date("2025-03-15T12:45:00Z"));
  });

  it("keeps slots separate when starts > 15 min apart", () => {
    // Match A at 11:15 -> slot 10:45-12:45
    // Match B at 11:46 -> slot 11:15-13:15
    // Starts are 30 min apart -> two separate slots
    const matches = [
      { start_time: new Date("2025-03-15T11:15:00Z") },
      { start_time: new Date("2025-03-15T11:46:00Z") },
    ];
    const slots = groupMatchesIntoSlots(matches);
    expect(slots).toHaveLength(2);
    expect(slots[0].start).toEqual(new Date("2025-03-15T10:45:00Z"));
    expect(slots[1].start).toEqual(new Date("2025-03-15T11:15:00Z"));
  });

  it("merges A+B but not C when C is > 15 min from group start", () => {
    // Match A at 11:00 -> slot 10:30-12:30
    // Match B at 11:15 -> slot 10:45-12:45
    // Match C at 11:31 -> slot 11:00-13:00
    // A+B merge (starts 15 min apart) -> group start 10:30
    // C start 11:00 vs group start 10:30 = 30 min -> separate
    const matches = [
      { start_time: new Date("2025-03-15T11:00:00Z") },
      { start_time: new Date("2025-03-15T11:15:00Z") },
      { start_time: new Date("2025-03-15T11:31:00Z") },
    ];
    const slots = groupMatchesIntoSlots(matches);
    expect(slots).toHaveLength(2);
    expect(slots[0].start).toEqual(new Date("2025-03-15T10:30:00Z"));
    expect(slots[0].end).toEqual(new Date("2025-03-15T12:45:00Z"));
    expect(slots[1].start).toEqual(new Date("2025-03-15T11:00:00Z"));
    expect(slots[1].end).toEqual(new Date("2025-03-15T13:00:00Z"));
  });

  it("handles string ISO dates as input", () => {
    const matches = [{ start_time: "2025-03-15T11:15:00Z" }];
    const slots = groupMatchesIntoSlots(matches);
    expect(slots).toHaveLength(1);
    expect(slots[0].start).toEqual(new Date("2025-03-15T10:45:00Z"));
  });

  it("matches on different days are never merged", () => {
    const matches = [
      { start_time: new Date("2025-03-15T11:15:00Z") },
      { start_time: new Date("2025-03-16T11:15:00Z") },
    ];
    const slots = groupMatchesIntoSlots(matches);
    expect(slots).toHaveLength(2);
  });

  it("sorts output chronologically", () => {
    const matches = [
      { start_time: new Date("2025-03-15T16:00:00Z") },
      { start_time: new Date("2025-03-15T10:00:00Z") },
    ];
    const slots = groupMatchesIntoSlots(matches);
    expect(slots[0].start.getTime()).toBeLessThan(slots[1].start.getTime());
  });
});
