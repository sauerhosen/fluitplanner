# Poll Email Verification — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify returning umpires own their email before granting poll access, using a 6-digit code or magic link sent via AWS SES.

**Architecture:** New `verification_codes` Supabase table stores hashed codes + magic tokens. Server actions in a new `lib/actions/verification.ts` handle code generation, email sending (nodemailer/SES SMTP), and verification. The `UmpireIdentifier` component gains a verification step between email entry and poll access. New umpires self-registering skip verification entirely.

**Tech Stack:** nodemailer (new dep), Node.js crypto (SHA-256 + timingSafeEqual), nanoid (existing), Supabase, React

---

## Task 1: Database Migration — `verification_codes` Table

**Files:**

- Create: `supabase/migrations/20260214000001_verification_codes.sql`

**Step 1: Write the migration**

```sql
-- Verification codes for poll email verification
create table public.verification_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  magic_token text unique not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz default now() not null
);

-- Only one active code per email (enforced via partial unique index)
create unique index verification_codes_email_active
  on public.verification_codes (email)
  where expires_at > now();

-- Index for magic token lookups
create index verification_codes_magic_token_idx
  on public.verification_codes (magic_token);

-- RLS: deny all anonymous access (server actions use service role internally)
alter table public.verification_codes enable row level security;

-- Authenticated planners can view (useful for debugging, not required)
create policy "Authenticated users can view verification codes"
  on public.verification_codes for select
  to authenticated
  using (true);
```

**Step 2: Apply migration locally**

Run: `npx supabase db reset`
Expected: Migration applies successfully, table created.

**Step 3: Commit**

```bash
git add supabase/migrations/20260214000001_verification_codes.sql
git commit -m "feat: add verification_codes table migration"
```

---

## Task 2: Install nodemailer + Create Email Utility

**Files:**

- Create: `lib/email.ts`
- Test: `__tests__/lib/email.test.ts`

**Step 1: Install nodemailer**

Run: `npm install nodemailer && npm install -D @types/nodemailer`

**Step 2: Write failing test for `sendVerificationEmail`**

```typescript
// __tests__/lib/email.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock nodemailer before importing
const mockSendMail = vi.fn();
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

describe("sendVerificationEmail", () => {
  beforeEach(() => {
    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({ messageId: "test-id" });

    // Set required env vars
    vi.stubEnv("SMTP_HOST", "smtp.test.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "testuser");
    vi.stubEnv("SMTP_PASS", "testpass");
    vi.stubEnv("SMTP_FROM", "Fluitplanner <noreply@test.com>");
  });

  it("sends an email with code and magic link", async () => {
    const { sendVerificationEmail } = await import("@/lib/email");
    await sendVerificationEmail({
      to: "jan@example.com",
      code: "384721",
      magicLink: "https://fluitplanner.nl/poll/abc123?verify=token123",
    });

    expect(mockSendMail).toHaveBeenCalledOnce();
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe("jan@example.com");
    expect(call.subject).toContain("verification");
    expect(call.text).toContain("384721");
    expect(call.text).toContain(
      "https://fluitplanner.nl/poll/abc123?verify=token123",
    );
    expect(call.html).toContain("384 721"); // formatted with space
    expect(call.html).toContain(
      "https://fluitplanner.nl/poll/abc123?verify=token123",
    );
  });

  it("throws when SMTP env vars are missing", async () => {
    vi.stubEnv("SMTP_HOST", "");

    const { sendVerificationEmail } = await import("@/lib/email");
    await expect(
      sendVerificationEmail({
        to: "jan@example.com",
        code: "384721",
        magicLink: "https://example.com/poll/abc?verify=tok",
      }),
    ).rejects.toThrow();
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npm test -- __tests__/lib/email.test.ts`
Expected: FAIL — module not found

**Step 4: Write `lib/email.ts`**

```typescript
// lib/email.ts
import nodemailer from "nodemailer";

type VerificationEmailParams = {
  to: string;
  code: string;
  magicLink: string;
};

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP environment variables not configured");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendVerificationEmail({
  to,
  code,
  magicLink,
}: VerificationEmailParams): Promise<void> {
  const transport = getTransport();
  const from =
    process.env.SMTP_FROM || "Fluitplanner <noreply@fluitplanner.nl>";
  const formattedCode = `${code.slice(0, 3)} ${code.slice(3)}`;

  await transport.sendMail({
    from,
    to,
    subject: "Your Fluitplanner verification code",
    text: `Your verification code is: ${code}\n\nOr click this link to verify: ${magicLink}\n\nThis code expires in 30 minutes.`,
    html: verificationEmailHtml({ formattedCode, magicLink }),
  });
}

function verificationEmailHtml({
  formattedCode,
  magicLink,
}: {
  formattedCode: string;
  magicLink: string;
}): string {
  // Branded HTML email with green accent matching the app (hsl(158 64% 30%) ≈ #1B9A6C)
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="padding:24px 32px 16px;border-bottom:3px solid #1B9A6C;">
            <span style="font-size:20px;font-weight:700;color:#1a2e24;">Fluitplanner</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:15px;color:#4a5e53;">Your verification code is:</p>
            <p style="margin:0 0 24px;font-size:36px;font-weight:700;letter-spacing:6px;color:#1a2e24;font-family:'Courier New',monospace;">${formattedCode}</p>
            <p style="margin:0 0 16px;font-size:15px;color:#4a5e53;">Or click the button below:</p>
            <a href="${magicLink}" style="display:inline-block;padding:12px 28px;background-color:#1B9A6C;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Verify my email</a>
            <p style="margin:24px 0 0;font-size:13px;color:#6b7f73;">This code expires in 30 minutes.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background-color:#f5f9f7;border-top:1px solid #e2ece7;">
            <p style="margin:0;font-size:12px;color:#6b7f73;">Fluitplanner &middot; You received this because someone requested access to a poll with your email address.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}
```

**Step 5: Run tests**

Run: `npm test -- __tests__/lib/email.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add package.json package-lock.json lib/email.ts __tests__/lib/email.test.ts
git commit -m "feat: add email utility with branded verification template"
```

---

## Task 3: Verification Server Actions

**Files:**

- Create: `lib/actions/verification.ts`
- Test: `__tests__/lib/actions/verification.test.ts`

**Step 1: Write failing tests**

```typescript
// __tests__/lib/actions/verification.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockUpdate = vi.fn();
const mockLt = vi.fn();
const mockGt = vi.fn();
const mockGte = vi.fn();

function chainable(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    select: mockSelect,
    eq: mockEq,
    single: mockSingle,
    insert: mockInsert,
    delete: mockDelete,
    update: mockUpdate,
    lt: mockLt,
    gt: mockGt,
    gte: mockGte,
  };
}

const mockFrom = vi.fn(() => chainable());

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
  })),
}));

vi.mock("@/lib/email", () => ({
  sendVerificationEmail: vi.fn(),
}));

function resetChain() {
  for (const fn of [
    mockFrom,
    mockSelect,
    mockEq,
    mockSingle,
    mockInsert,
    mockDelete,
    mockUpdate,
    mockLt,
    mockGt,
    mockGte,
  ]) {
    fn.mockReset();
  }
  mockFrom.mockReturnValue(chainable());
  mockSelect.mockReturnValue(chainable());
  mockEq.mockReturnValue(chainable());
  mockInsert.mockReturnValue(chainable());
  mockDelete.mockReturnValue(chainable());
  mockUpdate.mockReturnValue(chainable());
  mockLt.mockReturnValue(chainable());
  mockGt.mockReturnValue(chainable());
  mockGte.mockReturnValue(chainable());
  mockSingle.mockResolvedValue({ data: null, error: null });
}

beforeEach(() => {
  resetChain();
  vi.stubEnv("SMTP_HOST", "smtp.test.com");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_USER", "testuser");
  vi.stubEnv("SMTP_PASS", "testpass");
  vi.stubEnv("SMTP_FROM", "Test <noreply@test.com>");
});

/* ------------------------------------------------------------------ */
/*  requestVerification                                                */
/* ------------------------------------------------------------------ */

describe("requestVerification", () => {
  it("returns needsRegistration when email not in umpires table", async () => {
    // umpire lookup fails
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "not found" },
    });

    const { requestVerification } = await import("@/lib/actions/verification");
    const result = await requestVerification("new@example.com", "abc123");
    expect(result).toEqual({ needsRegistration: true });
  });

  it("returns success and masked email for existing umpire", async () => {
    // umpire lookup succeeds
    mockSingle.mockResolvedValueOnce({
      data: { id: "ump-1", email: "jan@example.com", name: "Jan" },
      error: null,
    });

    // delete old codes — resolves
    mockLt.mockResolvedValueOnce({ error: null });

    // insert new code — resolves
    mockSingle.mockResolvedValueOnce({ data: { id: "code-1" }, error: null });

    const { requestVerification } = await import("@/lib/actions/verification");
    const result = await requestVerification("jan@example.com", "abc123");

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("maskedEmail");
    expect((result as { maskedEmail: string }).maskedEmail).toContain("•");
  });
});

/* ------------------------------------------------------------------ */
/*  verifyCode                                                         */
/* ------------------------------------------------------------------ */

describe("verifyCode", () => {
  it("returns error when no active code exists", async () => {
    // verification_codes lookup returns nothing
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "not found" },
    });

    const { verifyCode } = await import("@/lib/actions/verification");
    const result = await verifyCode("jan@example.com", "123456");
    expect(result).toHaveProperty("error", "no_active_code");
  });

  it("returns locked error when email is locked", async () => {
    const future = new Date(Date.now() + 600_000).toISOString();
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "code-1",
        email: "jan@example.com",
        code_hash: "somehash",
        attempts: 5,
        locked_until: future,
        expires_at: new Date(Date.now() + 1_800_000).toISOString(),
      },
      error: null,
    });

    const { verifyCode } = await import("@/lib/actions/verification");
    const result = await verifyCode("jan@example.com", "123456");
    expect(result).toHaveProperty("error", "locked");
  });

  it("returns invalid_code and increments attempts on wrong code", async () => {
    const hash = createHash("sha256").update("654321").digest("hex");
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "code-1",
        email: "jan@example.com",
        code_hash: hash,
        attempts: 2,
        locked_until: null,
        expires_at: new Date(Date.now() + 1_800_000).toISOString(),
      },
      error: null,
    });
    // update attempts
    mockEq.mockResolvedValueOnce({ error: null });

    const { verifyCode } = await import("@/lib/actions/verification");
    const result = await verifyCode("jan@example.com", "000000");
    expect(result).toHaveProperty("error", "invalid_code");
    expect(result).toHaveProperty("attemptsRemaining");
  });

  it("returns umpire on correct code", async () => {
    const code = "384721";
    const hash = createHash("sha256").update(code).digest("hex");
    // verification code lookup
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "code-1",
        email: "jan@example.com",
        code_hash: hash,
        attempts: 0,
        locked_until: null,
        expires_at: new Date(Date.now() + 1_800_000).toISOString(),
      },
      error: null,
    });
    // delete the used code
    mockEq.mockResolvedValueOnce({ error: null });
    // umpire lookup
    mockSingle.mockResolvedValueOnce({
      data: { id: "ump-1", name: "Jan", email: "jan@example.com", level: 1 },
      error: null,
    });

    const { verifyCode } = await import("@/lib/actions/verification");
    const result = await verifyCode("jan@example.com", code);
    expect(result).toHaveProperty("umpire");
    expect((result as { umpire: { id: string } }).umpire.id).toBe("ump-1");
  });
});

/* ------------------------------------------------------------------ */
/*  verifyMagicLink                                                    */
/* ------------------------------------------------------------------ */

describe("verifyMagicLink", () => {
  it("returns error for invalid/expired token", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "not found" },
    });

    const { verifyMagicLink } = await import("@/lib/actions/verification");
    const result = await verifyMagicLink("bad-token");
    expect(result).toHaveProperty("error", "invalid_or_expired");
  });

  it("returns umpire for valid magic token", async () => {
    // magic token lookup
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "code-1",
        email: "jan@example.com",
        magic_token: "valid-token",
        expires_at: new Date(Date.now() + 1_800_000).toISOString(),
      },
      error: null,
    });
    // delete used code
    mockEq.mockResolvedValueOnce({ error: null });
    // umpire lookup
    mockSingle.mockResolvedValueOnce({
      data: { id: "ump-1", name: "Jan", email: "jan@example.com", level: 1 },
      error: null,
    });

    const { verifyMagicLink } = await import("@/lib/actions/verification");
    const result = await verifyMagicLink("valid-token");
    expect(result).toHaveProperty("umpire");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/lib/actions/verification.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `lib/actions/verification.ts`**

```typescript
"use server";

import { createHash, timingSafeEqual } from "crypto";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import { sendVerificationEmail } from "@/lib/email";
import type { Umpire } from "@/lib/types/domain";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type RequestResult =
  | { needsRegistration: true }
  | { success: true; maskedEmail: string }
  | { error: "locked"; retryAfter: string }
  | { error: "send_failed" };

type VerifyCodeResult =
  | { umpire: Umpire }
  | { error: "no_active_code" }
  | { error: "locked"; retryAfter: string }
  | { error: "invalid_code"; attemptsRemaining: number }
  | { error: "expired" };

type VerifyMagicLinkResult =
  | { umpire: Umpire }
  | { error: "invalid_or_expired" };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const CODE_EXPIRY_MINUTES = 30;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function generateCode(): string {
  // 6-digit numeric code
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0]}•••@${domain}`;
  return `${local[0]}${"•".repeat(Math.min(local.length - 2, 4))}${local.slice(-1)}@${domain}`;
}

/* ------------------------------------------------------------------ */
/*  requestVerification                                                */
/* ------------------------------------------------------------------ */

export async function requestVerification(
  email: string,
  pollToken: string,
): Promise<RequestResult> {
  const supabase = await createClient();
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Check if umpire exists
  const { data: umpire, error: umpireError } = await supabase
    .from("umpires")
    .select("*")
    .eq("email", normalizedEmail)
    .single();

  if (umpireError || !umpire) {
    return { needsRegistration: true };
  }

  // 2. Delete expired codes for this email
  await supabase
    .from("verification_codes")
    .delete()
    .eq("email", normalizedEmail)
    .lt("expires_at", new Date().toISOString());

  // 3. Generate code + magic token
  const code = generateCode();
  const magicToken = nanoid(32);
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60_000);

  // 4. Delete any active code for this email (only one allowed)
  await supabase
    .from("verification_codes")
    .delete()
    .eq("email", normalizedEmail);

  // 5. Insert new verification code
  const { error: insertError } = await supabase
    .from("verification_codes")
    .insert({
      email: normalizedEmail,
      code_hash: hashCode(code),
      magic_token: magicToken,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    return { error: "send_failed" };
  }

  // 6. Build magic link and send email
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    "http://localhost:3000";
  const protocol = baseUrl.startsWith("http") ? "" : "https://";
  const magicLink = `${protocol}${baseUrl}/poll/${pollToken}?verify=${magicToken}`;

  try {
    await sendVerificationEmail({ to: normalizedEmail, code, magicLink });
  } catch {
    return { error: "send_failed" };
  }

  return { success: true, maskedEmail: maskEmail(normalizedEmail) };
}

/* ------------------------------------------------------------------ */
/*  verifyCode                                                         */
/* ------------------------------------------------------------------ */

export async function verifyCode(
  email: string,
  code: string,
): Promise<VerifyCodeResult> {
  const supabase = await createClient();
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Find active code for this email
  const { data: record, error } = await supabase
    .from("verification_codes")
    .select("*")
    .eq("email", normalizedEmail)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !record) {
    return { error: "no_active_code" };
  }

  // 2. Check lockout
  if (record.locked_until && new Date(record.locked_until) > new Date()) {
    return { error: "locked", retryAfter: record.locked_until };
  }

  // 3. Check attempts
  if (record.attempts >= MAX_ATTEMPTS) {
    const lockUntil = new Date(
      Date.now() + LOCKOUT_MINUTES * 60_000,
    ).toISOString();
    await supabase
      .from("verification_codes")
      .update({ locked_until: lockUntil })
      .eq("id", record.id);
    return { error: "locked", retryAfter: lockUntil };
  }

  // 4. Compare code (constant-time)
  const inputHash = hashCode(code.replace(/\s/g, ""));
  if (!safeCompare(inputHash, record.code_hash)) {
    const newAttempts = record.attempts + 1;
    const updateData: { attempts: number; locked_until?: string } = {
      attempts: newAttempts,
    };
    if (newAttempts >= MAX_ATTEMPTS) {
      updateData.locked_until = new Date(
        Date.now() + LOCKOUT_MINUTES * 60_000,
      ).toISOString();
    }
    await supabase
      .from("verification_codes")
      .update(updateData)
      .eq("id", record.id);

    return {
      error: "invalid_code",
      attemptsRemaining: MAX_ATTEMPTS - newAttempts,
    };
  }

  // 5. Success — delete code and return umpire
  await supabase.from("verification_codes").delete().eq("id", record.id);

  const { data: umpire } = await supabase
    .from("umpires")
    .select("*")
    .eq("email", normalizedEmail)
    .single();

  if (!umpire) return { error: "no_active_code" };
  return { umpire };
}

/* ------------------------------------------------------------------ */
/*  verifyMagicLink                                                    */
/* ------------------------------------------------------------------ */

export async function verifyMagicLink(
  magicToken: string,
): Promise<VerifyMagicLinkResult> {
  const supabase = await createClient();

  // 1. Find record by magic token
  const { data: record, error } = await supabase
    .from("verification_codes")
    .select("*")
    .eq("magic_token", magicToken)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !record) {
    return { error: "invalid_or_expired" };
  }

  // 2. Delete used code
  await supabase.from("verification_codes").delete().eq("id", record.id);

  // 3. Look up umpire
  const { data: umpire } = await supabase
    .from("umpires")
    .select("*")
    .eq("email", record.email)
    .single();

  if (!umpire) return { error: "invalid_or_expired" };
  return { umpire };
}
```

**Step 4: Run tests**

Run: `npm test -- __tests__/lib/actions/verification.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/actions/verification.ts __tests__/lib/actions/verification.test.ts
git commit -m "feat: add verification server actions (request, verify code, magic link)"
```

---

## Task 4: Verification Code Input Component

**Files:**

- Create: `components/poll-response/verification-form.tsx`

**Step 1: Write the component**

A clean verification screen with:

- Masked email display
- 6-digit code input (auto-focus, auto-submit on 6th digit)
- "Resend code" with cooldown timer
- "Use a different email" link
- Error states: invalid code, locked, expired

```typescript
// components/poll-response/verification-form.tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyCode, requestVerification } from "@/lib/actions/verification";
import type { Umpire } from "@/lib/types/domain";

type Props = {
  email: string;
  maskedEmail: string;
  pollToken: string;
  onVerified: (umpire: Umpire) => void;
  onBack: () => void;
};

export function VerificationForm({
  email,
  maskedEmail,
  pollToken,
  onVerified,
  onBack,
}: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = useCallback(
    async (submittedCode: string) => {
      if (submittedCode.replace(/\s/g, "").length !== 6) return;
      setError(null);
      setLoading(true);
      try {
        const result = await verifyCode(email, submittedCode);
        if ("umpire" in result) {
          onVerified(result.umpire);
        } else if (result.error === "invalid_code") {
          setError(
            result.attemptsRemaining > 0
              ? `Invalid code. ${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? "" : "s"} remaining.`
              : "Too many attempts. Please request a new code.",
          );
          setCode("");
          inputRef.current?.focus();
        } else if (result.error === "locked") {
          setError("Too many attempts. Please try again in 15 minutes.");
        } else if (result.error === "no_active_code") {
          setError("Code expired. Please request a new one.");
        }
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [email, onVerified],
  );

  function handleCodeChange(value: string) {
    // Only allow digits
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) {
      handleSubmit(digits);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError(null);
    setResendCooldown(60);
    try {
      const result = await requestVerification(email, pollToken);
      if ("error" in result) {
        setError("Could not resend code. Please try again later.");
      }
    } catch {
      setError("Could not resend code. Please try again later.");
    }
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    await handleSubmit(code);
  }

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-muted-foreground text-sm">
          We sent a 6-digit code to <strong>{maskedEmail}</strong>
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="verification-code">Verification code</Label>
        <Input
          ref={inputRef}
          id="verification-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          placeholder="000000"
          maxLength={6}
          disabled={loading}
          className="text-center text-2xl tracking-widest"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        type="submit"
        disabled={loading || code.length !== 6}
        className="w-full"
      >
        {loading ? "Verifying\u2026" : "Verify"}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0}
          className="text-muted-foreground hover:text-foreground underline disabled:no-underline disabled:opacity-50"
        >
          {resendCooldown > 0
            ? `Resend code (${resendCooldown}s)`
            : "Resend code"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground underline"
        >
          Use a different email
        </button>
      </div>
    </form>
  );
}
```

**Step 2: Run type-check**

Run: `npm run type-check`
Expected: PASS (no type errors)

**Step 3: Commit**

```bash
git add components/poll-response/verification-form.tsx
git commit -m "feat: add verification code input component"
```

---

## Task 5: Integrate Verification into Poll Response Flow

**Files:**

- Modify: `components/poll-response/umpire-identifier.tsx` (change to call `requestVerification` for existing umpires)
- Modify: `components/poll-response/poll-response-page.tsx` (add verify state + magic link auto-verify)
- Modify: `app/poll/[token]/page.tsx` (pass `searchParams` for `?verify=` param)

**Step 1: Update `umpire-identifier.tsx`**

The email submit now calls `requestVerification` instead of `findOrCreateUmpire` for existing umpires. When email is found, it triggers verification. When email is new, it falls through to the existing registration flow.

Changes:

- `handleEmailSubmit`: call `requestVerification(email, pollToken)` instead of `findOrCreateUmpire(email)`
- If `needsRegistration`, show name form (existing flow)
- If `success`, call new `onNeedsVerification(email, maskedEmail)` callback
- If `error`, show error message
- Add `pollToken` prop and `onNeedsVerification` callback prop
- Keep existing registration flow (`findOrCreateUmpire` with name) unchanged

**Step 2: Update `poll-response-page.tsx`**

Changes:

- Add `verifyToken` prop (from `?verify=` search param)
- Add `verify` state with `{ email, maskedEmail }` data
- On mount: if `verifyToken` exists, call `verifyMagicLink` → auto-identify
- Add `handleNeedsVerification` callback → sets verify state
- Add `handleVerified` callback → sets cookie + loads responses (same as `handleIdentified`)
- Render `VerificationForm` when in verify state

**Step 3: Update `app/poll/[token]/page.tsx`**

Changes:

- Accept `searchParams` prop (`{ verify?: string }`)
- Pass `verifyToken` to `PollResponsePage`

**Step 4: Run type-check and tests**

Run: `npm run type-check && npm test`
Expected: Type-check passes. Existing tests may need minor updates since `UmpireIdentifier` now has new props. Fix any broken tests.

**Step 5: Commit**

```bash
git add components/poll-response/umpire-identifier.tsx components/poll-response/poll-response-page.tsx app/poll/\\[token\\]/page.tsx
git commit -m "feat: integrate email verification into poll response flow"
```

---

## Task 6: Update Existing Tests

**Files:**

- Modify: `__tests__/lib/actions/public-polls.test.ts` (ensure existing tests still pass — they should since `findOrCreateUmpire` is unchanged)
- Modify: `e2e/poll-response.spec.ts` (new umpire flow unchanged, but add test for verification flow with existing umpire)

**Step 1: Verify existing unit tests pass**

Run: `npm test`
Expected: All pass (the public-polls actions are unchanged)

**Step 2: Update E2E tests**

The existing E2E test uses a new (unique) email each run, so it should still work — new umpires skip verification. Add a note/comment that this tests the unverified (new umpire) path.

For testing the verification flow E2E, we'd need either:

- A test email interceptor (complex), or
- A test bypass (e.g., env var `SKIP_VERIFICATION=true` for E2E)

For now, add a `NEXT_PUBLIC_E2E_SKIP_VERIFICATION` env var that, when set, skips verification in the `requestVerification` action (returns the umpire directly). This is safe because:

- It's only set in the test environment
- The check is in server-side code
- It short-circuits to the same result as successful verification

**Step 3: Run all tests**

Run: `npm test && npm run test:e2e`
Expected: All pass

**Step 4: Commit**

```bash
git add e2e/poll-response.spec.ts __tests__/lib/actions/public-polls.test.ts
git commit -m "test: update E2E tests for email verification flow"
```

---

## Task 7: Environment Variables + Documentation

**Files:**

- Modify: `.env.local.example` (or create if not exists) — add SMTP vars
- Modify: `CLAUDE.md` — add SMTP env vars to the environment section

**Step 1: Add env var documentation**

Add to `CLAUDE.md` environment variables section:

```
- `SMTP_HOST` — AWS SES SMTP host (e.g. `email-smtp.eu-west-1.amazonaws.com`)
- `SMTP_PORT` — SMTP port (587)
- `SMTP_USER` — SES SMTP username
- `SMTP_PASS` — SES SMTP password
- `SMTP_FROM` — sender address (e.g. `Fluitplanner <noreply@fluitplanner.nl>`)
- `NEXT_PUBLIC_SITE_URL` — base URL for magic links (e.g. `https://fluitplanner.nl`)
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add SMTP environment variables to CLAUDE.md"
```

---

## Task 8: Final Verification

**Step 1: Run full CI suite locally**

```bash
npm run lint && npm run format:check && npm run type-check && npm test && npm run build
```

Expected: All pass

**Step 2: Manual smoke test**

Run: `npm run dev`

1. Visit a poll link → enter an existing umpire email → should see "Check your email" screen
2. Check terminal/logs for email sending attempt (will fail without real SMTP creds, but the flow should work)
3. Visit poll with `?verify=invalidtoken` → should show error and fall back to email input
4. Enter a new email → should go straight to name registration (no verification)

**Step 3: Final commit if needed, then push**

```bash
git push -u origin feat/poll-email-verification
```
