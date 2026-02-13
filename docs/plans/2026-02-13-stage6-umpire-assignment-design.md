# Stage 6: Umpire Assignment — Design

## Overview

The planner assigns umpires to matches based on availability poll responses. The UI is an interactive grid (matrix) on the existing poll detail page, where the planner clicks cells to toggle assignments.

## Database

New `assignments` table:

```sql
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
```

RLS: authenticated users can manage assignments for polls they created (`created_by = auth.uid()`). Read access follows the same pattern as existing poll RLS.

## UI Location

New **tab on the poll detail page** (`/protected/polls/[id]`):

- **Responses tab** — existing response summary grid (umpires × slots)
- **Assignments tab** — new assignment matrix (matches × umpires)

## Assignment Matrix

### Layout

- **Default:** Matches as rows, umpires as columns
- **Toggle button** to swap axes (umpires as rows, matches as columns)
- Sticky first column/row for labels
- Horizontal scroll for overflow

### Rows (matches, default view)

Grouped by date. Each row shows: time, home team vs away team, assignment counter badge (e.g. "1/2", "2/2").

### Columns (umpires, default view)

Umpire names across the top. Derived from umpires who responded to this poll.

### Cell coloring (availability)

Each cell reflects the umpire's availability for the match's corresponding time slot:

- **Green** — "yes"
- **Yellow** — "if need be"
- **Red** — "no"
- **Grey** — no response

The match-to-slot mapping uses the existing `calculateSlot` domain logic: determine which poll slot a match falls in, then look up the umpire's response for that slot.

### Click to toggle

Single click on a cell toggles the assignment on/off. Assigned cells show a **checkmark overlay** and a stronger border.

### Auto-save

Each toggle fires a server action immediately:

- `createAssignment(pollId, matchId, umpireId)` — insert
- `deleteAssignment(pollId, matchId, umpireId)` — delete

Optimistic UI update. On failure, revert and show error toast.

## Conflict Detection

Two severity levels, computed client-side:

1. **Hard conflict (red border + forbidden icon):** Umpire is assigned to another match in the **same time slot**. This is a real scheduling conflict.
2. **Soft conflict (orange border + warning icon):** Umpire is assigned to another match on the **same day** but a different time slot. Discouraged but allowed.

## 3+ Umpire Warning

When a match already has 2 umpires and the planner assigns a 3rd:

- Show a **toast warning** ("This match already has 2 umpires assigned")
- Allow the assignment (not blocked)
- Row header badge turns orange when count > 2

## Data Requirements

The assignment tab needs (most already loaded on poll detail):

- Poll's matches (existing)
- Poll's slots (existing)
- All availability responses for this poll (existing)
- Umpires who responded to this poll (derived from responses)
- Current assignments for this poll (new query)

## Testing

- **Unit tests:** conflict detection logic (same-slot, same-day), match-to-slot mapping
- **Component tests:** assignment grid rendering, click-to-toggle, conflict indicators
- **E2E test:** navigate to poll → assignments tab → assign umpires → verify persistence and conflict warnings
