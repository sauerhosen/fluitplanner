import { resolveTenantFromHost } from "@/lib/tenant-resolver";

/**
 * Where a WebAuthn ceremony is allowed to run, and where it is safe to return to.
 *
 * GoTrue validates the ceremony's origin against `rp_origins`, an exact-match
 * allow-list capped at five entries with no wildcards. Fluitplanner gives every
 * club its own subdomain, so listing them individually would run out after a
 * handful of clubs. Instead every ceremony runs on one origin, which spends a
 * single slot and scales to any number of clubs.
 *
 * *Which* origin is deployment configuration, not something to derive: a host
 * that canonicalises `fluiten.org` to `www.fluiten.org` (or the reverse) will
 * redirect a guess straight back, and the ceremony page would bounce forever.
 * `NEXT_PUBLIC_PASSKEY_ORIGIN` names it explicitly and must match the
 * `rp_origins` entry in the Supabase dashboard character for character.
 *
 * The browser would happily let `hic.fluiten.org` request `rp_id=fluiten.org` —
 * WebAuthn permits a registrable-domain suffix. It is the server-side origin
 * check that forces the redirect. That also means credentials are stored against
 * `rp_id=fluiten.org`: if Supabase ever ships wildcard origins, the redirect can
 * be deleted and every enrolled passkey keeps working.
 *
 * See `docs/passkeys.md`.
 */

function stripPort(value: string): string {
  return value.trim().toLowerCase().split(":")[0];
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

/** True when `hostname` is the base domain or a subdomain of it. */
function isUnderBaseDomain(hostname: string, base: string): boolean {
  return hostname === base || hostname.endsWith(`.${base}`);
}

/**
 * Whether passkeys can work at all on this host.
 *
 * False on Vercel preview hosts and anywhere else outside the base domain: those
 * origins can never appear in the production `rp_origins` list, so the entry
 * points are hidden rather than left to throw a WebAuthn error at the user.
 */
export function passkeysAvailable(host: string, baseDomain: string): boolean {
  const hostname = stripPort(host);
  const base = stripPort(baseDomain);
  if (!hostname || !base) return false;
  // Local development runs its own GoTrue with rp_id = "localhost".
  if (isLoopback(hostname)) return true;
  // A `*.localhost` dev subdomain is a different origin than `localhost` and is
  // not in the local `rp_origins`, so the ceremony could only fail. Excluded
  // explicitly because a base domain of `localhost` would otherwise match it.
  if (hostname.endsWith(".localhost")) return false;
  return isUnderBaseDomain(hostname, base);
}

/**
 * The one origin GoTrue will accept a ceremony from.
 *
 * Must equal the `rp_origins` entry in the Supabase dashboard exactly. It
 * defaults to the apex, but any deployment that canonicalises to `www` (or to
 * anything else) has to set `NEXT_PUBLIC_PASSKEY_ORIGIN` to its canonical
 * origin — otherwise the redirect below lands on a host that immediately
 * redirects back, and the ceremony page bounces in a loop.
 */
export function configuredCeremonyOrigin(baseDomain: string): string {
  const configured = process.env.NEXT_PUBLIC_PASSKEY_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `https://${stripPort(baseDomain)}`;
}

/**
 * The origin to run the ceremony on, or `null` for "run it right here".
 *
 * Null when the browser is already on the ceremony origin — which covers a
 * master admin on the canonical host — and on localhost, where dev and E2E have
 * no subdomain and the ceremony is same-origin. That is what keeps the happy
 * path testable locally without wildcard DNS or TLS.
 *
 * The comparison is against the *configured* origin, never a derived one:
 * `www.fluiten.org` and `fluiten.org` are different WebAuthn origins, and only
 * one of them is in `rp_origins`.
 */
export function passkeyCeremonyOrigin(
  host: string,
  baseDomain: string,
  ceremonyOrigin: string = configuredCeremonyOrigin(baseDomain),
): string | null {
  const hostname = stripPort(host);
  const base = stripPort(baseDomain);
  if (!hostname || !base) return null;
  if (isLoopback(hostname)) return null;

  let target: string;
  try {
    target = new URL(ceremonyOrigin).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (hostname === target) return null;
  return ceremonyOrigin;
}

/**
 * Narrow the untrusted `next=` destination of a passkey bounce.
 *
 * Unlike `toSafeRedirectPath`, this one has to accept a *cross-subdomain*
 * absolute URL — that is the whole point of the bounce — which makes it the
 * open-redirect surface of the feature. Only two shapes are allowed:
 * a same-origin URL (covers local development), or an https URL on the base
 * domain or one valid club subdomain of it. Anything else falls back to
 * `/protected` on the current origin.
 */
export function safePasskeyReturnUrl(
  next: string | string[] | null | undefined,
  baseDomain: string,
  currentOrigin: string,
): string {
  // A repeated ?next= param arrives as an array — take the first.
  const value = Array.isArray(next) ? next[0] : next;
  const fallback = `${currentOrigin}/protected`;
  if (!value) return fallback;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Not absolute: a bare path, protocol-relative or backslash form. The
    // destination has to be absolute to cross origins, so there is nothing to
    // salvage here.
    return fallback;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
  // Userinfo can smuggle the expected host into the credentials segment
  // ("https://fluiten.org@evil.com").
  if (url.username || url.password) return fallback;

  if (url.origin === currentOrigin) return url.toString();

  if (url.protocol !== "https:") return fallback;

  const base = stripPort(baseDomain);
  const hostname = stripPort(url.hostname);
  if (!isUnderBaseDomain(hostname, base)) return fallback;

  // Reuse the tenant resolver so the definition of a valid club subdomain lives
  // in exactly one place. It also accepts `*.localhost`, which must not be a
  // live redirect target in production — the base-domain check above excludes it.
  const resolution = resolveTenantFromHost(hostname, base);
  if (resolution.type !== "root" && resolution.type !== "tenant") {
    return fallback;
  }

  return url.toString();
}
