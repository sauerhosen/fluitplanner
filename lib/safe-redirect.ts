/**
 * Narrow an untrusted `next=` query parameter to a same-site path.
 *
 * Email links and the login form both carry a caller-supplied destination, so
 * this has to reject anything that could leave the site:
 *  - a full URL ("https://evil.example") — absolute redirect
 *  - a protocol-relative URL ("//evil.example")
 *  - a backslash form ("/\evil.example"), which URL parsing normalises to
 *    "//evil.example" and is therefore protocol-relative after all
 */
export function toSafeRedirectPath(
  next: string | string[] | null | undefined,
  fallback = "/",
): string {
  // A repeated ?next= param arrives as an array — take the first.
  const value = Array.isArray(next) ? next[0] : next;
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  return value;
}
