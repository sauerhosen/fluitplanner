# Stage 1: Database Schema & Core Domain Logic — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the Supabase database schema (5 tables with RLS) and TDD-implemented pure domain logic for time slot calculation.

**Architecture:** Supabase migration defines tables + RLS policies. Pure TypeScript functions handle slot calculation (no DB interaction). Hand-written types mirror the schema.

**Tech Stack:** Supabase (Postgres + RLS), TypeScript, Vitest

**Design doc:** `docs/plans/2026-02-12-stage1-design.md`

---

### Task 1: Create Domain Types

**Files:**

- Create: `lib/types/domain.ts`

**Step 1: Create the types file**

```typescript
export type Match = {
  id: string;
  date: string;
  start_time: string;
  home_team: string;
  away_team: string;
  competition: string | null;
  venue: string | null;
  created_by: string;
  created_at: string;
};

export type Poll = {
  id: string;
  title: string | null;
  token: string;
  status: "open" | "closed";
  created_by: string;
  created_at: string;
};

export type PollSlot = {
  id: string;
  poll_id: string;
  start_time: string;
  end_time: string;
};

export type AvailabilityResponse = {
  id: string;
  poll_id: string;
  slot_id: string;
  participant_name: string;
  response: "yes" | "if_need_be" | "no";
  created_at: string;
  updated_at: string;
};

export type TimeSlot = {
  start: Date;
  end: Date;
};
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit lib/types/domain.ts`
Expected: No errors.

**Step 3: Commit**

```bash
git add lib/types/domain.ts
git commit -m "feat: add domain types for matches, polls, slots, and responses"
```

---

### Task 2: TDD `calculateSlot` — Write Failing Tests

**Files:**

- Create: `__tests__/lib/domain/slots.test.ts`

**Step 1: Write failing tests for `calculateSlot`**

All times use a fixed date (2025-03-15) to avoid timezone ambiguity. Use UTC throughout.

```typescript
import { describe, it, expect } from "vitest";
import { calculateSlot } from "@/lib/domain/slots";

describe("calculateSlot", () => {
  it("subtracts 30 min and rounds down to quarter hour (match at 11:15)", () => {
    // 11:15 - 30min = 10:45, already on quarter hour
    const match = new Date("2025-03-15T11:15:00Z");
    const slot = calculateSlot(match);
    expect(slot.start).toEqual(new Date("2025-03-15T10:45:00Z"));
    expect(slot.end).toEqual(new Date("2025-03-15T12:45:00Z"));
  });

  it("rounds down when not on quarter hour (match at 12:05)", () => {
    // 12:05 - 30min = 11:35, round down to 11:30
    const match = new Date("2025-03-15T12:05:00Z");
    const slot = calculateSlot(match);
    expect(slot.start).toEqual(new Date("2025-03-15T11:30:00Z"));
    expect(slot.end).toEqual(new Date("2025-03-15T13:30:00Z"));
  });

  it("handles match exactly on the hour (14:00)", () => {
    // 14:00 - 30min = 13:30, already on quarter hour
    const match = new Date("2025-03-15T14:00:00Z");
    const slot = calculateSlot(match);
    expect(slot.start).toEqual(new Date("2025-03-15T13:30:00Z"));
    expect(slot.end).toEqual(new Date("2025-03-15T15:30:00Z"));
  });

  it("handles match at quarter past (10:15)", () => {
    // 10:15 - 30min = 9:45, already on quarter hour
    const match = new Date("2025-03-15T10:15:00Z");
    const slot = calculateSlot(match);
    expect(slot.start).toEqual(new Date("2025-03-15T09:45:00Z"));
    expect(slot.end).toEqual(new Date("2025-03-15T11:45:00Z"));
  });

  it("rounds down 1 min past quarter hour (10:01)", () => {
    // 10:01 - 30min = 9:31, round down to 9:30
    const match = new Date("2025-03-15T10:01:00Z");
    const slot = calculateSlot(match);
    expect(slot.start).toEqual(new Date("2025-03-15T09:30:00Z"));
    expect(slot.end).toEqual(new Date("2025-03-15T11:30:00Z"));
  });

  it("rounds down 14 min past quarter hour (10:44)", () => {
    // 10:44 - 30min = 10:14, round down to 10:00
    const match = new Date("2025-03-15T10:44:00Z");
    const slot = calculateSlot(match);
    expect(slot.start).toEqual(new Date("2025-03-15T10:00:00Z"));
    expect(slot.end).toEqual(new Date("2025-03-15T12:00:00Z"));
  });

  it("handles midnight boundary (match at 00:15)", () => {
    // 00:15 - 30min = 23:45 previous day
    const match = new Date("2025-03-15T00:15:00Z");
    const slot = calculateSlot(match);
    expect(slot.start).toEqual(new Date("2025-03-14T23:45:00Z"));
    expect(slot.end).toEqual(new Date("2025-03-15T01:45:00Z"));
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/domain/slots.test.ts`
Expected: FAIL — cannot find module `@/lib/domain/slots`.

---

### Task 3: Implement `calculateSlot`

**Files:**

- Create: `lib/domain/slots.ts`

**Step 1: Write minimal implementation**

```typescript
import type { TimeSlot } from "@/lib/types/domain";

export function calculateSlot(matchTime: Date): TimeSlot {
  const ms = matchTime.getTime();
  const thirtyMinMs = 30 * 60 * 1000;
  const fifteenMinMs = 15 * 60 * 1000;
  const twoHoursMs = 2 * 60 * 60 * 1000;

  const shifted = ms - thirtyMinMs;
  const start = shifted - (shifted % fifteenMinMs);
  const end = start + twoHoursMs;

  return { start: new Date(start), end: new Date(end) };
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/domain/slots.test.ts`
Expected: All 7 tests PASS.

**Step 3: Commit**

```bash
git add lib/domain/slots.ts __tests__/lib/domain/slots.test.ts
git commit -m "feat: add calculateSlot with TDD tests"
```

---

### Task 4: TDD `groupMatchesIntoSlots` — Write Failing Tests

**Files:**

- Modify: `__tests__/lib/domain/slots.test.ts`

**Step 1: Add failing tests for `groupMatchesIntoSlots`**

Append to the test file:

```typescript
import { calculateSlot, groupMatchesIntoSlots } from "@/lib/domain/slots";

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
    // Match B at 11:31 -> slot 11:00-13:00
    // Starts are 15+ min apart -> two separate slots
    const matches = [
      { start_time: new Date("2025-03-15T11:15:00Z") },
      { start_time: new Date("2025-03-15T11:31:00Z") },
    ];
    const slots = groupMatchesIntoSlots(matches);
    expect(slots).toHaveLength(2);
    expect(slots[0].start).toEqual(new Date("2025-03-15T10:45:00Z"));
    expect(slots[1].start).toEqual(new Date("2025-03-15T11:00:00Z"));
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
```

**Step 2: Run tests to verify the new tests fail**

Run: `npx vitest run __tests__/lib/domain/slots.test.ts`
Expected: `calculateSlot` tests PASS, `groupMatchesIntoSlots` tests FAIL — function not exported.

---

### Task 5: Implement `groupMatchesIntoSlots`

**Files:**

- Modify: `lib/domain/slots.ts`

**Step 1: Add implementation**

Append to `lib/domain/slots.ts`:

```typescript
export function groupMatchesIntoSlots(
  matches: { start_time: string | Date }[],
): TimeSlot[] {
  if (matches.length === 0) return [];

  const slots = matches.map((m) => {
    const time =
      typeof m.start_time === "string" ? new Date(m.start_time) : m.start_time;
    return calculateSlot(time);
  });

  slots.sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: TimeSlot[] = [{ ...slots[0] }];

  for (let i = 1; i < slots.length; i++) {
    const current = slots[i];
    const group = merged[merged.length - 1];
    const diffMs = current.start.getTime() - group.start.getTime();
    const fifteenMinMs = 15 * 60 * 1000;

    if (diffMs <= fifteenMinMs) {
      // Merge: extend end if needed
      if (current.end.getTime() > group.end.getTime()) {
        group.end = new Date(current.end.getTime());
      }
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/domain/slots.test.ts`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add lib/domain/slots.ts __tests__/lib/domain/slots.test.ts
git commit -m "feat: add groupMatchesIntoSlots with merge logic and TDD tests"
```

---

### Task 6: Create Supabase Migration — Tables

**Files:**

- Create: `supabase/migrations/20260213000001_stage1_schema.sql`

**Step 1: Write the migration**

```sql
-- Stage 1: Core tables for matches, polls, slots, and availability responses

-- Matches table
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time timestamptz not null,
  home_team text not null,
  away_team text not null,
  competition text,
  venue text,
  created_by uuid references auth.users not null,
  created_at timestamptz default now() not null
);

-- Polls table
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  title text,
  token text unique not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references auth.users not null,
  created_at timestamptz default now() not null
);

-- Junction: which matches belong to which poll
create table public.poll_matches (
  poll_id uuid references public.polls on delete cascade not null,
  match_id uuid references public.matches on delete cascade not null,
  primary key (poll_id, match_id)
);

-- Time slots within a poll
create table public.poll_slots (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.polls on delete cascade not null,
  start_time timestamptz not null,
  end_time timestamptz not null
);

-- Umpire availability responses
create table public.availability_responses (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.polls not null,
  slot_id uuid references public.poll_slots on delete cascade not null,
  participant_name text not null,
  response text not null check (response in ('yes', 'if_need_be', 'no')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (poll_id, slot_id, participant_name)
);

-- Indexes
create index idx_matches_date on public.matches (date);
create index idx_matches_created_by on public.matches (created_by);
create index idx_polls_token on public.polls (token);
create index idx_polls_created_by on public.polls (created_by);
create index idx_poll_slots_poll_id on public.poll_slots (poll_id);
create index idx_availability_responses_poll_id on public.availability_responses (poll_id);
create index idx_availability_responses_slot_id on public.availability_responses (slot_id);
```

**Step 2: Commit tables migration**

```bash
git add supabase/migrations/20260213000001_stage1_schema.sql
git commit -m "feat: add Stage 1 database schema migration (tables + indexes)"
```

---

### Task 7: Create Supabase Migration — RLS Policies

**Files:**

- Create: `supabase/migrations/20260213000002_stage1_rls.sql`

**Step 1: Write the RLS migration**

```sql
-- Stage 1: Row Level Security policies

-- Enable RLS on all tables
alter table public.matches enable row level security;
alter table public.polls enable row level security;
alter table public.poll_matches enable row level security;
alter table public.poll_slots enable row level security;
alter table public.availability_responses enable row level security;

-- matches: authenticated users only
create policy "Authenticated users can select matches"
  on public.matches for select to authenticated
  using (true);

create policy "Authenticated users can insert matches"
  on public.matches for insert to authenticated
  with check (auth.uid() = created_by);

create policy "Authenticated users can update matches"
  on public.matches for update to authenticated
  using (auth.uid() = created_by);

create policy "Authenticated users can delete matches"
  on public.matches for delete to authenticated
  using (auth.uid() = created_by);

-- polls: authenticated can CRUD, anon can select (token-filtered at query level)
create policy "Authenticated users can select polls"
  on public.polls for select to authenticated
  using (true);

create policy "Anon can select polls"
  on public.polls for select to anon
  using (true);

create policy "Authenticated users can insert polls"
  on public.polls for insert to authenticated
  with check (auth.uid() = created_by);

create policy "Authenticated users can update polls"
  on public.polls for update to authenticated
  using (auth.uid() = created_by);

create policy "Authenticated users can delete polls"
  on public.polls for delete to authenticated
  using (auth.uid() = created_by);

-- poll_matches: authenticated can manage, anon can select
create policy "Authenticated users can select poll_matches"
  on public.poll_matches for select to authenticated
  using (true);

create policy "Anon can select poll_matches"
  on public.poll_matches for select to anon
  using (true);

create policy "Authenticated users can insert poll_matches"
  on public.poll_matches for insert to authenticated
  with check (true);

create policy "Authenticated users can delete poll_matches"
  on public.poll_matches for delete to authenticated
  using (true);

-- poll_slots: authenticated can manage, anon can select
create policy "Authenticated users can select poll_slots"
  on public.poll_slots for select to authenticated
  using (true);

create policy "Anon can select poll_slots"
  on public.poll_slots for select to anon
  using (true);

create policy "Authenticated users can insert poll_slots"
  on public.poll_slots for insert to authenticated
  with check (true);

create policy "Authenticated users can delete poll_slots"
  on public.poll_slots for delete to authenticated
  using (true);

-- availability_responses: authenticated can select/delete, anon can select/insert/update
create policy "Authenticated users can select availability_responses"
  on public.availability_responses for select to authenticated
  using (true);

create policy "Anon can select availability_responses"
  on public.availability_responses for select to anon
  using (true);

create policy "Anon can insert availability_responses"
  on public.availability_responses for insert to anon
  with check (true);

create policy "Anon can update availability_responses"
  on public.availability_responses for update to anon
  using (true);

create policy "Authenticated users can delete availability_responses"
  on public.availability_responses for delete to authenticated
  using (true);
```

**Step 2: Commit RLS migration**

```bash
git add supabase/migrations/20260213000002_stage1_rls.sql
git commit -m "feat: add Stage 1 RLS policies"
```

---

### Task 8: Apply Migrations to Remote Supabase

**Step 1: Check current migration status**

Run: `npx supabase db push --dry-run`
Expected: Shows the two new migrations would be applied.

**Step 2: Apply migrations**

Run: `npx supabase db push`
Expected: Both migrations applied successfully.

**Step 3: Verify tables exist**

Run: `npx supabase db dump --schema public | head -50`
Expected: Shows created tables.

---

### Task 9: Run Full Test Suite + Lint

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass (existing + new slot tests).

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

**Step 3: Run format check**

Run: `npm run format:check`
Expected: All files formatted.

**Step 4: Run type check**

Run: `npm run type-check`
Expected: No type errors.

**Step 5: Run build**

Run: `npm run build`
Expected: Build succeeds.
