import { describe, it, expect, vi } from "vitest";
import {
  ClubFeedError,
  fetchClubFeed,
  parseClubSiteUrl,
  resolveClubFeed,
  USER_AGENT,
} from "@/lib/club-feed/fetch";
import vvvIndex from "./fixtures/vvv-index.json";
import vvvOctober from "./fixtures/vvv-matches_oct_2026.json";

const HOST = "www.hockeyclubvvv.nl";
const ALIAS = "d8ca7649";
const PAGE_HTML = `<script>window.Parameters = { SiteAlias: '${ALIAS}', IsMobile: false };</script>`;

type Route = (url: URL) => Response | Promise<Response>;

/** A fetch that answers by URL and records every request it saw. */
function fakeFetch(route: Route) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return route(new URL(String(input)));
  });
  return { fetch: impl as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const redirect = (location: string) =>
  new Response(null, { status: 301, headers: { location } });

function collectionOf(url: URL): string | null {
  return (
    url.pathname.match(/\/runtime\/collection\/([^/]+)\/query-data$/)?.[1] ??
    null
  );
}

describe("parseClubSiteUrl", () => {
  it.each([
    ["https://www.hockeyclubvvv.nl/", "www.hockeyclubvvv.nl"],
    ["www.hockeyclubvvv.nl", "www.hockeyclubvvv.nl"],
    ["  hockeyclubvvv.nl/wedstrijden  ", "hockeyclubvvv.nl"],
    ["HTTPS://WWW.HCAMVJ.NL", "www.hcamvj.nl"],
  ])("accepts %s", (input, host) => {
    expect(parseClubSiteUrl(input).hostname).toBe(host);
  });

  it.each([
    "http://www.hockeyclubvvv.nl",
    "ftp://www.hockeyclubvvv.nl",
    "javascript:alert(1)",
    "https://127.0.0.1/",
    "https://10.0.0.1",
    "https://[::1]/",
    "https://localhost/",
    "https://intranet/",
    "https://printer.local/",
    "https://db.internal/",
    "https://www.hockeyclubvvv.nl:8443/",
    "https://user:pass@www.hockeyclubvvv.nl/",
    "",
    "not a url at all",
  ])("rejects %s", (input) => {
    expect(() => parseClubSiteUrl(input)).toThrow(ClubFeedError);
  });
});

describe("resolveClubFeed", () => {
  const lisaSite: Route = (url) => {
    if (collectionOf(url) === "Toekomstige_wedstrijden") return json(vvvIndex);
    if (url.pathname === "/") return new Response(PAGE_HTML);
    return new Response("not found", { status: 404 });
  };

  it("finds the site alias and confirms the schedule index", async () => {
    const { fetch, calls } = fakeFetch(lisaSite);
    await expect(
      resolveClubFeed(`https://${HOST}/`, { fetch }),
    ).resolves.toEqual({ host: HOST, siteAlias: ALIAS });
    expect(calls.map((call) => new URL(call.url).host)).toEqual([HOST, HOST]);
  });

  it("names us and refuses to follow redirects on its own", async () => {
    const { fetch, calls } = fakeFetch(lisaSite);
    await resolveClubFeed(HOST, { fetch });
    for (const { init } of calls) {
      expect(new Headers(init?.headers).get("user-agent")).toBe(USER_AGENT);
      expect(init?.redirect).toBe("manual");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("follows the bare domain's redirect to www", async () => {
    const { fetch } = fakeFetch((url) =>
      url.host === "hockeyclubvvv.nl"
        ? redirect(`https://${HOST}/`)
        : lisaSite(url),
    );
    await expect(
      resolveClubFeed("hockeyclubvvv.nl", { fetch }),
    ).resolves.toEqual({ host: HOST, siteAlias: ALIAS });
  });

  it("does not follow a redirect to another host", async () => {
    const { fetch, calls } = fakeFetch(() => redirect("https://evil.example/"));
    await expect(resolveClubFeed(HOST, { fetch })).rejects.toMatchObject({
      code: "unreachable",
    });
    expect(calls).toHaveLength(1);
  });

  it("does not follow a redirect to a non-https or internal URL", async () => {
    for (const target of [
      "http://www.hockeyclubvvv.nl/",
      "https://127.0.0.1/",
    ]) {
      const { fetch } = fakeFetch(() => redirect(target));
      await expect(resolveClubFeed(HOST, { fetch })).rejects.toBeInstanceOf(
        ClubFeedError,
      );
    }
  });

  it("gives up after a few redirects", async () => {
    const { fetch, calls } = fakeFetch(() => redirect(`https://${HOST}/again`));
    await expect(resolveClubFeed(HOST, { fetch })).rejects.toMatchObject({
      code: "unreachable",
    });
    expect(calls.length).toBeLessThanOrEqual(4);
  });

  it("reports a page without a site alias as not a LISA site", async () => {
    const { fetch } = fakeFetch(() => new Response("<html>WordPress</html>"));
    await expect(resolveClubFeed(HOST, { fetch })).rejects.toMatchObject({
      code: "not_lisa",
    });
  });

  it("reports a Duda site without the schedule index as not a LISA site", async () => {
    const { fetch } = fakeFetch((url) =>
      collectionOf(url)
        ? json({ error: "missing" }, 404)
        : new Response(PAGE_HTML),
    );
    await expect(resolveClubFeed(HOST, { fetch })).rejects.toMatchObject({
      code: "not_lisa",
    });
  });

  it("reports an unreachable site", async () => {
    const down = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(
      resolveClubFeed(HOST, { fetch: down.fetch }),
    ).rejects.toMatchObject({ code: "unreachable" });
    const blocked = fakeFetch(() => new Response("Forbidden", { status: 403 }));
    await expect(
      resolveClubFeed(HOST, { fetch: blocked.fetch }),
    ).rejects.toMatchObject({ code: "unreachable" });
  });

  it("refuses an oversized page", async () => {
    const { fetch } = fakeFetch(
      () =>
        new Response("x", {
          headers: { "content-length": String(50_000_000) },
        }),
    );
    await expect(resolveClubFeed(HOST, { fetch })).rejects.toMatchObject({
      code: "unreachable",
    });
  });
});

describe("fetchClubFeed", () => {
  const feed = { host: HOST, siteAlias: ALIAS };
  const index = {
    values: [
      { data: { collectionname: "matches_oct_2026" } },
      { data: { collectionname: "matches_may_2027" } },
    ],
    page: { totalPages: 1 },
  };

  it("reads every page of every month the index names", async () => {
    const { fetch, calls } = fakeFetch((url) => {
      const collection = collectionOf(url);
      if (collection === "Toekomstige_wedstrijden") return json(index);
      if (collection === "matches_oct_2026") {
        const page = Number(url.searchParams.get("pageNumber"));
        return json({
          ...vvvOctober,
          // Split the captured page across two
          values: vvvOctober.values.slice(page * 5, page * 5 + 5),
          page: { ...vvvOctober.page, pageNumber: page, totalPages: 2 },
        });
      }
      return json({ values: [], page: { totalPages: 1 } });
    });
    const result = await fetchClubFeed(feed, { fetch });
    expect(result.problems).toEqual([]);
    expect(result.fixtures).toHaveLength(7);
    expect(
      calls.map((call) => {
        const url = new URL(call.url);
        return `${collectionOf(url)}:${url.searchParams.get("pageNumber")}`;
      }),
    ).toEqual([
      "Toekomstige_wedstrijden:0",
      "matches_oct_2026:0",
      "matches_oct_2026:1",
      "matches_may_2027:0",
    ]);
    for (const { url } of calls) {
      expect(new URL(url).host).toBe(HOST);
      expect(
        new URL(url).pathname.startsWith(`/rts/collections/public/${ALIAS}/`),
      ).toBe(true);
    }
  });

  it("is partial, not failed, when a month the index names is missing", async () => {
    const { fetch } = fakeFetch((url) => {
      const collection = collectionOf(url);
      if (collection === "Toekomstige_wedstrijden") return json(index);
      if (collection === "matches_oct_2026") return json(vvvOctober);
      return json({ error: "not found" }, 404);
    });
    const result = await fetchClubFeed(feed, { fetch });
    expect(result.fixtures).toHaveLength(7);
    expect(result.problems).toEqual(["matches_may_2027: HTTP 404"]);
  });

  it("stops starting requests at the deadline and reports what it missed", async () => {
    const { fetch, calls } = fakeFetch((url) =>
      collectionOf(url) === "Toekomstige_wedstrijden"
        ? json(index)
        : json(vvvOctober),
    );
    const result = await fetchClubFeed(feed, {
      fetch,
      deadline: Date.now() - 1,
    });
    // The index is always read: without it there is nothing to report.
    expect(calls).toHaveLength(1);
    expect(result.fixtures).toEqual([]);
    expect(result.problems).toEqual(["Out of time: 2 months not read"]);
  });

  it("fails when the index cannot be read", async () => {
    const { fetch } = fakeFetch(() => json({}, 500));
    await expect(fetchClubFeed(feed, { fetch })).rejects.toThrow("HTTP 500");
  });

  it("treats a redirect as a failed request", async () => {
    const { fetch } = fakeFetch(() => redirect("https://elsewhere.example/"));
    await expect(fetchClubFeed(feed, { fetch })).rejects.toThrow("HTTP 301");
  });
});
