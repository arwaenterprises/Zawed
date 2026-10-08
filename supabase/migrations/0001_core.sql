-- Family Manager core schema: families, members, per-tab permissions, activity log, expenses.
-- Rules in plain words:
--   * A new family is "pending" until the super-admin approves it.
--   * The family admin can see and change everything in their family.
--   * Every other member sees nothing until the admin grants a level on a tab
--     (none < view < edit < full). Children therefore start fully restricted.
--   * Items marked private are visible only to their owner and the admin.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  email text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'child' check (role in ('admin', 'adult', 'teen', 'child', 'guest')),
  relation text not null default '',
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table public.tab_permissions (
  family_id uuid not null,
  user_id uuid not null,
  tab_id text not null,
  level text not null default 'none' check (level in ('none', 'view', 'edit', 'full')),
  primary key (family_id, user_id, tab_id),
  foreign key (family_id, user_id) references public.members (family_id, user_id) on delete cascade
);

create table public.activity_log (
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families (id) on delete cascade,
  actor uuid references public.profiles (id) on delete set null,
  tab_id text not null,
  action text not null,
  detail text not null default '',
  at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (currency in ('SAR', 'INR')),
  category text not null default 'Other',
  note text not null default '',
  spent_on date not null default current_date,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);
create index expenses_family_idx on public.expenses (family_id, spent_on desc);

-- ---------------------------------------------------------------- helpers
-- security definer so policies can look at membership without recursing into RLS.

create function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false)
$$;

create function public.is_family_admin(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members m join public.families f on f.id = m.family_id
    where m.family_id = fid and m.user_id = auth.uid() and m.role = 'admin' and f.status = 'active'
  )
$$;

create function public.is_family_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members m join public.families f on f.id = m.family_id
    where m.family_id = fid and m.user_id = auth.uid() and f.status = 'active'
  )
$$;

-- 0 none, 1 view, 2 edit, 3 full. Admin is always 3. Non-members and pending families are 0.
create function public.tab_level(fid uuid, tab text) returns int
language sql stable security definer set search_path = public as $$
  select case
    when public.is_family_admin(fid) then 3
    when not public.is_family_member(fid) then 0
    else coalesce((
      select case p.level when 'view' then 1 when 'edit' then 2 when 'full' then 3 else 0 end
      from public.tab_permissions p
      where p.family_id = fid and p.user_id = auth.uid() and p.tab_id = tab
    ), 0)
  end
$$;

-- ------------------------------------------------------------ new-user hook
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(split_part(new.email, '@', 1), ''));
  return new;
end
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------ create family
-- The creator becomes admin. The family stays "pending" until the super-admin approves it.
create function public.create_family(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.families (name, created_by) values (p_name, auth.uid()) returning id into fid;
  insert into public.members (family_id, user_id, role, relation) values (fid, auth.uid(), 'admin', 'Admin');
  return fid;
end
$$;

-- ------------------------------------------------------------ activity log
create function public.log_expense_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.expenses;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  insert into public.activity_log (family_id, actor, tab_id, action, detail)
  values (r.family_id, auth.uid(), 'expenses', lower(tg_op), r.amount || ' ' || r.currency || ' ' || r.category);
  return r;
end
$$;
create trigger expenses_activity after insert or update or delete on public.expenses
  for each row execute function public.log_expense_change();

-- ---------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.tab_permissions enable row level security;
alter table public.activity_log enable row level security;
alter table public.expenses enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_super_admin() or exists (
    select 1 from public.members a join public.members b on a.family_id = b.family_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- people may only change their display name; the super-admin flag is never editable from the app
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy families_select on public.families for select to authenticated
  using (created_by = auth.uid() or public.is_family_member(id) or public.is_super_admin());
create policy families_super_update on public.families for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy members_select on public.members for select to authenticated
  using (user_id = auth.uid() or public.is_family_admin(family_id) or public.is_super_admin());
create policy members_admin_write on public.members for all to authenticated
  using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));

create policy perms_select on public.tab_permissions for select to authenticated
  using (user_id = auth.uid() or public.is_family_admin(family_id));
create policy perms_admin_write on public.tab_permissions for all to authenticated
  using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));

create policy log_select on public.activity_log for select to authenticated
  using (public.is_family_admin(family_id));

create policy expenses_select on public.expenses for select to authenticated
  using (public.is_family_admin(family_id)
    or (public.tab_level(family_id, 'expenses') >= 1 and (not is_private or user_id = auth.uid())));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (user_id = auth.uid() and public.tab_level(family_id, 'expenses') >= 2);
create policy expenses_update on public.expenses for update to authenticated
  using (public.tab_level(family_id, 'expenses') >= 3
    or (user_id = auth.uid() and public.tab_level(family_id, 'expenses') >= 2))
  with check (public.tab_level(family_id, 'expenses') >= 3
    or (user_id = auth.uid() and public.tab_level(family_id, 'expenses') >= 2));
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.tab_level(family_id, 'expenses') >= 3
    or (user_id = auth.uid() and public.tab_level(family_id, 'expenses') >= 2));

-- Only the explicit grants above; nothing is writable by anon.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.families, public.members, public.tab_permissions,
  public.expenses to authenticated;
grant select on public.profiles, public.activity_log to authenticated;
revoke insert, delete on public.families from authenticated;
revoke execute on function public.create_family(text) from public, anon;
grant execute on function public.create_family(text) to authenticated;
