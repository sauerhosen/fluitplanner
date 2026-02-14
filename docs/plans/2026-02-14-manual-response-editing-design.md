# Manual Poll Response Editing — Design

## Summary

Allow planners to manually edit poll responses in the Responses tab by clicking response cells to cycle through states: `yes → if_need_be → no → [none] → yes`.

## Approach

Inline click-to-cycle with immediate save (optimistic UI). Each response cell becomes a clickable button. Changes persist immediately via a server action; on failure the UI reverts and shows an error toast.

## Scope

- Planners can edit any existing response cell (umpires who have at least one response)
- Planners can set responses for empty slots of umpires already in the table
- Cycling to "none" deletes the response row
- Works regardless of poll open/closed status (planners are admins)

## UI Changes

**ResponseSummary component** (`components/polls/response-summary.tsx`):

- Convert to client component (needs click handlers and state)
- Each table cell becomes a `<button>` with hover effect
- Click cycles: `yes → if_need_be → no → null → yes`
- Optimistic UI: cell updates instantly, reverts on server error
- Error feedback via toast

**Data requirements:**

- Component needs `pollId` prop (for server action)
- Rows keyed by `umpire_id` (already available in response data) rather than just `participant_name`

## Server Action

New file: `lib/actions/poll-responses.ts`

```typescript
"use server";

async function updatePollResponse(
  pollId: string,
  slotId: string,
  umpireId: string,
  response: "yes" | "if_need_be" | "no" | null,
): Promise<{ error?: string }>;
```

**Behavior:**

- `requireAuth()` to verify planner is authenticated
- Verify planner owns the poll (`polls.created_by === user.id`)
- If `response` is `null`: delete the `availability_responses` row matching `(poll_id, slot_id, umpire_id)`
- If `response` is a value: upsert with `onConflict: "poll_id, slot_id, umpire_id"`, using the umpire's name as `participant_name`

## Data Flow

```
Click cell
  → compute next response state
  → optimistic UI update
  → call updatePollResponse(pollId, slotId, umpireId, newValue)
  → success: done
  → failure: revert cell + show toast error
```

## Edge Cases

- Clearing an umpire's only response: row stays visible in current session, disappears on reload
- Closed polls: editable by planner (they're the admin)
- Concurrent edits: last-write-wins (same as umpire self-editing)

## Testing

- **Unit**: `updatePollResponse` server action — upsert, delete, auth check, ownership check
- **Component**: click-to-cycle behavior on response cells
- **E2E**: planner clicks response cell, verifies cycle and persistence
