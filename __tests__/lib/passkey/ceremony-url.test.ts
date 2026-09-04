import { describe, expect, it } from "vitest";

import {
  passkeyCeremonyOrigin,
  passkeysAvailable,
  safePasskeyReturnUrl,
} from "@/lib/passkey/ceremony-url";

const BASE = "fluiten.org";

describe("passkeyCeremonyOrigin", () => {
  // WebAuthn origins are an explicit allow-list capped at five, so every
  // ceremony runs on the apex and nowhere else.
  it("sends a club subdomain to the apex", () => {
    expect(passkeyCeremonyOrigin("hic.fluiten.org", BASE)).toBe(
      "https://fluiten.org",
    );
  });

  it("returns null on the apex itself, so the ceremony runs inline", () => {
    expect(passkeyCeremonyOrigin("fluiten.org", BASE)).toBeNull();
  });

  // www resolves as "root" for tenancy, but https://www.fluiten.org is a
  // different WebAuthn origin than https://fluiten.org and is not in rp_origins.
  // Treating it as "already home" would fail the ceremony server-side.
  it("sends www to the apex rather than treating it as home", () => {
    expect(passkeyCeremonyOrigin("www.fluiten.org", BASE)).toBe(
      "https://fluiten.org",
    );
  });

  // Local dev has no subdomain and rp_id is "localhost", so the ceremony is
  // already same-origin. This is what keeps the happy path locally testable.
  it("returns null on localhost", () => {
    expect(passkeyCeremonyOrigin("localhost:3000", BASE)).toBeNull();
    expect(passkeyCeremonyOrigin("127.0.0.1:3000", BASE)).toBeNull();
  });

  it("ignores the port on the apex", () => {
    expect(passkeyCeremonyOrigin("fluiten.org:443", BASE)).toBeNull();
  });
});

describe("passkeysAvailable", () => {
  it("is available on the apex and on club subdomains", () => {
    expect(passkeysAvailable("fluiten.org", BASE)).toBe(true);
    expect(passkeysAvailable("hic.fluiten.org", BASE)).toBe(true);
    expect(passkeysAvailable("www.fluiten.org", BASE)).toBe(true);
  });

  it("is available on localhost for local development", () => {
    expect(passkeysAvailable("localhost:3000", BASE)).toBe(true);
  });

  // A preview deployment can never match the production rp_origins list, so the
  // buttons are hidden rather than left to throw a WebAuthn error.
  it("is unavailable on Vercel preview hosts", () => {
    expect(passkeysAvailable("fluitplanner-abc123.vercel.app", BASE)).toBe(
      false,
    );
  });

  it("is unavailable on an unrelated host", () => {
    expect(passkeysAvailable("evilfluiten.org", BASE)).toBe(false);
  });

  // `hic.localhost` is a different origin than `localhost` and is not in the
  // local rp_origins, so the button must hide rather than bounce to a dead URL —
  // including when the base domain is itself "localhost".
  it("is unavailable on a localhost subdomain", () => {
    expect(passkeysAvailable("hic.localhost:3000", BASE)).toBe(false);
    expect(passkeysAvailable("hic.localhost:3000", "localhost")).toBe(false);
  });
});

describe("safePasskeyReturnUrl", () => {
  const HERE = "https://fluiten.org";

  it("keeps a club subdomain destination", () => {
    expect(
      safePasskeyReturnUrl("https://hic.fluiten.org/protected", BASE, HERE),
    ).toBe("https://hic.fluiten.org/protected");
  });

  it("keeps an apex destination, path and query intact", () => {
    expect(
      safePasskeyReturnUrl(
        "https://fluiten.org/protected/users?a=1",
        BASE,
        HERE,
      ),
    ).toBe("https://fluiten.org/protected/users?a=1");
  });

  it("takes the first value when the param is repeated", () => {
    expect(
      safePasskeyReturnUrl(
        ["https://hic.fluiten.org/protected", "https://evil.example"],
        BASE,
        HERE,
      ),
    ).toBe("https://hic.fluiten.org/protected");
  });

  it("keeps a same-origin destination in local development", () => {
    const dev = "http://localhost:3000";
    expect(
      safePasskeyReturnUrl("http://localhost:3000/protected", BASE, dev),
    ).toBe("http://localhost:3000/protected");
  });

  // Everything below is an open redirect if it gets through.
  it("rejects a lookalike host", () => {
    expect(
      safePasskeyReturnUrl("https://fluiten.org.evil.com/", BASE, HERE),
    ).toBe(`${HERE}/protected`);
    expect(safePasskeyReturnUrl("https://evilfluiten.org/", BASE, HERE)).toBe(
      `${HERE}/protected`,
    );
  });

  it("rejects userinfo smuggling", () => {
    expect(
      safePasskeyReturnUrl("https://fluiten.org@evil.com/", BASE, HERE),
    ).toBe(`${HERE}/protected`);
  });

  it("rejects a nested subdomain, which is not a valid club slug", () => {
    expect(safePasskeyReturnUrl("https://a.b.fluiten.org/", BASE, HERE)).toBe(
      `${HERE}/protected`,
    );
  });

  it("rejects a scheme downgrade", () => {
    expect(safePasskeyReturnUrl("http://hic.fluiten.org/", BASE, HERE)).toBe(
      `${HERE}/protected`,
    );
  });

  it("rejects non-http schemes", () => {
    expect(safePasskeyReturnUrl("javascript:alert(1)", BASE, HERE)).toBe(
      `${HERE}/protected`,
    );
    expect(safePasskeyReturnUrl("data:text/html,x", BASE, HERE)).toBe(
      `${HERE}/protected`,
    );
  });

  it("rejects protocol-relative, backslash and bare paths", () => {
    expect(safePasskeyReturnUrl("//evil.example", BASE, HERE)).toBe(
      `${HERE}/protected`,
    );
    expect(safePasskeyReturnUrl("/\\evil.example", BASE, HERE)).toBe(
      `${HERE}/protected`,
    );
    expect(safePasskeyReturnUrl("/protected", BASE, HERE)).toBe(
      `${HERE}/protected`,
    );
  });

  it("rejects a localhost destination when we are not on localhost", () => {
    expect(safePasskeyReturnUrl("https://evil.localhost/", BASE, HERE)).toBe(
      `${HERE}/protected`,
    );
  });

  it("falls back when there is no value", () => {
    expect(safePasskeyReturnUrl(undefined, BASE, HERE)).toBe(
      `${HERE}/protected`,
    );
    expect(safePasskeyReturnUrl(null, BASE, HERE)).toBe(`${HERE}/protected`);
    expect(safePasskeyReturnUrl("", BASE, HERE)).toBe(`${HERE}/protected`);
    expect(safePasskeyReturnUrl([], BASE, HERE)).toBe(`${HERE}/protected`);
  });
});
