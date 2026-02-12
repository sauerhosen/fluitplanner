-- Stage 1: Core tables for matches, polls, slots, and availability responses

-- Matches table
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time timestamptz not null,
  home_team text not null,
  away_team text not null,
  competition text,
  venue text,
  created_by uuid references auth.users not null,
  created_at timestamptz default now() not null
);

-- Polls table
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  title text,
  token text unique not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references auth.users not null,
  created_at timestamptz default now() not null
);

-- Junction: which matches belong to which poll
create table public.poll_matches (
  poll_id uuid references public.polls on delete cascade not null,
  match_id uuid references public.matches on delete cascade not null,
  primary key (poll_id, match_id)
);

-- Time slots within a poll
create table public.poll_slots (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.polls on delete cascade not null,
  start_time timestamptz not null,
  end_time timestamptz not null
);

-- Umpire availability responses
create table public.availability_responses (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.polls not null,
  slot_id uuid references public.poll_slots on delete cascade not null,
  participant_name text not null,
  response text not null check (response in ('yes', 'if_need_be', 'no')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (poll_id, slot_id, participant_name)
);

-- Indexes
create index idx_matches_date on public.matches (date);
create index idx_matches_created_by on public.matches (created_by);
create index idx_polls_token on public.polls (token);
create index idx_polls_created_by on public.polls (created_by);
create index idx_poll_slots_poll_id on public.poll_slots (poll_id);
create index idx_availability_responses_poll_id on public.availability_responses (poll_id);
create index idx_availability_responses_slot_id on public.availability_responses (slot_id);
