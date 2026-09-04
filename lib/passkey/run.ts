import { createClient } from "@/lib/supabase/client";

export type PasskeyMode = "signin" | "enroll";

/** The two ceremonies, normalised to "resolves on success, throws on failure". */
export async function runPasskeyCeremony(mode: PasskeyMode): Promise<void> {
  const supabase = createClient();
  const { error } =
    mode === "signin"
      ? await supabase.auth.signInWithPasskey()
      : await supabase.auth.registerPasskey();
  if (error) throw error;
}

/**
 * Whether this browser can do WebAuthn at all.
 *
 * Guards the entry points so a browser without platform authenticator support
 * is offered a password instead of a button that can only fail.
 */
export function browserSupportsPasskeys(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

/**
 * True when the user dismissed the system passkey sheet rather than hitting a
 * real failure. Cancelling is not an error worth shouting about, so the callers
 * fall silent instead of showing a red message.
 */
export function isPasskeyCancellation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return name === "NotAllowedError" || name === "AbortError";
}
