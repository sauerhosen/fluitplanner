# Hockey.nl match sync

Fluitplanner can pull a club's fixtures straight from the Hockey.nl Match Center instead of
having the planner import a spreadsheet every few weeks. A planner picks which teams to
follow; a nightly cron job imports their future home matches, updates the ones that moved,
and flags what a human needs to look at.

The upstream API itself is documented separately in
[`hockey-match-center-api.md`](hockey-match-center-api.md) — it is unofficial and
reverse-engineered. This document describes what Fluitplanner does with it.

## What a planner sees

**Settings → tracked teams** (`components/settings/hockey-sync-settings.tsx` and
`hockey-team-picker-dialog.tsx`). Search a club, pick teams, and they are tracked. This
section is the tracked-team list only — it shows no run history.

Tracking a team also creates (or reuses) a **managed team** with the same (trimmed) name,
and stores the link as `tracked_teams.managed_team_id`. The name matching happens once, at
tracking time; from then on the sync reads `required_level` through that foreign key
(defaulting to 1), so a synced match gets the same required level a hand-imported one would.
Untracking removes only the tracking config — the matches and the managed team stay.

**Matches page.** This is where the sync's state surfaces: a "sync now" button with the
relative time of the last run and a count of fixtures still awaiting a kick-off time
(`components/matches/sync-now-button.tsx`). The per-run counts — inserted, updated, flagged
— appear only in the toast that follows a manual sync; they are not displayed persistently
anywhere. Synced matches carry `source = "hockey_sync"`. A match the sync changed
underneath the planner is flagged `needs_review` with one or more `review_reasons`
(`date_changed`, `time_changed`, `venue_changed`, `cancelled`); the planner clears the flag
once they have dealt with it (`clearMatchReviewFlags`). Upstream cancellations also set
`cancelled_upstream`, which stays set after the flag is cleared so the row keeps its
cancelled styling until the planner deletes it.

**Matches page → "…" → Import from Match Center.** A one-off import for a team the club
does _not_ track — the odd fixture the nightly sync will never see
(`components/matches/match-center-import-dialog.tsx`). The planner searches a club, picks a
team, and ticks individual fixtures; nothing is subscribed. After picking a club, "All home
matches on a day…" lists every field team's home match on one chosen date instead
(`getClubDayFixtures` / `importClubDayFixtures`): the Match Center has no per-club or per-day
listing, and one poule request per team trips its rate limit, so it reads the day's match list
of the club's venues instead — inferred from facility names, else the club's city, at most
five (`pickClubFacilities`) — keeps the club's own field home matches, and fails as a whole if
one venue cannot be loaded. Details in [Importing single matches](#importing-single-matches).

**On demand.** `syncNow()` (`lib/actions/hockey-sync.ts`) runs the same engine for the
current club, behind a **15-minute cooldown**. The cooldown is a returned status rather than
a thrown error, because Next.js replaces server-action error messages with a generic digest
in production. The MCP `trigger_sync` tool runs the same engine behind the same 15-minute window, though
it calls `syncWithLease()` directly rather than going through `syncNow()` (and spells the
cooldown constant out again — keep the two in step).

## Importing single matches

`lib/actions/hockey-import.ts` serves the matches page dialog with four planner-gated
actions, two per way of picking. Each pair is a list action, whose fixtures are flagged
`alreadyImported` (with that row's `existingMatchId`) when this club already has a row an
import would update — by `external_id`, or by the natural key below — and an import action
that writes the picked ids. The client sends **ids only**; the import action re-reads
the fixtures server-side and imports only ids found in that fresh list, rather than trusting
what the browser posts back.

**By team** — `getTeamFixtures()` / `importTeamFixtures()`. Both resolve the team's current
poule through `fetchClubDetail` (so a season rollover needs no extra handling) and read its
fixtures through the same cached `fetchTeamPoule` the sync uses.

**By day** — `getClubDayFixtures()` / `importClubDayFixtures()`. These skip the poule path
entirely, since one poule request per team trips the Match Center's rate limit for a club with
dozens of teams. Instead:

- `fetchAllClubs` finds the club, and `pickClubFacilities` picks its venues from
  `fetchAllFacilities`: facilities whose name carries the club's core name (prefixes like
  "MHC" / "H.C." stripped), else those in the club's city. It keeps **at most five**, ordering
  name matches in the club's own city first
- `fetchFacilityMatches` reads each venue's match list for the day, in parallel. A match with
  no location gets the facility's name as its venue
- `collectClubDayFixtures` keeps the club's own field (`VE`) **home** matches on that date,
  with the same status filters as the by-team list, and duplicates are dropped by match id
- A date before today returns an empty list without calling upstream. This also absorbs the
  partial years a date input emits while the planner types one. A date that isn't a real
  calendar day throws `INVALID_DATE`
- If one venue cannot be loaded, the whole load fails. A partial list would read as "that's
  everything"

`collectImportableFixtures()` (`lib/hockey/import.ts`) decides what is on offer: the team's
own **home** fixtures, from today on, minus the played/live/unusable statuses and minus
cancellations. It differs from the nightly sync on one point — a fixture still **awaiting a
kick-off time** is offered, and imported with a null `start_time`, because a deliberate pick
is not the same as an unattended import.

Each picked fixture is inserted with `source = "hockey_sync"` and its `external_id`, at the
`required_level` of the managed team whose name matches the home team (exact match, as a
file import does; 1 otherwise). A row that already exists — by `external_id`, or by the
natural key `date | home_team | away_team`, which adopts a match the planner added by hand —
is updated in place instead of duplicated, and one that already matches upstream is skipped.
An import never sets `needs_review`, never overwrites `required_level`, and never clears a
`start_time` that is already on the row (a fixture still awaiting its time upstream keeps the
one the planner typed in): the planner asked for this row, so nothing about it is retracted
behind their back.

Because the team is not tracked, the nightly run does not revisit these matches — importing
the same fixture again is how one picks up a kick-off time that was still TBD, which is why
a fixture the club already has starts **ticked** (and green) in the dialog and is re-read on
every import from that list; with only such ticks the button reads "Update". Unticking one
deletes the match (`deleteMatch`), after a confirmation. The rows carry
`source = "hockey_sync"`, so a later file import may only adjust their `required_level`
(`lib/actions/matches.ts` treats the Match Center as the authority on sync-owned rows):
correct them here, in the match editor, or by tracking the team.

## The nightly run

`vercel.json` schedules `GET /api/cron/hockey-sync` at **04:30 UTC** daily. The route:

1. Authenticates on `CRON_SECRET` as a bearer token (the proxy skips `/api/cron/*` entirely, so the route is on its own here)
2. Collects every organization that has tracked teams, paging `tracked_teams` 1000 rows at a time
3. Orders them **last run failed first, then stalest first**. A club whose last run was not a `success` (or that never completed one) leads; within each group the oldest `last_synced_at` goes first. Staleness alone is not enough: a club whose teams were throttled still gets tonight's `last_synced_at`, and only its `partial` / `error` status says it lost out
4. Syncs them **sequentially** with a jitter pause between upstream fetches — low request volume, and the shared cache dedupes teams several clubs follow
5. Skips any club synced within the last **6 hours** (e.g. one that just ran a manual sync)
6. Sets a **deadline 240 s** into the run: the Match Center client may wait out rate limits only while the wait ends before it (see [Rate limiting](#rate-limiting)), and no further club is started after it — those report `skipped: true` and, left unsynced, sort as stalest next night. The last minute of `maxDuration` is headroom for the work already under way

`maxDuration` is 300s. Results are returned per organization; a club whose slot could not be
claimed reports `skipped: true`.

## Concurrency: cooldown + lease

Manual syncs, cron runs, and MCP `trigger_sync` can all fire at once, so `claimSyncSlot()`
(`lib/hockey/sync.ts`) gates every run with two layers on `hockey_sync_state`:

- **Cooldown** — `last_synced_at` within the caller's window means no claim. Only the final
  state upsert advances `last_synced_at`, so a run that throws mid-way does not count as a
  completed sync.
- **Lease** — `sync_claimed_until` is advanced into the future by a single conditional
  update. Concurrent callers serialize on the row lock and exactly one wins; a crashed run's
  lease self-expires after 10 minutes.

The cooldown is checked twice — cheaply before claiming, then again under the lease, which
closes the race where a stale pre-check claims a slot another run just released. Releasing
is fenced by the lease token, so a run that outlived its lease cannot clear a newer
claimant's. `syncWithLease()` wraps claim → sync → release so no call site has to get this
right on its own.

## The sync engine

`syncOrganizationMatches()` walks one club's tracked teams (capped at **50**; beyond that it
reports truncation rather than silently dropping teams), **least recently fetched first** —
ordered by the `fetched_at` of each team's cached poule, never-fetched teams first, ties in
tracking order. A club's detail is loaded once, on its first team; a club that fails is
reported once and its teams are skipped. Per team, it:

- Follows the upstream `recent_poule_id`, updating the stored one — this is how a season rollover is picked up automatically
- Reads the poule's matches and keeps only **home** matches of the tracked team
- Skips matches that are `final`, `result`, `live`, `expired` or `unknown` — already played or unusable
- Skips past matches, **except** cancellations (`cancelled` or `discontinued`), which must still flag an imported row even when observed after match day

Then, per fixture:

| Situation                                     | What happens                                                                                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New fixture, time confirmed                   | Inserted with `source = "hockey_sync"`                                                                                                                            |
| Known fixture, date/time/venue/field changed  | Updated in place, `needs_review = true`, reasons merged. A field change reports as `venue_changed` — there is no separate reason                                  |
| Known fixture, competition renamed only       | Updated silently — cosmetic, no review                                                                                                                            |
| Time retracted upstream (back to "announced") | `start_time` cleared **and** flagged, so nobody staffs a withdrawn time. Matched by `external_id` only, so a hand-imported row the sync has not adopted is missed |
| Cancelled upstream                            | `cancelled_upstream = true` + flagged. Never deleted                                                                                                              |
| Unchanged                                     | Only `last_synced_at` is touched                                                                                                                                  |

Matching an upstream fixture to an existing row goes by `external_id` first, then by the
natural key `date | home_team | away_team`. The natural key is what lets the sync **adopt**
matches the planner imported by hand earlier, and re-adopt a fixture the upstream reissued
under a new match id. `required_level` is deliberately never overwritten — a planner may
have adjusted it after import.

A run never deletes anything. The result (`inserted` / `updated` / `flagged` / `cancelled` /
`awaitingTime` / `errors`) is returned in full but only partly persisted to
`hockey_sync_state`: `cancelled` is folded into `last_flagged`, and only the _first_ error is
kept, as `last_sync_error`. Status is `success` with no errors, `error` when **no tracked
team** yielded fixtures (a failed club detail, a team missing upstream, no current poule, or a
failed poule fetch each count every team they cost), and `partial` otherwise — including a run
where every team was read but a single match write failed. Errors themselves are one flat
list: a truncation warning, a club fetch failure and a match's update error all land in it,
and one club failure is a single message however many teams it cost.

**"Awaiting time"** is an upstream convention: an `announced` match at local midnight means
the date is set but the kick-off time is not (see the API doc §12). Such a fixture is never
imported, and is counted in `awaiting_time_count` until a real time appears — but where it
corresponds to a row that already _has_ a time, that is a retraction, handled as the table
above describes.

## Upstream access

- `lib/hockey/client.ts` — registers an anonymous device on first use, signs every request, re-registers once on a 401. Concurrent requests share one registration (cold start or a parallel batch of 401s), so a parallel batch never registers several devices. **Never log the device uuid or token** — the pair is an access credential.
- `lib/hockey/signature.ts` — the request-signing algorithm (API doc §5.3), kept pure and unit-tested.
- `lib/hockey/credential-store.ts` — the single global device credential in `hockey_device_credentials` (one row, service-role only).
- `lib/hockey/cache.ts` + `discovery.ts` — a read-through cache in `hockey_api_cache`, shared across clubs and surviving function invocations. TTLs: clubs 24h, facilities 24h, club detail 6h, poule+team 15 min (**2h** when read by the sync), a facility's matches for a day 15 min.

### Rate limiting

The Match Center allows about **five requests a minute** (`x-ratelimit-limit: 5`; device
registration counts too) and answers the rest with `429 "Too Many Attempts."` plus
`Retry-After`. A sync costs one request per club detail and one per tracked team, so a club
with a dozen teams cannot be synced inside one window. Three things keep it working:

- **Waiting** — `createHockeyClient({ rateLimitDeadline })` waits out a 429 (`Retry-After`,
  else `X-RateLimit-Reset`, else 60 s) and retries — device registration included — as long
  as the wait ends before the deadline. Only the cron sets one; manual sync, MCP
  `trigger_sync` and the import dialog leave it unset and fail fast, since an interactive
  request cannot hang for minutes.
- **No doomed requests** — the client remembers until when it is throttled. A request in that
  window that may not wait it out fails locally with the same `Too Many Attempts.` message
  (and a `not sent` log line) instead of spending a call upstream is certain to refuse.
- **Stalest first** — a throttled run's missed teams sort to the front of the next one, so
  repeated manual syncs work through the whole list instead of refetching the same leaders.
- **A 2-hour poule TTL for the sync** — longer than the 15-minute manual cooldown, so a
  repeated "sync now" spends its budget on teams it has not reached yet. The trade-off: an
  upstream change to a team fetched under two hours ago is picked up by a later sync, not the
  next one. The import dialog keeps the 15-minute TTL.

Everything upstream-facing runs on the **service-role client** (`lib/hockey/deps.ts`), since
the sync also runs outside any request context. Org-scoped queries still filter on
`organization_id` explicitly.

## Schema

Migration `supabase/migrations/20260815000001_hockey_sync.sql`:

| Table                       | Purpose                                                      | RLS                                          |
| --------------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| `hockey_device_credentials` | The one global anonymous device credential                   | Enabled with no policies — service role only |
| `hockey_api_cache`          | Org-agnostic upstream response cache                         | Enabled with no policies — service role only |
| `tracked_teams`             | Per-club team subscriptions, linked to a `managed_teams` row | Members read; planners write                 |
| `hockey_sync_state`         | Per-club last run, counters, and the run lease               | Members read; all writes via service client  |

Plus, on `matches`: `external_id`, `source`, `cancelled_upstream`, `needs_review`,
`review_reasons`, `last_synced_at`, and a **partial** unique index on
`(organization_id, external_id) WHERE external_id IS NOT NULL` — the predicate matters, since
hand-created matches have a null `external_id`.

## Tests

`__tests__/lib/hockey/import.test.ts` and `__tests__/lib/actions/hockey-import.test.ts`
cover the one-off import (what is on offer, and the insert/adopt/skip branches);
`components/matches/__tests__/match-center-import-dialog.test.tsx` covers the dialog.
`__tests__/lib/hockey/` covers the signing algorithm (`signature.test.ts`), the signed
transport and its re-registration on 401 (`client.test.ts`), normalisation including the
midnight/"awaiting time" rule (`normalize.test.ts`), and the claim/release lease protocol
plus the sync engine's insert/update/flag/cancel branches against a fake client
(`sync.test.ts`). `__tests__/app/api/cron/hockey-sync.test.ts` covers the cron route.
