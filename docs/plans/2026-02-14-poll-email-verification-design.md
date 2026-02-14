# Poll Email Verification Design

**Date:** 2026-02-14
**Status:** Approved

## Problem

When an umpire visits a poll link without a cookie, the app accepts any email without verification. Anyone who knows an umpire's email can respond on their behalf.

## Solution

Require existing umpires to verify email ownership via a 6-digit code or magic link before accessing a poll. New umpires self-registering skip verification (they're providing their own email).

## Decisions

| Decision           | Choice                                    | Rationale                           |
| ------------------ | ----------------------------------------- | ----------------------------------- |
| Cookie trust model | Keep current (365-day, no re-verify)      | Low friction for returning users    |
| New umpire flow    | No verification                           | Self-registering = owns the email   |
| Code format        | 6-digit numeric                           | Mobile-friendly, familiar           |
| Code expiry        | 30 minutes                                | Forgiving for slow email delivery   |
| Rate limiting      | Lock email 15 min after 5 failures        | Simple and effective                |
| Email sending      | Server action + nodemailer + AWS SES SMTP | Fits existing pattern, no new infra |
| Code storage       | New Supabase table                        | Fits existing stack                 |
| Magic link landing | Same poll page with `?verify=` param      | No extra redirect                   |

## Flow

```
Umpire visits /poll/[token] (no cookie)
  ├─ Enters email
  ├─ Email NOT in umpires table → current self-registration flow (no verification)
  └─ Email IS in umpires table →
       ├─ Server action generates 6-digit code + magic link token
       ├─ Stores in verification_codes table (30 min expiry)
       ├─ Sends email via nodemailer/SES with code + magic link
       └─ UI switches to verification screen:
            ├─ "Enter 6-digit code" input
            ├─ "Or check your email for a magic link"
            ├─ "Resend code" button (rate limited)
            └─ On valid code OR magic link click:
                 ├─ Set umpire cookie (365 days)
                 ├─ Load existing responses
                 └─ Show availability form
```

## Database

### New table: `verification_codes`

```sql
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

-- Plain indexes for lookups (uniqueness enforced at application level)
create index verification_codes_email_idx on public.verification_codes (email);
create index verification_codes_magic_token_idx on public.verification_codes (magic_token);
```

- Codes stored as SHA-256 hash (short-lived + rate-limited = sufficient)
- Magic tokens stored as plain nanoid(32) — need lookup by value
- New request invalidates previous (application deletes old codes before inserting)
- Cleanup: old codes deleted on each new request for that email

### RLS

RLS is enabled with only an authenticated SELECT policy (for planner debugging). All verification CRUD operations use the Supabase **service role client** (`lib/supabase/service.ts`) which bypasses RLS entirely. This keeps the table locked down — no anonymous or authenticated user can directly read code hashes or magic tokens.

## Server Actions

Added to `lib/actions/public-polls.ts` (or a new `lib/actions/verification.ts`):

### `requestVerification(email, pollToken)`

1. Check if email exists in `umpires` table — if not, return `{ needsRegistration: true }`
2. Check rate limits: if `locked_until > now()`, return `{ error: "locked", retryAfter }`
3. Delete any existing codes for this email
4. Generate 6-digit code + nanoid(32) magic token
5. Insert into `verification_codes` with `expires_at = now() + 30 min`
6. Send email via nodemailer/SES
7. Return `{ success: true, maskedEmail: "o••••@example.com" }`

### `verifyCode(email, code)`

1. Find active (non-expired) verification record for email
2. If `locked_until > now()`, return `{ error: "locked", retryAfter }`
3. If `attempts >= 5`, set `locked_until = now() + 15 min`, return locked error
4. Compare SHA-256 hash (constant-time)
5. On match: delete record, return umpire data
6. On mismatch: increment attempts, return `{ error: "invalid_code", attemptsRemaining }`

### `verifyMagicLink(magicToken)`

1. Find record by `magic_token` where `expires_at > now()`
2. If found: look up umpire by email, delete record, return umpire data
3. If not found/expired: return `{ error: "invalid_or_expired" }`

## Magic Link URL

Format: `/poll/[token]?verify=[magicToken]`

Poll page detects `?verify=` on load, calls `verifyMagicLink`, auto-identifies the user.

## Email Setup

### Environment Variables (Vercel)

```
SMTP_HOST=email-smtp.eu-west-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=<SES SMTP username>
SMTP_PASS=<SES SMTP password>
SMTP_FROM=Fluitplanner <noreply@fluitplanner.nl>
```

### Email Library

`nodemailer` — runs server-side only in server actions. Credentials never touch the client bundle.

### Email Template

Branded HTML email matching the app's green-tinted design:

- **Header:** Fluitplanner logo/name with green accent bar (`hsl(158 64% 30%)` → `#1B9A6C`)
- **Body:** Clean white card with the verification code prominently displayed, magic link button in primary green
- **Footer:** Muted text with expiry notice
- **Fallback:** Plain text version for email clients that don't render HTML

```
┌─────────────────────────────────┐
│ ▌ Fluitplanner                  │  ← green left border accent
├─────────────────────────────────┤
│                                 │
│  Your verification code is:     │
│                                 │
│     384 721                     │  ← large, spaced digits
│                                 │
│  Or click the button below:     │
│                                 │
│  ┌─────────────────────────┐    │
│  │   Verify my email →     │    │  ← green button
│  └─────────────────────────┘    │
│                                 │
│  This code expires in           │
│  30 minutes.                    │
│                                 │
├─────────────────────────────────┤
│  Fluitplanner · You received    │  ← muted footer
│  this because someone requested │
│  access to a poll with your     │
│  email address.                 │
└─────────────────────────────────┘
```

## Rate Limiting

| Limit                | Threshold              | Action                         |
| -------------------- | ---------------------- | ------------------------------ |
| Failed code attempts | 5 per code             | Lock email for 15 minutes      |
| Resend requests      | 3 per 30-minute window | Show "try again later" message |

Resend limit enforced by counting non-expired rows created in the last 30 min for that email (or a simple counter on the record).

## UI Changes

### Component: `poll-response-page.tsx`

Current states: `loading → identify → (register) → respond`

New states: `loading → identify → verify → respond` (for existing umpires)

### Verification Screen

- Header: "Check your email"
- Subtitle: "We sent a 6-digit code to o••••@example.com"
- 6-digit input field (auto-focus, auto-submit on 6th digit)
- "Resend code" link with countdown timer showing seconds until allowed
- "Use a different email" link → returns to identify state
- Error states: invalid code (with attempts remaining), locked out, expired

### Magic Link Auto-Verify

On page load, if `?verify=` param exists:

1. Show "Verifying..." spinner
2. Call `verifyMagicLink`
3. On success: set cookie, load responses, show form
4. On failure: show error, fall back to normal identify flow

## Security

- **Code hashing:** SHA-256 (short-lived codes with rate limiting don't need bcrypt)
- **Constant-time comparison:** for code verification to prevent timing attacks
- **Magic token entropy:** nanoid(32) = ~192 bits, sufficient for URL tokens
- **Email enumeration:** the app already reveals email existence (different flows for new vs existing). Acceptable for a team tool.
- **No client-side secrets:** SMTP credentials only in Vercel env vars, accessed via server actions

## Future Ideas (Not Implemented)

- SMS/WhatsApp verification as alternative channel (store phone number on umpire record)
- Push notifications for poll reminders
