# Stage 4: Availability Polls — Creation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build poll creation and management for planners — select matches, auto-calculate time slots, generate shareable links, and view umpire responses.

**Architecture:** New protected routes `/protected/polls`, `/protected/polls/new`, `/protected/polls/[id]`. Server actions in `lib/actions/polls.ts`. Pure domain logic for slot diffing in `lib/domain/diff-slots.ts`. Reuses existing `groupMatchesIntoSlots` from `lib/domain/slots.ts`. Token generation via `nanoid`. No new DB migrations — Stage 1 schema covers all tables.

**Tech Stack:** Next.js App Router, Supabase, nanoid, shadcn/ui (+ calendar/popover), TailwindCSS v4, Vitest, Playwright

---

## Task 1: Install nanoid dependency

**Files:**

- Modify: `package.json`

**Step 1: Install nanoid**

Run: `npm install nanoid`

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add nanoid dependency for poll token generation"
```

---

## Task 2: Add shadcn/ui calendar and popover components

**Files:**

- Create: `components/ui/calendar.tsx`
- Create: `components/ui/popover.tsx`

**Step 1: Add the components**

Run:

```bash
npx shadcn@latest add calendar popover
```

**Step 2: Commit**

```bash
git add components/ui/calendar.tsx components/ui/popover.tsx package.json package-lock.json
git commit -m "chore: add shadcn calendar and popover components"
```

---

## Task 3: Implement diffSlots pure function (TDD)

**Files:**

- Create: `lib/domain/diff-slots.ts`
- Create: `__tests__/lib/domain/diff-slots.test.ts`

**Step 1: Write the failing test**

```typescript
// __tests__/lib/domain/diff-slots.test.ts
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
      makeTimeSlot("2026-02-15T10:45:00Z", "2026-02-15T12:45:00Z"), // same as s1
      makeTimeSlot("2026-02-16T09:00:00Z", "2026-02-16T11:00:00Z"), // new
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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/lib/domain/diff-slots.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// lib/domain/diff-slots.ts
import type { PollSlot, TimeSlot } from "@/lib/types/domain";

export type SlotDiff = {
  toAdd: TimeSlot[];
  toRemove: PollSlot[];
  toKeep: PollSlot[];
};

export function diffSlots(existing: PollSlot[], desired: TimeSlot[]): SlotDiff {
  const toAdd: TimeSlot[] = [];
  const toRemove: PollSlot[] = [];
  const toKeep: PollSlot[] = [];

  const existingMap = new Map(
    existing.map((s) => [
      `${new Date(s.start_time).getTime()}-${new Date(s.end_time).getTime()}`,
      s,
    ]),
  );

  for (const slot of desired) {
    const key = `${slot.start.getTime()}-${slot.end.getTime()}`;
    const match = existingMap.get(key);
    if (match) {
      toKeep.push(match);
      existingMap.delete(key);
    } else {
      toAdd.push(slot);
    }
  }

  for (const remaining of existingMap.values()) {
    toRemove.push(remaining);
  }

  return { toAdd, toRemove, toKeep };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/lib/domain/diff-slots.test.ts`
Expected: PASS — all 5 tests green

**Step 5: Commit**

```bash
git add lib/domain/diff-slots.ts __tests__/lib/domain/diff-slots.test.ts
git commit -m "feat: add diffSlots pure function for poll slot reconciliation"
```

---

## Task 4: Implement server actions for polls

**Files:**

- Create: `lib/actions/polls.ts`

**Step 1: Write the server actions**

```typescript
// lib/actions/polls.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { groupMatchesIntoSlots } from "@/lib/domain/slots";
import { diffSlots } from "@/lib/domain/diff-slots";
import type {
  Match,
  Poll,
  PollSlot,
  AvailabilityResponse,
} from "@/lib/types/domain";
import { nanoid } from "nanoid";

export type PollWithMeta = Poll & {
  response_count: number;
  match_date_min: string | null;
  match_date_max: string | null;
};

export type PollDetail = Poll & {
  matches: Match[];
  slots: PollSlot[];
  responses: AvailabilityResponse[];
};

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function getPolls(): Promise<PollWithMeta[]> {
  const { supabase } = await requireAuth();

  const { data: polls, error } = await supabase
    .from("polls")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!polls || polls.length === 0) return [];

  const pollIds = polls.map((p) => p.id);

  // Get response counts per poll
  const { data: responses } = await supabase
    .from("availability_responses")
    .select("poll_id, participant_name")
    .in("poll_id", pollIds);

  const responseCounts = new Map<string, Set<string>>();
  for (const r of responses ?? []) {
    if (!responseCounts.has(r.poll_id))
      responseCounts.set(r.poll_id, new Set());
    responseCounts.get(r.poll_id)!.add(r.participant_name);
  }

  // Get match date ranges per poll
  const { data: pollMatches } = await supabase
    .from("poll_matches")
    .select("poll_id, match_id")
    .in("poll_id", pollIds);

  const matchIds = [...new Set((pollMatches ?? []).map((pm) => pm.match_id))];

  const { data: matches } =
    matchIds.length > 0
      ? await supabase.from("matches").select("id, date").in("id", matchIds)
      : { data: [] };

  const matchDateMap = new Map((matches ?? []).map((m) => [m.id, m.date]));
  const pollDateRanges = new Map<
    string,
    { min: string | null; max: string | null }
  >();

  for (const pm of pollMatches ?? []) {
    const date = matchDateMap.get(pm.match_id);
    if (!date) continue;
    const range = pollDateRanges.get(pm.poll_id) ?? { min: null, max: null };
    if (!range.min || date < range.min) range.min = date;
    if (!range.max || date > range.max) range.max = date;
    pollDateRanges.set(pm.poll_id, range);
  }

  return polls.map((poll) => ({
    ...poll,
    response_count: responseCounts.get(poll.id)?.size ?? 0,
    match_date_min: pollDateRanges.get(poll.id)?.min ?? null,
    match_date_max: pollDateRanges.get(poll.id)?.max ?? null,
  }));
}

export async function getPoll(id: string): Promise<PollDetail> {
  const { supabase } = await requireAuth();

  const { data: poll, error } = await supabase
    .from("polls")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);

  const { data: pollMatches } = await supabase
    .from("poll_matches")
    .select("match_id")
    .eq("poll_id", id);

  const matchIds = (pollMatches ?? []).map((pm) => pm.match_id);

  const { data: matches } =
    matchIds.length > 0
      ? await supabase
          .from("matches")
          .select("*")
          .in("id", matchIds)
          .order("date")
          .order("start_time")
      : { data: [] };

  const { data: slots } = await supabase
    .from("poll_slots")
    .select("*")
    .eq("poll_id", id)
    .order("start_time");

  const { data: responses } = await supabase
    .from("availability_responses")
    .select("*")
    .eq("poll_id", id);

  return {
    ...poll,
    matches: matches ?? [],
    slots: slots ?? [],
    responses: responses ?? [],
  };
}

export async function getAvailableMatches(
  excludePollId?: string,
): Promise<Match[]> {
  const { supabase } = await requireAuth();

  // Get all matches with start_time
  const { data: allMatches, error } = await supabase
    .from("matches")
    .select("*")
    .not("start_time", "is", null)
    .order("date")
    .order("start_time");

  if (error) throw new Error(error.message);

  // Get match IDs already in active polls
  let query = supabase.from("poll_matches").select("match_id, poll_id");

  const { data: pollMatches } = await query;

  // If editing a poll, exclude its own matches from the "taken" set
  const takenMatchIds = new Set(
    (pollMatches ?? [])
      .filter((pm) => pm.poll_id !== excludePollId)
      .map((pm) => pm.match_id),
  );

  return (allMatches ?? []).filter((m) => !takenMatchIds.has(m.id));
}

export async function createPoll(
  title: string,
  matchIds: string[],
): Promise<{ id: string; token: string }> {
  const { supabase, user } = await requireAuth();

  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error("Title is required");
  if (matchIds.length === 0) throw new Error("At least one match is required");

  // Fetch match start_times for slot calculation
  const { data: matches, error: matchError } = await supabase
    .from("matches")
    .select("id, start_time")
    .in("id", matchIds);

  if (matchError) throw new Error(matchError.message);
  if (!matches || matches.length !== matchIds.length) {
    throw new Error("One or more matches not found");
  }

  const token = nanoid(12);
  const slots = groupMatchesIntoSlots(matches);

  // Insert poll
  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .insert({ title: trimmedTitle, token, status: "open", created_by: user.id })
    .select("id")
    .single();

  if (pollError) throw new Error(pollError.message);

  // Insert poll_matches
  const pollMatchRows = matchIds.map((matchId) => ({
    poll_id: poll.id,
    match_id: matchId,
  }));

  const { error: pmError } = await supabase
    .from("poll_matches")
    .insert(pollMatchRows);

  if (pmError) throw new Error(pmError.message);

  // Insert poll_slots
  if (slots.length > 0) {
    const slotRows = slots.map((s) => ({
      poll_id: poll.id,
      start_time: s.start.toISOString(),
      end_time: s.end.toISOString(),
    }));

    const { error: slotError } = await supabase
      .from("poll_slots")
      .insert(slotRows);

    if (slotError) throw new Error(slotError.message);
  }

  return { id: poll.id, token };
}

export async function updatePollMatches(
  pollId: string,
  matchIds: string[],
): Promise<void> {
  const { supabase } = await requireAuth();

  if (matchIds.length === 0) throw new Error("At least one match is required");

  // Fetch match start_times for new slot calculation
  const { data: matches, error: matchError } = await supabase
    .from("matches")
    .select("id, start_time")
    .in("id", matchIds);

  if (matchError) throw new Error(matchError.message);

  const newSlots = groupMatchesIntoSlots(matches ?? []);

  // Get existing slots
  const { data: existingSlots } = await supabase
    .from("poll_slots")
    .select("*")
    .eq("poll_id", pollId);

  const diff = diffSlots(existingSlots ?? [], newSlots);

  // Delete removed slots (cascade deletes responses)
  if (diff.toRemove.length > 0) {
    const { error } = await supabase
      .from("poll_slots")
      .delete()
      .in(
        "id",
        diff.toRemove.map((s) => s.id),
      );

    if (error) throw new Error(error.message);
  }

  // Insert new slots
  if (diff.toAdd.length > 0) {
    const { error } = await supabase.from("poll_slots").insert(
      diff.toAdd.map((s) => ({
        poll_id: pollId,
        start_time: s.start.toISOString(),
        end_time: s.end.toISOString(),
      })),
    );

    if (error) throw new Error(error.message);
  }

  // Replace poll_matches
  const { error: deleteError } = await supabase
    .from("poll_matches")
    .delete()
    .eq("poll_id", pollId);

  if (deleteError) throw new Error(deleteError.message);

  const { error: insertError } = await supabase
    .from("poll_matches")
    .insert(
      matchIds.map((matchId) => ({ poll_id: pollId, match_id: matchId })),
    );

  if (insertError) throw new Error(insertError.message);
}

export async function updatePollTitle(
  pollId: string,
  title: string,
): Promise<void> {
  const { supabase } = await requireAuth();

  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error("Title is required");

  const { error } = await supabase
    .from("polls")
    .update({ title: trimmedTitle })
    .eq("id", pollId);

  if (error) throw new Error(error.message);
}

export async function togglePollStatus(pollId: string): Promise<Poll> {
  const { supabase } = await requireAuth();

  const { data: poll, error: fetchError } = await supabase
    .from("polls")
    .select("status")
    .eq("id", pollId)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  const newStatus = poll.status === "open" ? "closed" : "open";

  const { data, error } = await supabase
    .from("polls")
    .update({ status: newStatus })
    .eq("id", pollId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deletePoll(pollId: string): Promise<void> {
  const { supabase } = await requireAuth();

  const { error } = await supabase.from("polls").delete().eq("id", pollId);

  if (error) throw new Error(error.message);
}
```

**Step 2: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 3: Commit**

```bash
git add lib/actions/polls.ts
git commit -m "feat: add poll server actions (CRUD, slot reconciliation)"
```

---

## Task 5: Add "Polls" nav link

**Files:**

- Modify: `app/protected/layout.tsx`

**Step 1: Add nav link**

In `app/protected/layout.tsx`, add a "Polls" link after "Matches":

```tsx
<Link href="/protected/polls" className="hover:underline">
  Polls
</Link>
```

**Step 2: Commit**

```bash
git add app/protected/layout.tsx
git commit -m "feat: add Polls nav link to protected layout"
```

---

## Task 6: Build share-poll-button component

**Files:**

- Create: `components/polls/share-poll-button.tsx`

**Step 1: Write the component**

```tsx
// components/polls/share-poll-button.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, Share2 } from "lucide-react";

export function SharePollButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  const pollUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/poll/${token}`
      : `/poll/${token}`;

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Availability Poll", url: pollUrl });
        return;
      } catch {
        // User cancelled or share failed — fall through to copy
      }
    }
    await handleCopy();
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(pollUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleCopy}>
        {copied ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Copy className="mr-2 h-4 w-4" />
        )}
        {copied ? "Copied!" : "Copy Link"}
      </Button>
      {typeof navigator !== "undefined" && navigator.share && (
        <Button variant="outline" size="sm" onClick={handleShare}>
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/polls/share-poll-button.tsx
git commit -m "feat: add SharePollButton with clipboard and Web Share API"
```

---

## Task 7: Build slot-preview component

**Files:**

- Create: `components/polls/slot-preview.tsx`
- Create: `components/__tests__/slot-preview.test.tsx`

**Step 1: Write the failing test**

```tsx
// components/__tests__/slot-preview.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SlotPreview } from "@/components/polls/slot-preview";
import type { TimeSlot } from "@/lib/types/domain";

describe("SlotPreview", () => {
  it("renders time slots with formatted dates", () => {
    const slots: TimeSlot[] = [
      {
        start: new Date("2026-02-15T10:45:00"),
        end: new Date("2026-02-15T12:45:00"),
      },
      {
        start: new Date("2026-02-16T14:00:00"),
        end: new Date("2026-02-16T16:00:00"),
      },
    ];

    render(<SlotPreview slots={slots} />);

    expect(screen.getByText(/10:45/)).toBeInTheDocument();
    expect(screen.getByText(/12:45/)).toBeInTheDocument();
    expect(screen.getByText(/14:00/)).toBeInTheDocument();
    expect(screen.getByText(/16:00/)).toBeInTheDocument();
  });

  it("shows message when no slots", () => {
    render(<SlotPreview slots={[]} />);

    expect(
      screen.getByText(/select matches to see time slots/i),
    ).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- components/__tests__/slot-preview.test.tsx`
Expected: FAIL

**Step 3: Write the component**

```tsx
// components/polls/slot-preview.tsx
import type { TimeSlot } from "@/lib/types/domain";
import { Card } from "@/components/ui/card";

function formatSlotTime(date: Date): string {
  return date.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSlotDate(date: Date): string {
  return date.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function SlotPreview({ slots }: { slots: TimeSlot[] }) {
  if (slots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Select matches to see time slots
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">
        {slots.length} time slot{slots.length !== 1 ? "s" : ""}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((slot, i) => (
          <Card key={i} className="px-3 py-2 text-sm">
            <span className="font-medium">{formatSlotDate(slot.start)}</span>{" "}
            {formatSlotTime(slot.start)} – {formatSlotTime(slot.end)}
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- components/__tests__/slot-preview.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add components/polls/slot-preview.tsx components/__tests__/slot-preview.test.tsx
git commit -m "feat: add SlotPreview component with tests"
```

---

## Task 8: Build match-selector component

**Files:**

- Create: `components/polls/match-selector.tsx`
- Create: `components/__tests__/match-selector.test.tsx`

**Step 1: Write the failing test**

```tsx
// components/__tests__/match-selector.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MatchSelector } from "@/components/polls/match-selector";
import type { Match } from "@/lib/types/domain";

const mockMatches: Match[] = [
  {
    id: "m1",
    date: "2026-02-15",
    start_time: "2026-02-15T11:00:00Z",
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
    date: "2026-02-15",
    start_time: "2026-02-15T14:30:00Z",
    home_team: "HC Utrecht",
    away_team: "HC Den Bosch",
    competition: "Eerste Klasse",
    venue: "Galgenwaard",
    field: "2",
    required_level: 1,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "m3",
    date: "2026-02-22",
    start_time: "2026-02-22T12:00:00Z",
    home_team: "HC Bloemendaal",
    away_team: "Kampong",
    competition: "Hoofdklasse",
    venue: "Bloemendaal",
    field: null,
    required_level: 3,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
  },
];

describe("MatchSelector", () => {
  it("renders matches grouped by date", () => {
    render(
      <MatchSelector
        matches={mockMatches}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
    );

    expect(screen.getByText("HC Amsterdam")).toBeInTheDocument();
    expect(screen.getByText("HC Rotterdam")).toBeInTheDocument();
    expect(screen.getByText("HC Bloemendaal")).toBeInTheDocument();
  });

  it("shows checkboxes that reflect selected state", () => {
    render(
      <MatchSelector
        matches={mockMatches}
        selectedIds={["m1"]}
        onSelectionChange={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("calls onSelectionChange when checkbox toggled", () => {
    const onChange = vi.fn();
    render(
      <MatchSelector
        matches={mockMatches}
        selectedIds={["m1"]}
        onSelectionChange={onChange}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // toggle m2
    expect(onChange).toHaveBeenCalledWith(["m1", "m2"]);
  });

  it("shows empty state when no matches", () => {
    render(
      <MatchSelector
        matches={[]}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/no matches available/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- components/__tests__/match-selector.test.tsx`
Expected: FAIL

**Step 3: Write the component**

```tsx
// components/polls/match-selector.tsx
"use client";

import type { Match } from "@/lib/types/domain";
import { Checkbox } from "@/components/ui/checkbox";

function formatMatchDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatMatchTime(startTime: string): string {
  const d = new Date(startTime);
  return d.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  matches: Match[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
};

export function MatchSelector({
  matches,
  selectedIds,
  onSelectionChange,
}: Props) {
  if (matches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No matches available for poll creation.
      </p>
    );
  }

  // Group matches by date
  const grouped = new Map<string, Match[]>();
  for (const match of matches) {
    const existing = grouped.get(match.date) ?? [];
    existing.push(match);
    grouped.set(match.date, existing);
  }

  function toggleMatch(matchId: string) {
    const newIds = selectedIds.includes(matchId)
      ? selectedIds.filter((id) => id !== matchId)
      : [...selectedIds, matchId];
    onSelectionChange(newIds);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...grouped.entries()].map(([date, dateMatches]) => (
        <div key={date}>
          <h4 className="text-sm font-medium mb-2">{formatMatchDate(date)}</h4>
          <div className="flex flex-col gap-1">
            {dateMatches.map((match) => (
              <label
                key={match.id}
                className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent"
              >
                <Checkbox
                  checked={selectedIds.includes(match.id)}
                  onCheckedChange={() => toggleMatch(match.id)}
                />
                <div className="flex-1 text-sm">
                  <span className="font-medium">
                    {match.home_team} – {match.away_team}
                  </span>
                  {match.start_time && (
                    <span className="text-muted-foreground ml-2">
                      {formatMatchTime(match.start_time)}
                    </span>
                  )}
                  {match.competition && (
                    <span className="text-muted-foreground ml-2">
                      · {match.competition}
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- components/__tests__/match-selector.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add components/polls/match-selector.tsx components/__tests__/match-selector.test.tsx
git commit -m "feat: add MatchSelector component with date grouping and tests"
```

---

## Task 9: Build poll-form component (create page)

**Files:**

- Create: `components/polls/poll-form.tsx`

**Step 1: Write the component**

The poll form combines the title input, match selector with date filtering, and live slot preview. Used on `/protected/polls/new`.

```tsx
// components/polls/poll-form.tsx
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Match } from "@/lib/types/domain";
import { groupMatchesIntoSlots } from "@/lib/domain/slots";
import { createPoll } from "@/lib/actions/polls";
import { MatchSelector } from "./match-selector";
import { SlotPreview } from "./slot-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  availableMatches: Match[];
};

export function PollForm({ availableMatches }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Filter matches by date range
  const filteredMatches = useMemo(() => {
    return availableMatches.filter((m) => {
      if (dateFrom && m.date < dateFrom) return false;
      if (dateTo && m.date > dateTo) return false;
      return true;
    });
  }, [availableMatches, dateFrom, dateTo]);

  // Calculate slots from selected matches
  const selectedMatches = availableMatches.filter((m) =>
    selectedMatchIds.includes(m.id),
  );
  const slots = useMemo(() => {
    const withStartTime = selectedMatches.filter((m) => m.start_time);
    return groupMatchesIntoSlots(withStartTime as { start_time: string }[]);
  }, [selectedMatches]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (selectedMatchIds.length === 0) {
      setError("Select at least one match");
      return;
    }

    setSaving(true);
    try {
      const { id } = await createPoll(title, selectedMatchIds);
      router.push(`/protected/polls/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create poll");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Poll Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Weekend 15-16 February"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Filter by Date</Label>
        <div className="flex gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From"
            className="w-40"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="To"
            className="w-40"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Select Matches ({selectedMatchIds.length} selected)</Label>
        <MatchSelector
          matches={filteredMatches}
          selectedIds={selectedMatchIds}
          onSelectionChange={setSelectedMatchIds}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Time Slots Preview</Label>
        <SlotPreview slots={slots} />
      </div>

      <Button type="submit" disabled={saving}>
        {saving ? "Creating..." : "Create Poll"}
      </Button>
    </form>
  );
}
```

**Step 2: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 3: Commit**

```bash
git add components/polls/poll-form.tsx
git commit -m "feat: add PollForm component with match selection and slot preview"
```

---

## Task 10: Build poll-table component

**Files:**

- Create: `components/polls/poll-table.tsx`
- Create: `components/__tests__/poll-table.test.tsx`

**Step 1: Write the failing test**

```tsx
// components/__tests__/poll-table.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PollTable } from "@/components/polls/poll-table";
import type { PollWithMeta } from "@/lib/actions/polls";

vi.mock("@/lib/actions/polls", () => ({
  deletePoll: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockPolls: PollWithMeta[] = [
  {
    id: "p1",
    title: "Weekend Feb 15",
    token: "abc123token1",
    status: "open",
    created_by: "user-1",
    created_at: "2026-02-13T10:00:00Z",
    response_count: 5,
    match_date_min: "2026-02-15",
    match_date_max: "2026-02-16",
  },
  {
    id: "p2",
    title: "Weekend Feb 22",
    token: "def456token2",
    status: "closed",
    created_by: "user-1",
    created_at: "2026-02-14T10:00:00Z",
    response_count: 0,
    match_date_min: "2026-02-22",
    match_date_max: "2026-02-22",
  },
];

describe("PollTable", () => {
  it("renders poll rows with title and status", () => {
    render(<PollTable polls={mockPolls} onDeleted={vi.fn()} />);

    expect(screen.getByText("Weekend Feb 15")).toBeInTheDocument();
    expect(screen.getByText("Weekend Feb 22")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("shows response counts", () => {
    render(<PollTable polls={mockPolls} onDeleted={vi.fn()} />);

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows empty state when no polls", () => {
    render(<PollTable polls={[]} onDeleted={vi.fn()} />);

    expect(screen.getByText(/no polls yet/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- components/__tests__/poll-table.test.tsx`
Expected: FAIL

**Step 3: Write the component**

```tsx
// components/polls/poll-table.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PollWithMeta } from "@/lib/actions/polls";
import { deletePoll } from "@/lib/actions/polls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, Trash2 } from "lucide-react";
import { SharePollButton } from "./share-poll-button";

function formatDateRange(min: string | null, max: string | null): string {
  if (!min) return "—";
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
    });
  if (min === max) return fmt(min);
  return `${fmt(min)} – ${fmt(max!)}`;
}

export function PollTable({
  polls,
  onDeleted,
}: {
  polls: PollWithMeta[];
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deletePoll(id);
      onDeleted();
    } finally {
      setDeletingId(null);
    }
  }

  if (polls.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No polls yet. Create your first availability poll to get started.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Dates</TableHead>
          <TableHead className="w-24">Status</TableHead>
          <TableHead className="w-24">Responses</TableHead>
          <TableHead className="w-40">Share</TableHead>
          <TableHead className="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {polls.map((poll) => (
          <TableRow key={poll.id}>
            <TableCell
              className="font-medium cursor-pointer hover:underline"
              onClick={() => router.push(`/protected/polls/${poll.id}`)}
            >
              {poll.title}
            </TableCell>
            <TableCell>
              {formatDateRange(poll.match_date_min, poll.match_date_max)}
            </TableCell>
            <TableCell>
              <Badge variant={poll.status === "open" ? "default" : "secondary"}>
                {poll.status === "open" ? "Open" : "Closed"}
              </Badge>
            </TableCell>
            <TableCell>{poll.response_count}</TableCell>
            <TableCell>
              <SharePollButton token={poll.token} />
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">More actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => router.push(`/protected/polls/${poll.id}`)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDelete(poll.id)}
                    disabled={deletingId === poll.id}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- components/__tests__/poll-table.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add components/polls/poll-table.tsx components/__tests__/poll-table.test.tsx
git commit -m "feat: add PollTable component with status badges and tests"
```

---

## Task 11: Build response-summary component

**Files:**

- Create: `components/polls/response-summary.tsx`

**Step 1: Write the component**

```tsx
// components/polls/response-summary.tsx
import type { PollSlot, AvailabilityResponse } from "@/lib/types/domain";

const RESPONSE_COLORS: Record<string, string> = {
  yes: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  if_need_be:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  no: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const RESPONSE_LABELS: Record<string, string> = {
  yes: "Yes",
  if_need_be: "If need be",
  no: "No",
};

function formatSlotHeader(slot: PollSlot): string {
  const start = new Date(slot.start_time);
  const date = start.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = start.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = new Date(slot.end_time).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${time}–${endTime}`;
}

type Props = {
  slots: PollSlot[];
  responses: AvailabilityResponse[];
};

export function ResponseSummary({ slots, responses }: Props) {
  // Get unique participant names
  const participants = [
    ...new Set(responses.map((r) => r.participant_name)),
  ].sort();

  if (participants.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No responses yet. Share the poll link with umpires to collect
        availability.
      </p>
    );
  }

  // Build lookup: slotId → participantName → response
  const responseMap = new Map<string, Map<string, string>>();
  for (const r of responses) {
    if (!responseMap.has(r.slot_id)) responseMap.set(r.slot_id, new Map());
    responseMap.get(r.slot_id)!.set(r.participant_name, r.response);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left p-2 border-b font-medium sticky left-0 bg-background">
              Umpire
            </th>
            {slots.map((slot) => (
              <th
                key={slot.id}
                className="text-center p-2 border-b font-medium min-w-[100px]"
              >
                {formatSlotHeader(slot)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {participants.map((name) => (
            <tr key={name}>
              <td className="p-2 border-b font-medium sticky left-0 bg-background">
                {name}
              </td>
              {slots.map((slot) => {
                const response = responseMap.get(slot.id)?.get(name);
                return (
                  <td key={slot.id} className="p-2 border-b text-center">
                    {response ? (
                      <span
                        className={`inline-block rounded px-2 py-1 text-xs font-medium ${RESPONSE_COLORS[response]}`}
                      >
                        {RESPONSE_LABELS[response]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/polls/response-summary.tsx
git commit -m "feat: add ResponseSummary component for umpire availability overview"
```

---

## Task 12: Build polls list page

**Files:**

- Create: `components/polls/polls-page-client.tsx`
- Create: `app/protected/polls/page.tsx`

**Step 1: Write the client component**

```tsx
// components/polls/polls-page-client.tsx
"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { PollWithMeta } from "@/lib/actions/polls";
import { getPolls } from "@/lib/actions/polls";
import { PollTable } from "./poll-table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function PollsPageClient({
  initialPolls,
}: {
  initialPolls: PollWithMeta[];
}) {
  const [polls, setPolls] = useState(initialPolls);

  const refreshPolls = useCallback(async () => {
    const data = await getPolls();
    setPolls(data);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="ml-auto">
          <Button asChild>
            <Link href="/protected/polls/new">
              <Plus className="mr-2 h-4 w-4" />
              New Poll
            </Link>
          </Button>
        </div>
      </div>

      <PollTable polls={polls} onDeleted={refreshPolls} />
    </div>
  );
}
```

**Step 2: Write the server page**

```tsx
// app/protected/polls/page.tsx
import { Suspense } from "react";
import { getPolls } from "@/lib/actions/polls";
import { PollsPageClient } from "@/components/polls/polls-page-client";

async function PollsLoader() {
  const polls = await getPolls();
  return <PollsPageClient initialPolls={polls} />;
}

export default function PollsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Polls</h1>
        <p className="text-muted-foreground">
          Create and manage availability polls for umpires.
        </p>
      </div>
      <Suspense
        fallback={<div className="text-muted-foreground">Loading polls...</div>}
      >
        <PollsLoader />
      </Suspense>
    </div>
  );
}
```

**Step 3: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 4: Commit**

```bash
git add components/polls/polls-page-client.tsx app/protected/polls/page.tsx
git commit -m "feat: add polls list page with server-side data loading"
```

---

## Task 13: Build poll creation page

**Files:**

- Create: `app/protected/polls/new/page.tsx`

**Step 1: Write the page**

```tsx
// app/protected/polls/new/page.tsx
import { Suspense } from "react";
import { getAvailableMatches } from "@/lib/actions/polls";
import { PollForm } from "@/components/polls/poll-form";

async function PollFormLoader() {
  const matches = await getAvailableMatches();
  return <PollForm availableMatches={matches} />;
}

export default function NewPollPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">New Poll</h1>
        <p className="text-muted-foreground">
          Select matches and create an availability poll.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="text-muted-foreground">Loading matches...</div>
        }
      >
        <PollFormLoader />
      </Suspense>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/protected/polls/new/page.tsx
git commit -m "feat: add poll creation page"
```

---

## Task 14: Build poll detail page

**Files:**

- Create: `components/polls/poll-detail-client.tsx`
- Create: `app/protected/polls/[id]/page.tsx`

**Step 1: Write the client component**

```tsx
// components/polls/poll-detail-client.tsx
"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Match } from "@/lib/types/domain";
import type { PollDetail } from "@/lib/actions/polls";
import {
  getPoll,
  updatePollTitle,
  updatePollMatches,
  togglePollStatus,
  deletePoll,
} from "@/lib/actions/polls";
import { groupMatchesIntoSlots } from "@/lib/domain/slots";
import { MatchSelector } from "./match-selector";
import { SlotPreview } from "./slot-preview";
import { ResponseSummary } from "./response-summary";
import { SharePollButton } from "./share-poll-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Pencil, Check, Trash2 } from "lucide-react";

type Props = {
  initialPoll: PollDetail;
  availableMatches: Match[];
};

export function PollDetailClient({ initialPoll, availableMatches }: Props) {
  const router = useRouter();
  const [poll, setPoll] = useState(initialPoll);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(poll.title ?? "");
  const [editingMatches, setEditingMatches] = useState(false);
  const [selectedMatchIds, setSelectedMatchIds] = useState(
    poll.matches.map((m) => m.id),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // All selectable matches = available + currently in this poll
  const allSelectableMatches = useMemo(() => {
    const pollMatchIds = new Set(poll.matches.map((m) => m.id));
    const combined = [...poll.matches];
    for (const m of availableMatches) {
      if (!pollMatchIds.has(m.id)) combined.push(m);
    }
    combined.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.start_time ?? "").localeCompare(b.start_time ?? "");
    });
    return combined;
  }, [poll.matches, availableMatches]);

  // Preview slots when editing matches
  const previewSlots = useMemo(() => {
    if (!editingMatches) return [];
    const selected = allSelectableMatches.filter((m) =>
      selectedMatchIds.includes(m.id),
    );
    const withStartTime = selected.filter((m) => m.start_time);
    return groupMatchesIntoSlots(withStartTime as { start_time: string }[]);
  }, [editingMatches, selectedMatchIds, allSelectableMatches]);

  const refreshPoll = useCallback(async () => {
    const updated = await getPoll(poll.id);
    setPoll(updated);
  }, [poll.id]);

  async function handleSaveTitle() {
    setSaving(true);
    setError(null);
    try {
      await updatePollTitle(poll.id, titleDraft);
      await refreshPoll();
      setEditingTitle(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update title");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMatches() {
    setSaving(true);
    setError(null);
    try {
      await updatePollMatches(poll.id, selectedMatchIds);
      await refreshPoll();
      setEditingMatches(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update matches");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    setSaving(true);
    try {
      await togglePollStatus(poll.id);
      await refreshPoll();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this poll? All responses will be lost.")) return;
    setSaving(true);
    try {
      await deletePoll(poll.id);
      router.push("/protected/polls");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Header: title + status + actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="text-xl font-bold"
                autoFocus
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={handleSaveTitle}
                disabled={saving}
              >
                <Check className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{poll.title}</h1>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setTitleDraft(poll.title ?? "");
                  setEditingTitle(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={poll.status === "open" ? "default" : "secondary"}>
            {poll.status === "open" ? "Open" : "Closed"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleStatus}
            disabled={saving}
          >
            {poll.status === "open" ? "Close Poll" : "Reopen Poll"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={saving}
            className="text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Share */}
      <div className="flex flex-col gap-2">
        <Label>Share Link</Label>
        <SharePollButton token={poll.token} />
      </div>

      {/* Matches */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Matches ({poll.matches.length})</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (editingMatches) {
                setSelectedMatchIds(poll.matches.map((m) => m.id));
                setEditingMatches(false);
              } else {
                setSelectedMatchIds(poll.matches.map((m) => m.id));
                setEditingMatches(true);
              }
            }}
          >
            {editingMatches ? "Cancel" : "Edit Matches"}
          </Button>
        </div>

        {editingMatches ? (
          <div className="flex flex-col gap-4">
            <MatchSelector
              matches={allSelectableMatches}
              selectedIds={selectedMatchIds}
              onSelectionChange={setSelectedMatchIds}
            />
            <div className="flex flex-col gap-2">
              <Label>Updated Time Slots Preview</Label>
              <SlotPreview slots={previewSlots} />
            </div>
            <Button onClick={handleSaveMatches} disabled={saving}>
              {saving ? "Saving..." : "Save Match Changes"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {poll.matches.map((match) => (
              <div
                key={match.id}
                className="text-sm py-1 border-b last:border-0"
              >
                <span className="font-medium">
                  {match.home_team} – {match.away_team}
                </span>
                {match.start_time && (
                  <span className="text-muted-foreground ml-2">
                    {new Date(match.start_time).toLocaleString("nl-NL", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Time Slots */}
      {!editingMatches && (
        <div className="flex flex-col gap-2">
          <Label>Time Slots ({poll.slots.length})</Label>
          <SlotPreview
            slots={poll.slots.map((s) => ({
              start: new Date(s.start_time),
              end: new Date(s.end_time),
            }))}
          />
        </div>
      )}

      {/* Responses */}
      <div className="flex flex-col gap-2">
        <Label>
          Responses (
          {[...new Set(poll.responses.map((r) => r.participant_name))].length}{" "}
          umpires)
        </Label>
        <ResponseSummary slots={poll.slots} responses={poll.responses} />
      </div>
    </div>
  );
}
```

**Step 2: Write the server page**

```tsx
// app/protected/polls/[id]/page.tsx
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPoll, getAvailableMatches } from "@/lib/actions/polls";
import { PollDetailClient } from "@/components/polls/poll-detail-client";

async function PollDetailLoader({ id }: { id: string }) {
  try {
    const [poll, availableMatches] = await Promise.all([
      getPoll(id),
      getAvailableMatches(id),
    ]);
    return (
      <PollDetailClient
        initialPoll={poll}
        availableMatches={availableMatches}
      />
    );
  } catch {
    notFound();
  }
}

export default async function PollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense
      fallback={<div className="text-muted-foreground">Loading poll...</div>}
    >
      <PollDetailLoader id={id} />
    </Suspense>
  );
}
```

**Step 3: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 4: Commit**

```bash
git add components/polls/poll-detail-client.tsx app/protected/polls/[id]/page.tsx
git commit -m "feat: add poll detail page with edit, responses, and share"
```

---

## Task 15: Run all unit tests

**Step 1: Run tests**

Run: `npm test`
Expected: All tests PASS (existing + new slot-preview, match-selector, poll-table, diff-slots tests)

**Step 2: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 3: Run lint**

Run: `npm run lint`
Expected: PASS (fix any issues if needed)

**Step 4: Run format**

Run: `npm run format`

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: lint and formatting fixes"
```

---

## Task 16: Manual smoke test

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Smoke test checklist**

1. Navigate to `/protected/polls` — see empty state
2. Click "New Poll" — navigate to `/protected/polls/new`
3. Enter a title, select matches, verify slot preview updates
4. Create the poll — redirected to detail page
5. On detail page: verify title, matches, slots, empty response summary
6. Edit title inline
7. Edit matches (add/remove), verify slot preview
8. Copy link, test Web Share if on mobile
9. Toggle poll open/closed
10. Go back to poll list, verify poll shows
11. Delete poll from list or detail page

---

## Task 17: Write E2E test

**Files:**

- Create: `e2e/polls.spec.ts`

**Step 1: Write the E2E test**

```typescript
// e2e/polls.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Polls page", () => {
  test.describe.configure({ mode: "serial" });

  const uniqueId = Date.now();
  const pollTitle = `E2E Poll ${uniqueId}`;

  test("shows polls page", async ({ page }) => {
    await page.goto("/protected/polls");
    await expect(page.getByRole("heading", { name: "Polls" })).toBeVisible();
  });

  test("can create a poll with matches", async ({ page }) => {
    // First ensure we have at least one match
    await page.goto("/protected/matches");
    await expect(page.getByRole("heading", { name: "Matches" })).toBeVisible();

    // Navigate to create poll
    await page.goto("/protected/polls/new");
    await expect(page.getByRole("heading", { name: "New Poll" })).toBeVisible();

    // Fill title
    await page.getByLabel("Poll Title").fill(pollTitle);

    // Select first available match (if any)
    const checkboxes = page.getByRole("checkbox");
    const count = await checkboxes.count();
    if (count > 0) {
      await checkboxes.first().click();

      // Verify slot preview appears
      await expect(page.getByText(/time slot/i)).toBeVisible();

      // Create poll
      await page.getByRole("button", { name: "Create Poll" }).click();

      // Should redirect to detail page
      await expect(page.getByText(pollTitle)).toBeVisible();
    }
  });

  test("can view poll in list", async ({ page }) => {
    await page.goto("/protected/polls");
    await expect(page.getByText(pollTitle)).toBeVisible();
  });

  test("can toggle poll status", async ({ page }) => {
    await page.goto("/protected/polls");

    // Click on the poll title to go to detail
    await page.getByText(pollTitle).click();
    await expect(page.getByText(pollTitle)).toBeVisible();

    // Toggle status
    await page.getByRole("button", { name: /close poll/i }).click();
    await expect(page.getByText("Closed")).toBeVisible();

    // Toggle back
    await page.getByRole("button", { name: /reopen poll/i }).click();
    await expect(page.getByText("Open")).toBeVisible();
  });

  test("can delete poll", async ({ page }) => {
    await page.goto("/protected/polls");
    await page.getByText(pollTitle).click();

    // Accept the confirmation dialog
    page.on("dialog", (dialog) => dialog.accept());

    await page.getByRole("button", { name: /delete/i }).click();

    // Should redirect to polls list
    await page.waitForURL(/\/protected\/polls$/);
    await expect(page.getByText(pollTitle)).not.toBeVisible();
  });
});
```

**Step 2: Run E2E tests**

Run: `npm run test:e2e -- --grep "Polls"`
Expected: All E2E tests pass

**Step 3: Commit**

```bash
git add e2e/polls.spec.ts
git commit -m "test: add E2E tests for poll creation, status toggle, and deletion"
```

---

## Task 18: Final verification

**Step 1: Run full test suite**

Run: `npm test && npm run type-check && npm run lint && npm run format:check`
Expected: All PASS

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

**Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: final cleanup for Stage 4"
```
