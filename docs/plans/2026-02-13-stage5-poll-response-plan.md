# Stage 5: Availability Polls — Umpire Response Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the public poll response page where umpires open a shared link, identify by email, and indicate availability (yes / if need be / no) for each 2-hour time slot.

**Architecture:** Single public route `app/poll/[token]/page.tsx` with server-side data fetching and a client component for the interactive form. Umpire identification via cookie (returning) or email (new visitor). Unauthenticated server actions in `lib/actions/public-polls.ts`. Self-registration for unknown emails.

**Tech Stack:** Next.js App Router, Supabase (anon client), TailwindCSS, shadcn/ui, Vitest, Playwright

---

### Task 1: Update AvailabilityResponse type

**Files:**

- Modify: `lib/types/domain.ts:31-39`

**Step 1: Add umpire_id to AvailabilityResponse type**

In `lib/types/domain.ts`, update the `AvailabilityResponse` type:

```typescript
export type AvailabilityResponse = {
  id: string;
  poll_id: string;
  slot_id: string;
  participant_name: string;
  response: "yes" | "if_need_be" | "no";
  umpire_id: string | null;
  created_at: string;
  updated_at: string;
};
```

**Step 2: Run type check**

Run: `npm run type-check`
Expected: PASS (umpire_id is nullable so existing code won't break)

**Step 3: Commit**

```bash
git add lib/types/domain.ts
git commit -m "feat: add umpire_id to AvailabilityResponse type"
```

---

### Task 2: Server actions — getPollByToken

**Files:**

- Create: `lib/actions/public-polls.ts`
- Create: `__tests__/lib/actions/public-polls.test.ts`

**Step 1: Write the failing test**

Create `__tests__/lib/actions/public-polls.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase server client
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
    }),
  ),
}));

// Helper to set up chained query mock
function mockQuery(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    in: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };
  // For queries that don't end in .single()
  chain.then = undefined;
  return chain;
}

function mockQueryList(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error }),
    in: vi.fn().mockReturnThis(),
  };
  return chain;
}

import { getPollByToken } from "@/lib/actions/public-polls";

describe("getPollByToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for non-existent token", async () => {
    const pollChain = mockQuery(null, { message: "not found" });
    mockFrom.mockReturnValue(pollChain);

    const result = await getPollByToken("nonexistent");
    expect(result).toBeNull();
  });

  it("returns poll with slots for valid token", async () => {
    const poll = {
      id: "p1",
      title: "Weekend Poll",
      token: "abc123",
      status: "open",
      created_by: "user-1",
      created_at: "2026-02-13T10:00:00Z",
    };
    const slots = [
      {
        id: "s1",
        poll_id: "p1",
        start_time: "2026-02-15T10:45:00Z",
        end_time: "2026-02-15T12:45:00Z",
      },
    ];

    const pollChain = mockQuery(poll);
    const slotChain = mockQueryList(slots);

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "polls") return pollChain;
      if (table === "poll_slots") return slotChain;
      return mockQuery(null);
    });

    const result = await getPollByToken("abc123");
    expect(result).not.toBeNull();
    expect(result!.poll.id).toBe("p1");
    expect(result!.slots).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/lib/actions/public-polls.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `lib/actions/public-polls.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  Poll,
  PollSlot,
  AvailabilityResponse,
  Umpire,
} from "@/lib/types/domain";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PublicPollData = {
  poll: Poll;
  slots: PollSlot[];
};

/* ------------------------------------------------------------------ */
/*  getPollByToken                                                     */
/* ------------------------------------------------------------------ */

export async function getPollByToken(
  token: string,
): Promise<PublicPollData | null> {
  const supabase = await createClient();

  // Fetch poll by token (anon RLS allows select)
  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("*")
    .eq("token", token)
    .single();

  if (pollError || !poll) return null;

  // Fetch slots ordered by start_time
  const { data: slots, error: slotError } = await supabase
    .from("poll_slots")
    .select("*")
    .eq("poll_id", poll.id)
    .order("start_time");

  if (slotError) return null;

  return { poll, slots: slots ?? [] };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/lib/actions/public-polls.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/actions/public-polls.ts __tests__/lib/actions/public-polls.test.ts
git commit -m "feat: add getPollByToken server action"
```

---

### Task 3: Server actions — findOrCreateUmpire

**Files:**

- Modify: `lib/actions/public-polls.ts`
- Modify: `__tests__/lib/actions/public-polls.test.ts`

**Step 1: Write the failing tests**

Add to `__tests__/lib/actions/public-polls.test.ts`:

```typescript
import { findOrCreateUmpire } from "@/lib/actions/public-polls";

describe("findOrCreateUmpire", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing umpire when email matches", async () => {
    const umpire = {
      id: "u1",
      name: "Jane Doe",
      email: "jane@example.com",
      level: 1,
      auth_user_id: null,
      created_at: "2026-02-13T10:00:00Z",
      updated_at: "2026-02-13T10:00:00Z",
    };

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: umpire, error: null }),
        }),
      }),
    });

    const result = await findOrCreateUmpire("Jane@Example.com");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("u1");
  });

  it("returns null when email not found and no name provided", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "not found" },
          }),
        }),
      }),
    });

    const result = await findOrCreateUmpire("unknown@example.com");
    expect(result).toBeNull();
  });

  it("creates new umpire when email not found and name provided", async () => {
    const newUmpire = {
      id: "u2",
      name: "John New",
      email: "john@example.com",
      level: 1,
      auth_user_id: null,
      created_at: "2026-02-13T10:00:00Z",
      updated_at: "2026-02-13T10:00:00Z",
    };

    // First call: lookup by email — not found
    // Second call: insert — returns new umpire
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: "not found" },
              }),
            }),
          }),
        };
      }
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: newUmpire,
              error: null,
            }),
          }),
        }),
      };
    });

    const result = await findOrCreateUmpire("john@example.com", "John New");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("John New");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/lib/actions/public-polls.test.ts`
Expected: FAIL — findOrCreateUmpire not exported

**Step 3: Write implementation**

Add to `lib/actions/public-polls.ts`:

```typescript
/* ------------------------------------------------------------------ */
/*  findOrCreateUmpire                                                 */
/* ------------------------------------------------------------------ */

export async function findOrCreateUmpire(
  email: string,
  name?: string,
): Promise<Umpire | null> {
  const supabase = await createClient();
  const normalizedEmail = email.trim().toLowerCase();

  // Try to find existing umpire by email
  const { data: existing, error: findError } = await supabase
    .from("umpires")
    .select("*")
    .eq("email", normalizedEmail)
    .single();

  if (existing && !findError) return existing;

  // Not found — if no name provided, can't create
  if (!name) return null;

  // Create new umpire (anon RLS allows insert)
  const { data: created, error: createError } = await supabase
    .from("umpires")
    .insert({
      name: name.trim(),
      email: normalizedEmail,
      level: 1,
    })
    .select()
    .single();

  if (createError) throw new Error(createError.message);
  return created;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/lib/actions/public-polls.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/actions/public-polls.ts __tests__/lib/actions/public-polls.test.ts
git commit -m "feat: add findOrCreateUmpire server action"
```

---

### Task 4: Server actions — getMyResponses and submitResponses

**Files:**

- Modify: `lib/actions/public-polls.ts`
- Modify: `__tests__/lib/actions/public-polls.test.ts`

**Step 1: Write the failing tests**

Add to the test file:

```typescript
import { getMyResponses, submitResponses } from "@/lib/actions/public-polls";

describe("getMyResponses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns responses for given umpire and poll", async () => {
    const responses = [
      {
        id: "r1",
        poll_id: "p1",
        slot_id: "s1",
        participant_name: "Jane",
        response: "yes",
        umpire_id: "u1",
        created_at: "2026-02-13T10:00:00Z",
        updated_at: "2026-02-13T10:00:00Z",
      },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: responses, error: null }),
        }),
      }),
    });

    const result = await getMyResponses("p1", "u1");
    expect(result).toHaveLength(1);
    expect(result[0].response).toBe("yes");
  });
});

describe("submitResponses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when poll is closed", async () => {
    const closedPoll = {
      id: "p1",
      status: "closed",
    };

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: closedPoll, error: null }),
        }),
      }),
    });

    await expect(
      submitResponses("p1", "u1", "Jane", [{ slotId: "s1", response: "yes" }]),
    ).rejects.toThrow("Poll is closed");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/lib/actions/public-polls.test.ts`
Expected: FAIL — functions not exported

**Step 3: Write implementation**

Add to `lib/actions/public-polls.ts`:

```typescript
/* ------------------------------------------------------------------ */
/*  getMyResponses                                                     */
/* ------------------------------------------------------------------ */

export async function getMyResponses(
  pollId: string,
  umpireId: string,
): Promise<AvailabilityResponse[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("availability_responses")
    .select("*")
    .eq("poll_id", pollId)
    .eq("umpire_id", umpireId);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/* ------------------------------------------------------------------ */
/*  submitResponses                                                    */
/* ------------------------------------------------------------------ */

export type ResponseInput = {
  slotId: string;
  response: "yes" | "if_need_be" | "no";
};

export async function submitResponses(
  pollId: string,
  umpireId: string,
  participantName: string,
  responses: ResponseInput[],
): Promise<void> {
  if (responses.length === 0) return;

  const supabase = await createClient();

  // Verify poll is open
  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("id, status")
    .eq("id", pollId)
    .single();

  if (pollError || !poll) throw new Error("Poll not found");
  if (poll.status === "closed") throw new Error("Poll is closed");

  // Upsert responses one by one (using unique constraint on poll_id, slot_id, participant_name)
  for (const r of responses) {
    const { error } = await supabase.from("availability_responses").upsert(
      {
        poll_id: pollId,
        slot_id: r.slotId,
        participant_name: participantName,
        response: r.response,
        umpire_id: umpireId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "poll_id,slot_id,participant_name" },
    );

    if (error) throw new Error(error.message);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/lib/actions/public-polls.test.ts`
Expected: PASS

**Step 5: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 6: Commit**

```bash
git add lib/actions/public-polls.ts __tests__/lib/actions/public-polls.test.ts
git commit -m "feat: add getMyResponses and submitResponses server actions"
```

---

### Task 5: Public poll page — server component

**Files:**

- Create: `app/poll/[token]/page.tsx`

**Step 1: Create the server component**

Create `app/poll/[token]/page.tsx`:

```tsx
import { getPollByToken } from "@/lib/actions/public-polls";
import { PollResponsePage } from "@/components/poll-response/poll-response-page";

type Props = {
  params: Promise<{ token: string }>;
};

export default async function PublicPollPage({ params }: Props) {
  const { token } = await params;
  const data = await getPollByToken(token);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Poll not found</h1>
          <p className="text-muted-foreground mt-2">
            This poll link is invalid or has been deleted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg p-4">
      <PollResponsePage poll={data.poll} slots={data.slots} />
    </div>
  );
}
```

**Step 2: Run type check** (will fail because PollResponsePage doesn't exist yet — that's expected)

Run: `npm run type-check`
Expected: FAIL — PollResponsePage module not found. This is expected; we'll create it next.

**Step 3: Commit**

```bash
git add app/poll/\[token\]/page.tsx
git commit -m "feat: add public poll page server component"
```

---

### Task 6: Poll response client component — umpire identification

**Files:**

- Create: `components/poll-response/poll-response-page.tsx`
- Create: `components/poll-response/umpire-identifier.tsx`

**Step 1: Create the umpire identifier component**

Create `components/poll-response/umpire-identifier.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { findOrCreateUmpire } from "@/lib/actions/public-polls";
import type { Umpire } from "@/lib/types/domain";

type Props = {
  onIdentified: (umpire: Umpire) => void;
};

export function UmpireIdentifier({ onIdentified }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setError(null);
    setLoading(true);

    try {
      const umpire = await findOrCreateUmpire(email);
      if (umpire) {
        onIdentified(umpire);
      } else {
        // Email not found — ask for name to register
        setNeedsName(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setError(null);
    setLoading(true);

    try {
      const umpire = await findOrCreateUmpire(email, name);
      if (umpire) {
        onIdentified(umpire);
      } else {
        setError("Could not create account. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (needsName) {
    return (
      <form onSubmit={handleRegisterSubmit} className="space-y-4">
        <p className="text-muted-foreground text-sm">
          We don&apos;t have <strong>{email}</strong> on file yet. Enter your
          name to register.
        </p>
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jane Doe"
            required
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full"
        >
          {loading ? "Registering…" : "Continue"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleEmailSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Your email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. jane@example.com"
          required
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button
        type="submit"
        disabled={loading || !email.trim()}
        className="w-full"
      >
        {loading ? "Looking up…" : "Continue"}
      </Button>
    </form>
  );
}
```

**Step 2: Create the poll response page (skeleton)**

Create `components/poll-response/poll-response-page.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { UmpireIdentifier } from "@/components/poll-response/umpire-identifier";
import { getMyResponses } from "@/lib/actions/public-polls";
import type {
  Poll,
  PollSlot,
  Umpire,
  AvailabilityResponse,
} from "@/lib/types/domain";

type Props = {
  poll: Poll;
  slots: PollSlot[];
};

const COOKIE_NAME = "fluitplanner_umpire_id";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

export function PollResponsePage({ poll, slots }: Props) {
  const [umpire, setUmpire] = useState<Umpire | null>(null);
  const [existingResponses, setExistingResponses] = useState<
    AvailabilityResponse[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [cookieChecked, setCookieChecked] = useState(false);

  // Check cookie on mount
  useEffect(() => {
    async function checkCookie() {
      const umpireId = getCookie(COOKIE_NAME);
      if (umpireId) {
        try {
          // Import dynamically to avoid issues
          const { findOrCreateUmpire: _, getMyResponses: getResponses } =
            await import("@/lib/actions/public-polls");
          // We need to look up the umpire by ID — but our action uses email.
          // Instead, we'll use getMyResponses to check if the umpire exists
          // and load their responses. If it fails, the cookie is stale.
          const { findUmpireById } = await import("@/lib/actions/public-polls");
          const ump = await findUmpireById(umpireId);
          if (ump) {
            setUmpire(ump);
            if (poll.status === "open" || poll.status === "closed") {
              const responses = await getResponses(poll.id, umpireId);
              setExistingResponses(responses);
            }
          } else {
            deleteCookie(COOKIE_NAME);
          }
        } catch {
          deleteCookie(COOKIE_NAME);
        }
      }
      setLoading(false);
      setCookieChecked(true);
    }
    checkCookie();
  }, [poll.id, poll.status]);

  async function handleIdentified(ump: Umpire) {
    setCookie(COOKIE_NAME, ump.id, 365);
    setUmpire(ump);
    // Load existing responses
    try {
      const responses = await getMyResponses(poll.id, ump.id);
      setExistingResponses(responses);
    } catch {
      // No existing responses, that's fine
    }
  }

  function handleSwitchUser() {
    deleteCookie(COOKIE_NAME);
    setUmpire(null);
    setExistingResponses([]);
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  // Closed poll
  if (poll.status === "closed") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{poll.title}</h1>
        <p className="text-muted-foreground">This poll is closed.</p>
      </div>
    );
  }

  // No slots
  if (slots.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{poll.title}</h1>
        <p className="text-muted-foreground">No time slots available.</p>
      </div>
    );
  }

  // Not identified yet
  if (!umpire) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{poll.title}</h1>
        <UmpireIdentifier onIdentified={handleIdentified} />
      </div>
    );
  }

  // Identified — show availability form (placeholder, built in next task)
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{poll.title}</h1>
        <p className="text-muted-foreground text-sm">
          Responding as: <strong>{umpire.name}</strong>{" "}
          <button
            onClick={handleSwitchUser}
            className="text-primary underline"
            type="button"
          >
            Not you?
          </button>
        </p>
      </div>
      <p className="text-muted-foreground">Availability form coming next…</p>
    </div>
  );
}
```

**Note:** This references `findUmpireById` which we haven't added yet. We'll add it in the next step.

**Step 3: Add findUmpireById to server actions**

Add to `lib/actions/public-polls.ts`:

```typescript
/* ------------------------------------------------------------------ */
/*  findUmpireById                                                     */
/* ------------------------------------------------------------------ */

export async function findUmpireById(id: string): Promise<Umpire | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("umpires")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data;
}
```

**Step 4: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 5: Commit**

```bash
git add components/poll-response/poll-response-page.tsx components/poll-response/umpire-identifier.tsx lib/actions/public-polls.ts
git commit -m "feat: add poll response page with umpire identification"
```

---

### Task 7: Availability form component

**Files:**

- Create: `components/poll-response/availability-form.tsx`
- Create: `components/poll-response/slot-row.tsx`
- Modify: `components/poll-response/poll-response-page.tsx`

**Step 1: Create the slot row component**

Create `components/poll-response/slot-row.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";

type ResponseValue = "yes" | "if_need_be" | "no";

type Props = {
  startTime: string;
  endTime: string;
  value: ResponseValue | null;
  onChange: (value: ResponseValue) => void;
};

function formatSlotTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatSlotDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

const BUTTONS: { value: ResponseValue; label: string; activeClass: string }[] =
  [
    {
      value: "yes",
      label: "Yes",
      activeClass:
        "bg-green-600 text-white hover:bg-green-700 border-green-600",
    },
    {
      value: "if_need_be",
      label: "If need be",
      activeClass:
        "bg-yellow-500 text-white hover:bg-yellow-600 border-yellow-500",
    },
    {
      value: "no",
      label: "No",
      activeClass: "bg-red-600 text-white hover:bg-red-700 border-red-600",
    },
  ];

export function SlotRow({ startTime, endTime, value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="text-sm font-medium">
        {formatSlotDate(startTime)}, {formatSlotTime(startTime)} –{" "}
        {formatSlotTime(endTime)}
      </div>
      <div className="flex gap-2">
        {BUTTONS.map((btn) => (
          <Button
            key={btn.value}
            type="button"
            variant={value === btn.value ? "default" : "outline"}
            size="sm"
            className={value === btn.value ? btn.activeClass : ""}
            onClick={() => onChange(btn.value)}
          >
            {btn.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Create the availability form**

Create `components/poll-response/availability-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SlotRow } from "@/components/poll-response/slot-row";
import { submitResponses } from "@/lib/actions/public-polls";
import type { PollSlot, AvailabilityResponse } from "@/lib/types/domain";

type ResponseValue = "yes" | "if_need_be" | "no";

type Props = {
  pollId: string;
  umpireId: string;
  umpireName: string;
  slots: PollSlot[];
  existingResponses: AvailabilityResponse[];
};

export function AvailabilityForm({
  pollId,
  umpireId,
  umpireName,
  slots,
  existingResponses,
}: Props) {
  // Initialize state from existing responses
  const initialState: Record<string, ResponseValue | null> = {};
  for (const slot of slots) {
    const existing = existingResponses.find((r) => r.slot_id === slot.id);
    initialState[slot.id] = existing ? existing.response : null;
  }

  const [responses, setResponses] =
    useState<Record<string, ResponseValue | null>>(initialState);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(slotId: string, value: ResponseValue) {
    setResponses((prev) => ({ ...prev, [slotId]: value }));
    setSaved(false);
  }

  const hasSelections = Object.values(responses).some((v) => v !== null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const toSubmit = Object.entries(responses)
      .filter(([, value]) => value !== null)
      .map(([slotId, response]) => ({
        slotId,
        response: response!,
      }));

    try {
      await submitResponses(pollId, umpireId, umpireName, toSubmit);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {slots.map((slot) => (
        <SlotRow
          key={slot.id}
          startTime={slot.start_time}
          endTime={slot.end_time}
          value={responses[slot.id]}
          onChange={(value) => handleChange(slot.id, value)}
        />
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && (
        <p className="text-sm text-green-600">
          Your availability has been saved!
        </p>
      )}

      <Button
        type="submit"
        disabled={!hasSelections || saving}
        className="w-full"
      >
        {saving ? "Saving…" : saved ? "Save changes" : "Save availability"}
      </Button>
    </form>
  );
}
```

**Step 3: Wire up the availability form in the poll response page**

Update the identified/form section in `components/poll-response/poll-response-page.tsx`. Replace the placeholder at the end of the component (the last return block, the "Identified" section) with:

```tsx
// In the imports, add:
import { AvailabilityForm } from "@/components/poll-response/availability-form";

// Replace the last return block (the "Identified" section) with:
return (
  <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold">{poll.title}</h1>
      <p className="text-muted-foreground text-sm">
        Responding as: <strong>{umpire.name}</strong>{" "}
        <button
          onClick={handleSwitchUser}
          className="text-primary underline"
          type="button"
        >
          Not you?
        </button>
      </p>
    </div>
    <AvailabilityForm
      pollId={poll.id}
      umpireId={umpire.id}
      umpireName={umpire.name}
      slots={slots}
      existingResponses={existingResponses}
    />
  </div>
);
```

**Step 4: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 5: Commit**

```bash
git add components/poll-response/slot-row.tsx components/poll-response/availability-form.tsx components/poll-response/poll-response-page.tsx
git commit -m "feat: add availability form with slot selection buttons"
```

---

### Task 8: Component tests

**Files:**

- Create: `components/__tests__/poll-response-page.test.tsx`

**Step 1: Write component tests**

Create `components/__tests__/poll-response-page.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlotRow } from "@/components/poll-response/slot-row";

// Test SlotRow in isolation (it's the core interactive piece)
describe("SlotRow", () => {
  const defaultProps = {
    startTime: "2026-02-15T10:45:00Z",
    endTime: "2026-02-15T12:45:00Z",
    value: null as "yes" | "if_need_be" | "no" | null,
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders date and time", () => {
    render(<SlotRow {...defaultProps} />);
    // Should show the formatted date and times
    expect(screen.getByText(/feb/i)).toBeTruthy();
  });

  it("renders three buttons", () => {
    render(<SlotRow {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Yes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "If need be" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No" })).toBeTruthy();
  });

  it("calls onChange when button clicked", () => {
    render(<SlotRow {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(defaultProps.onChange).toHaveBeenCalledWith("yes");
  });

  it("calls onChange with if_need_be when Maybe clicked", () => {
    render(<SlotRow {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "If need be" }));
    expect(defaultProps.onChange).toHaveBeenCalledWith("if_need_be");
  });

  it("calls onChange with no when No clicked", () => {
    render(<SlotRow {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(defaultProps.onChange).toHaveBeenCalledWith("no");
  });
});
```

**Step 2: Run tests**

Run: `npm test -- components/__tests__/poll-response-page.test.tsx`
Expected: PASS

**Step 3: Commit**

```bash
git add components/__tests__/poll-response-page.test.tsx
git commit -m "test: add SlotRow component tests"
```

---

### Task 9: E2E test

**Files:**

- Create: `e2e/poll-response.spec.ts`

**Step 1: Write E2E test**

Create `e2e/poll-response.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Poll response page", () => {
  test("shows not found for invalid token", async ({ page }) => {
    await page.goto("/poll/nonexistent-token-xyz");
    await expect(page.getByText("Poll not found")).toBeVisible();
  });

  test.describe("full poll response flow", () => {
    test.describe.configure({ mode: "serial" });

    const uniqueId = Date.now();
    const pollTitle = `E2E Response Poll ${uniqueId}`;
    const umpireEmail = `e2e-${uniqueId}@test.com`;
    const umpireName = `E2E Umpire ${uniqueId}`;
    let pollToken = "";
    let pollCreated = false;

    test("planner creates a poll and gets share link", async ({ page }) => {
      // Create a poll via the planner interface
      await page.goto("/protected/polls/new");
      await page.getByLabel("Poll Title").fill(pollTitle);

      const checkboxes = page.getByRole("checkbox");
      const count = await checkboxes.count();
      if (count === 0) {
        test.skip(true, "No matches available to create a poll");
        return;
      }

      await checkboxes.first().click();
      await page.getByRole("button", { name: "Create Poll" }).click();

      // On detail page, get the share URL
      await expect(page.getByText(pollTitle)).toBeVisible();

      // Extract token from the page URL or share button
      const url = page.url();
      const pollId = url.split("/").pop();
      // Get the token from the share button's data or the page content
      // The share button copies a URL like /poll/{token}
      // We can get it by checking the page for the token pattern
      const shareButton = page.getByRole("button", { name: /copy|share/i });
      await expect(shareButton).toBeVisible();

      // Use clipboard to get the share URL
      await shareButton.click();
      // Read from clipboard
      pollToken = await page.evaluate(async () => {
        const text = await navigator.clipboard.readText();
        const match = text.match(/\/poll\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : "";
      });

      expect(pollToken).not.toBe("");
      pollCreated = true;
    });

    test("umpire can fill out availability via poll link", async ({ page }) => {
      test.skip(!pollCreated, "Poll was not created");

      // Visit the public poll page
      await page.goto(`/poll/${pollToken}`);
      await expect(page.getByText(pollTitle)).toBeVisible();

      // Enter email (new umpire)
      await page.getByLabel("Your email").fill(umpireEmail);
      await page.getByRole("button", { name: "Continue" }).click();

      // Should ask for name (new umpire)
      await expect(page.getByLabel("Your name")).toBeVisible();
      await page.getByLabel("Your name").fill(umpireName);
      await page.getByRole("button", { name: "Continue" }).click();

      // Should show availability form
      await expect(page.getByText(`Responding as:`)).toBeVisible();
      await expect(page.getByText(umpireName)).toBeVisible();

      // Click Yes on the first slot
      const yesButtons = page.getByRole("button", { name: "Yes" });
      await yesButtons.first().click();

      // Save
      await page.getByRole("button", { name: /save/i }).click();
      await expect(page.getByText("saved")).toBeVisible();
    });

    test("returning umpire sees existing responses", async ({ page }) => {
      test.skip(!pollCreated, "Poll was not created");

      // Visit the same poll link again (cookie should identify)
      await page.goto(`/poll/${pollToken}`);

      // Should show the form directly with existing responses
      await expect(page.getByText(umpireName)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(`Responding as:`)).toBeVisible();
    });

    test("closed poll shows closed message", async ({ page }) => {
      test.skip(!pollCreated, "Poll was not created");

      // Close the poll via planner
      await page.goto("/protected/polls");
      await page.getByText(pollTitle).click();
      await page.getByRole("button", { name: /close poll/i }).click();
      await expect(page.getByText("Closed")).toBeVisible();

      // Visit the public poll link
      await page.goto(`/poll/${pollToken}`);
      await expect(page.getByText("This poll is closed")).toBeVisible();

      // Cleanup: reopen and delete poll
      await page.goto("/protected/polls");
      await page.getByText(pollTitle).click();
      await page.getByRole("button", { name: /reopen/i }).click();
      page.on("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: /delete/i }).click();
      await page.waitForURL(/\/protected\/polls$/);
    });
  });
});
```

**Step 2: Run E2E test**

Run: `npm run test:e2e -- --grep "Poll response"`
Expected: PASS (requires dev server running and matches in database)

**Step 3: Commit**

```bash
git add e2e/poll-response.spec.ts
git commit -m "test: add E2E tests for poll response flow"
```

---

### Task 10: Run all tests and lint

**Step 1: Run linting and formatting**

Run: `npm run lint && npm run format:check`
Expected: PASS

**Step 2: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 3: Run unit tests**

Run: `npm test`
Expected: PASS

**Step 4: Run E2E tests**

Run: `npm run test:e2e`
Expected: PASS

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: fix lint/formatting issues"
```
