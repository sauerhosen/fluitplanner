import { describe, it, expect, vi, beforeEach } from "vitest";

const { imageResponse, getPollMeta } = vi.hoisted(() => ({
  imageResponse: vi.fn(),
  getPollMeta: vi.fn(),
}));
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: unknown, options: unknown) {
      imageResponse(element, options);
    }
  },
}));

vi.mock("@/lib/actions/public-polls", () => ({ getPollMeta }));

import PollImage from "@/app/poll/[token]/opengraph-image";

describe("poll opengraph-image", () => {
  beforeEach(() => {
    imageResponse.mockReset();
    getPollMeta.mockReset();
  });

  // Rendering the PNG is the most CPU-heavy thing this app does per request,
  // and every share of a poll link makes chat apps and link scanners fetch it.
  // The CDN must be allowed to serve repeats without invoking the function.
  it("lets the CDN cache the rendered image", async () => {
    getPollMeta.mockResolvedValue({ clubName: "HIC", title: "x" });
    await PollImage({ params: Promise.resolve({ token: "abc" }) });

    const options = imageResponse.mock.calls[0][1] as {
      headers?: Record<string, string>;
    };
    const cacheControl = options.headers?.["Cache-Control"] ?? "";
    expect(cacheControl).toMatch(/\bpublic\b/);
    expect(cacheControl).toMatch(/s-maxage=\d+/);
  });
});
