import type { SupabaseClient } from "@supabase/supabase-js";
import { HockeyHttpError, HockeyRateLimitError } from "@/lib/hockey/client";
import { fetchMatch } from "@/lib/hockey/discovery";
import { amsterdamDateOf } from "@/lib/hockey/normalize";
import {
  homeFixtureOf,
  loadRequiredLevels,
  reconcileFixtures,
  type SyncDeps,
} from "@/lib/hockey/sync";
import type { NormalizedFixture } from "@/lib/hockey/types";
import type { ClubFeed, TrackedTeam } from "@/lib/types/domain";
import {
  applyConfirmation,
  detectSuspects,
  orderSuspects,
  type SnapshotRow,
  type StoredMatch,
  type Suspect,
  type SuspectRule,
} from "./detect";
import { fetchClubFeed, type FetchedFeed } from "./fetch";
import { watchedFixtures } from "./parse";

/**
 * Match Center confirmations per run: about five requests a minute are
 * allowed, and one stays free for anything else sharing the budget.
 */
export const MAX_CONFIRMATIONS_PER_RUN = 4;

/**
 * Two orgs watching the same combined team's match share one answer — except
 * for a "changed" suspect, which asks fresh: a cached answer may predate the
 * change the club site just showed.
 */
const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

/**
 * Time the polling step may take across all feeds, so a slow club site cannot
 * use up an interactive caller's budget (MCP allows 60s) before the full sync
 * starts. A feed not reached is polled first next run.
 */
export const POLL_BUDGET_MS = 20_000;

/** A feed polled this recently is left alone, to be polite to the club site. */
const MIN_POLL_INTERVAL_MS = 2 * 60 * 1000;

/** Snapshot rows a feed stopped publishing (played matches) are dropped. */
const SNAPSHOT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** PostgREST caps a response at 1000 rows, and long `in` lists hit URL limits. */
const PAGE_SIZE = 1000;
const IN_CHUNK = 200;
const WRITE_CHUNK = 500;

export type WatchResult = {
  feeds: number;
  /** Feeds actually read this run (a feed polled minutes ago is skipped). */
  polled: number;
  /** Distinct matches worth confirming. */
  suspects: number;
  /** Suspects the Match Center answered for. */
  confirmed: number;
  /** Suspects left for a later run (budget spent, or throttled). */
  pending: number;
  /** Confirmed fixtures not applied because their feeds are in shadow mode. */
  shadowed: number;
  inserted: number;
  updated: number;
  flagged: number;
  cancelled: number;
  errors: string[];
};

export type WatchDeps = SyncDeps & {
  /** Feed reader; tests replace it, production reads the club website. */
  fetchFeed?: (
    feed: ClubFeed,
    opts: { deadline: number },
  ) => Promise<FetchedFeed>;
};

export function emptyWatchResult(feeds = 0): WatchResult {
  return {
    feeds,
    polled: 0,
    suspects: 0,
    confirmed: 0,
    pending: 0,
    shadowed: 0,
    inserted: 0,
    updated: 0,
    flagged: 0,
    cancelled: 0,
    errors: [],
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

function throwDb(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

type FeedRun = {
  feed: ClubFeed;
  fixtures: ReturnType<typeof watchedFixtures>;
  problems: string[];
  snapshot: Map<number, SnapshotRow>;
  mapped: Map<string, string>;
  suspects: number;
  confirmed: number;
};

/** A suspect merged across the feeds that raised it. */
type MergedSuspect = Suspect & {
  byFeed: Map<string, Suspect>;
};

async function loadSnapshot(
  supabase: SupabaseClient,
  organizationId: string,
  feedId: string,
): Promise<Map<number, SnapshotRow>> {
  const rows = new Map<number, SnapshotRow>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("club_feed_fixtures")
      .select(
        "code, lisa_team_id, fingerprint, pending_fingerprint, checked_at",
      )
      .eq("organization_id", organizationId)
      .eq("feed_id", feedId)
      .order("code")
      .range(from, from + PAGE_SIZE - 1);
    throwDb(error);
    for (const row of data ?? []) {
      rows.set(Number(row.code), {
        code: Number(row.code),
        lisaTeamId: row.lisa_team_id,
        fingerprint: row.fingerprint,
        pendingFingerprint: row.pending_fingerprint,
        checkedAt: row.checked_at,
      });
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadStoredMatches(
  supabase: SupabaseClient,
  organizationId: string,
  codes: number[],
): Promise<Map<number, StoredMatch>> {
  const stored = new Map<number, StoredMatch>();
  for (const chunk of chunks(codes, IN_CHUNK)) {
    const { data, error } = await supabase
      .from("matches")
      .select(
        "external_id, date, start_time, field, cancelled_upstream, home_team",
      )
      .eq("organization_id", organizationId)
      .in("external_id", chunk);
    throwDb(error);
    for (const row of data ?? []) {
      if (row.external_id == null) continue;
      stored.set(Number(row.external_id), {
        externalId: Number(row.external_id),
        date: row.date,
        startTime: row.start_time,
        field: row.field,
        cancelledUpstream: row.cancelled_upstream,
        homeTeam: row.home_team,
      });
    }
  }
  return stored;
}

/**
 * Poll an organization's club feeds, confirm what changed against the Match
 * Center within the run's budget, and apply the answers through the sync's own
 * reconciliation. Returns null when the org watches no feeds. Runs under the
 * sync lease its caller holds (see refreshOrganization).
 */
export async function watchClubFeeds(
  deps: WatchDeps,
  organizationId: string,
): Promise<WatchResult | null> {
  const { supabase, client, now = new Date() } = deps;
  const fetchFeed =
    deps.fetchFeed ??
    ((feed: ClubFeed, opts: { deadline: number }) =>
      fetchClubFeed({ host: feed.host, siteAlias: feed.site_alias }, opts));
  const nowIso = now.toISOString();
  const today = amsterdamDateOf(nowIso);

  const { data: feedRows, error: feedError } = await supabase
    .from("club_feeds")
    .select("*")
    .eq("organization_id", organizationId)
    // Least recently polled first, so a feed the budget did not reach leads.
    .order("last_polled_at", { ascending: true, nullsFirst: true })
    .order("created_at");
  throwDb(feedError);
  const feeds = (feedRows ?? []) as ClubFeed[];
  if (feeds.length === 0) return null;

  const result = emptyWatchResult(feeds.length);

  const { data: trackedRows, error: trackedError } = await supabase
    .from("tracked_teams")
    .select("*")
    .eq("organization_id", organizationId);
  throwDb(trackedError);
  const trackedTeams = (trackedRows ?? []) as TrackedTeam[];
  const trackedById = new Map(trackedTeams.map((team) => [team.id, team]));
  const trackedByHockeyId = new Map(
    trackedTeams.map((team) => [team.hockey_team_id, team]),
  );
  const trackedByName = new Map(
    trackedTeams.map((team) => [team.team_name, team]),
  );

  // 1. Poll. A failing feed is recorded and skipped; the others carry on.
  //    Wall-clock time, not `now`: the budget is about this run's duration.
  const pollDeadline = Date.now() + POLL_BUDGET_MS;
  const runs: FeedRun[] = [];
  const statusUpdates: Array<{
    feed: ClubFeed;
    payload: Record<string, unknown>;
  }> = [];
  for (const feed of feeds) {
    if (
      feed.last_polled_at &&
      now.getTime() - new Date(feed.last_polled_at).getTime() <
        MIN_POLL_INTERVAL_MS
    ) {
      continue;
    }
    if (Date.now() >= pollDeadline) {
      // Not an error of the feed's: its status stays as it was.
      result.errors.push(`${feed.host}: not polled, out of time`);
      continue;
    }
    try {
      const fetched = await fetchFeed(feed, { deadline: pollDeadline });
      runs.push({
        feed,
        fixtures: watchedFixtures(fetched.fixtures, today),
        problems: fetched.problems,
        snapshot: new Map(),
        mapped: new Map(),
        suspects: 0,
        confirmed: 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${feed.host}: ${message}`);
      statusUpdates.push({
        feed,
        payload: {
          last_polled_at: nowIso,
          last_poll_status: "error",
          last_poll_error: message,
          last_suspects: 0,
          last_confirmed: 0,
        },
      });
    }
  }
  result.polled = runs.length;

  if (runs.length > 0) {
    await detectAndConfirm();
  }

  for (const { feed, payload } of statusUpdates) {
    const { error } = await supabase
      .from("club_feeds")
      .update(payload)
      .eq("id", feed.id)
      .eq("organization_id", organizationId);
    if (error) result.errors.push(`${feed.host}: ${error.message}`);
  }
  return result;

  async function detectAndConfirm(): Promise<void> {
    const codes = Array.from(
      new Set(
        runs.flatMap((run) => run.fixtures.map((fixture) => fixture.code)),
      ),
    );
    const stored = await loadStoredMatches(supabase, organizationId, codes);

    const { data: teamRows, error: teamError } = await supabase
      .from("club_feed_teams")
      .select("feed_id, lisa_team_id, tracked_team_id")
      .eq("organization_id", organizationId)
      .in(
        "feed_id",
        runs.map((run) => run.feed.id),
      );
    throwDb(teamError);
    const runByFeed = new Map(runs.map((run) => [run.feed.id, run]));
    for (const row of teamRows ?? []) {
      runByFeed
        .get(row.feed_id)
        ?.mapped.set(row.lisa_team_id, row.tracked_team_id);
    }

    // Mapping changes, written at the end: lisa team → tracked team, or null
    // to drop a mapping a confirmation proved wrong.
    const mappingChanges = new Map<
      string,
      { run: FeedRun; lisaTeamId: string; trackedTeamId: string | null }
    >();
    const remap = (
      run: FeedRun,
      lisaTeamId: string,
      trackedTeamId: string | null,
    ) => {
      const current = run.mapped.get(lisaTeamId) ?? null;
      if (current === trackedTeamId) return;
      if (trackedTeamId === null) run.mapped.delete(lisaTeamId);
      else run.mapped.set(lisaTeamId, trackedTeamId);
      mappingChanges.set(`${run.feed.id}|${lisaTeamId}`, {
        run,
        lisaTeamId,
        trackedTeamId,
      });
    };

    // 2. Detect per feed, then merge: a combined team's match can be raised by
    //    two feeds, and costs one request.
    const merged = new Map<number, MergedSuspect>();
    for (const run of runs) {
      run.snapshot = await loadSnapshot(supabase, organizationId, run.feed.id);

      // Learn mappings from our own data: a code we store whose home team is
      // a tracked team's.
      for (const fixture of run.fixtures) {
        const match = stored.get(fixture.code);
        const team = match ? trackedByName.get(match.homeTeam) : undefined;
        if (team && !run.mapped.has(fixture.lisaTeamId)) {
          remap(run, fixture.lisaTeamId, team.id);
        }
      }

      const mappedTeams = new Set(
        Array.from(run.mapped.entries())
          .filter(([, trackedTeamId]) => trackedById.has(trackedTeamId))
          .map(([lisaTeamId]) => lisaTeamId),
      );
      const detection = detectSuspects({
        fixtures: run.fixtures,
        snapshot: run.snapshot,
        stored,
        mappedTeams,
        now,
      });
      run.snapshot = new Map(detection.snapshot.map((row) => [row.code, row]));
      run.suspects = detection.suspects.length;

      for (const suspect of detection.suspects) {
        const existing = merged.get(suspect.code);
        if (!existing) {
          merged.set(suspect.code, {
            ...suspect,
            byFeed: new Map([[run.feed.id, suspect]]),
          });
          continue;
        }
        existing.byFeed.set(run.feed.id, suspect);
        existing.rules = Array.from(
          new Set<SuspectRule>([...existing.rules, ...suspect.rules]),
        );
        existing.cancelled ||= suspect.cancelled;
        if (suspect.date < existing.date) existing.date = suspect.date;
      }
    }

    const ordered = orderSuspects(
      Array.from(merged.values()),
    ) as MergedSuspect[];
    result.suspects = ordered.length;

    // 3. Confirm, soonest first, within the budget. A throttled request stops
    //    the run: its suspect and the rest stay pending (snapshot not
    //    advanced) and lead the next run.
    const discovery = { client, supabase, pause: deps.pause };
    const toApply: Array<{
      fixture: NormalizedFixture;
      team: TrackedTeam;
      suspect: MergedSuspect;
    }> = [];
    const shadowed: typeof toApply = [];
    let attempted = 0;
    for (const suspect of ordered.slice(0, MAX_CONFIRMATIONS_PER_RUN)) {
      let team: TrackedTeam | undefined;
      let fixture: NormalizedFixture | null = null;
      let answered = false;
      try {
        const match = await fetchMatch(
          discovery,
          suspect.code,
          suspect.rules.includes("changed") ? 0 : CONFIRMATION_TTL_MS,
        );
        answered = true;
        result.confirmed++;
        team = trackedByHockeyId.get(match?.home?.id);
        fixture = team ? homeFixtureOf(match, team, today) : null;
      } catch (error) {
        if (error instanceof HockeyRateLimitError) break;
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Match ${suspect.code}: ${message}`);
        // A timeout, network failure or upstream error says nothing about the
        // match: it and the rest stay pending for the next run. Only a 404 (a
        // withdrawn match id) or a payload we cannot read is recorded as
        // checked — retrying those every run would only burn the budget.
        if (
          !answered &&
          !(error instanceof HockeyHttpError && error.status === 404)
        ) {
          break;
        }
      }
      attempted++;

      const applies = Array.from(suspect.byFeed.keys()).some(
        (feedId) => runByFeed.get(feedId)?.feed.apply_changes,
      );
      for (const [feedId, raised] of suspect.byFeed) {
        const run = runByFeed.get(feedId);
        const row = run?.snapshot.get(suspect.code);
        if (!run || !row) continue;
        run.snapshot.set(
          suspect.code,
          applyConfirmation(row, raised.fingerprint, nowIso),
        );
        run.confirmed++;
        // The Match Center's home team is the truth about a LISA team: a
        // mapping it contradicts is corrected (or dropped, for a team this
        // org does not track). Only answered requests teach anything.
        if (answered) remap(run, raised.lisaTeamId, team?.id ?? null);
      }
      // A code that is another team's home match, or no longer worth
      // syncing, is checked and dropped.
      if (team && fixture)
        (applies ? toApply : shadowed).push({ fixture, team, suspect });
    }
    result.pending = ordered.length - attempted;

    // 4. Apply through the full sync's own rules. `awaitingTime` from these
    //    few fixtures is not the club's count, so it is not reported.
    if (toApply.length > 0) {
      const levelByManagedId = await loadRequiredLevels(
        supabase,
        toApply.map(({ team }) => team),
      );
      const reconciled = await reconcileFixtures(
        supabase,
        organizationId,
        toApply.map(({ fixture, team }) => ({ fixture, team })),
        { today, syncedAt: nowIso, levelByManagedId },
      );
      result.inserted = reconciled.inserted;
      result.updated = reconciled.updated;
      result.flagged = reconciled.flagged;
      result.cancelled = reconciled.cancelled;
      result.errors.push(...reconciled.errors);
    }
    result.shadowed = shadowed.length;
    for (const { fixture, suspect } of shadowed) {
      const match = stored.get(fixture.matchId);
      console.info(
        "[club-feed] shadow",
        JSON.stringify({
          organizationId,
          code: fixture.matchId,
          rules: suspect.rules,
          upstream: {
            start: fixture.timeConfirmed ? fixture.start : null,
            status: fixture.status,
            venue: fixture.venue,
            field: fixture.fieldKnown ? fixture.field : undefined,
          },
          stored: match
            ? {
                date: match.date,
                start: match.startTime,
                field: match.field,
                cancelled: match.cancelledUpstream,
              }
            : null,
        }),
      );
    }

    // 5. Advance the snapshot and mappings, then record each feed's status.
    for (const run of runs) {
      const rows = Array.from(run.snapshot.values()).map((row) => ({
        feed_id: run.feed.id,
        organization_id: organizationId,
        code: row.code,
        lisa_team_id: row.lisaTeamId,
        fingerprint: row.fingerprint,
        pending_fingerprint: row.pendingFingerprint,
        checked_at: row.checkedAt,
        seen_at: nowIso,
      }));
      for (const chunk of chunks(rows, WRITE_CHUNK)) {
        const { error } = await supabase
          .from("club_feed_fixtures")
          .upsert(chunk, { onConflict: "feed_id,code" });
        throwDb(error);
      }
      const { error: pruneError } = await supabase
        .from("club_feed_fixtures")
        .delete()
        .eq("organization_id", organizationId)
        .eq("feed_id", run.feed.id)
        .lt(
          "seen_at",
          new Date(now.getTime() - SNAPSHOT_RETENTION_MS).toISOString(),
        );
      if (pruneError)
        result.errors.push(`${run.feed.host}: ${pruneError.message}`);
    }

    for (const { run, lisaTeamId, trackedTeamId } of mappingChanges.values()) {
      const { error } =
        trackedTeamId === null
          ? await supabase
              .from("club_feed_teams")
              .delete()
              .eq("organization_id", organizationId)
              .eq("feed_id", run.feed.id)
              .eq("lisa_team_id", lisaTeamId)
          : await supabase.from("club_feed_teams").upsert(
              {
                feed_id: run.feed.id,
                organization_id: organizationId,
                lisa_team_id: lisaTeamId,
                tracked_team_id: trackedTeamId,
              },
              { onConflict: "feed_id,lisa_team_id" },
            );
      if (error) result.errors.push(`${run.feed.host}: ${error.message}`);
    }

    for (const run of runs) {
      statusUpdates.push({
        feed: run.feed,
        payload: {
          last_polled_at: nowIso,
          last_poll_status: run.problems.length > 0 ? "partial" : "success",
          last_poll_error: run.problems[0] ?? null,
          last_suspects: run.suspects,
          last_confirmed: run.confirmed,
        },
      });
    }
  }
}
