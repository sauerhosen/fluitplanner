import { describe, it, expect, vi, beforeEach } from "vitest";

const { imageResponse, getPollClubName } = vi.hoisted(() => ({
  imageResponse: vi.fn(),
  getPollClubName: vi.fn(),
}));
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: unknown, options: unknown) {
      imageResponse(element, options);
    }
  },
}));
vi.mock("@/lib/og/poll-club-name", () => ({ getPollClubName }));
vi.mock("@/lib/og/icon", () => ({
  loadOgIcon: () => Promise.resolve(new ArrayBuffer(8)),
}));

import PollImage from "@/app/poll/[token]/opengraph-image";

async function render(token = "abc") {
  await PollImage({ params: Promise.resolve({ token }) });
  const [element, options] = imageResponse.mock.calls.at(-1)!;
  return {
    text: JSON.stringify(element),
    cacheControl:
      (options as { headers?: Record<string, string> }).headers?.[
        "Cache-Control"
      ] ?? "",
  };
}

describe("poll opengraph-image", () => {
  beforeEach(() => vi.clearAllMocks());

  // Rendering the PNG is CPU-heavy, and every share of a poll link makes chat
  // apps and link scanners fetch it. The CDN must serve repeats.
  it("lets the CDN cache an image that names the club", async () => {
    getPollClubName.mockResolvedValue({ found: true, clubName: "HIC" });
    const { text, cacheControl } = await render();
    expect(text).toContain("HIC");
    expect(cacheControl).toMatch(/\bpublic\b/);
    expect(cacheControl).toMatch(/s-maxage=86400\b/);
  });

  it("caches an unknown poll only briefly", async () => {
    getPollClubName.mockResolvedValue({ found: false, clubName: null });
    const { text, cacheControl } = await render();
    expect(text).toContain("Fluitplanner");
    const sMaxAge = Number(cacheControl.match(/s-maxage=(\d+)/)?.[1]);
    expect(sMaxAge).toBeGreaterThan(0);
    expect(sMaxAge).toBeLessThanOrEqual(600);
    expect(cacheControl).not.toMatch(/stale-while-revalidate/);
  });

  // A transient lookup failure must not pin the club-less fallback image in
  // the CDN for a day.
  it("does not cache the fallback after a lookup error", async () => {
    getPollClubName.mockRejectedValue(new Error("timeout"));
    const { text, cacheControl } = await render();
    expect(text).toContain("Fluitplanner");
    expect(cacheControl).toMatch(/no-store/);
  });
});
