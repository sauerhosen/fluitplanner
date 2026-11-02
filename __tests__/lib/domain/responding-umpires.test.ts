import { describe, it, expect } from "vitest";
import { onlyRespondingUmpires } from "@/lib/domain/responding-umpires";

const umpires = [
  { id: "u1", name: "Answered" },
  { id: "u2", name: "Silent" },
  { id: "u3", name: "Answered other days" },
  { id: "u4", name: "Silent but assigned" },
];

describe("onlyRespondingUmpires", () => {
  it("keeps umpires who answered a slot in view, in roster order", () => {
    const result = onlyRespondingUmpires(
      umpires,
      ["s1", "s2"],
      [
        { slot_id: "s2", umpire_id: "u1" },
        { slot_id: "s9", umpire_id: "u3" },
      ],
      [],
      ["m1"],
    );
    expect(result.map((u) => u.id)).toEqual(["u1"]);
  });

  it("counts a 'no' as an answer", () => {
    const result = onlyRespondingUmpires(
      umpires,
      ["s1"],
      [{ slot_id: "s1", umpire_id: "u2", response: "no" }],
      [],
      [],
    );
    expect(result.map((u) => u.id)).toEqual(["u2"]);
  });

  it("keeps a silent umpire who is assigned to a match in view", () => {
    const result = onlyRespondingUmpires(
      umpires,
      ["s1"],
      [],
      [
        { match_id: "m1", umpire_id: "u4" },
        { match_id: "m9", umpire_id: "u2" },
      ],
      ["m1"],
    );
    expect(result.map((u) => u.id)).toEqual(["u4"]);
  });

  it("ignores anonymous responses", () => {
    const result = onlyRespondingUmpires(
      umpires,
      ["s1"],
      [{ slot_id: "s1", umpire_id: null }],
      [],
      [],
    );
    expect(result).toEqual([]);
  });
});
