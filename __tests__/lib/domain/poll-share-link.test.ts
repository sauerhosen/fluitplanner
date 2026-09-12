import { describe, it, expect } from "vitest";
import {
  pollTitleVersion,
  buildPollSharePath,
  buildPollShareUrl,
} from "@/lib/domain/poll-share-link";

describe("pollTitleVersion", () => {
  it("returns null when there is no title to go stale", () => {
    expect(pollTitleVersion(null)).toBeNull();
    expect(pollTitleVersion("")).toBeNull();
    expect(pollTitleVersion("   ")).toBeNull();
  });

  it("is stable for the same title", () => {
    expect(pollTitleVersion("Poll #2 - 19 en 26 september")).toBe(
      pollTitleVersion("Poll #2 - 19 en 26 september"),
    );
  });

  it("changes when the title changes", () => {
    expect(pollTitleVersion("Poll #2 - 13 en 19 september")).not.toBe(
      pollTitleVersion("Poll #2 - 19 en 26 september"),
    );
  });

  it("ignores surrounding whitespace", () => {
    expect(pollTitleVersion("  Herfst  ")).toBe(pollTitleVersion("Herfst"));
  });

  it("is short and URL-safe", () => {
    const v = pollTitleVersion("Seizoen '26-'27 — tot herfstvakantie");
    expect(v).toMatch(/^[0-9a-z]{1,7}$/);
  });

  it("distinguishes titles that differ only by one character", () => {
    expect(pollTitleVersion("Poll #1")).not.toBe(pollTitleVersion("Poll #2"));
  });
});

describe("buildPollShareUrl", () => {
  it("appends the title version so chat apps re-unfurl after a rename", () => {
    const url = buildPollShareUrl(
      "https://vvv.fluiten.org",
      "abc123",
      "Herfst",
    );
    expect(url).toBe(
      `https://vvv.fluiten.org/poll/abc123?v=${pollTitleVersion("Herfst")}`,
    );
  });

  it("omits the param for an untitled poll", () => {
    expect(buildPollShareUrl("https://vvv.fluiten.org", "abc123", null)).toBe(
      "https://vvv.fluiten.org/poll/abc123",
    );
  });

  it("does not double up slashes when the origin has a trailing one", () => {
    expect(buildPollShareUrl("https://vvv.fluiten.org/", "abc123", null)).toBe(
      "https://vvv.fluiten.org/poll/abc123",
    );
  });
});

describe("buildPollSharePath", () => {
  it("stamps the root-relative link the same way", () => {
    expect(buildPollSharePath("abc123", "Herfst")).toBe(
      `/poll/abc123?v=${pollTitleVersion("Herfst")}`,
    );
  });

  it("omits the param for an untitled poll", () => {
    expect(buildPollSharePath("abc123", null)).toBe("/poll/abc123");
  });

  it("agrees with the absolute builder", () => {
    expect(
      buildPollShareUrl("https://vvv.fluiten.org", "abc123", "Herfst"),
    ).toBe(`https://vvv.fluiten.org${buildPollSharePath("abc123", "Herfst")}`);
  });
});
