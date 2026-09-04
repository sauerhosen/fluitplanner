import { describe, expect, it } from "vitest";

import { sessionCookieDomain } from "@/lib/supabase/cookie-domain";

const BASE = "fluiten.org";

describe("sessionCookieDomain", () => {
  it("widens the auth cookie to the base domain on the root host", () => {
    expect(sessionCookieDomain("fluiten.org", BASE)).toBe(".fluiten.org");
  });

  it("widens it on www, which serves the same root surface", () => {
    expect(sessionCookieDomain("www.fluiten.org", BASE)).toBe(".fluiten.org");
  });

  it("widens it on a club subdomain, so a root-domain login carries over", () => {
    expect(sessionCookieDomain("hic.fluiten.org", BASE)).toBe(".fluiten.org");
    expect(sessionCookieDomain("myra.fluiten.org", BASE)).toBe(".fluiten.org");
  });

  it("ignores the port", () => {
    expect(sessionCookieDomain("hic.fluiten.org:3000", BASE)).toBe(
      ".fluiten.org",
    );
    expect(sessionCookieDomain("fluiten.org:443", BASE)).toBe(".fluiten.org");
  });

  it("is case-insensitive about the host", () => {
    expect(sessionCookieDomain("HIC.Fluiten.ORG", BASE)).toBe(".fluiten.org");
  });

  // Local dev and E2E run on localhost, which must stay host-only: e2e/global-setup.ts
  // seeds a host-only cookie and the whole suite depends on that scope.
  it("leaves localhost host-only", () => {
    expect(sessionCookieDomain("localhost:3000", BASE)).toBeUndefined();
    expect(sessionCookieDomain("localhost", BASE)).toBeUndefined();
    expect(sessionCookieDomain("127.0.0.1:3000", BASE)).toBeUndefined();
  });

  // Domain=localhost is rejected by some browsers for single-label hosts, and dev
  // never needs cross-subdomain sharing because the ceremony runs same-origin.
  it("leaves localhost subdomains host-only", () => {
    expect(sessionCookieDomain("hic.localhost:3000", BASE)).toBeUndefined();
  });

  // A base domain of "localhost" is what an older setup guide suggests for
  // multi-tenant local dev. Widening there would attach `secure: true` to a
  // cookie served over plain http, and the browser would drop every auth cookie.
  it("leaves loopback hosts host-only even when they are the base domain", () => {
    expect(sessionCookieDomain("localhost:3000", "localhost")).toBeUndefined();
    expect(
      sessionCookieDomain("hic.localhost:3000", "localhost:3000"),
    ).toBeUndefined();
  });

  it("leaves Vercel preview hosts host-only", () => {
    expect(
      sessionCookieDomain("fluitplanner-abc123.vercel.app", BASE),
    ).toBeUndefined();
  });

  // The suffix check must be on a dot boundary, or "evilfluiten.org" would be
  // handed a cookie scoped to our base domain.
  it("rejects a host that merely ends with the base domain's letters", () => {
    expect(sessionCookieDomain("evilfluiten.org", BASE)).toBeUndefined();
    expect(sessionCookieDomain("notfluiten.org", BASE)).toBeUndefined();
  });

  it("rejects an unrelated host", () => {
    expect(sessionCookieDomain("example.com", BASE)).toBeUndefined();
    expect(sessionCookieDomain("fluiten.org.evil.com", BASE)).toBeUndefined();
  });

  it("falls back safely on missing or malformed input", () => {
    expect(sessionCookieDomain("", BASE)).toBeUndefined();
    expect(sessionCookieDomain(":3000", BASE)).toBeUndefined();
    expect(sessionCookieDomain("fluiten.org", "")).toBeUndefined();
  });
});
