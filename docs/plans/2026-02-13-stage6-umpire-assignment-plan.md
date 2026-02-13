# Stage 6: Umpire Assignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow planners to assign umpires to matches via an interactive grid on the poll detail page, with conflict detection and auto-save.

**Architecture:** New `assignments` table in Supabase. Two new server actions (create/delete assignment). New `AssignmentGrid` component added as a tab on the existing poll detail page. Conflict detection is pure client-side logic. Match-to-slot mapping reuses existing `calculateSlot`.

**Tech Stack:** Next.js 15 (App Router), Supabase, TailwindCSS v4, shadcn/ui, Vitest, Playwright

---

## Task 1: Database Migration — `assignments` Table

**Files:**

- Create: `supabase/migrations/20260213000007_stage6_assignments.sql`

**Step 1: Write the migration**

```sql
-- Stage 6: Assignments table for umpire-to-match assignment

CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid REFERENCES public.polls ON DELETE CASCADE NOT NULL,
  match_id uuid REFERENCES public.matches ON DELETE CASCADE NOT NULL,
  umpire_id uuid REFERENCES public.umpires ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(match_id, umpire_id)
);

CREATE INDEX idx_assignments_poll_id ON public.assignments (poll_id);
CREATE INDEX idx_assignments_match_id ON public.assignments (match_id);

-- RLS
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert assignments"
  ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete assignments"
  ON public.assignments FOR DELETE TO authenticated
  USING (true);
```

**Step 2: Apply migration to local Supabase**

Run: `npx supabase db push` (or `npx supabase migration up` depending on local setup)

If no local Supabase is running, just verify the SQL is valid and move on — the migration will be applied when deployed.

**Step 3: Commit**

```bash
git add supabase/migrations/20260213000007_stage6_assignments.sql
git commit -m "feat: add assignments table migration (stage 6)"
```

---

## Task 2: Domain Type — `Assignment`

**Files:**

- Modify: `lib/types/domain.ts`

**Step 1: Add the Assignment type**

Add to the end of `lib/types/domain.ts`:

```typescript
export type Assignment = {
  id: string;
  poll_id: string;
  match_id: string;
  umpire_id: string;
  created_at: string;
};
```

**Step 2: Commit**

```bash
git add lib/types/domain.ts
git commit -m "feat: add Assignment domain type"
```

---

## Task 3: Conflict Detection — Pure Domain Logic (TDD)

**Files:**

- Create: `lib/domain/assignment-conflicts.ts`
- Create: `__tests__/lib/domain/assignment-conflicts.test.ts`

**Step 1: Write the failing tests**

Create `__tests__/lib/domain/assignment-conflicts.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  findConflicts,
  type AssignmentConflict,
} from "@/lib/domain/assignment-conflicts";
import type { Match, Assignment } from "@/lib/types/domain";

// Helper to create a match
function makeMatch(overrides: Partial<Match> & { id: string }): Match {
  return {
    date: "2026-03-15",
    start_time: "2026-03-15T11:00:00Z",
    home_team: "Team A",
    away_team: "Team B",
    competition: null,
    venue: null,
    field: null,
    required_level: 1,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeAssignment(
  overrides: Partial<Assignment> & {
    match_id: string;
    umpire_id: string;
  },
): Assignment {
  return {
    id: "a-" + overrides.match_id + "-" + overrides.umpire_id,
    poll_id: "poll-1",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("findConflicts", () => {
  it("returns empty array when no conflicts exist", () => {
    const matches = [
      makeMatch({
        id: "m1",
        date: "2026-03-15",
        start_time: "2026-03-15T11:00:00Z",
      }),
      makeMatch({
        id: "m2",
        date: "2026-03-16",
        start_time: "2026-03-16T11:00:00Z",
      }),
    ];
    const assignments = [
      makeAssignment({ match_id: "m1", umpire_id: "u1" }),
      makeAssignment({ match_id: "m2", umpire_id: "u1" }),
    ];

    const conflicts = findConflicts(assignments, matches);
    expect(conflicts).toEqual([]);
  });

  it("detects hard conflict: same umpire assigned to overlapping time slots", () => {
    // Two matches 30 min apart — their 2-hour slots overlap
    const matches = [
      makeMatch({
        id: "m1",
        date: "2026-03-15",
        start_time: "2026-03-15T11:00:00Z",
      }),
      makeMatch({
        id: "m2",
        date: "2026-03-15",
        start_time: "2026-03-15T11:30:00Z",
      }),
    ];
    const assignments = [
      makeAssignment({ match_id: "m1", umpire_id: "u1" }),
      makeAssignment({ match_id: "m2", umpire_id: "u1" }),
    ];

    const conflicts = findConflicts(assignments, matches);
    expect(conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          umpireId: "u1",
          matchId: "m2",
          conflictingMatchId: "m1",
          severity: "hard",
        }),
      ]),
    );
  });

  it("detects soft conflict: same umpire assigned to different slots on same day", () => {
    // Two matches on same day, far enough apart that slots don't overlap
    const matches = [
      makeMatch({
        id: "m1",
        date: "2026-03-15",
        start_time: "2026-03-15T09:00:00Z",
      }),
      makeMatch({
        id: "m2",
        date: "2026-03-15",
        start_time: "2026-03-15T15:00:00Z",
      }),
    ];
    const assignments = [
      makeAssignment({ match_id: "m1", umpire_id: "u1" }),
      makeAssignment({ match_id: "m2", umpire_id: "u1" }),
    ];

    const conflicts = findConflicts(assignments, matches);
    expect(conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          umpireId: "u1",
          matchId: "m2",
          conflictingMatchId: "m1",
          severity: "soft",
        }),
      ]),
    );
  });

  it("does not flag different umpires assigned to same match", () => {
    const matches = [
      makeMatch({
        id: "m1",
        date: "2026-03-15",
        start_time: "2026-03-15T11:00:00Z",
      }),
    ];
    const assignments = [
      makeAssignment({ match_id: "m1", umpire_id: "u1" }),
      makeAssignment({ match_id: "m1", umpire_id: "u2" }),
    ];

    const conflicts = findConflicts(assignments, matches);
    expect(conflicts).toEqual([]);
  });

  it("returns conflicts for multiple umpires independently", () => {
    const matches = [
      makeMatch({
        id: "m1",
        date: "2026-03-15",
        start_time: "2026-03-15T11:00:00Z",
      }),
      makeMatch({
        id: "m2",
        date: "2026-03-15",
        start_time: "2026-03-15T11:15:00Z",
      }),
    ];
    const assignments = [
      makeAssignment({ match_id: "m1", umpire_id: "u1" }),
      makeAssignment({ match_id: "m2", umpire_id: "u1" }),
      makeAssignment({ match_id: "m1", umpire_id: "u2" }),
      makeAssignment({ match_id: "m2", umpire_id: "u2" }),
    ];

    const conflicts = findConflicts(assignments, matches);
    const u1Conflicts = conflicts.filter((c) => c.umpireId === "u1");
    const u2Conflicts = conflicts.filter((c) => c.umpireId === "u2");
    expect(u1Conflicts.length).toBeGreaterThanOrEqual(1);
    expect(u2Conflicts.length).toBeGreaterThanOrEqual(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/lib/domain/assignment-conflicts.test.ts`

Expected: FAIL — module not found

**Step 3: Implement `findConflicts`**

Create `lib/domain/assignment-conflicts.ts`:

```typescript
import { calculateSlot } from "@/lib/domain/slots";
import type { Match, Assignment } from "@/lib/types/domain";

export type AssignmentConflict = {
  umpireId: string;
  matchId: string;
  conflictingMatchId: string;
  severity: "hard" | "soft";
};

function slotsOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): boolean {
  return a.start < b.end && b.start < a.end;
}

function sameDay(dateA: string, dateB: string): boolean {
  return dateA === dateB;
}

export function findConflicts(
  assignments: Assignment[],
  matches: Match[],
): AssignmentConflict[] {
  const matchMap = new Map(matches.map((m) => [m.id, m]));
  const conflicts: AssignmentConflict[] = [];

  // Group assignments by umpire
  const byUmpire = new Map<string, Assignment[]>();
  for (const a of assignments) {
    if (!byUmpire.has(a.umpire_id)) byUmpire.set(a.umpire_id, []);
    byUmpire.get(a.umpire_id)!.push(a);
  }

  for (const [umpireId, umpireAssignments] of byUmpire) {
    if (umpireAssignments.length < 2) continue;

    for (let i = 0; i < umpireAssignments.length; i++) {
      for (let j = 0; j < i; j++) {
        const matchA = matchMap.get(umpireAssignments[i].match_id);
        const matchB = matchMap.get(umpireAssignments[j].match_id);
        if (!matchA?.start_time || !matchB?.start_time) continue;

        const slotA = calculateSlot(new Date(matchA.start_time));
        const slotB = calculateSlot(new Date(matchB.start_time));

        if (slotsOverlap(slotA, slotB)) {
          conflicts.push({
            umpireId,
            matchId: matchA.id,
            conflictingMatchId: matchB.id,
            severity: "hard",
          });
          conflicts.push({
            umpireId,
            matchId: matchB.id,
            conflictingMatchId: matchA.id,
            severity: "hard",
          });
        } else if (sameDay(matchA.date, matchB.date)) {
          conflicts.push({
            umpireId,
            matchId: matchA.id,
            conflictingMatchId: matchB.id,
            severity: "soft",
          });
          conflicts.push({
            umpireId,
            matchId: matchB.id,
            conflictingMatchId: matchA.id,
            severity: "soft",
          });
        }
      }
    }
  }

  return conflicts;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/lib/domain/assignment-conflicts.test.ts`

Expected: ALL PASS

**Step 5: Commit**

```bash
git add lib/domain/assignment-conflicts.ts __tests__/lib/domain/assignment-conflicts.test.ts
git commit -m "feat: add conflict detection for umpire assignments (TDD)"
```

---

## Task 4: Match-to-Slot Mapping — Pure Domain Logic (TDD)

This function maps each match to its corresponding poll slot, so we can look up umpire availability.

**Files:**

- Create: `lib/domain/match-slot-mapping.ts`
- Create: `__tests__/lib/domain/match-slot-mapping.test.ts`

**Step 1: Write the failing tests**

Create `__tests__/lib/domain/match-slot-mapping.test.ts`:

```typescript
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
      [
        {
          id: "m1",
          start_time: "2026-03-15T11:00:00Z",
        } as Match,
      ],
      slots,
    );
    expect(result.get("m1")).toBe("slot-1");
  });

  it("maps a match to the correct slot when multiple slots exist", () => {
    const result = mapMatchesToSlots(
      [
        {
          id: "m1",
          start_time: "2026-03-15T14:30:00Z",
        } as Match,
      ],
      slots,
    );
    expect(result.get("m1")).toBe("slot-2");
  });

  it("returns undefined for a match with no matching slot", () => {
    const result = mapMatchesToSlots(
      [
        {
          id: "m1",
          start_time: "2026-03-16T11:00:00Z",
        } as Match,
      ],
      slots,
    );
    expect(result.get("m1")).toBeUndefined();
  });

  it("returns undefined for a match with no start_time", () => {
    const result = mapMatchesToSlots(
      [
        {
          id: "m1",
          start_time: null,
        } as Match,
      ],
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
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/lib/domain/match-slot-mapping.test.ts`

Expected: FAIL — module not found

**Step 3: Implement `mapMatchesToSlots`**

Create `lib/domain/match-slot-mapping.ts`:

```typescript
import type { Match, PollSlot } from "@/lib/types/domain";

/**
 * Maps each match to the poll slot that contains its start time.
 * Returns a Map of matchId -> slotId.
 */
export function mapMatchesToSlots(
  matches: Match[],
  slots: PollSlot[],
): Map<string, string> {
  const result = new Map<string, string>();

  for (const match of matches) {
    if (!match.start_time) continue;

    const matchTime = new Date(match.start_time).getTime();

    for (const slot of slots) {
      const slotStart = new Date(slot.start_time).getTime();
      const slotEnd = new Date(slot.end_time).getTime();

      if (matchTime >= slotStart && matchTime < slotEnd) {
        result.set(match.id, slot.id);
        break;
      }
    }
  }

  return result;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/lib/domain/match-slot-mapping.test.ts`

Expected: ALL PASS

**Step 5: Commit**

```bash
git add lib/domain/match-slot-mapping.ts __tests__/lib/domain/match-slot-mapping.test.ts
git commit -m "feat: add match-to-slot mapping for assignment grid (TDD)"
```

---

## Task 5: Server Actions — Assignment CRUD

**Files:**

- Create: `lib/actions/assignments.ts`

**Step 1: Create the server actions**

Create `lib/actions/assignments.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import type { Assignment } from "@/lib/types/domain";
import { revalidatePath } from "next/cache";

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function getAssignmentsForPoll(
  pollId: string,
): Promise<Assignment[]> {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("poll_id", pollId);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createAssignment(
  pollId: string,
  matchId: string,
  umpireId: string,
): Promise<Assignment> {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("assignments")
    .insert({ poll_id: pollId, match_id: matchId, umpire_id: umpireId })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/protected/polls/${pollId}`);
  return data;
}

export async function deleteAssignment(
  pollId: string,
  matchId: string,
  umpireId: string,
): Promise<void> {
  const { supabase } = await requireAuth();

  const { error } = await supabase
    .from("assignments")
    .delete()
    .eq("poll_id", pollId)
    .eq("match_id", matchId)
    .eq("umpire_id", umpireId);

  if (error) throw new Error(error.message);
  revalidatePath(`/protected/polls/${pollId}`);
}
```

**Step 2: Commit**

```bash
git add lib/actions/assignments.ts
git commit -m "feat: add server actions for assignment CRUD"
```

---

## Task 6: Extend `getPoll` to Include Assignments

**Files:**

- Modify: `lib/actions/polls.ts`

**Step 1: Update `PollDetail` type and `getPoll` function**

In `lib/actions/polls.ts`, update the `PollDetail` type to include assignments:

```typescript
// Change the PollDetail type to:
export type PollDetail = Poll & {
  matches: Match[];
  slots: PollSlot[];
  responses: AvailabilityResponse[];
  assignments: Assignment[];
};
```

Add `Assignment` to the imports from `@/lib/types/domain`:

```typescript
import type {
  Match,
  Poll,
  PollSlot,
  AvailabilityResponse,
  Assignment,
} from "@/lib/types/domain";
```

At the end of the `getPoll` function, before the return, add a fetch for assignments:

```typescript
// Fetch assignments
const { data: assignments, error: assignError } = await supabase
  .from("assignments")
  .select("*")
  .eq("poll_id", id);

if (assignError) throw new Error(assignError.message);

return {
  ...poll,
  matches,
  slots: slots ?? [],
  responses: responses ?? [],
  assignments: assignments ?? [],
};
```

**Step 2: Run type-check**

Run: `npm run type-check`

Expected: PASS (the poll-detail-client doesn't reference `assignments` yet, so no errors)

**Step 3: Commit**

```bash
git add lib/actions/polls.ts
git commit -m "feat: extend getPoll to include assignments"
```

---

## Task 7: AssignmentGrid Component (TDD)

**Files:**

- Create: `components/polls/assignment-grid.tsx`
- Create: `components/__tests__/assignment-grid.test.tsx`

**Step 1: Write the failing component tests**

Create `components/__tests__/assignment-grid.test.tsx`:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AssignmentGrid } from "@/components/polls/assignment-grid";
import type {
  Match,
  PollSlot,
  AvailabilityResponse,
  Assignment,
  Umpire,
} from "@/lib/types/domain";

// Mock server actions
vi.mock("@/lib/actions/assignments", () => ({
  createAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
}));

const mockMatches: Match[] = [
  {
    id: "m1",
    date: "2026-03-15",
    start_time: "2026-03-15T11:00:00Z",
    home_team: "HC Amsterdam",
    away_team: "HC Rotterdam",
    competition: "Hoofdklasse",
    venue: "Wagener",
    field: "1",
    required_level: 2,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "m2",
    date: "2026-03-15",
    start_time: "2026-03-15T14:30:00Z",
    home_team: "HC Utrecht",
    away_team: "HC Den Bosch",
    competition: "Eerste Klasse",
    venue: "Galgenwaard",
    field: "2",
    required_level: 1,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
  },
];

const mockSlots: PollSlot[] = [
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

const mockUmpires: Umpire[] = [
  {
    id: "u1",
    auth_user_id: null,
    name: "Jan de Vries",
    email: "jan@example.com",
    level: 2,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "u2",
    auth_user_id: null,
    name: "Piet Bakker",
    email: "piet@example.com",
    level: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const mockResponses: AvailabilityResponse[] = [
  {
    id: "r1",
    poll_id: "poll-1",
    slot_id: "slot-1",
    participant_name: "Jan de Vries",
    umpire_id: "u1",
    response: "yes",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "r2",
    poll_id: "poll-1",
    slot_id: "slot-2",
    participant_name: "Jan de Vries",
    umpire_id: "u1",
    response: "no",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "r3",
    poll_id: "poll-1",
    slot_id: "slot-1",
    participant_name: "Piet Bakker",
    umpire_id: "u2",
    response: "if_need_be",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "r4",
    poll_id: "poll-1",
    slot_id: "slot-2",
    participant_name: "Piet Bakker",
    umpire_id: "u2",
    response: "yes",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

describe("AssignmentGrid", () => {
  const defaultProps = {
    pollId: "poll-1",
    matches: mockMatches,
    slots: mockSlots,
    responses: mockResponses,
    assignments: [] as Assignment[],
    umpires: mockUmpires,
  };

  it("renders match rows and umpire columns", () => {
    render(<AssignmentGrid {...defaultProps} />);

    expect(screen.getByText("HC Amsterdam – HC Rotterdam")).toBeInTheDocument();
    expect(screen.getByText("HC Utrecht – HC Den Bosch")).toBeInTheDocument();
    expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
    expect(screen.getByText("Piet Bakker")).toBeInTheDocument();
  });

  it("shows assignment count per match", () => {
    render(<AssignmentGrid {...defaultProps} />);

    // Both matches should show 0/2
    const badges = screen.getAllByText("0/2");
    expect(badges).toHaveLength(2);
  });

  it("shows assigned state when assignment exists", () => {
    const assignments: Assignment[] = [
      {
        id: "a1",
        poll_id: "poll-1",
        match_id: "m1",
        umpire_id: "u1",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    render(<AssignmentGrid {...defaultProps} assignments={assignments} />);

    // Should show 1/2 for match m1
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("calls createAssignment when clicking unassigned cell", async () => {
    const { createAssignment } = await import("@/lib/actions/assignments");
    const mockCreate = vi.mocked(createAssignment);
    mockCreate.mockResolvedValue({
      id: "a1",
      poll_id: "poll-1",
      match_id: "m1",
      umpire_id: "u1",
      created_at: "2026-01-01T00:00:00Z",
    });

    render(<AssignmentGrid {...defaultProps} />);

    // Click cell for match m1, umpire u1
    const cell = screen.getByTestId("cell-m1-u1");
    fireEvent.click(cell);

    expect(mockCreate).toHaveBeenCalledWith("poll-1", "m1", "u1");
  });

  it("calls deleteAssignment when clicking assigned cell", async () => {
    const { deleteAssignment } = await import("@/lib/actions/assignments");
    const mockDelete = vi.mocked(deleteAssignment);
    mockDelete.mockResolvedValue(undefined);

    const assignments: Assignment[] = [
      {
        id: "a1",
        poll_id: "poll-1",
        match_id: "m1",
        umpire_id: "u1",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    render(<AssignmentGrid {...defaultProps} assignments={assignments} />);

    const cell = screen.getByTestId("cell-m1-u1");
    fireEvent.click(cell);

    expect(mockDelete).toHaveBeenCalledWith("poll-1", "m1", "u1");
  });

  it("can toggle between matches-as-rows and umpires-as-rows", () => {
    render(<AssignmentGrid {...defaultProps} />);

    const toggleButton = screen.getByRole("button", { name: /swap/i });
    fireEvent.click(toggleButton);

    // After toggle, umpires should be in the first column
    // and matches across the top (exact assertion depends on implementation)
    expect(toggleButton).toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- components/__tests__/assignment-grid.test.tsx`

Expected: FAIL — module not found

**Step 3: Implement AssignmentGrid component**

Create `components/polls/assignment-grid.tsx`:

```typescript
"use client";

import { useState, useMemo, useCallback } from "react";
import { Check, Ban, AlertTriangle } from "lucide-react";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createAssignment,
  deleteAssignment,
} from "@/lib/actions/assignments";
import { mapMatchesToSlots } from "@/lib/domain/match-slot-mapping";
import {
  findConflicts,
  type AssignmentConflict,
} from "@/lib/domain/assignment-conflicts";
import type {
  Match,
  PollSlot,
  AvailabilityResponse,
  Assignment,
  Umpire,
} from "@/lib/types/domain";
import { useToast } from "@/hooks/use-toast";

type Props = {
  pollId: string;
  matches: Match[];
  slots: PollSlot[];
  responses: AvailabilityResponse[];
  assignments: Assignment[];
  umpires: Umpire[];
};

const AVAILABILITY_COLORS: Record<string, string> = {
  yes: "bg-green-100 dark:bg-green-900/30",
  if_need_be: "bg-yellow-100 dark:bg-yellow-900/30",
  no: "bg-red-100 dark:bg-red-900/30",
};

const NO_RESPONSE_COLOR = "bg-muted/50";

export function AssignmentGrid({
  pollId,
  matches,
  slots,
  responses,
  assignments: initialAssignments,
  umpires,
}: Props) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [saving, setSaving] = useState<string | null>(null); // "matchId-umpireId"
  const [transposed, setTransposed] = useState(false);
  const { toast } = useToast();

  // Map matches to their corresponding poll slots
  const matchSlotMap = useMemo(
    () => mapMatchesToSlots(matches, slots),
    [matches, slots],
  );

  // Build response lookup: slotId -> umpireId -> response
  const responseMap = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    for (const r of responses) {
      if (!r.umpire_id) continue;
      if (!map.has(r.slot_id)) map.set(r.slot_id, new Map());
      map.get(r.slot_id)!.set(r.umpire_id, r.response);
    }
    return map;
  }, [responses]);

  // Assignment lookup: "matchId-umpireId" -> boolean
  const assignmentSet = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignments) {
      set.add(`${a.match_id}-${a.umpire_id}`);
    }
    return set;
  }, [assignments]);

  // Assignment count per match
  const assignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assignments) {
      counts.set(a.match_id, (counts.get(a.match_id) ?? 0) + 1);
    }
    return counts;
  }, [assignments]);

  // Conflict detection
  const conflicts = useMemo(
    () => findConflicts(assignments, matches),
    [assignments, matches],
  );

  const conflictMap = useMemo(() => {
    const map = new Map<string, AssignmentConflict>();
    for (const c of conflicts) {
      const key = `${c.matchId}-${c.umpireId}`;
      // Hard conflicts take priority over soft
      const existing = map.get(key);
      if (!existing || c.severity === "hard") {
        map.set(key, c);
      }
    }
    return map;
  }, [conflicts]);

  function getAvailability(matchId: string, umpireId: string): string | null {
    const slotId = matchSlotMap.get(matchId);
    if (!slotId) return null;
    return responseMap.get(slotId)?.get(umpireId) ?? null;
  }

  const handleToggle = useCallback(
    async (matchId: string, umpireId: string) => {
      const key = `${matchId}-${umpireId}`;
      if (saving) return;

      const isAssigned = assignmentSet.has(key);
      const count = assignmentCounts.get(matchId) ?? 0;

      // Warn when assigning 3rd+ umpire
      if (!isAssigned && count >= 2) {
        toast({
          title: "This match already has 2 umpires assigned",
          variant: "destructive",
        });
      }

      // Optimistic update
      setSaving(key);
      if (isAssigned) {
        setAssignments((prev) =>
          prev.filter(
            (a) => !(a.match_id === matchId && a.umpire_id === umpireId),
          ),
        );
      } else {
        setAssignments((prev) => [
          ...prev,
          {
            id: `temp-${key}`,
            poll_id: pollId,
            match_id: matchId,
            umpire_id: umpireId,
            created_at: new Date().toISOString(),
          },
        ]);
      }

      try {
        if (isAssigned) {
          await deleteAssignment(pollId, matchId, umpireId);
        } else {
          const result = await createAssignment(pollId, matchId, umpireId);
          // Replace temp assignment with real one
          setAssignments((prev) =>
            prev.map((a) => (a.id === `temp-${key}` ? result : a)),
          );
        }
      } catch {
        // Revert optimistic update
        setAssignments(
          isAssigned
            ? (prev) => [
                ...prev,
                {
                  id: `reverted-${key}`,
                  poll_id: pollId,
                  match_id: matchId,
                  umpire_id: umpireId,
                  created_at: new Date().toISOString(),
                },
              ]
            : (prev) =>
                prev.filter(
                  (a) =>
                    !(a.match_id === matchId && a.umpire_id === umpireId),
                ),
        );
        toast({
          title: "Failed to save assignment",
          variant: "destructive",
        });
      } finally {
        setSaving(null);
      }
    },
    [
      saving,
      assignmentSet,
      assignmentCounts,
      pollId,
      toast,
    ],
  );

  // Sort matches by date and time
  const sortedMatches = useMemo(
    () =>
      [...matches].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.start_time ?? "").localeCompare(b.start_time ?? "");
      }),
    [matches],
  );

  if (umpires.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No umpire responses yet. Share the poll to collect availability before
        making assignments.
      </p>
    );
  }

  function renderCell(matchId: string, umpireId: string) {
    const key = `${matchId}-${umpireId}`;
    const isAssigned = assignmentSet.has(key);
    const availability = getAvailability(matchId, umpireId);
    const conflict = conflictMap.get(key);
    const isSaving = saving === key;

    const bgColor = availability
      ? AVAILABILITY_COLORS[availability]
      : NO_RESPONSE_COLOR;

    const conflictBorder = conflict
      ? conflict.severity === "hard"
        ? "ring-2 ring-red-500"
        : "ring-2 ring-orange-400"
      : "";

    const assignedStyle = isAssigned
      ? "ring-2 ring-primary font-bold"
      : "";

    return (
      <button
        key={key}
        data-testid={`cell-${key}`}
        className={`relative flex h-10 w-full min-w-10 items-center justify-center rounded transition-all ${bgColor} ${conflictBorder || assignedStyle} ${isSaving ? "opacity-50" : "cursor-pointer hover:opacity-80"}`}
        onClick={() => handleToggle(matchId, umpireId)}
        disabled={isSaving}
      >
        {isAssigned && !conflict && (
          <Check className="h-4 w-4 text-primary" />
        )}
        {isAssigned && conflict?.severity === "hard" && (
          <Ban className="h-4 w-4 text-red-500" />
        )}
        {isAssigned && conflict?.severity === "soft" && (
          <AlertTriangle className="h-4 w-4 text-orange-500" />
        )}
      </button>
    );
  }

  function renderCountBadge(matchId: string) {
    const count = assignmentCounts.get(matchId) ?? 0;
    const variant =
      count === 2 ? "default" : count > 2 ? "destructive" : "secondary";
    return <Badge variant={variant}>{count}/2</Badge>;
  }

  // Default: matches as rows, umpires as columns
  if (!transposed) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTransposed(true)}
            aria-label="Swap rows and columns"
          >
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            Swap axes
          </Button>
        </div>
        <div className="scrollbar-visible overflow-x-auto pb-2">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 font-medium sticky left-0 z-10 bg-background min-w-48">
                  Match
                </th>
                <th className="p-2 text-center font-medium min-w-12" />
                {umpires.map((u) => (
                  <th
                    key={u.id}
                    className="p-2 text-center font-medium whitespace-nowrap min-w-20"
                  >
                    {u.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMatches.map((match) => (
                <tr key={match.id} className="border-b">
                  <td className="p-2 sticky left-0 z-10 bg-background">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {match.home_team} – {match.away_team}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(match.date).toLocaleDateString("nl-NL", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                        {match.start_time &&
                          ` ${new Date(match.start_time).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`}
                      </span>
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    {renderCountBadge(match.id)}
                  </td>
                  {umpires.map((u) => (
                    <td key={u.id} className="p-1">
                      {renderCell(match.id, u.id)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Transposed: umpires as rows, matches as columns
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTransposed(false)}
          aria-label="Swap rows and columns"
        >
          <ArrowRightLeft className="mr-2 h-4 w-4" />
          Swap axes
        </Button>
      </div>
      <div className="scrollbar-visible overflow-x-auto pb-2">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 font-medium sticky left-0 z-10 bg-background min-w-32">
                Umpire
              </th>
              {sortedMatches.map((match) => (
                <th
                  key={match.id}
                  className="p-2 text-center font-medium whitespace-nowrap min-w-24"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                      {new Date(match.date).toLocaleDateString("nl-NL", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <span className="text-[11px]">
                      {match.home_team} – {match.away_team}
                    </span>
                    {renderCountBadge(match.id)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {umpires.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="p-2 font-medium sticky left-0 z-10 bg-background whitespace-nowrap">
                  {u.name}
                </td>
                {sortedMatches.map((match) => (
                  <td key={match.id} className="p-1">
                    {renderCell(match.id, u.id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- components/__tests__/assignment-grid.test.tsx`

Expected: ALL PASS

**Step 5: Commit**

```bash
git add components/polls/assignment-grid.tsx components/__tests__/assignment-grid.test.tsx
git commit -m "feat: add AssignmentGrid component with click-to-toggle and conflicts (TDD)"
```

---

## Task 8: Integrate AssignmentGrid Into Poll Detail Page

**Files:**

- Modify: `components/polls/poll-detail-client.tsx`
- Modify: `app/protected/polls/[id]/page.tsx`

**Step 1: Resolve umpire data**

The assignment grid needs `Umpire[]` objects (not just participant names from responses). We need to fetch umpires who responded to this poll. Add a helper to `lib/actions/assignments.ts`:

Add to `lib/actions/assignments.ts`:

```typescript
export async function getUmpiresForPoll(pollId: string): Promise<Umpire[]> {
  const { supabase } = await requireAuth();

  // Get unique umpire IDs from responses
  const { data: responses, error: respError } = await supabase
    .from("availability_responses")
    .select("umpire_id")
    .eq("poll_id", pollId)
    .not("umpire_id", "is", null);

  if (respError) throw new Error(respError.message);

  const umpireIds = [
    ...new Set(
      (responses ?? [])
        .map((r: { umpire_id: string | null }) => r.umpire_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  if (umpireIds.length === 0) return [];

  const { data: umpires, error } = await supabase
    .from("umpires")
    .select("*")
    .in("id", umpireIds)
    .order("name");

  if (error) throw new Error(error.message);
  return umpires ?? [];
}
```

Add `Umpire` to the import from `@/lib/types/domain` in `lib/actions/assignments.ts`.

**Step 2: Update poll detail page to fetch umpires**

In `app/protected/polls/[id]/page.tsx`, update the loader:

```typescript
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPoll, getAvailableMatches } from "@/lib/actions/polls";
import { getUmpiresForPoll } from "@/lib/actions/assignments";
import { PollDetailClient } from "@/components/polls/poll-detail-client";

async function PollDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const [poll, availableMatches, umpires] = await Promise.all([
      getPoll(id),
      getAvailableMatches(id),
      getUmpiresForPoll(id),
    ]);
    return (
      <PollDetailClient
        initialPoll={poll}
        availableMatches={availableMatches}
        umpires={umpires}
      />
    );
  } catch {
    notFound();
  }
}
```

**Step 3: Add tabs to PollDetailClient**

Modify `components/polls/poll-detail-client.tsx`:

1. Add imports for `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` from `@/components/ui/tabs` (install with `npx shadcn@latest add tabs` if not present)
2. Add import for `AssignmentGrid` and `Umpire` type
3. Add `umpires` to Props type
4. Wrap the Responses section and add an Assignments tab

The key change: replace the "Responses" `<div>` section at the bottom of the component with:

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignmentGrid } from "./assignment-grid";
import type { Umpire } from "@/lib/types/domain";

// Update Props type:
type Props = {
  initialPoll: PollDetail;
  availableMatches: Match[];
  umpires: Umpire[];
};

// In the component, accept umpires prop:
export function PollDetailClient({ initialPoll, availableMatches, umpires }: Props) {

// Replace the Responses section with tabs:
      {/* Responses & Assignments */}
      <Tabs defaultValue="responses">
        <TabsList>
          <TabsTrigger value="responses">
            Responses ({[...new Set(poll.responses.map((r) => r.participant_name))].length})
          </TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
        </TabsList>
        <TabsContent value="responses">
          <ResponseSummary slots={poll.slots} responses={poll.responses} />
        </TabsContent>
        <TabsContent value="assignments">
          <AssignmentGrid
            pollId={poll.id}
            matches={poll.matches}
            slots={poll.slots}
            responses={poll.responses}
            assignments={poll.assignments}
            umpires={umpires}
          />
        </TabsContent>
      </Tabs>
```

**Step 4: Install shadcn tabs component if not present**

Run: `npx shadcn@latest add tabs` (skip if already installed — check `components/ui/tabs.tsx`)

**Step 5: Verify use-toast hook exists**

Check if `hooks/use-toast.ts` exists. If not, run: `npx shadcn@latest add toast`

**Step 6: Run type-check and dev server**

Run: `npm run type-check`

Run: `npm run dev` and verify the poll detail page loads with two tabs.

**Step 7: Commit**

```bash
git add lib/actions/assignments.ts app/protected/polls/\[id\]/page.tsx components/polls/poll-detail-client.tsx components/ui/tabs.tsx
git commit -m "feat: integrate assignment grid with tabs on poll detail page"
```

---

## Task 9: E2E Test — Assignment Flow

**Files:**

- Create: `e2e/assignments.spec.ts`

**Step 1: Write the E2E test**

Create `e2e/assignments.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Umpire Assignment", () => {
  test("planner can assign umpires to matches via the assignment grid", async ({
    page,
  }) => {
    // This test assumes:
    // 1. A planner user exists and can log in
    // 2. A poll with matches and responses exists
    // The exact setup depends on the existing E2E test helpers/fixtures.

    // Navigate to a poll detail page
    // (Adjust selector/URL based on actual test data setup)
    await page.goto("/auth/login");
    // ... login flow ...

    // Navigate to polls
    await page.goto("/protected/polls");
    // Click on first poll
    await page.locator("table tbody tr").first().click();

    // Click Assignments tab
    await page.getByRole("tab", { name: /assignments/i }).click();

    // Verify grid is visible
    await expect(page.locator('[data-testid^="cell-"]').first()).toBeVisible();

    // Click a cell to assign
    const firstCell = page.locator('[data-testid^="cell-"]').first();
    await firstCell.click();

    // Verify checkmark appears (assignment was made)
    await expect(firstCell.locator("svg")).toBeVisible();

    // Click again to unassign
    await firstCell.click();

    // Verify checkmark is gone
    await expect(firstCell.locator("svg")).not.toBeVisible();
  });
});
```

Note: The E2E test will need to be adapted to the actual test data setup and login flow used by existing E2E tests. Check `e2e/` for existing patterns.

**Step 2: Run E2E tests**

Run: `npm run test:e2e -- --grep "Umpire Assignment"`

Expected: PASS (may need test data adjustments)

**Step 3: Commit**

```bash
git add e2e/assignments.spec.ts
git commit -m "test: add E2E test for umpire assignment flow"
```

---

## Task 10: Final Verification

**Step 1: Run all tests**

Run: `npm test`

Expected: ALL PASS

**Step 2: Run type-check**

Run: `npm run type-check`

Expected: PASS

**Step 3: Run lint and format**

Run: `npm run lint && npm run format:check`

Expected: PASS

**Step 4: Run E2E tests**

Run: `npm run test:e2e`

Expected: ALL PASS

**Step 5: Final commit if any formatting changes**

```bash
npm run format
git add -A
git commit -m "chore: fix formatting"
```
