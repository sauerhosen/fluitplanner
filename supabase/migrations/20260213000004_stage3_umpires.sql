-- Stage 3: Umpires table, RLS policies, and availability_responses umpire_id column

-- Umpires table (shared across all planners)
create table public.umpires (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id),
  name text not null,
  email text not null unique,
  level integer not null default 1 check (level in (1, 2, 3)),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_umpires_email on public.umpires(email);
create index idx_umpires_auth_user_id on public.umpires(auth_user_id);

-- RLS for umpires
alter table public.umpires enable row level security;

create policy "Authenticated users can select umpires"
  on public.umpires for select to authenticated
  using (true);

create policy "Authenticated users can insert umpires"
  on public.umpires for insert to authenticated
  with check (true);

create policy "Authenticated users can update umpires"
  on public.umpires for update to authenticated
  using (true);

create policy "Authenticated users can delete umpires"
  on public.umpires for delete to authenticated
  using (true);

create policy "Anon can insert umpires"
  on public.umpires for insert to anon
  with check (true);

create policy "Anon can select umpires"
  on public.umpires for select to anon
  using (true);

-- Add umpire_id FK to availability_responses (nullable, populated by Stage 5)
alter table public.availability_responses
  add column umpire_id uuid references public.umpires(id);

create index idx_availability_responses_umpire_id
  on public.availability_responses(umpire_id);

-- Reusable updated_at trigger function
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_umpires_updated_at
  before update on public.umpires
  for each row execute function public.update_updated_at();
