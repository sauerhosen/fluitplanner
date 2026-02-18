import { describe, it, expect } from "vitest";
import {
  prepareResponseExport,
  prepareAssignmentExport,
} from "@/lib/export/prepare-export-data";
import type {
  PollSlot,
  AvailabilityResponse,
  Match,
  Assignment,
  Umpire,
} from "@/lib/types/domain";

// Identity formatters for testing (no locale dependency)
const fmtDate = (iso: string) => iso;
const fmtTime = (iso: string) => iso;

/* ------------------------------------------------------------------ */
/*  prepareResponseExport                                              */
/* ------------------------------------------------------------------ */

describe("prepareResponseExport", () => {
  it("returns empty rows when there are no responses", () => {
    const result = prepareResponseExport(
      "Test Poll",
      [
        {
          id: "s1",
          poll_id: "p1",
          start_time: "2026-03-15T10:00:00Z",
          end_time: "2026-03-15T12:00:00Z",
        },
      ],
      [],
      fmtDate,
      fmtTime,
    );
    expect(result.pollTitle).toBe("Test Poll");
    expect(result.headers).toHaveLength(1);
    expect(result.rows).toHaveLength(0);
  });

  it("produces correct cell for a single umpire and slot", () => {
    const slots: PollSlot[] = [
      {
        id: "s1",
        poll_id: "p1",
        start_time: "2026-03-15T10:00:00Z",
        end_time: "2026-03-15T12:00:00Z",
      },
    ];
    const responses: AvailabilityResponse[] = [
      {
        id: "r1",
        poll_id: "p1",
        slot_id: "s1",
        participant_name: "Alice",
        response: "yes",
        umpire_id: "u1",
        created_at: "",
        updated_at: "",
      },
    ];

    const result = prepareResponseExport(
      "Poll",
      slots,
      responses,
      fmtDate,
      fmtTime,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].umpireName).toBe("Alice");
    expect(result.rows[0].cells).toEqual(["yes"]);
  });

  it("sorts umpires alphabetically", () => {
    const slots: PollSlot[] = [
      {
        id: "s1",
        poll_id: "p1",
        start_time: "2026-03-15T10:00:00Z",
        end_time: "2026-03-15T12:00:00Z",
      },
    ];
    const responses: AvailabilityResponse[] = [
      {
        id: "r1",
        poll_id: "p1",
        slot_id: "s1",
        participant_name: "Charlie",
        response: "yes",
        umpire_id: "u3",
        created_at: "",
        updated_at: "",
      },
      {
        id: "r2",
        poll_id: "p1",
        slot_id: "s1",
        participant_name: "Alice",
        response: "no",
        umpire_id: "u1",
        created_at: "",
        updated_at: "",
      },
      {
        id: "r3",
        poll_id: "p1",
        slot_id: "s1",
        participant_name: "Bob",
        response: "if_need_be",
        umpire_id: "u2",
        created_at: "",
        updated_at: "",
      },
    ];

    const result = prepareResponseExport(
      "Poll",
      slots,
      responses,
      fmtDate,
      fmtTime,
    );
    expect(result.rows.map((r) => r.umpireName)).toEqual([
      "Alice",
      "Bob",
      "Charlie",
    ]);
  });

  it("sorts slots chronologically", () => {
    const slots: PollSlot[] = [
      {
        id: "s2",
        poll_id: "p1",
        start_time: "2026-03-16T14:00:00Z",
        end_time: "2026-03-16T16:00:00Z",
      },
      {
        id: "s1",
        poll_id: "p1",
        start_time: "2026-03-15T10:00:00Z",
        end_time: "2026-03-15T12:00:00Z",
      },
    ];

    const result = prepareResponseExport("Poll", slots, [], fmtDate, fmtTime);
    expect(result.headers[0].slotId).toBe("s1");
    expect(result.headers[1].slotId).toBe("s2");
  });

  it("returns null for missing responses", () => {
    const slots: PollSlot[] = [
      {
        id: "s1",
        poll_id: "p1",
        start_time: "2026-03-15T10:00:00Z",
        end_time: "2026-03-15T12:00:00Z",
      },
      {
        id: "s2",
        poll_id: "p1",
        start_time: "2026-03-15T14:00:00Z",
        end_time: "2026-03-15T16:00:00Z",
      },
    ];
    const responses: AvailabilityResponse[] = [
      {
        id: "r1",
        poll_id: "p1",
        slot_id: "s1",
        participant_name: "Alice",
        response: "yes",
        umpire_id: "u1",
        created_at: "",
        updated_at: "",
      },
    ];

    const result = prepareResponseExport(
      "Poll",
      slots,
      responses,
      fmtDate,
      fmtTime,
    );
    expect(result.rows[0].cells).toEqual(["yes", null]);
  });

  it("excludes responses without umpire_id", () => {
    const slots: PollSlot[] = [
      {
        id: "s1",
        poll_id: "p1",
        start_time: "2026-03-15T10:00:00Z",
        end_time: "2026-03-15T12:00:00Z",
      },
    ];
    const responses: AvailabilityResponse[] = [
      {
        id: "r1",
        poll_id: "p1",
        slot_id: "s1",
        participant_name: "Anonymous",
        response: "yes",
        umpire_id: null,
        created_at: "",
        updated_at: "",
      },
    ];

    const result = prepareResponseExport(
      "Poll",
      slots,
      responses,
      fmtDate,
      fmtTime,
    );
    expect(result.rows).toHaveLength(0);
  });

  it("builds header timeRange from formatTime callbacks", () => {
    const slots: PollSlot[] = [
      {
        id: "s1",
        poll_id: "p1",
        start_time: "2026-03-15T10:00:00Z",
        end_time: "2026-03-15T12:00:00Z",
      },
    ];
    const customFmtTime = (iso: string) => {
      const d = new Date(iso);
      return `${d.getUTCHours()}h`;
    };

    const result = prepareResponseExport(
      "Poll",
      slots,
      [],
      fmtDate,
      customFmtTime,
    );
    expect(result.headers[0].timeRange).toBe("10h - 12h");
  });
});

/* ------------------------------------------------------------------ */
/*  prepareAssignmentExport                                            */
/* ------------------------------------------------------------------ */

describe("prepareAssignmentExport", () => {
  const baseMatch: Match = {
    id: "m1",
    date: "2026-03-15",
    start_time: "2026-03-15T14:00:00Z",
    home_team: "Team A",
    away_team: "Team B",
    competition: "League",
    venue: "Stadium",
    field: "1",
    required_level: 1,
    created_by: "user1",
    created_at: "",
    organization_id: "org1",
  };

  const baseUmpire: Umpire = {
    id: "u1",
    auth_user_id: null,
    name: "Alice",
    email: "alice@example.com",
    level: 1,
    created_at: "",
    updated_at: "",
  };

  it("returns empty rows when there are no matches", () => {
    const result = prepareAssignmentExport(
      "Poll",
      [],
      [],
      [],
      fmtDate,
      fmtTime,
    );
    expect(result.pollTitle).toBe("Poll");
    expect(result.rows).toHaveLength(0);
  });

  it("sorts matches by date then start_time", () => {
    const matches: Match[] = [
      {
        ...baseMatch,
        id: "m2",
        date: "2026-03-16",
        start_time: "2026-03-16T10:00:00Z",
      },
      {
        ...baseMatch,
        id: "m1",
        date: "2026-03-15",
        start_time: "2026-03-15T14:00:00Z",
      },
      {
        ...baseMatch,
        id: "m3",
        date: "2026-03-16",
        start_time: "2026-03-16T08:00:00Z",
      },
    ];

    const result = prepareAssignmentExport(
      "Poll",
      matches,
      [],
      [],
      fmtDate,
      fmtTime,
    );
    expect(result.rows.map((r) => r.time)).toEqual([
      "2026-03-15T14:00:00Z",
      "2026-03-16T08:00:00Z",
      "2026-03-16T10:00:00Z",
    ]);
  });

  it("resolves assigned umpire names", () => {
    const umpires: Umpire[] = [
      { ...baseUmpire, id: "u1", name: "Alice" },
      { ...baseUmpire, id: "u2", name: "Bob" },
    ];
    const assignments: Assignment[] = [
      {
        id: "a1",
        poll_id: "p1",
        match_id: "m1",
        umpire_id: "u2",
        created_at: "",
        organization_id: "org1",
      },
      {
        id: "a2",
        poll_id: "p1",
        match_id: "m1",
        umpire_id: "u1",
        created_at: "",
        organization_id: "org1",
      },
    ];

    const result = prepareAssignmentExport(
      "Poll",
      [baseMatch],
      assignments,
      umpires,
      fmtDate,
      fmtTime,
    );
    // Umpire names sorted alphabetically into separate columns
    expect(result.rows[0].umpire1).toBe("Alice");
    expect(result.rows[0].umpire2).toBe("Bob");
  });

  it("shows correct assignment count", () => {
    const umpires: Umpire[] = [{ ...baseUmpire, id: "u1", name: "Alice" }];
    const assignments: Assignment[] = [
      {
        id: "a1",
        poll_id: "p1",
        match_id: "m1",
        umpire_id: "u1",
        created_at: "",
        organization_id: "org1",
      },
    ];

    const result = prepareAssignmentExport(
      "Poll",
      [baseMatch],
      assignments,
      umpires,
      fmtDate,
      fmtTime,
    );
    expect(result.rows[0].assignmentCount).toBe("1/2");
  });

  it("shows 0/2 for unassigned matches", () => {
    const result = prepareAssignmentExport(
      "Poll",
      [baseMatch],
      [],
      [],
      fmtDate,
      fmtTime,
    );
    expect(result.rows[0].assignmentCount).toBe("0/2");
    expect(result.rows[0].umpire1).toBe("");
    expect(result.rows[0].umpire2).toBe("");
  });

  it("uses empty string for unknown umpire IDs instead of raw ID", () => {
    const assignments: Assignment[] = [
      {
        id: "a1",
        poll_id: "p1",
        match_id: "m1",
        umpire_id: "unknown-uuid",
        created_at: "",
        organization_id: "org1",
      },
    ];

    const result = prepareAssignmentExport(
      "Poll",
      [baseMatch],
      assignments,
      [], // no umpires list
      fmtDate,
      fmtTime,
    );
    // Should not leak the raw UUID
    expect(result.rows[0].umpire1).toBe("");
    expect(result.rows[0].umpire1).not.toBe("unknown-uuid");
  });

  it("uses empty string for null match fields", () => {
    const match: Match = {
      ...baseMatch,
      start_time: null,
      venue: null,
      field: null,
      competition: null,
    };

    const result = prepareAssignmentExport(
      "Poll",
      [match],
      [],
      [],
      fmtDate,
      fmtTime,
    );
    expect(result.rows[0].time).toBe("");
    expect(result.rows[0].venue).toBe("");
    expect(result.rows[0].field).toBe("");
    expect(result.rows[0].competition).toBe("");
  });
});
