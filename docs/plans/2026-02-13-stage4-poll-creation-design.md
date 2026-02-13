# Stage 4: Availability Polls — Creation (Planner)

## Overview

Planner can create and manage availability polls from matches. Polls are long-lived and editable: matches can be added/removed while preserving the same shareable URL and existing umpire responses for unchanged slots.

## Key Decisions

- **Multiple active polls** allowed simultaneously
- **Polls are editable** — add/remove matches, responses for unchanged slots preserved
- **Match exclusivity** — a match can only belong to one active poll at a time
- **Poll title** — always required (custom, not auto-generated)
- **Token** — nanoid (12 chars, URL-safe) for shareable links
- **Sharing** — copy-to-clipboard + Web Share API (native share sheet on mobile)
- **No new migrations** — Stage 1 schema covers all tables; title required enforced at application level

## Routes

| Route                   | Purpose                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| `/protected/polls`      | Poll list — title, date range, status, response count, share, link to detail |
| `/protected/polls/new`  | Create poll — title input, match selector, slot preview                      |
| `/protected/polls/[id]` | Poll detail — edit title/matches, view response summary, share, open/close   |

Navigation: "Polls" link added to protected layout.

## Poll Creation Flow

1. Planner clicks "New Poll" → `/protected/polls/new`
2. Enters poll title (required)
3. Selects matches:
   - Date range pickers to filter the match list
   - Checkboxes on individual matches to include/exclude
   - Only matches with `start_time` shown; matches in other polls excluded
4. Live slot preview shows calculated 2-hour time slots (via `groupMatchesIntoSlots`), updating as matches are toggled
5. "Create Poll" → generates nanoid token, inserts poll + poll_matches + poll_slots, redirects to detail page

## Poll Editing Flow (Detail Page)

- Edit title inline
- Add/remove matches using the same match selector, pre-populated
- On save, recalculate slots and diff against existing:
  - Matching slots (same start/end) → keep, responses preserved
  - New slots → insert
  - Removed slots → delete (cascade deletes responses via FK)
- Toggle poll open/closed
- Delete poll (cascade deletes everything)

## Server Actions (`lib/actions/polls.ts`)

| Action                                  | Description                                                     |
| --------------------------------------- | --------------------------------------------------------------- |
| `getPolls()`                            | All polls for auth user, with response count and date range     |
| `getPoll(id)`                           | Single poll with matches, slots, and all availability responses |
| `getAvailableMatches(excludePollId?)`   | Matches with start_time not in any other active poll            |
| `createPoll(title, matchIds[])`         | Validate, generate token, calculate slots, insert all           |
| `updatePollMatches(pollId, matchIds[])` | Recalculate slots, diff, add/remove slots and poll_matches      |
| `updatePollTitle(pollId, title)`        | Update title                                                    |
| `togglePollStatus(pollId)`              | Toggle open/closed                                              |
| `deletePoll(pollId)`                    | Delete poll (cascades)                                          |

All actions require authentication. All mutations sanitize inputs.

### Slot Diff Logic

Extract a pure function `diffSlots(existingSlots, newSlots)` that returns `{ toAdd, toRemove, toKeep }` based on matching start/end times. This is independently unit-testable.

## Database

No new migrations. Existing Stage 1 schema has all required tables:

- `polls` (id, title, token, status, created_by, created_at)
- `poll_matches` (poll_id, match_id) — cascade on delete
- `poll_slots` (id, poll_id, start_time, end_time) — cascade on delete
- `availability_responses` (id, poll_id, slot_id, ...) — cascade on slot delete

Token: nanoid, 12 characters, URL-safe alphabet. Poll URL: `/poll/[token]` (public, implemented in Stage 5).

## UI Components (`components/polls/`)

| Component                | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `polls-page-client.tsx`  | Client state for poll list page                                         |
| `poll-table.tsx`         | Poll list table with status badges, response counts, actions            |
| `poll-form.tsx`          | Title + match selector + slot preview, used for create and edit         |
| `match-selector.tsx`     | Date range filter + checkbox list of available matches, grouped by date |
| `slot-preview.tsx`       | Live display of calculated time slots                                   |
| `poll-detail-client.tsx` | Client state for detail page — edit, responses, share                   |
| `response-summary.tsx`   | Umpire × slot table with colored cells (green/yellow/red/grey)          |
| `share-poll-button.tsx`  | Copy URL + Web Share API                                                |

**New shadcn/ui components needed:** `popover`, `calendar` (for date range pickers).

## Testing

**Unit tests:**

- `__tests__/lib/actions/polls.test.ts` — createPoll, updatePollMatches logic
- `__tests__/lib/domain/diff-slots.test.ts` — pure slot diff function

**Component tests:**

- `components/__tests__/poll-table.test.tsx` — renders polls with correct status/count
- `components/__tests__/match-selector.test.tsx` — date filtering, excludes unavailable matches
- `components/__tests__/slot-preview.test.tsx` — correct slots for given matches

**E2E tests:**

- `e2e/polls.spec.ts` — create poll with title and matches → verify slots → verify in list → edit (add/remove match) → verify slot update → copy share link → toggle open/closed → delete poll
