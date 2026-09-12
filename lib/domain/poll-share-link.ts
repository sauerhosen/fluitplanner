/**
 * Share links for the public poll page.
 *
 * WhatsApp — and most other chat apps — cache a link preview keyed on the exact
 * URL and never re-fetch it, with no purge endpoint to ask them to. Renaming a
 * poll therefore leaves every card they have already unfurled showing the old
 * title, even though `generateMetadata` serves the new one. Appending a short
 * hash of the current title gives a renamed poll a URL those caches have not
 * seen, so the next share unfurls fresh. `/poll/[token]` only reads `verify`,
 * so the extra param is inert; links shared before a rename keep working.
 */

/**
 * FNV-1a (32-bit). Not a security hash — it just has to be deterministic,
 * identical in the browser and on the server, and change on any title edit.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * A short, URL-safe stamp of the poll title, or null when there is no title —
 * an untitled poll has nothing that can go stale, and adding a title later
 * changes the URL from bare to stamped, which busts the cache just the same.
 */
export function pollTitleVersion(
  title: string | null | undefined,
): string | null {
  const trimmed = title?.trim();
  if (!trimmed) return null;
  return fnv1a(trimmed).toString(36);
}

export function buildPollShareUrl(
  origin: string,
  token: string,
  title: string | null | undefined,
): string {
  const base = `${origin.replace(/\/+$/, "")}/poll/${token}`;
  const version = pollTitleVersion(title);
  return version ? `${base}?v=${version}` : base;
}
