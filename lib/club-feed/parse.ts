import { createHash } from "node:crypto";

// Pure parsing of a LISA club-site schedule export (Duda collections). Every
// payload is untrusted input from a third-party site: anything malformed is
// dropped, never guessed at. Only what the change detector compares is kept —
// no team, person or referee names.

/** The index collection: dates of upcoming matches and the month holding each. */
export const INDEX_COLLECTION = "Toekomstige_wedstrijden";

/** One home or away fixture as a club's LISA export publishes it. */
export type FeedFixture = {
  /** The Match Center match id — our `matches.external_id`. */
  code: number;
  /** The club's own team id (LISA), stable per team. */
  lisaTeamId: string;
  /** YYYY-MM-DD. */
  date: string;
  /** HH:MM Amsterdam wall clock, null while untimed. */
  time: string | null;
  /** Club-local pitch name ("Water 1"), never comparable to the federation's. */
  field: string | null;
  cancelled: boolean;
  isHome: boolean;
  venue: string | null;
};

export type FeedPage = {
  values?: unknown;
  page?: { totalPages?: unknown } | null;
};

const COLLECTION_NAME = /^[A-Za-z0-9_]{1,64}$/;
const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

function rowsOf(page: FeedPage | null | undefined): Record<string, unknown>[] {
  const values = page?.values;
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => (value as { data?: unknown } | null)?.data)
    .filter(
      (data): data is Record<string, unknown> =>
        typeof data === "object" && data !== null,
    );
}

/** How many pages a collection response says it has (at least one). */
export function totalPagesOf(page: FeedPage | null | undefined): number {
  const total = Number(page?.page?.totalPages);
  return Number.isInteger(total) && total > 0 ? total : 1;
}

/**
 * The month collections an index page names, deduplicated, in order. Names
 * end up in a request path, so anything but a plain identifier is dropped.
 */
export function parseIndexCollections(
  page: FeedPage | null | undefined,
): string[] {
  const names = new Set<string>();
  for (const row of rowsOf(page)) {
    const name = row.collectionname;
    if (typeof name === "string" && COLLECTION_NAME.test(name)) {
      names.add(name);
    }
  }
  return Array.from(names);
}

/** A trimmed string, with "" (and anything not a string) read as null. */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** "25-10-2026" → "2026-10-25", or null when it is not a real date. */
function parseDate(value: unknown): string | null {
  const match =
    typeof value === "string" && value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}

function parseTime(value: unknown): string | null {
  const match = typeof value === "string" && value.match(/^(\d{2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1]}:${match[2]}`;
}

/**
 * One raw row → a fixture, or null for rows the detector cannot use: no
 * numeric `code` (trainings, "Mini's", pitch reservations, friendlies), no
 * team, or no parseable date.
 */
export function parseFeedRow(row: Record<string, unknown>): FeedFixture | null {
  const code = typeof row.code === "string" ? row.code.trim() : "";
  if (!/^\d{1,15}$/.test(code)) return null;
  const lisaTeamId = text(row.team_id);
  const date = parseDate(row.date);
  if (!lisaTeamId || !date) return null;
  const location = row.location as { name?: unknown } | null | undefined;
  return {
    code: Number(code),
    lisaTeamId,
    date,
    time: parseTime(row.time),
    field: text(row.field),
    cancelled: row.is_cancelled === true,
    isHome: row.is_home_match === true,
    venue: text(location?.name),
  };
}

/** The month a collection is named for ("matches_oct_2026" → "2026-10"). */
function collectionMonth(collection: string): string | null {
  const match = collection.match(/_([a-z]{3})_(\d{4})$/i);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1].toLowerCase());
  return month < 0 ? null : `${match[2]}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Every usable fixture across a feed's collection pages, one per code. A
 * month collection can also hold the previous month's last days, so the same
 * row can arrive twice: the copy from the collection named for its own month
 * wins, so a stale overlap can never flip a fingerprint back and forth.
 */
export function parseFeedPages(
  pages: Array<{ collection: string; page: FeedPage }>,
): FeedFixture[] {
  const byCode = new Map<number, { fixture: FeedFixture; own: boolean }>();
  for (const { collection, page } of pages) {
    const month = collectionMonth(collection);
    for (const row of rowsOf(page)) {
      const fixture = parseFeedRow(row);
      if (!fixture) continue;
      const own = month !== null && fixture.date.startsWith(month);
      const seen = byCode.get(fixture.code);
      if (!seen || (own && !seen.own)) {
        byCode.set(fixture.code, { fixture, own });
      }
    }
  }
  return Array.from(byCode.values(), ({ fixture }) => fixture);
}

/**
 * The home fixtures the detector watches: from `today` on, or any date when
 * cancelled (a cancellation must still reach a row observed after match day).
 */
export function watchedFixtures(
  fixtures: FeedFixture[],
  today: string,
): FeedFixture[] {
  return fixtures.filter(
    (fixture) => fixture.isHome && (fixture.date >= today || fixture.cancelled),
  );
}

/** What a change is measured on: date, time, pitch, cancellation, venue. */
export function fingerprintOf(fixture: FeedFixture): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        fixture.date,
        fixture.time,
        fixture.field,
        fixture.cancelled,
        fixture.venue,
      ]),
    )
    .digest("hex")
    .slice(0, 32);
}
