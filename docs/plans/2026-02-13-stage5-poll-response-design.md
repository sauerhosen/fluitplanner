# Stage 5: Availability Polls — Umpire Response (Public)

## Overview

Umpires open a shared poll link, identify themselves by email, and indicate availability (yes / if need be / no) for each time slot. Mobile-first, no auth required.

## Key Decisions

- **Single-page client component** — server fetches poll data, client handles identification + form
- **Umpire identification** — cookie-first (`fluitplanner_umpire_id`), email fallback
- **Self-registration** — unknown emails can create a new umpire (name + email, level 1) through poll links
- **Response visibility** — umpires see only their own responses, never others'
- **Interaction** — three buttons per slot (Yes / If need be / No), selected button is solid, others outlined
- **No partial saves** — single Save button submits all slots at once

## Route

`app/poll/[token]/page.tsx` — public route, no auth required. The Supabase proxy already excludes non-`/protected/*` routes.

## User Flow

### First visit (no cookie)

1. Server component fetches poll + slots by token
2. If poll not found → "Poll not found" message
3. If poll closed → show title + "This poll is closed" (read-only responses if cookie exists)
4. Umpire enters email
5. If email found in umpires table → set cookie, show form pre-filled with existing responses
6. If email not found → show name input → create umpire (level 1) → set cookie, show empty form
7. Umpire selects availability per slot using three buttons
8. Save → upsert all responses → success message, form stays editable

### Return visit (cookie present)

1. Cookie `fluitplanner_umpire_id` identifies umpire
2. Validate umpire still exists (if deleted, clear cookie, show email input)
3. Show "Responding as: [name]" with "Not you?" link
4. Form pre-filled with existing responses
5. Edit and re-save as needed

## Cookie

- Name: `fluitplanner_umpire_id`
- Value: umpire UUID
- Expiry: 1 year
- Not httpOnly (needs client-side read)

## Server Actions (`lib/actions/public-polls.ts`)

All actions use anon Supabase client — no authentication required.

| Action                                                               | Description                                                                                                                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getPollByToken(token)`                                              | Returns poll + slots (ordered by start_time), or null if not found. Returns closed polls too (for messaging).                                                        |
| `findOrCreateUmpire(email, name?)`                                   | Lookup by email (lowercase). If found → return umpire. If not found + name → create umpire (level 1) + return. If not found + no name → return null.                 |
| `getMyResponses(pollId, umpireId)`                                   | Returns existing responses for this umpire on this poll.                                                                                                             |
| `submitResponses(pollId, umpireId, responses: {slotId, response}[])` | Validates poll is open. Upserts responses with `participant_name` (from umpire name) and `umpire_id`. Uses unique constraint `(poll_id, slot_id, participant_name)`. |

## Type Update

Add `umpire_id` to `AvailabilityResponse` in `lib/types/domain.ts`:

```typescript
export type AvailabilityResponse = {
  // ...existing fields...
  umpire_id: string | null;
};
```

## UI Components (`components/poll-response/`)

| Component                | Purpose                                                         |
| ------------------------ | --------------------------------------------------------------- |
| `poll-response-page.tsx` | Client component — orchestrates identification + form           |
| `umpire-identifier.tsx`  | Email input, name input for new umpires, "welcome back" display |
| `availability-form.tsx`  | List of slots with three buttons each, Save button              |
| `slot-row.tsx`           | Single slot: date/time label + Yes/If need be/No buttons        |

### Slot Row Layout

- Date + time range label (e.g. "Sat 15 Feb, 10:45 – 12:45")
- Three buttons: **Yes** (green) | **If need be** (yellow) | **No** (red)
- Selected: solid/filled. Unselected: outlined/ghost.
- Mobile-first vertical list. Desktop: same layout, wider.

### Form Behavior

- Local state: `Record<slotId, 'yes' | 'if_need_be' | 'no' | null>`
- Initialized from existing responses (all null for new)
- Save button disabled until at least one slot selected
- After save: success toast, form stays visible for edits
- Header shows poll title + "Responding as: [name]"

## Error States

| State                          | Behavior                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Poll not found                 | "Poll not found" message, no form                                              |
| Poll closed                    | Poll title + "This poll is closed". Show read-only responses if cookie exists. |
| Stale cookie (umpire deleted)  | Clear cookie, show email input                                                 |
| No slots on poll               | "No time slots available" message                                              |
| Concurrent edits (two devices) | Last-write-wins via upsert, acceptable                                         |

## Testing

### Unit tests (`__tests__/lib/actions/public-polls.test.ts`)

- `getPollByToken` — valid token returns poll+slots, invalid returns null
- `findOrCreateUmpire` — finds existing, creates new, returns null without name
- `submitResponses` — upserts correctly, rejects closed polls

### Component tests (`components/__tests__/`)

- `poll-response-page.test.tsx` — renders slots with three buttons, handles selection, submits
- Umpire identification — email input, name input for new, welcome back for returning

### E2E test (`e2e/poll-response.spec.ts`)

- Full flow: create poll → open link as anon → enter email (new) → enter name → fill availability → save → reopen → cookie identifies → see existing → edit → re-save
- Closed poll shows closed message
- Invalid token shows not found
