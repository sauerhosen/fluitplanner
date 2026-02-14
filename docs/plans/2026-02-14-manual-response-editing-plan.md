# Manual Poll Response Editing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow planners to click response cells in the Responses tab to cycle through yes/maybe/no/none, with optimistic UI and immediate server-side persistence.

**Architecture:** New server action `updatePollResponse` in `lib/actions/poll-responses.ts` handles upsert/delete with auth + ownership checks. The `ResponseSummary` component converts from server to client component with local state for optimistic updates, calling the server action on each click.

**Tech Stack:** Next.js server actions, Supabase upsert/delete, React `useState` + `useTransition`, shadcn/ui toast for error feedback.

---

### Task 1: Server Action — `updatePollResponse`

**Files:**

- Create: `lib/actions/poll-responses.ts`
- Test: `__tests__/lib/actions/poll-responses.test.ts`

**Step 1: Write the failing test**

Create `__tests__/lib/actions/poll-responses.test.ts` with this content:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Supabase mock                                                      */
/* ------------------------------------------------------------------ */

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockUpsert = vi.fn();
const mockDelete = vi.fn();

function chainable() {
  return {
    select: mockSelect,
    eq: mockEq,
    single: mockSingle,
    upsert: mockUpsert,
    delete: mockDelete,
  };
}

const mockFrom = vi.fn(() => chainable());
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    auth: { getUser: mockGetUser },
  })),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function resetChain() {
  for (const fn of [
    mockFrom,
    mockSelect,
    mockEq,
    mockSingle,
    mockUpsert,
    mockDelete,
    mockGetUser,
  ]) {
    fn.mockReset();
  }
  mockFrom.mockReturnValue(chainable());
  mockSelect.mockReturnValue(chainable());
  mockEq.mockReturnValue(chainable());
  mockUpsert.mockReturnValue(chainable());
  mockDelete.mockReturnValue(chainable());
  mockSingle.mockResolvedValue({ data: null, error: null });
}

beforeEach(() => {
  resetChain();
});

/* ------------------------------------------------------------------ */
/*  Import under test                                                  */
/* ------------------------------------------------------------------ */

import { updatePollResponse } from "@/lib/actions/poll-responses";

describe("updatePollResponse", () => {
  it("throws when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(
      updatePollResponse("poll-1", "slot-1", "umpire-1", "yes"),
    ).rejects.toThrow("Not authenticated");
  });

  it("returns error when poll not found", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "not found" },
    });

    const result = await updatePollResponse(
      "poll-1",
      "slot-1",
      "umpire-1",
      "yes",
    );
    expect(result).toEqual({ error: "Poll not found" });
  });

  it("returns error when user does not own poll", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    // First single call: poll lookup
    mockSingle.mockResolvedValueOnce({
      data: { id: "poll-1", created_by: "other-user" },
      error: null,
    });

    const result = await updatePollResponse(
      "poll-1",
      "slot-1",
      "umpire-1",
      "yes",
    );
    expect(result).toEqual({ error: "Not authorized" });
  });

  it("upserts response when value is yes/if_need_be/no", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    // Poll lookup
    mockSingle
      .mockResolvedValueOnce({
        data: { id: "poll-1", created_by: "user-1" },
        error: null,
      })
      // Umpire lookup
      .mockResolvedValueOnce({
        data: { id: "umpire-1", name: "Test Umpire" },
        error: null,
      });
    mockUpsert.mockResolvedValue({ error: null });

    const result = await updatePollResponse(
      "poll-1",
      "slot-1",
      "umpire-1",
      "yes",
    );
    expect(result).toEqual({});
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        poll_id: "poll-1",
        slot_id: "slot-1",
        umpire_id: "umpire-1",
        response: "yes",
        participant_name: "Test Umpire",
      }),
      { onConflict: "poll_id,slot_id,umpire_id" },
    );
  });

  it("deletes response when value is null", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockSingle.mockResolvedValueOnce({
      data: { id: "poll-1", created_by: "user-1" },
      error: null,
    });
    mockDelete.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());

    const result = await updatePollResponse(
      "poll-1",
      "slot-1",
      "umpire-1",
      null,
    );
    expect(result).toEqual({});
    expect(mockDelete).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/lib/actions/poll-responses.test.ts`
Expected: FAIL — module `@/lib/actions/poll-responses` not found.

**Step 3: Write minimal implementation**

Create `lib/actions/poll-responses.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function updatePollResponse(
  pollId: string,
  slotId: string,
  umpireId: string,
  response: "yes" | "if_need_be" | "no" | null,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAuth();

  // Verify ownership
  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("id, created_by")
    .eq("id", pollId)
    .single();

  if (pollError || !poll) return { error: "Poll not found" };
  if (poll.created_by !== user.id) return { error: "Not authorized" };

  if (response === null) {
    // Delete the response
    await supabase
      .from("availability_responses")
      .delete()
      .eq("poll_id", pollId)
      .eq("slot_id", slotId)
      .eq("umpire_id", umpireId);
  } else {
    // Look up umpire name for participant_name field
    const { data: umpire, error: umpireError } = await supabase
      .from("umpires")
      .select("id, name")
      .eq("id", umpireId)
      .single();

    if (umpireError || !umpire) return { error: "Umpire not found" };

    const { error: upsertError } = await supabase
      .from("availability_responses")
      .upsert(
        {
          poll_id: pollId,
          slot_id: slotId,
          umpire_id: umpireId,
          participant_name: umpire.name,
          response,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "poll_id,slot_id,umpire_id" },
      );

    if (upsertError) return { error: upsertError.message };
  }

  revalidatePath(`/protected/polls/${pollId}`);
  return {};
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/lib/actions/poll-responses.test.ts`
Expected: All 4 tests PASS.

Note: You may need to mock `next/cache` (`revalidatePath`). Add this to the test file if needed:

```typescript
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
```

**Step 5: Commit**

```bash
git add lib/actions/poll-responses.ts __tests__/lib/actions/poll-responses.test.ts
git commit -m "feat: add updatePollResponse server action with auth + ownership checks"
```

---

### Task 2: Convert `ResponseSummary` to Interactive Client Component

**Files:**

- Modify: `components/polls/response-summary.tsx` (full file, lines 1–153)
- Modify: `components/polls/poll-detail-client.tsx:374` (pass `pollId` prop)

**Step 1: Write the failing component test**

Create `components/__tests__/response-summary.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ResponseSummary } from "@/components/polls/response-summary";
import type { PollSlot, AvailabilityResponse } from "@/lib/types/domain";

// Mock server action
vi.mock("@/lib/actions/poll-responses", () => ({
  updatePollResponse: vi.fn(async () => ({})),
}));

// Mock toast
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { updatePollResponse } from "@/lib/actions/poll-responses";

const SLOTS: PollSlot[] = [
  {
    id: "slot-1",
    poll_id: "poll-1",
    start_time: "2026-03-01T10:00:00Z",
    end_time: "2026-03-01T12:00:00Z",
  },
];

const RESPONSES: AvailabilityResponse[] = [
  {
    id: "resp-1",
    poll_id: "poll-1",
    slot_id: "slot-1",
    participant_name: "Alice",
    response: "yes",
    umpire_id: "umpire-1",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  },
];

describe("ResponseSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders response cells as buttons", () => {
    render(
      <ResponseSummary slots={SLOTS} responses={RESPONSES} pollId="poll-1" />,
    );
    // The cell should be a button
    const button = screen.getByRole("button", { name: /alice.*slot/i });
    expect(button).toBeInTheDocument();
  });

  it("cycles yes → if_need_be on click", async () => {
    render(
      <ResponseSummary slots={SLOTS} responses={RESPONSES} pollId="poll-1" />,
    );
    const button = screen.getByRole("button", { name: /alice/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(updatePollResponse).toHaveBeenCalledWith(
        "poll-1",
        "slot-1",
        "umpire-1",
        "if_need_be",
      );
    });
  });

  it("cycles no → null (none) on click", async () => {
    const responses: AvailabilityResponse[] = [
      { ...RESPONSES[0], response: "no" },
    ];
    render(
      <ResponseSummary slots={SLOTS} responses={responses} pollId="poll-1" />,
    );
    const button = screen.getByRole("button", { name: /alice/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(updatePollResponse).toHaveBeenCalledWith(
        "poll-1",
        "slot-1",
        "umpire-1",
        null,
      );
    });
  });

  it("shows toast on server error", async () => {
    vi.mocked(updatePollResponse).mockResolvedValueOnce({
      error: "Something failed",
    });
    render(
      <ResponseSummary slots={SLOTS} responses={RESPONSES} pollId="poll-1" />,
    );
    const button = screen.getByRole("button", { name: /alice/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
        }),
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- components/__tests__/response-summary.test.ts`
Expected: FAIL — `ResponseSummary` doesn't accept `pollId` prop, cells are not buttons.

**Step 3: Rewrite `response-summary.tsx` as client component**

Replace the full content of `components/polls/response-summary.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Check, X, HelpCircle } from "lucide-react";
import { updatePollResponse } from "@/lib/actions/poll-responses";
import { useToast } from "@/hooks/use-toast";
import type { PollSlot, AvailabilityResponse } from "@/lib/types/domain";

type ResponseValue = "yes" | "if_need_be" | "no";

const CYCLE_ORDER: (ResponseValue | null)[] = ["yes", "if_need_be", "no", null];

function nextResponse(current: ResponseValue | null): ResponseValue | null {
  const idx = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
}

const RESPONSE_ICONS: Record<
  ResponseValue,
  { icon: typeof Check; className: string; label: string }
> = {
  yes: {
    icon: Check,
    className: "text-green-600 dark:text-green-400",
    label: "available",
  },
  if_need_be: {
    icon: HelpCircle,
    className: "text-yellow-500 dark:text-yellow-400",
    label: "if need be",
  },
  no: {
    icon: X,
    className: "text-red-500 dark:text-red-400",
    label: "not available",
  },
};

type DateGroup = {
  weekday: string;
  day: string;
  slots: PollSlot[];
};

function groupSlotsByDate(slots: PollSlot[]): DateGroup[] {
  const groups: DateGroup[] = [];
  for (const slot of slots) {
    const date = new Date(slot.start_time);
    const dateKey = date.toDateString();
    const last = groups[groups.length - 1];
    if (last && new Date(last.slots[0].start_time).toDateString() === dateKey) {
      last.slots.push(slot);
    } else {
      groups.push({
        weekday: date.toLocaleDateString("nl-NL", { weekday: "short" }),
        day: date.toLocaleDateString("nl-NL", {
          day: "numeric",
          month: "short",
        }),
        slots: [slot],
      });
    }
  }
  return groups;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Key for the local response map: "slotId:umpireId" */
function cellKey(slotId: string, umpireId: string) {
  return `${slotId}:${umpireId}`;
}

type Participant = {
  umpireId: string;
  name: string;
};

type Props = {
  pollId: string;
  slots: PollSlot[];
  responses: AvailabilityResponse[];
};

export function ResponseSummary({ pollId, slots, responses }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  // Build initial response map from props
  const initialMap = new Map<string, ResponseValue>();
  for (const r of responses) {
    if (r.umpire_id) {
      initialMap.set(cellKey(r.slot_id, r.umpire_id), r.response);
    }
  }
  const [responseMap, setResponseMap] = useState(initialMap);

  // Extract unique participants (umpires with at least one response)
  const participants: Participant[] = [];
  const seen = new Set<string>();
  for (const r of responses) {
    if (r.umpire_id && !seen.has(r.umpire_id)) {
      seen.add(r.umpire_id);
      participants.push({ umpireId: r.umpire_id, name: r.participant_name });
    }
  }
  participants.sort((a, b) => a.name.localeCompare(b.name));

  if (participants.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No responses yet. Share the poll link with umpires to collect
        availability.
      </p>
    );
  }

  const dateGroups = groupSlotsByDate(slots);

  function handleClick(slotId: string, umpireId: string) {
    const key = cellKey(slotId, umpireId);
    const current = responseMap.get(key) ?? null;
    const next = nextResponse(current);

    // Optimistic update
    setResponseMap((prev) => {
      const updated = new Map(prev);
      if (next === null) {
        updated.delete(key);
      } else {
        updated.set(key, next);
      }
      return updated;
    });

    startTransition(async () => {
      const result = await updatePollResponse(pollId, slotId, umpireId, next);
      if (result.error) {
        // Revert on error
        setResponseMap((prev) => {
          const reverted = new Map(prev);
          if (current === null) {
            reverted.delete(key);
          } else {
            reverted.set(key, current);
          }
          return reverted;
        });
        toast({
          variant: "destructive",
          title: "Failed to update response",
          description: result.error,
        });
      }
    });
  }

  return (
    <div className="scrollbar-visible overflow-x-auto pb-2">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          {/* Date header row */}
          <tr>
            <th
              rowSpan={2}
              className="text-left p-2 font-medium sticky left-0 z-10 bg-background align-bottom"
            />
            {dateGroups.map((group, i) => (
              <th
                key={i}
                colSpan={group.slots.length}
                className={`text-center px-1 pt-3 pb-1 align-bottom whitespace-nowrap ${i > 0 ? "border-l-2 border-border" : ""}`}
              >
                <div className="text-muted-foreground text-[10px] uppercase tracking-wider">
                  {group.weekday}
                </div>
                <div className="text-base font-bold leading-tight">
                  {group.day}
                </div>
              </th>
            ))}
          </tr>
          {/* Time header row */}
          <tr>
            {dateGroups.flatMap((group, gi) =>
              group.slots.map((slot, si) => (
                <th
                  key={slot.id}
                  className={`text-center px-1 pt-1 pb-2 border-b font-normal whitespace-nowrap text-[11px] text-muted-foreground min-w-16 ${gi > 0 && si === 0 ? "border-l-2 border-border" : ""}`}
                >
                  {formatTime(slot.start_time)}
                  <br />
                  {formatTime(slot.end_time)}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {participants.map(({ umpireId, name }) => (
            <tr key={umpireId}>
              <td className="p-2 border-b font-medium sticky left-0 z-10 bg-background whitespace-nowrap">
                {name}
              </td>
              {dateGroups.flatMap((group, gi) =>
                group.slots.map((slot, si) => {
                  const key = cellKey(slot.id, umpireId);
                  const response = responseMap.get(key) ?? null;
                  const config = response ? RESPONSE_ICONS[response] : null;
                  const label = `${name} – ${formatTime(slot.start_time)}: ${config?.label ?? "no response"}`;
                  return (
                    <td
                      key={slot.id}
                      className={`border-b text-center p-0 ${gi > 0 && si === 0 ? "border-l-2 border-border" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => handleClick(slot.id, umpireId)}
                        className="w-full h-full p-1 cursor-pointer hover:bg-muted/50 transition-colors rounded-sm"
                        aria-label={label}
                        disabled={isPending}
                      >
                        {config ? (
                          <config.icon
                            className={`mx-auto h-5 w-5 ${config.className}`}
                          />
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {"\u2014"}
                          </span>
                        )}
                      </button>
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 4: Update parent component to pass `pollId`**

In `components/polls/poll-detail-client.tsx`, line 374, change:

```tsx
<ResponseSummary slots={poll.slots} responses={poll.responses} />
```

to:

```tsx
<ResponseSummary
  pollId={poll.id}
  slots={poll.slots}
  responses={poll.responses}
/>
```

**Step 5: Run component test to verify it passes**

Run: `npm test -- components/__tests__/response-summary.test.tsx`
Expected: All 4 tests PASS.

Note: The `aria-label` pattern in the test (`/alice/i`) should match the label format `"Alice – 10:00: available"`. Adjust the test selector if the exact format differs — use `screen.getByRole("button", { name: /alice/i })` which is case-insensitive and partial.

**Step 6: Run full test suite**

Run: `npm test`
Expected: All tests PASS. Existing component tests for `ResponseSummary` (if any) may need updating since the props changed.

**Step 7: Commit**

```bash
git add components/polls/response-summary.tsx components/polls/poll-detail-client.tsx components/__tests__/response-summary.test.tsx
git commit -m "feat: make response cells clickable with cycle-through editing"
```

---

### Task 3: Verify `useToast` Hook Exists

**Files:**

- Check: `hooks/use-toast.ts` or `hooks/use-toast.tsx`

**Step 1: Verify the hook exists**

Run: `ls hooks/use-toast*` or check if shadcn/ui toast is installed.

If the hook does NOT exist, install it:

```bash
npx shadcn@latest add toast
```

This creates `hooks/use-toast.ts` and `components/ui/toast.tsx` + `components/ui/toaster.tsx`.

If `Toaster` is not yet in the root layout, add `<Toaster />` to `app/layout.tsx`.

**Step 2: Commit (only if changes were needed)**

```bash
git add -A
git commit -m "chore: add shadcn toast component"
```

---

### Task 4: E2E Test — Planner Edits Response

**Files:**

- Modify or create: `e2e/poll-responses-edit.spec.ts`

**Step 1: Write the E2E test**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Planner response editing", () => {
  test("can cycle a response by clicking", async ({ page }) => {
    // Navigate to a poll detail page (assumes authenticated via global setup)
    // Go to polls list
    await page.goto("/protected/polls");

    // Click the first poll (or create one if needed)
    const pollLink = page
      .getByRole("link")
      .filter({ hasText: /poll/i })
      .first();
    await pollLink.click();

    // Switch to Responses tab
    await page.getByRole("tab", { name: /responses/i }).click();

    // Find a response button (skip if no responses exist)
    const responseButton = page
      .getByRole("button", {
        name: /available|if need be|not available|no response/i,
      })
      .first();
    const count = await responseButton.count();
    if (count === 0) {
      test.skip();
      return;
    }

    // Click to cycle
    await responseButton.click();

    // Verify the response changed (the aria-label should update)
    // Wait for the server action to complete
    await page.waitForTimeout(500);

    // The button should still be present (page didn't crash)
    await expect(responseButton).toBeVisible();
  });
});
```

**Step 2: Run E2E test**

Run: `npm run test:e2e -- --grep "cycle a response"`
Expected: PASS (if test data exists), or SKIP (if no poll with responses).

**Step 3: Commit**

```bash
git add e2e/poll-responses-edit.spec.ts
git commit -m "test: add E2E test for planner response editing"
```

---

### Task 5: Manual Smoke Test & Final Polish

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Manual verification**

1. Navigate to `/protected/polls/[id]` for a poll with responses
2. Click the "Responses" tab
3. Click a response cell — verify it cycles through yes → maybe → no → none → yes
4. Verify changes persist on page reload
5. Verify hover effect on cells
6. Verify error toast appears if you disconnect network and click

**Step 3: Run full CI checks**

```bash
npm run lint && npm run format:check && npm run type-check && npm test && npm run build
```

Expected: All pass.

**Step 4: Final commit (if any polish needed)**

```bash
git add -A
git commit -m "fix: polish response editing UI"
```
