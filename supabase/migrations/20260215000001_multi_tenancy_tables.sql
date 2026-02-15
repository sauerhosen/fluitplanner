-- Organizations (tenants)
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  is_active boolean not null default true,
  created_at timestamptz default now() not null,
  created_by uuid references auth.users not null
);

create index idx_organizations_slug on public.organizations (slug);

-- Organization members (user-to-org mapping with role)
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations on delete cascade not null,
  user_id uuid references auth.users not null,
  role text not null default 'planner' check (role in ('planner', 'viewer')),
  created_at timestamptz default now() not null,
  unique (organization_id, user_id)
);

create index idx_org_members_user on public.organization_members (user_id);
create index idx_org_members_org on public.organization_members (organization_id);

-- Organization umpires (umpire-to-org roster link)
create table public.organization_umpires (
  organization_id uuid references public.organizations on delete cascade not null,
  umpire_id uuid references public.umpires on delete cascade not null,
  created_at timestamptz default now() not null,
  primary key (organization_id, umpire_id)
);

-- RLS for organizations: authenticated users can read orgs they belong to
alter table public.organizations enable row level security;

create policy "Users can view their organizations"
  on public.organizations for select to authenticated
  using (
    id in (select organization_id from public.organization_members where user_id = auth.uid())
  );

create policy "Master admins can manage all organizations"
  on public.organizations for all to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'is_master_admin')::boolean = true
  );

-- RLS for organization_members: users can see members of their own orgs
alter table public.organization_members enable row level security;

create policy "Users can view members of their organizations"
  on public.organization_members for select to authenticated
  using (
    organization_id in (select organization_id from public.organization_members where user_id = auth.uid())
  );

create policy "Master admins can manage all members"
  on public.organization_members for all to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'is_master_admin')::boolean = true
  );

-- RLS for organization_umpires: users can manage umpires in their orgs
alter table public.organization_umpires enable row level security;

create policy "Users can view umpires in their organizations"
  on public.organization_umpires for select to authenticated
  using (
    organization_id in (select organization_id from public.organization_members where user_id = auth.uid())
  );

create policy "Planners can manage umpires in their organizations"
  on public.organization_umpires for all to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role = 'planner'
    )
  );
