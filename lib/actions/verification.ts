"use server";

import { createHash, timingSafeEqual } from "crypto";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import { sendVerificationEmail } from "@/lib/email";
import type { Umpire } from "@/lib/types/domain";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type RequestResult =
  | { needsRegistration: true }
  | { success: true; maskedEmail: string }
  | { error: "locked"; retryAfter: string }
  | { error: "send_failed" };

export type VerifyCodeResult =
  | { umpire: Umpire }
  | { error: "no_active_code" }
  | { error: "locked"; retryAfter: string }
  | { error: "invalid_code"; attemptsRemaining: number }
  | { error: "expired" };

export type VerifyMagicLinkResult =
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
    console.error("[verification] DB insert error:", insertError.message);
    return { error: "send_failed" } as RequestResult;
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
  } catch (err) {
    console.error(
      "[verification] SMTP error:",
      err instanceof Error ? err.message : err,
    );
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
