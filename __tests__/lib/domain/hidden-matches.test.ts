import { describe, it, expect } from "vitest";
import {
  collapseHiddenMatches,
  withoutHidden,
} from "@/lib/domain/hidden-matches";

const m = (id: string, date = "2026-11-14") => ({ id, date });

describe("collapseHiddenMatches", () => {
  it("keeps visible matches as their own columns", () => {
    expect(collapseHiddenMatches([m("a"), m("b")], new Set())).toEqual([
      { kind: "match", match: m("a") },
      { kind: "match", match: m("b") },
    ]);
  });

  it("folds a run of consecutive hidden matches into one segment", () => {
    const segs = collapseHiddenMatches(
      [m("a"), m("b"), m("c"), m("d")],
      new Set(["b", "c"]),
    );
    expect(segs).toEqual([
      { kind: "match", match: m("a") },
      { kind: "hidden", key: "hidden-b", matches: [m("b"), m("c")] },
      { kind: "match", match: m("d") },
    ]);
  });

  it("never folds hidden matches across a date boundary", () => {
    const segs = collapseHiddenMatches(
      [m("a", "2026-11-14"), m("b", "2026-11-15")],
      new Set(["a", "b"]),
    );
    expect(segs).toHaveLength(2);
    expect(segs.every((s) => s.kind === "hidden")).toBe(true);
  });
});

describe("withoutHidden", () => {
  it("drops hidden matches", () => {
    expect(withoutHidden([m("a"), m("b")], ["b"])).toEqual([m("a")]);
  });

  it("returns the same array when nothing is hidden", () => {
    const list = [m("a")];
    expect(withoutHidden(list, [])).toBe(list);
  });
});
