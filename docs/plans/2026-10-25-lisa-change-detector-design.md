# LISA change detector — design

**Status:** phases 1–3 built (refactor, feeds + detector, all three triggers). Writes
start in shadow mode: `club_feeds.apply_changes` defaults to false and is flipped per feed.
Phase 0 (cadence measurement) and phase 4 (page-visit trigger) are not started. How much
"sync now" gains depends on the cadence measurement in [Phase 0](#rollout); the nightly path
does not. The current behaviour is documented in [`docs/hockey-sync.md`](../hockey-sync.md).
**Builds on:** the Hockey.nl sync (`docs/hockey-sync.md`), whose engine and review flags it
reuses unchanged.

## Problem

The Match Center allows about five requests a minute, so the sync is built around spending as
few of them as possible: a nightly run, a 2h/20h cache, and a venue sweep that still needs one
poule request per team for pitches and anything beyond four weeks. The result is that an
upstream change — a moved kick-off, a new pitch, a cancellation — reaches Fluitplanner at the
next nightly run, up to a day later, unless a planner presses "sync now" and is lucky with the
budget.

Most of those requests are spent confirming that nothing changed. If something else could tell
us _which_ matches changed, the Match Center budget could go to exactly those.

## What we found

Clubs whose website says "Powered by LISA" (VVV, AMVJ, Myra, Kampong, Pinoké, LOHC, HVZ,
Forescate, Hurley, Druten — checked 2026-10-25) run a Duda site into which LISA, the KNHB club
administration system, exports the club's whole programme. The schedule widget reads it from
the club's own domain as plain JSON:

```text
GET https://www.hockeyclubvvv.nl/rts/collections/public/d8ca7649/runtime/collection/matches_nov_2026/query-data
    ?pageSize=100&pageNumber=0&query=%28%29&language=DUTCH
```

- **No auth, no signing, no throttling seen** (30 back-to-back requests, all 200, ~0.33s, often
  served from Duda's CDN cache). The WAF rejects a missing `User-Agent` and library defaults
  like `Python-urllib` with a 403, but accepts one that names us. On 2026-10-25,
  `Fluitplanner/1.0 (+https://fluitplanner.nl)` got a 200 on the page, the index and a month
  collection at VVV, AMVJ and Myra, as did Node's default `fetch`.
- **Site alias** (`d8ca7649`) is `window.Parameters.SiteAlias` in the page HTML.
- **Layout**: an index collection `Toekomstige_wedstrijden` lists dates and the monthly
  collection holding each (`matches_oct_2026`, …). Pages hold at most 100 rows; a club's whole
  season is ~10 requests. The index sometimes names months that 404 (VVV May/June, AMVJ
  April/June, Myra March/April), and a month collection can hold the previous month's last
  days.
- **`code` is the Match Center match id** — our `external_id`. Verified on seven matches.
- Team and pitch names are **club-local** (`H2` for `VVV HC H2-O`, `Water 1` for the federation's
  `Veld 1`), so rows can only be matched on `code`, and LISA's pitch can never be written as ours.
- **Not earlier than the Match Center.** In every spot check, a fixture timed in LISA was timed
  in the Match Center and an untimed one was untimed in both. LISA is not a better _source_; it
  is a cheaper _signal_.
- **LISA re-exports during the day, at an unknown cadence.** Saturday's scores were present on
  Sunday morning. On Sunday 2026-10-25 both the VVV and AMVJ feeds changed between 08:59 and
  09:04 UTC; in VVV's, the change was the score of a match played that morning. Whether exports
  run on a timer or on every edit is not known yet.
- **Reliability is uneven.** Kampong's schedule page currently carries "Check hier Match Center
  ivm storing LISA". The design must degrade to today's behaviour when a feed is stale or gone.
- A combined team (`AMVJ/VVV HC JO12-1`) can appear in either club's feed, so one Fluitplanner
  club may need more than one feed.

## Shape of the fix

Use the LISA feed as a **change detector**, never as a source of truth:

1. **Poll** each of a club's LISA feeds whenever a refresh runs — nightly, on "sync now", and
   on a stale page visit (see [Triggers](#triggers)). It is cheap and unthrottled.
2. **Diff** each home fixture against what we saw last time and against what we stored.
3. **Confirm** every suspect with one `GET /matches/{id}` against the Match Center.
4. **Apply** the Match Center's answer through the existing reconciliation (insert, update and
   flag, retract time, cancel) — the same code, flags and guarantees as the nightly sync.

Nothing read from LISA is written to `matches`. LISA only decides _which_ matches to ask the
Match Center about, and _when_. A wrong, stale or missing feed costs at most some wasted
requests or a missed early warning; the nightly sync stays as the safety net.

```text
LISA feed (per club site)          Match Center                Fluitplanner
  poll ~10 req, unthrottled  ──►   GET /matches/{code}  ──►   reconcileFixtures()
  diff vs snapshot + matches       (only for suspects,         (existing rules:
  → suspects                        budgeted, soonest first)    insert/flag/retract/cancel)
```

`/matches/{id}` returns a superset of `ApiMatchSummary` (`id`, `date`, `status`, `home.id`,
`competition_name`, and `location` **with** the field — which facility lists omit), so
`normalizeMatch()` takes it as is. One request yields a complete fixture, pitch included.

## Detection rules

Per poll, per feed, for every row with a numeric `code`, `is_home_match = true`, and a date from
today on (or any date, when `is_cancelled`):

| Rule              | Suspect when                                                                                       | Catches                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Changed**       | The row's fingerprint differs from the snapshot's                                                  | Moved date/time, new or changed pitch, cancellation       |
| **Drift**         | The code is in `matches` and LISA's date, time or cancellation disagrees with the stored row       | Changes the nightly run missed; the first poll of a feed  |
| **New**           | The code is not in `matches`, LISA has a time, and the row's LISA team is mapped to a tracked team | A newly timed fixture, imported before the nightly run    |
| **Pitch fill-in** | The code is in `matches` with no `field`, and LISA has a pitch                                     | The MO14-1 case: pitch published, our top-up not yet read |

The **fingerprint** is a hash of `date`, `time`, `field`, `is_cancelled` and `location.name`,
with strings trimmed and `""` read as null. Rows without a `code` (trainings, "Mini's",
pitch reservations, friendlies) and away rows are ignored.

**The snapshot advances only after confirmation.** A row's stored fingerprint is replaced
by the new one only once the Match Center has been asked about that match (whatever it
answered). A suspect left over from a run with no budget left is therefore still a suspect
next run: nothing is lost, it just waits. To stop a permanent LISA/Match Center disagreement
from burning the budget forever, a **drift-only** suspect (fingerprint unchanged) is
re-checked at most once every 6 hours (`checked_at`).

**First poll of a feed** writes the snapshot as a baseline without treating every row as
changed; only the drift, new and pitch fill-in rules fire. Otherwise adding a feed would
queue the whole season.

### Mapping LISA teams to tracked teams

A LISA row carries `team_id`, the club's own team, stable per team (except one catch-all id
used for non-federation events, which never has a `code`). It is mapped to a tracked team
in two ways, stored per feed:

- **From our data**: a row whose `code` equals a `matches.external_id` whose `home_team` is a
  tracked team's `team_name`.
- **From a confirmation**: the Match Center's `home.id` for a confirmed code equals a tracked
  team's `hockey_team_id`. If it names a different team, the mapping is corrected.

An unmapped LISA team's fixtures only ever trigger drift and pitch fill-in (codes we already
store), never "new": a club with ~100 teams and 9 tracked must not spend requests on the
other 91. Cost: a tracked team's first match is still imported by the full sync, which then
maps the team.

### Confirmation budget

Suspects are confirmed in order: cancellations, then soonest match date, then rule order
above. Each run confirms at most **`MAX_CONFIRMATIONS_PER_RUN = 4`**, keeping one request of
the per-minute budget for anything else sharing it. In the nightly run the detector shares the
cron's `rateLimitDeadline` and may wait one window for a few more; "sync now", MCP
`trigger_sync` and page visits fail fast on a 429, as interactive callers do today. Confirmations go through `getCachedJson` under `match:{id}` with a
**10-minute** TTL, so two orgs watching the same combined team's match share the answer.

A confirmed fixture is applied only if `home.id` is a tracked team of this org — the same
filter `homeFixture()` applies today. A code that turns out to be another team's home match
is recorded as checked and dropped.

## Reconciliation refactor

Today the per-fixture logic — insert, compare, flag, retract a withdrawn time, mark a
cancellation, touch `last_synced_at` — lives inline in `syncOrganizationMatches()`
(`lib/hockey/sync.ts`, from "importable" to the unchanged-ids update). Extract it unchanged
into:

```ts
export async function reconcileFixtures(
  supabase: SupabaseClient,
  organizationId: string,
  entries: Array<{ fixture: NormalizedFixture; team: TrackedTeam }>,
  opts: {
    today: string;
    syncedAt: string;
    levelByManagedId: Map<string, 1 | 2 | 3>;
  },
): Promise<
  Pick<
    SyncResult,
    "inserted" | "updated" | "flagged" | "cancelled" | "awaitingTime" | "errors"
  >
>;
```

The full sync calls it with its merged sweep + poule fixtures. The detector calls it with
the confirmed fixtures only. One difference is deliberate: the detector passes only the
matches it confirmed, so `awaitingTime` from a detector run is not written to
`awaiting_time_count`. That count stays the full sync's to set.

This refactor ships first and on its own, covered by the existing `sync.test.ts`. It has
value without the rest.

## Schema

One migration, three tables, all service-role-written like `hockey_sync_state`.

```sql
-- A club website whose LISA export a Fluitplanner club watches. Several per org:
-- VVV needs AMVJ's site for the combined youth teams.
create table public.club_feeds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  host text not null,                 -- www.hockeyclubvvv.nl
  site_alias text not null,           -- d8ca7649
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  last_polled_at timestamptz,
  last_poll_status text check (last_poll_status in ('success', 'partial', 'error')),
  last_poll_error text,
  last_suspects integer not null default 0,
  last_confirmed integer not null default 0,
  unique (organization_id, host)
);

-- Last seen state of each home fixture in a feed.
create table public.club_feed_fixtures (
  feed_id uuid not null references public.club_feeds(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code bigint not null,               -- = matches.external_id
  lisa_team_id text not null,
  fingerprint text not null,          -- advanced only after confirmation
  pending_fingerprint text,           -- seen but not yet confirmed
  checked_at timestamptz,             -- last Match Center confirmation
  seen_at timestamptz not null,
  primary key (feed_id, code)
);

-- LISA team → tracked team, learned (see "Mapping").
create table public.club_feed_teams (
  feed_id uuid not null references public.club_feeds(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lisa_team_id text not null,
  tracked_team_id uuid not null references public.tracked_teams(id) on delete cascade,
  primary key (feed_id, lisa_team_id)
);
```

RLS: `club_feeds` readable by members, written through planner-gated server actions on the
service client; the other two enabled with no policies (service role only), like
`hockey_api_cache`. Every query filters on `organization_id` explicitly.

Deliberately **not** stored: `referees`, `club_remarks`, `standings`, team or person names.
AMVJ and Myra publish umpire names in `referees`. We have no need for them in this design,
and not storing them keeps it out of personal-data territory. (Reading `referees` is a
separate idea, option 3 of the research, and deserves its own design.)

## Modules

| File                                | What                                                                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/club-feed/fetch.ts`            | `resolveClubFeed(url)` (page → host + alias, verifies the `Toekomstige_wedstrijden` binding) and `fetchClubFeed(feed)` (index + months, all pages)                                      |
| `lib/club-feed/parse.ts`            | Pure: raw rows → `FeedFixture { code, lisaTeamId, date, time, field, cancelled, isHome, venue }`, fingerprinting. Unit-tested on captured responses                                     |
| `lib/club-feed/detect.ts`           | Pure: feed fixtures + snapshot + stored matches + mappings → ordered suspects with their rule                                                                                           |
| `lib/club-feed/watch.ts`            | `watchClubFeeds(deps, orgId)` — poll its feeds, detect, confirm within budget, `reconcileFixtures()`, advance snapshot and mappings, record status. Runs under a lease its caller holds |
| `lib/hockey/refresh.ts`             | `refreshOrganization(deps, orgId, { fullSyncWindowMs })` — the one entry point for every trigger (see [Triggers](#triggers))                                                            |
| `lib/hockey/sync.ts`                | `reconcileFixtures()` extracted (see above)                                                                                                                                             |
| `lib/hockey/discovery.ts`           | `fetchMatch(deps, id, ttlMs)` through the cache                                                                                                                                         |
| `app/api/cron/hockey-sync/route.ts` | Existing nightly route, same org selection and ordering; calls `refreshOrganization()` per org instead of `syncWithLease()`                                                             |
| `lib/actions/hockey-sync.ts`        | `syncNow()` calls `refreshOrganization()`; `SyncNowResult` reports detector and full-sync results separately                                                                            |
| `lib/mcp/data.ts`                   | `trigger_sync` calls `refreshOrganization()` too, which also retires its copy of the 15-minute cooldown constant                                                                        |
| `app/protected/matches/page.tsx`    | Phase 4: `after(() => refreshOrganization(…, { fullSyncWindowMs: Infinity }))` when the last poll is stale                                                                              |
| `lib/actions/club-feeds.ts`         | `addClubFeed(url)`, `removeClubFeed(id)` — `requirePlanner()`                                                                                                                           |

**Fetching club pages** is the one place we request a URL a planner typed, so `resolveClubFeed`
accepts only `https:` URLs with a DNS host name (no IP literals, no ports, no
`localhost`/`.local`). It follows no redirects to another host, caps the response size, and
after that only ever requests `https://{host}/rts/collections/public/{alias}/…`. Every
request — page and feed — sends `User-Agent: Fluitplanner/1.0 (+https://fluitplanner.nl)`,
set explicitly rather than left to the runtime's default, and times out after 10s.

**Feed completeness** is reported, never acted on. A month in the index that 404s, or a page
that fails, makes the poll `partial`. But absence never _means_ anything here: a fixture
missing from LISA is not suspect, so a broken export can only make us miss warnings, never
cancel or change a match.

## Triggers

Vercel cron runs at most **once a day** on our plan, so there is no separate detector
schedule. The detector runs wherever a refresh already happens, always **before** the full
sync, through one function:

```ts
/** Detector, then — outside its cooldown — the full sync, under one lease. */
export async function refreshOrganization(
  deps: SyncDeps,
  organizationId: string,
  opts: { fullSyncWindowMs: number },
): Promise<
  | { status: "busy" }
  | {
      status: "refreshed";
      detector: WatchResult | null;
      sync: SyncResult | null;
    }
>;
```

It claims the lease with `claimSyncSlot(supabase, orgId, 0)`: a zero window skips the cooldown
and keeps the atomic lease, so no two refreshes of one org overlap. Under the lease it runs
`watchClubFeeds()` if the org has feeds (`detector: null` if not), then re-reads
`last_synced_at` and runs `syncOrganizationMatches()` only if that is older than
`fullSyncWindowMs` (`sync: null` if not). Only the full sync advances `last_synced_at` —
it stays "last full sync", which the cron ordering and its 6h skip rely on. The detector
keeps its own `club_feeds.last_polled_at`. `busy` replaces today's `null`: another refresh
holds the lease.

Detector first, because it is cheap and spends its Match Center budget on matches that
actually changed. If the full sync then runs out of budget, the important changes have
already landed.

| Trigger                         | `fullSyncWindowMs` | Detector's value                                                                                                    |
| ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Nightly cron (04:30 UTC)        | 6h (as today)      | Modest: the full sync runs anyway. Adds pitch fill-ins, changes the sweep missed, newly timed fixtures past 4 weeks |
| "Sync now" / MCP `trigger_sync` | 15 min (as today)  | The main one: changes land in seconds, and the button does something useful even inside the cooldown                |
| Matches page visit (phase 4)    | `Infinity` (never) | Picks up changes during the day while a planner is looking, at no scheduler cost                                    |

**"Sync now" no longer hits a wall.** Today a press within 15 minutes of the last sync
returns `cooldown` and does nothing. With a feed, the same press runs the detector and returns
`refreshed` with `sync: null`. The toast reports what the detector found ("2 changes
checked, 1 updated"); the cooldown message appears only when the detector found nothing to
check. Repeated presses are cheap: LISA is unthrottled, and the snapshot only produces
suspects for rows that changed, so a second press seconds later spends no Match Center
requests. To be polite to the club sites, a poll is skipped if the feed was polled less than
**2 minutes** ago.

**Page visits** run the detector only, in `after()` so the page does not wait. Only when
`club_feeds.last_polled_at` is older than **60 minutes**, and only for planners (viewers
don't trigger upstream work). A busy lease or a failure is silent, since the page has
already rendered. Changes show up on the next navigation or refresh.

**How much the daytime triggers gain depends on LISA's cadence.** The nightly path only needs
LISA to export at least once a day, which it does. "Sync now" and page visits can only find
changes LISA has already exported, so they are worth as much as LISA is fresh. One
data point so far: a score from a Sunday-morning match was in the feed by 09:04 UTC the same
morning (see "What we found"). Phase 0 measures it properly. If LISA turns out to export often, an hourly
Supabase `pg_cron` + `pg_net` job calling the cron route with `CRON_SECRET` is a cheap way to
add a schedule later without a Vercel plan change. Not part of this design.

## What a planner sees

- **Settings → tracked teams** gets a "Club websites" list: add a club site URL, see each
  feed's last poll time and status. Most clubs add their own site; VVV also adds AMVJ's.
- **Matches page**: changes arrive as they do today — updated rows, `needs_review` with the
  same `review_reasons` — but within seconds of pressing "sync now", which now works inside
  the 15-minute cooldown too. The button's "last synced" line gains the last LISA poll.
- **MCP `get_sync_status`** gains the feeds' last poll and counts.

## Failure modes

| Situation                                     | Effect                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| LISA export stale (Kampong's "storing LISA")  | No suspects. Back to today's nightly behaviour, nothing wrong is written        |
| Club leaves LISA / Duda changes the API       | Poll errors, shown in Settings; nightly sync unaffected                         |
| LISA disagrees with the Match Center          | The Match Center wins; drift-only suspects back off to one check per 6h         |
| Match Center throttles                        | Unconfirmed suspects stay pending (snapshot not advanced) and lead the next run |
| A suspect is another team's home match        | Recorded as checked, dropped; mapping corrected if it came from LISA            |
| Burst of real changes (rain, mass reschedule) | Soonest matches first; the rest over the following runs and the nightly sync    |
| LISA exports only nightly after all           | "Sync now" finds little during the day; the nightly path is unaffected          |

## Alternatives considered

- **Run the existing sync more often.** Not possible on a once-a-day cron, and expensive even
  with a scheduler: each run costs a venue sweep plus poule top-ups, so the cost grows with
  tracked teams × orgs × runs, and the sweep still lacks pitches. The detector's cost grows
  with the number of _changes_.
- **A separate detector cron.** Needs more than one cron a day. Running the detector inside the
  refreshes that already happen gets most of the value without one.
- **Use LISA as the source** (write its times and pitches). Rejected: LISA never led the Match
  Center in our checks, its names are club-local, and its export is the less reliable of the
  two. Two writers to `matches` would also mean two sets of rules.
- **Conditional requests to the Match Center.** A 304 still counts against the limit
  (verified 2026-10-24, `docs/hockey-sync.md`).

## Rollout

0. **Measure.** Sample the VVV, AMVJ and Myra feeds every 15 minutes for a week, across a match
   weekend, and record when time, pitch and cancellation changes appear (not only scores).
   This doesn't block the work. It sets expectations for "sync now", decides whether phase 4
   is worth building, and decides whether a `pg_cron` schedule is ever worth adding.
1. **`reconcileFixtures()` refactor** — no behaviour change.
2. **Feeds + detector in shadow mode**, nightly only: `refreshOrganization()` in the cron route,
   but the detector logs what it would apply instead of calling `reconcileFixtures()`. One
   week. Count suspects, how many the Match Center confirmed as real changes, and requests
   spent.
3. **Writes on**, VVV first: the nightly run, "sync now" and MCP `trigger_sync`, together,
   since they share `refreshOrganization()`.
4. **Page-visit trigger**, if Phase 0 shows LISA exports during the day often enough to matter.
5. **Later, separately**: with a healthy feed covering every tracked team, lengthen the poule
   top-up TTL (weekly instead of nightly), freeing more of the budget.

## Testing

- `parse.test.ts` / `detect.test.ts` — pure, on response fixtures captured from the three
  feeds, with `referees`, names and logos stripped before they are committed. Cover: the
  stale-index 404, month overlap, empty-string pitch, the catch-all `team_id`, combined teams
  in two feeds, first-poll baseline, snapshot not advancing without confirmation, drift
  backoff.
- `watch.test.ts` — against a fake Match Center client and fake feed fetcher. Budget and
  ordering, the lease, a throttled confirmation leaving the suspect pending, a code belonging
  to an untracked team.
- `refresh.test.ts` — the lease is held across both steps; the full sync is skipped inside
  its window while the detector still runs; `busy` when the lease is taken; an org without
  feeds behaves exactly as today.
- `sync.test.ts` — unchanged, guarding the refactor.
- `__tests__/app/api/cron/hockey-sync.test.ts` and the `syncNow()` / `trigger_sync` tests —
  updated for `refreshOrganization()` and the new result shape.

## Open questions

- **LISA re-export cadence** — on a timer, or on every edit? Phase 0. It decides what "sync
  now" can promise and whether phase 4 is built.
- **Discovery** — should adding a tracked team offer the club's LISA site automatically?
  Federation club records don't carry a website URL as far as we know, so for now the planner
  types it.
