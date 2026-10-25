-- LISA change detector (docs/plans/2026-10-25-lisa-change-detector-design.md).
--
-- Club websites built on LISA publish the club's whole programme as public
-- JSON whose match code is the Match Center id. The detector polls it to pick
-- which matches to confirm against the Match Center; nothing read from LISA is
-- ever written to matches. All three tables are written by the service role
-- only (server actions and the sync engine), like hockey_sync_state.
--
-- Deliberately not stored: referees, club remarks, standings, team or person
-- names. Some clubs publish umpire names in their export; the detector has no
-- use for them.

-- A club website whose LISA export a Fluitplanner club watches. Several per
-- org: a club with combined youth teams also watches its partner's site.
create table public.club_feeds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  host text not null,
  site_alias text not null,
  -- Rollout switch: off, the detector confirms suspects and logs what it would
  -- apply, but writes nothing to matches (shadow mode). Flipped per feed by a
  -- master admin until the detector is on for every club.
  apply_changes boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  last_polled_at timestamptz,
  last_poll_status text check (last_poll_status in ('success', 'partial', 'error')),
  last_poll_error text,
  last_suspects integer not null default 0,
  last_confirmed integer not null default 0,
  unique (organization_id, host)
);

create index idx_club_feeds_created_by on public.club_feeds (created_by);

alter table public.club_feeds enable row level security;

-- Members can read their club's feeds; writes go through planner-gated server
-- actions on the service client.
create policy "Members can select club_feeds"
  on public.club_feeds for select to authenticated
  using (organization_id in (select public.get_user_org_ids()));

-- Last seen state of each watched home fixture in a feed.
create table public.club_feed_fixtures (
  feed_id uuid not null references public.club_feeds(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code bigint not null,                 -- = matches.external_id
  lisa_team_id text not null,
  fingerprint text not null,            -- advanced only after confirmation
  pending_fingerprint text,             -- seen but not yet confirmed
  checked_at timestamptz,               -- last Match Center confirmation
  seen_at timestamptz not null,
  primary key (feed_id, code)
);

create index idx_club_feed_fixtures_org on public.club_feed_fixtures (organization_id);

-- Service-role only: RLS enabled with no policies.
alter table public.club_feed_fixtures enable row level security;

-- LISA team → tracked team, learned from our matches and from confirmations.
create table public.club_feed_teams (
  feed_id uuid not null references public.club_feeds(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lisa_team_id text not null,
  tracked_team_id uuid not null references public.tracked_teams(id) on delete cascade,
  primary key (feed_id, lisa_team_id)
);

create index idx_club_feed_teams_org on public.club_feed_teams (organization_id);
create index idx_club_feed_teams_tracked_team on public.club_feed_teams (tracked_team_id);

-- Service-role only: RLS enabled with no policies.
alter table public.club_feed_teams enable row level security;
