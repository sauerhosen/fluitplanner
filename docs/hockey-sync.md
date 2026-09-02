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

**On demand.** `syncNow()` (`lib/actions/hockey-sync.ts`) runs the same engine for the
current club, behind a **15-minute cooldown**. The cooldown is a returned status rather than
a thrown error, because Next.js replaces server-action error messages with a generic digest
in production. The MCP `trigger_sync` tool runs the same engine behind the same 15-minute window, though
it calls `syncWithLease()` directly rather than going through `syncNow()` (and spells the
cooldown constant out again — keep the two in step).

## The nightly run

`vercel.json` schedules `GET /api/cron/hockey-sync` at **04:30 UTC** daily. The route:

1. Authenticates on `CRON_SECRET` as a bearer token (the proxy skips `/api/cron/*` entirely, so the route is on its own here)
2. Collects every organization that has tracked teams, paging `tracked_teams` 1000 rows at a time
3. Orders them **stalest first**, so an over-long run cuts off different clubs each night instead of starving the same tail
4. Syncs them **sequentially** with a jitter pause between upstream fetches — low request volume, and the shared cache dedupes teams several clubs follow
5. Skips any club synced within the last **6 hours** (e.g. one that just ran a manual sync)

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
reports truncation rather than silently dropping teams) and, per team:

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
kept, as `last_sync_error`. Status is `success` with no errors, `error` once the error count
reaches the number of tracked teams, `partial` in between. Note that errors are one flat list
— a truncation warning, a club fetch failure and a single match's update error all land in it
— so with one tracked team a single bad row already reads as `error`.

**"Awaiting time"** is an upstream convention: an `announced` match at local midnight means
the date is set but the kick-off time is not (see the API doc §12). Such a fixture is never
imported, and is counted in `awaiting_time_count` until a real time appears — but where it
corresponds to a row that already _has_ a time, that is a retraction, handled as the table
above describes.

## Upstream access

- `lib/hockey/client.ts` — registers an anonymous device on first use, signs every request, re-registers once on a 401. **Never log the device uuid or token** — the pair is an access credential.
- `lib/hockey/signature.ts` — the request-signing algorithm (API doc §5.3), kept pure and unit-tested.
- `lib/hockey/credential-store.ts` — the single global device credential in `hockey_device_credentials` (one row, service-role only).
- `lib/hockey/cache.ts` + `discovery.ts` — a read-through cache in `hockey_api_cache`, shared across clubs and surviving function invocations. TTLs: clubs 24h, club detail 6h, poule+team 15 min.

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

`__tests__/lib/hockey/` covers the signing algorithm (`signature.test.ts`), the signed
transport and its re-registration on 401 (`client.test.ts`), normalisation including the
midnight/"awaiting time" rule (`normalize.test.ts`), and the claim/release lease protocol
plus the sync engine's insert/update/flag/cancel branches against a fake client
(`sync.test.ts`). `__tests__/app/api/cron/hockey-sync.test.ts` covers the cron route.
