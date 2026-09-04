import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guards the bug class that broke every email link at once: the app verifies
 * links server-side through /auth/confirm using {{ .TokenHash }}, so a template
 * that falls back to the stock {{ .ConfirmationURL }} produces links that can
 * never establish a session — with no error anywhere to show for it.
 */

const ROOT = resolve(__dirname, "../..");
const CONFIG = readFileSync(resolve(ROOT, "supabase/config.toml"), "utf8");

/** The verifyOtp `type` each template must hand to /auth/confirm. */
const EXPECTED_TYPE: Record<string, string> = {
  invite: "invite",
  confirmation: "email",
  recovery: "recovery",
  magic_link: "magiclink",
  email_change: "email_change",
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

describe("supabase email templates", () => {
  const blocks = templateBlocks();

  it("configures every template the app relies on", () => {
    expect(blocks.map((b) => b.name).sort()).toEqual(
      Object.keys(EXPECTED_TYPE).sort(),
    );
  });

  it.each(blocks)("$name points at /auth/confirm", ({ contentPath }) => {
    const html = readFileSync(resolve(ROOT, contentPath), "utf8");
    expect(html).toContain("/auth/confirm?token_hash={{ .TokenHash }}");
  });

  it.each(blocks)("$name never uses ConfirmationURL", ({ contentPath }) => {
    const html = readFileSync(resolve(ROOT, contentPath), "utf8");
    expect(html).not.toContain(".ConfirmationURL");
  });

  it.each(blocks)(
    "$name uses the right verifyOtp type",
    ({ name, contentPath }) => {
      const html = readFileSync(resolve(ROOT, contentPath), "utf8");
      const types = new Set(
        [...html.matchAll(/[?&]type=([a-z_]+)/g)].map((m) => m[1]),
      );
      expect([...types]).toEqual([EXPECTED_TYPE[name]]);
    },
  );

  it("sends invited users to the choose-a-password screen", () => {
    const html = readFileSync(
      resolve(ROOT, "supabase/templates/invite.html"),
      "utf8",
    );
    // URL-encoded /auth/update-password?type=invite
    expect(html).toContain("next=%2Fauth%2Fupdate-password%3Ftype%3Dinvite");
  });

  it("sends password recovery to the reset screen", () => {
    const html = readFileSync(
      resolve(ROOT, "supabase/templates/recovery.html"),
      "utf8",
    );
    expect(html).toContain("next=%2Fauth%2Fupdate-password");
    expect(html).not.toContain("type%3Dinvite");
  });
});
