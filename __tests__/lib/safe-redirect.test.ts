import { describe, expect, it } from "vitest";

import { toSafeRedirectPath } from "@/lib/safe-redirect";

describe("toSafeRedirectPath", () => {
  it("keeps same-site paths, including a query string", () => {
    expect(toSafeRedirectPath("/protected")).toBe("/protected");
    expect(toSafeRedirectPath("/auth/update-password?type=invite")).toBe(
      "/auth/update-password?type=invite",
    );
  });

  it("takes the first value when the param is repeated", () => {
    expect(toSafeRedirectPath(["/protected", "/evil"])).toBe("/protected");
  });

  it("falls back when there is no value", () => {
    expect(toSafeRedirectPath(undefined)).toBe("/");
    expect(toSafeRedirectPath(null)).toBe("/");
    expect(toSafeRedirectPath("")).toBe("/");
    expect(toSafeRedirectPath([])).toBe("/");
  });

  it("rejects absolute URLs", () => {
    expect(toSafeRedirectPath("https://evil.example")).toBe("/");
    expect(toSafeRedirectPath("http://evil.example")).toBe("/");
  });

  it("rejects protocol-relative URLs", () => {
    expect(toSafeRedirectPath("//evil.example")).toBe("/");
  });

  it("rejects backslash forms that normalise to protocol-relative", () => {
    expect(toSafeRedirectPath("/\\evil.example")).toBe("/");
    expect(toSafeRedirectPath("/foo\\bar")).toBe("/");
  });

  it("rejects bare relative paths that are not rooted", () => {
    expect(toSafeRedirectPath("protected")).toBe("/");
  });

  it("honours a custom fallback", () => {
    expect(toSafeRedirectPath("https://evil.example", "")).toBe("");
  });
});
