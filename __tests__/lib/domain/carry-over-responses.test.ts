import { describe, it, expect } from "vitest";
import {
  planResponseCarryOver,
  countDiscardedResponses,
  carryOverCandidates,
} from "@/lib/domain/carry-over-responses";
import { groupMatchesIntoSlots } from "@/lib/domain/slots";
import type { AvailabilityResponse, PollSlot } from "@/lib/types/domain";

function slot(id: string, start: string, end: string): PollSlot {
  return { id, poll_id: "poll-1", start_time: start, end_time: end };
}

function answer(
  slotId: string,
  umpireId: string,
  response: AvailabilityResponse["response"],
): AvailabilityResponse {
  return {
    id: `r-${slotId}-${umpireId}`,
    poll_id: "poll-1",
    slot_id: slotId,
    participant_name: `Umpire ${umpireId}`,
    response,
    umpire_id: umpireId,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-02T10:00:00Z",
  };
}

// The reported case: a 12:20 placeholder had slot 12:00–14:00 (local, UTC+2);
// adding the real 12:10 match merges both into 11:45–14:00.
const OLD = slot("old", "2026-10-03T10:00:00Z", "2026-10-03T12:00:00Z");
const MERGED = slot("new", "2026-10-03T09:45:00Z", "2026-10-03T12:00:00Z");

describe("planResponseCarryOver", () => {
  it("moves answers from a replaced slot onto its shifted successor", () => {
    const responses = [answer("old", "u1", "yes"), answer("old", "u2", "no")];

    const { carried, discarded } = planResponseCarryOver(
      [OLD],
      [MERGED],
      responses,
    );

    expect(discarded).toEqual([]);
    expect(carried).toEqual([
      { ...responses[0], slot_id: "new" },
      { ...responses[1], slot_id: "new" },
    ]);
  });

  it("keeps the original timestamps so the answer is not reported as new", () => {
    const { carried } = planResponseCarryOver(
      [OLD],
      [MERGED],
      [answer("old", "u1", "if_need_be")],
    );

    expect(carried[0].created_at).toBe("2026-09-01T10:00:00Z");
    expect(carried[0].updated_at).toBe("2026-09-02T10:00:00Z");
    expect(carried[0].response).toBe("if_need_be");
  });

  it("carries across an end-only shift", () => {
    const extended = slot(
      "new",
      "2026-10-03T10:00:00Z",
      "2026-10-03T12:15:00Z",
    );

    const { carried } = planResponseCarryOver(
      [OLD],
      [extended],
      [answer("old", "u1", "yes")],
    );

    expect(carried).toHaveLength(1);
  });

  it("discards answers when the new window moved more than a quarter hour", () => {
    // A different match in a different part of the day is not the same
    // question; a "yes" for 12:00–14:00 says nothing about 13:30–15:30.
    const later = slot("new", "2026-10-03T11:30:00Z", "2026-10-03T13:30:00Z");
    const responses = [answer("old", "u1", "yes")];

    const { carried, discarded } = planResponseCarryOver(
      [OLD],
      [later],
      responses,
    );

    expect(carried).toEqual([]);
    expect(discarded).toEqual(responses);
  });

  it("never overwrites an answer the umpire already gave on the target", () => {
    const { carried, discarded } = planResponseCarryOver(
      [OLD],
      [MERGED],
      [answer("old", "u1", "yes"), answer("new", "u1", "no")],
    );

    expect(carried).toEqual([]);
    // The umpire still has an answer for the window, so nothing was lost.
    expect(discarded).toEqual([]);
  });

  it("takes each umpire's answer from the closest replaced slot", () => {
    // Only reachable after a partial failure left overlapping slots behind;
    // the nearest window is the better stand-in.
    const near = slot("near", "2026-10-03T09:45:00Z", "2026-10-03T11:45:00Z");
    const far = slot("far", "2026-10-03T10:00:00Z", "2026-10-03T12:15:00Z");
    const target = slot("t", "2026-10-03T09:45:00Z", "2026-10-03T12:00:00Z");

    const { carried } = planResponseCarryOver(
      [far, near],
      [target],
      [
        answer("far", "u1", "no"),
        answer("near", "u1", "yes"),
        answer("far", "u2", "if_need_be"),
      ],
    );

    expect(
      carried.map((r) => [r.umpire_id, r.response, r.slot_id]).sort(),
    ).toEqual([
      ["u1", "yes", "t"],
      ["u2", "if_need_be", "t"],
    ]);
  });

  it("ignores answers on slots that are not being removed", () => {
    const kept = slot("kept", "2026-10-03T13:30:00Z", "2026-10-03T15:30:00Z");

    const { carried, discarded } = planResponseCarryOver(
      [OLD],
      [MERGED, kept],
      [answer("kept", "u1", "yes")],
    );

    expect(carried).toEqual([]);
    expect(discarded).toEqual([]);
  });
});

describe("carryOverCandidates", () => {
  it("returns only the slots close enough to inherit from a removed slot", () => {
    const far = slot("far", "2026-10-03T13:30:00Z", "2026-10-03T15:30:00Z");

    expect(carryOverCandidates([OLD], [MERGED, far])).toEqual([MERGED]);
  });
});

describe("countDiscardedResponses", () => {
  it("counts nothing for the placeholder-then-real-match case", () => {
    const existing = [OLD];
    const desired = groupMatchesIntoSlots([
      { start_time: "2026-10-03T10:20:00Z" },
      { start_time: "2026-10-03T10:10:00Z" },
    ]);

    expect(
      countDiscardedResponses(existing, desired, [
        answer("old", "u1", "yes"),
        answer("old", "u2", "no"),
      ]),
    ).toBe(0);
  });

  it("counts answers on slots whose matches left the poll", () => {
    const later = slot("later", "2026-10-03T13:30:00Z", "2026-10-03T15:30:00Z");
    const desired = groupMatchesIntoSlots([
      { start_time: "2026-10-03T10:20:00Z" },
    ]);

    expect(
      countDiscardedResponses([OLD, later], desired, [
        answer("old", "u1", "yes"),
        answer("later", "u1", "yes"),
        answer("later", "u2", "no"),
      ]),
    ).toBe(2);
  });
});
