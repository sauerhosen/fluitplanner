import { describe, it, expect } from "vitest";
import { findAvailableUnassigned } from "@/lib/domain/available-unassigned";

const match = (id: string, date = "2026-11-14") => ({ id, date });
const res = (
  slot_id: string,
  umpire_id: string | null,
  response: "yes" | "if_need_be" | "no",
) => ({ slot_id, umpire_id, response });
const asg = (match_id: string, umpire_id: string) => ({ match_id, umpire_id });

describe("findAvailableUnassigned", () => {
  const matches = [
    match("m1", "2026-11-14"),
    match("m2", "2026-11-14"),
    match("m3", "2026-11-15"),
  ];
  const slotMap = new Map([
    ["m1", "s1"],
    ["m2", "s2"],
    ["m3", "s3"],
  ]);

  it("lists umpires who are available on a day and have no assignment there", () => {
    const result = findAvailableUnassigned({
      matches,
      matchSlotMap: slotMap,
      responses: [res("s1", "u1", "yes"), res("s3", "u2", "if_need_be")],
      assignments: [],
    });
    expect(result.get("2026-11-14")).toEqual(new Map([["u1", "yes"]]));
    expect(result.get("2026-11-15")).toEqual(new Map([["u2", "if_need_be"]]));
  });

  it("ignores 'no' answers and anonymous responses", () => {
    const result = findAvailableUnassigned({
      matches,
      matchSlotMap: slotMap,
      responses: [res("s1", "u1", "no"), res("s2", null, "yes")],
      assignments: [],
    });
    expect(result.get("2026-11-14")?.size ?? 0).toBe(0);
  });

  it("prefers 'yes' over 'if need be' across the day's slots", () => {
    const result = findAvailableUnassigned({
      matches,
      matchSlotMap: slotMap,
      responses: [res("s1", "u1", "if_need_be"), res("s2", "u1", "yes")],
      assignments: [],
    });
    expect(result.get("2026-11-14")?.get("u1")).toBe("yes");
  });

  it("drops umpires with any assignment that day, tentative or confirmed", () => {
    const result = findAvailableUnassigned({
      matches,
      matchSlotMap: slotMap,
      responses: [
        res("s1", "u1", "yes"),
        res("s3", "u1", "yes"),
        res("s1", "u2", "yes"),
      ],
      assignments: [asg("m2", "u1")],
    });
    expect([...(result.get("2026-11-14")?.keys() ?? [])]).toEqual(["u2"]);
    // An assignment on another day does not count.
    expect(result.get("2026-11-15")?.has("u1")).toBe(true);
  });

  it("does not count availability for hidden matches, but does count their assignments", () => {
    const result = findAvailableUnassigned({
      matches,
      matchSlotMap: slotMap,
      responses: [res("s1", "u1", "yes"), res("s2", "u2", "yes")],
      assignments: [asg("m1", "u2")],
      hiddenMatchIds: new Set(["m1"]),
    });
    expect(result.get("2026-11-14")?.size ?? 0).toBe(0);
  });
});
