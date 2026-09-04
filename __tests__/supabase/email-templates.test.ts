import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guards the bug class that broke every email link at once: the app verifies
 * links server-side through /auth/confirm using {{ .TokenHash }}, so a template
 * that falls back to the stock {{ .ConfirmationURL }} produces links that can
 * never establish a session — with no error anywhere to show for it.
 *
 * Every template carries the link twice: once as the button's href, once as
 * copyable text for mail clients that mangle the button. Both are real user
 * paths, so both are checked — a fallback link that quietly lost its `type`
 * would send the reader to "No token hash or type".
 */

const ROOT = resolve(__dirname, "../..");
const CONFIG = readFileSync(resolve(ROOT, "supabase/config.toml"), "utf8");

/** The `type` and `next` each template must hand to /auth/confirm. */
const EXPECTED: Record<string, { type: string; next: string }> = {
  invite: {
    type: "invite",
    // URL-encoded /auth/update-password?type=invite
    next: "%2Fauth%2Fupdate-password%3Ftype%3Dinvite",
  },
  confirmation: { type: "email", next: "%2Fprotected" },
  recovery: { type: "recovery", next: "%2Fauth%2Fupdate-password" },
  magic_link: { type: "magiclink", next: "%2Fprotected" },
  email_change: { type: "email_change", next: "%2Fprotected" },
};

function templateBlocks(): Array<{ name: string; contentPath: string }> {
  const blocks: Array<{ name: string; contentPath: string }> = [];
  const re =
    /\[auth\.email\.template\.(\w+)\][^[]*?content_path\s*=\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(CONFIG)) !== null) {
    blocks.push({ name: match[1], contentPath: match[2] });
  }
  return blocks;
}

/**
 * Every /auth/confirm URL in the template — button href and copyable text
 * alike, so the two compare identically:
 *  - HTML entities are decoded (`&amp;type=` in the copyable form)
 *  - Go actions are collapsed to a space-free form, because Prettier is free to
 *    wrap a line inside `{{ ... }}` (harmless to Go's parser, but it would
 *    otherwise truncate the match)
 *
 * Any whitespace Prettier introduced *outside* an action would still truncate
 * the match — which is the point: that would be a genuinely broken link.
 */
function confirmUrls(html: string): string[] {
  const normalised = html
    .replace(/&amp;/g, "&")
    .replace(/\{\{\s*(\.\w+)\s*\}\}/g, "{{$1}}");
  return [...normalised.matchAll(/\/auth\/confirm\?[^"'\s<]+/g)].map(
    (m) => m[0],
  );
}

describe("supabase email templates", () => {
  const blocks = templateBlocks();

  it("configures every template the app relies on", () => {
    expect(blocks.map((b) => b.name).sort()).toEqual(
      Object.keys(EXPECTED).sort(),
    );
  });

  describe.each(blocks)("$name", ({ name, contentPath }) => {
    const html = readFileSync(resolve(ROOT, contentPath), "utf8");
    const urls = confirmUrls(html);
    const { type, next } = EXPECTED[name];
    // Index the titles rather than interpolating the URL, whose percent-escapes
    // would collide with vitest's printf-style placeholders.
    const indexed = urls.map((url, i) => [i, url] as const);

    it("never uses ConfirmationURL", () => {
      expect(html).not.toContain(".ConfirmationURL");
    });

    it("carries the link as both a button and copyable text", () => {
      expect(urls.length).toBeGreaterThanOrEqual(2);
    });

    it("never builds a link from RedirectTo", () => {
      // {{ .RedirectTo }} silently falls back to the site URL whenever it
      // misses Supabase's allow-list, so links must not depend on it.
      expect(html).not.toContain(".RedirectTo");
    });

    it.each(indexed)("link %i is rooted at the site URL", (_i, url) => {
      expect(html.replace(/\s+/g, " ")).toContain(
        `{{ .SiteURL }}${url.split("?")[0]}`,
      );
    });

    it.each(indexed)("link %i passes the token hash", (_i, url) => {
      expect(url).toContain("token_hash={{.TokenHash}}");
    });

    it.each(indexed)("link %i uses the right verifyOtp type", (_i, url) => {
      expect(new URLSearchParams(url.split("?")[1]).getAll("type")).toEqual([
        type,
      ]);
    });

    it.each(indexed)("link %i targets the right screen", (_i, url) => {
      // Compared raw: `next` is deliberately percent-encoded, and decoding it
      // would hide a missing encoding.
      expect(url).toContain(`next=${next}`);
    });
  });
});
