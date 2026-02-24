-- Organization-level availability guard policy and warning events

create table public.organization_settings (
  organization_id uuid primary key references public.organizations on delete cascade,
  availability_guard_policy text not null default 'warn' check (availability_guard_policy in ('warn', 'block')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users
);

insert into public.organization_settings (organization_id)
select id
from public.organizations
on conflict (organization_id) do nothing;

create table public.availability_change_warnings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  poll_id uuid not null references public.polls on delete cascade,
  slot_id uuid not null references public.poll_slots on delete cascade,
  umpire_id uuid not null references public.umpires on delete cascade,
  from_response text not null check (from_response in ('yes', 'if_need_be')),
  to_response text not null check (to_response in ('no', 'none')),
  policy text not null check (policy in ('warn', 'block')),
  outcome text not null check (outcome in ('confirm_required', 'blocked')),
  created_at timestamptz not null default now()
);

create index idx_availability_change_warnings_org_created
  on public.availability_change_warnings (organization_id, created_at desc);

create index idx_availability_change_warnings_poll_umpire_created
  on public.availability_change_warnings (poll_id, umpire_id, created_at desc);

alter table public.organization_settings enable row level security;
alter table public.availability_change_warnings enable row level security;

create policy "Tenant isolation for organization_settings select"
  on public.organization_settings for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

create policy "Planner can update organization_settings"
  on public.organization_settings for update to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = auth.uid() and role = 'planner'
    )
  );

create policy "Planner can insert organization_settings"
  on public.organization_settings for insert to authenticated
  with check (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = auth.uid() and role = 'planner'
    )
  );

create policy "Tenant isolation for availability_change_warnings select"
  on public.availability_change_warnings for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );
