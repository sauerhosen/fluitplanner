import {
  INDEX_COLLECTION,
  parseFeedPages,
  parseIndexCollections,
  totalPagesOf,
  type FeedFixture,
  type FeedPage,
} from "./parse";

// Requests to club websites. Resolving a feed is the one place the app
// fetches a URL a planner typed, so it is locked down: https only, a DNS host
// name (no IP literal, port or local name), no redirect to another host, a
// size cap and a timeout. After that only the fixed Duda collection path on
// the stored host is ever requested.

/** Sent on every request: the club sites' WAF rejects anonymous defaults. */
export const USER_AGENT = "Fluitplanner/1.0 (+https://fluitplanner.nl)";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PAGE_BYTES = 2_000_000;
const MAX_COLLECTION_BYTES = 5_000_000;
const MAX_REDIRECTS = 3;
/** A season is ~10 collection pages; these only stop a runaway export. */
const MAX_COLLECTIONS = 24;
const MAX_PAGES_PER_COLLECTION = 20;
const PAGE_SIZE = 100;

export type ClubFeedErrorCode = "invalid_url" | "unreachable" | "not_lisa";

export class ClubFeedError extends Error {
  constructor(
    readonly code: ClubFeedErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ClubFeedError";
  }
}

export type ClubFeedLocation = { host: string; siteAlias: string };

export type FetchedFeed = {
  fixtures: FeedFixture[];
  /** Collections or pages that failed: the poll is partial, never wrong. */
  problems: string[];
};

type FetchLike = typeof fetch;

const HOST_NAME =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LOCAL_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home"];
const SITE_ALIAS = /\bSiteAlias\s*[:=]\s*['"]([A-Za-z0-9]{4,32})['"]/;

/**
 * A planner-typed club website as a safe https URL. A bare host name
 * ("hockeyclubvvv.nl") is read as https; anything else must already be one.
 */
export function parseClubSiteUrl(input: string): URL {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ClubFeedError("invalid_url", "Not a URL");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    // Rejects IPv4 and IPv6 literals too: the last label must be letters.
    !HOST_NAME.test(host) ||
    LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    throw new ClubFeedError("invalid_url", "Only public https websites");
  }
  return url;
}

/** Hosts that are the same site: equal, or one is the other with "www.". */
function sameSite(a: string, b: string): boolean {
  const bare = (host: string) => host.replace(/^www\./, "");
  return bare(a) === bare(b);
}

/** Response text, refusing anything over `maxBytes`. */
async function readLimited(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("Response too large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("Response too large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function request(fetchImpl: FetchLike, url: string): Promise<Response> {
  return fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
}

function collectionUrl(
  feed: ClubFeedLocation,
  collection: string,
  pageNumber: number,
): string {
  return (
    `https://${feed.host}/rts/collections/public/${encodeURIComponent(feed.siteAlias)}` +
    `/runtime/collection/${encodeURIComponent(collection)}/query-data` +
    `?pageSize=${PAGE_SIZE}&pageNumber=${pageNumber}&query=%28%29&language=DUTCH`
  );
}

class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function fetchCollectionPage(
  fetchImpl: FetchLike,
  feed: ClubFeedLocation,
  collection: string,
  pageNumber: number,
): Promise<FeedPage> {
  const response = await request(
    fetchImpl,
    collectionUrl(feed, collection, pageNumber),
  );
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => {});
    throw new HttpStatusError(response.status);
  }
  const body = await readLimited(response, MAX_COLLECTION_BYTES);
  try {
    return JSON.parse(body) as FeedPage;
  } catch {
    throw new Error("Not JSON");
  }
}

function pastDeadline(deadline: number | undefined): boolean {
  return deadline !== undefined && Date.now() >= deadline;
}

/** Every page of one collection, up to the cap and the deadline. */
async function fetchCollection(
  fetchImpl: FetchLike,
  feed: ClubFeedLocation,
  collection: string,
  deadline?: number,
): Promise<FeedPage[]> {
  const first = await fetchCollectionPage(fetchImpl, feed, collection, 0);
  const pages = [first];
  const total = Math.min(totalPagesOf(first), MAX_PAGES_PER_COLLECTION);
  for (let pageNumber = 1; pageNumber < total; pageNumber++) {
    if (pastDeadline(deadline)) throw new Error("Out of time");
    pages.push(
      await fetchCollectionPage(fetchImpl, feed, collection, pageNumber),
    );
  }
  return pages;
}

/**
 * Find the LISA export behind a club website: the page's Duda site alias,
 * confirmed by reading the schedule index from it. Throws ClubFeedError.
 */
export async function resolveClubFeed(
  input: string,
  opts: { fetch?: FetchLike } = {},
): Promise<ClubFeedLocation> {
  const fetchImpl = opts.fetch ?? fetch;
  const start = parseClubSiteUrl(input);
  let url = start;
  let html: string | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await request(fetchImpl, url.toString());
    } catch {
      throw new ClubFeedError("unreachable", "Website did not respond");
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      const location = response.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) {
        throw new ClubFeedError("unreachable", "Too many redirects");
      }
      // hockeyclubvvv.nl → www.hockeyclubvvv.nl is followed; another host is not.
      const next = parseClubSiteUrl(new URL(location, url).toString());
      if (!sameSite(next.hostname, start.hostname)) {
        throw new ClubFeedError("unreachable", "Redirects to another website");
      }
      url = next;
      continue;
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      throw new ClubFeedError("unreachable", `HTTP ${response.status}`);
    }
    try {
      html = await readLimited(response, MAX_PAGE_BYTES);
    } catch {
      throw new ClubFeedError("unreachable", "Website page too large");
    }
    break;
  }

  const alias = html?.match(SITE_ALIAS)?.[1];
  if (!alias) {
    throw new ClubFeedError("not_lisa", "No LISA schedule on this website");
  }
  const feed = { host: url.hostname.toLowerCase(), siteAlias: alias };
  try {
    const index = await fetchCollectionPage(
      fetchImpl,
      feed,
      INDEX_COLLECTION,
      0,
    );
    if (!Array.isArray(index.values)) throw new Error("No values");
  } catch {
    throw new ClubFeedError("not_lisa", "No LISA schedule on this website");
  }
  return feed;
}

/**
 * Read a feed's whole programme: the index, then every month it names. The
 * index failing fails the poll; a month or page failing (the index often
 * names months that 404) only makes it partial — absence never means
 * anything to the detector.
 */
export async function fetchClubFeed(
  feed: ClubFeedLocation,
  opts: {
    fetch?: FetchLike;
    /** Epoch ms after which no further request starts; the rest is a problem. */
    deadline?: number;
  } = {},
): Promise<FetchedFeed> {
  const fetchImpl = opts.fetch ?? fetch;
  const { deadline } = opts;
  const index = await fetchCollection(
    fetchImpl,
    feed,
    INDEX_COLLECTION,
    deadline,
  );
  const collections = Array.from(
    new Set(index.flatMap((page) => parseIndexCollections(page))),
  ).slice(0, MAX_COLLECTIONS);

  const problems: string[] = [];
  const pages: Array<{ collection: string; page: FeedPage }> = [];
  for (const [i, collection] of collections.entries()) {
    if (pastDeadline(deadline)) {
      problems.push(`Out of time: ${collections.length - i} months not read`);
      break;
    }
    try {
      for (const page of await fetchCollection(
        fetchImpl,
        feed,
        collection,
        deadline,
      )) {
        pages.push({ collection, page });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problems.push(`${collection}: ${message}`);
    }
  }
  return { fixtures: parseFeedPages(pages), problems };
}
