# Stage 1 Design: Database Schema & Core Domain Logic

## Decisions

- **Poll–match relationship:** Arbitrary set. Planner selects any matches to create a poll from.
- **Umpire identification:** Free-text name entry (Rallly/Doodle style). No auth for umpires.
- **Schema scope:** Only tables used by Stages 1–5 (matches, polls, poll_matches, poll_slots, availability_responses). Umpires and assignments tables deferred.
- **RLS:** Anon + token check for public poll access. Authenticated-only for planner operations.
- **Types:** Hand-written TypeScript types matching the schema.

---

## Database Schema

### `matches`

| Column        | Type                     | Notes                       |
| ------------- | ------------------------ | --------------------------- |
| `id`          | `uuid` PK                | Default `gen_random_uuid()` |
| `date`        | `date`                   | Match date                  |
| `start_time`  | `timestamptz`            | Full date+time of kickoff   |
| `home_team`   | `text` NOT NULL          |                             |
| `away_team`   | `text` NOT NULL          |                             |
| `competition` | `text`                   | Optional                    |
| `venue`       | `text`                   | Optional                    |
| `created_by`  | `uuid` FK → `auth.users` | Planner who added it        |
| `created_at`  | `timestamptz`            | Default `now()`             |

### `polls`

| Column       | Type                     | Notes                                    |
| ------------ | ------------------------ | ---------------------------------------- |
| `id`         | `uuid` PK                |                                          |
| `title`      | `text`                   | Optional display name                    |
| `token`      | `text` UNIQUE NOT NULL   | Shareable link token (nanoid)            |
| `status`     | `text`                   | `'open'` or `'closed'`, default `'open'` |
| `created_by` | `uuid` FK → `auth.users` |                                          |
| `created_at` | `timestamptz`            |                                          |

### `poll_matches` (junction)

| Column     | Type                                    | Notes                 |
| ---------- | --------------------------------------- | --------------------- |
| `poll_id`  | `uuid` FK → `polls` ON DELETE CASCADE   |                       |
| `match_id` | `uuid` FK → `matches` ON DELETE CASCADE |                       |
| PK         |                                         | `(poll_id, match_id)` |

### `poll_slots`

| Column       | Type                                  | Notes |
| ------------ | ------------------------------------- | ----- |
| `id`         | `uuid` PK                             |       |
| `poll_id`    | `uuid` FK → `polls` ON DELETE CASCADE |       |
| `start_time` | `timestamptz` NOT NULL                |       |
| `end_time`   | `timestamptz` NOT NULL                |       |

### `availability_responses`

| Column             | Type                                       | Notes                                  |
| ------------------ | ------------------------------------------ | -------------------------------------- |
| `id`               | `uuid` PK                                  |                                        |
| `poll_id`          | `uuid` FK → `polls`                        |                                        |
| `slot_id`          | `uuid` FK → `poll_slots` ON DELETE CASCADE |                                        |
| `participant_name` | `text` NOT NULL                            | Free-text umpire name                  |
| `response`         | `text` NOT NULL                            | `'yes'`, `'if_need_be'`, or `'no'`     |
| `created_at`       | `timestamptz`                              |                                        |
| `updated_at`       | `timestamptz`                              |                                        |
| UNIQUE             |                                            | `(poll_id, slot_id, participant_name)` |

---

## RLS Policies

**`matches`:** SELECT/INSERT/UPDATE/DELETE only for authenticated users.

**`polls`:** Authenticated users can CRUD. Anon can SELECT (filtered by token in query).

**`poll_matches`:** Authenticated can INSERT/DELETE. Anon can SELECT (via poll token filter).

**`poll_slots`:** Authenticated can INSERT/DELETE. Anon can SELECT (via poll token filter).

**`availability_responses`:** Authenticated can SELECT/DELETE. Anon can SELECT, INSERT, UPDATE (how umpires submit). Token-scoped via poll relationship.

---

## Domain Types

File: `lib/types/domain.ts`

```typescript
type Match = {
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

type Poll = {
  id: string;
  title: string | null;
  token: string;
  status: "open" | "closed";
  created_by: string;
  created_at: string;
};

type PollSlot = {
  id: string;
  poll_id: string;
  start_time: string;
  end_time: string;
};

type AvailabilityResponse = {
  id: string;
  poll_id: string;
  slot_id: string;
  participant_name: string;
  response: "yes" | "if_need_be" | "no";
  created_at: string;
  updated_at: string;
};

type TimeSlot = {
  start: Date;
  end: Date;
};
```

---

## Slot Calculation Logic

File: `lib/domain/slots.ts`

### `calculateSlot(matchTime: Date): TimeSlot`

1. Subtract 30 minutes from match time
2. Round **down** to nearest quarter hour (00, 15, 30, 45)
3. End time = start + 2 hours

Examples:

- Match 11:15 → 10:45–12:45
- Match 12:05 → 11:30–13:30
- Match 14:00 → 13:30–15:30

### `groupMatchesIntoSlots(matches: { start_time: string | Date }[]): TimeSlot[]`

1. Calculate slot for each match
2. Sort by start time
3. Merge slots whose start times are **≤ 15 minutes apart** (take earliest start, latest end)
4. Compare against group's start time (earliest start in group), not individual slot starts
5. Return merged slots sorted chronologically

Merge examples:

- 10:30–12:30 + 10:45–12:45 → starts 15 min apart → **10:30–12:45**
- 10:45–12:45 + 11:00–13:00 → starts 16 min apart → **two separate slots**
- 10:30–12:30 + 10:45–12:45 + 11:00–13:00 → A+B merge (15 min), merged AB start 10:30 vs C start 11:00 = 30 min apart → **10:30–12:45 and 11:00–13:00**

---

## File Structure

```
lib/
  types/
    domain.ts
  domain/
    slots.ts

supabase/
  migrations/
    YYYYMMDD_stage1_schema.sql

__tests__/
  lib/
    domain/
      slots.test.ts
```

## Testing

- Pure TDD: failing tests first, then implement
- Edge cases: exact quarter hour, 1 min past quarter, midnight boundary, duplicate slots, merge threshold (15 vs 16 min), empty/single input, different days
- No DB tests (schema validated by migration)

## Out of Scope

- No UI/routes
- No server actions
- No Supabase client calls
- No umpires or assignments tables
