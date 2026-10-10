-- Expenses mobile redesign: own categories + sub-categories, receipts, budgets, repeating expenses.
-- Same access rules as 0001: tab_level(family, 'expenses') 0 none, 1 view, 2 edit, 3 full (admin is always 3).
--   * categories: view can read, edit can add, full can rename/delete.
--   * budgets: view can read, full can change.
--   * repeating expenses follow the same rules as the expenses they create.

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  parent_id uuid,
  name text not null check (length(trim(name)) > 0 and length(name) <= 40),
  icon text not null default '🏷️' check (length(icon) <= 16),
  color text not null default '#7c3aed' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (family_id, id),
  -- a sub-category must belong to a category of the same family; deleting a category deletes its sub-categories
  foreign key (family_id, parent_id) references public.expense_categories (family_id, id) on delete cascade
);
create unique index expense_categories_name_idx on public.expense_categories
  (family_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- only one level of sub-categories
create function public.check_category_depth() returns trigger
language plpgsql as $$
begin
  if new.parent_id is not null and exists (
    select 1 from public.expense_categories p where p.id = new.parent_id and p.parent_id is not null) then
    raise exception 'sub-categories cannot have sub-categories';
  end if;
  return new;
end
$$;
create trigger expense_categories_depth before insert or update on public.expense_categories
  for each row execute function public.check_category_depth();

alter table public.expenses
  add column subcategory text not null default '',
  add column receipt_path text;

create table public.expense_budgets (
  family_id uuid not null references public.families (id) on delete cascade,
  category text not null default '',               -- '' = overall monthly budget
  monthly_amount numeric(14, 2) not null check (monthly_amount > 0),  -- in SAR
  primary key (family_id, category)
);

create table public.expense_recurring (
  id uuid primary key,                              -- same id as the first expense it came from (safe to retry)
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (currency in ('SAR', 'INR')),
  category text not null default 'Other',
  subcategory text not null default '',
  note text not null default '',
  is_private boolean not null default false,
  every text not null check (every in ('daily', 'weekly', 'monthly')),
  next_on date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------- RLS
alter table public.expense_categories enable row level security;
alter table public.expense_budgets enable row level security;
alter table public.expense_recurring enable row level security;

create policy cats_select on public.expense_categories for select to authenticated
  using (public.tab_level(family_id, 'expenses') >= 1);
create policy cats_insert on public.expense_categories for insert to authenticated
  with check (public.tab_level(family_id, 'expenses') >= 2);
create policy cats_update on public.expense_categories for update to authenticated
  using (public.tab_level(family_id, 'expenses') >= 3) with check (public.tab_level(family_id, 'expenses') >= 3);
create policy cats_delete on public.expense_categories for delete to authenticated
  using (public.tab_level(family_id, 'expenses') >= 3);

create policy budgets_select on public.expense_budgets for select to authenticated
  using (public.tab_level(family_id, 'expenses') >= 1);
create policy budgets_write on public.expense_budgets for all to authenticated
  using (public.tab_level(family_id, 'expenses') >= 3) with check (public.tab_level(family_id, 'expenses') >= 3);

create policy recurring_select on public.expense_recurring for select to authenticated
  using (public.is_family_admin(family_id)
    or (public.tab_level(family_id, 'expenses') >= 1 and (not is_private or user_id = auth.uid())));
create policy recurring_insert on public.expense_recurring for insert to authenticated
  with check (user_id = auth.uid() and public.tab_level(family_id, 'expenses') >= 2);
create policy recurring_update on public.expense_recurring for update to authenticated
  using (public.tab_level(family_id, 'expenses') >= 3
    or (user_id = auth.uid() and public.tab_level(family_id, 'expenses') >= 2))
  with check (public.tab_level(family_id, 'expenses') >= 3
    or (user_id = auth.uid() and public.tab_level(family_id, 'expenses') >= 2));
create policy recurring_delete on public.expense_recurring for delete to authenticated
  using (public.tab_level(family_id, 'expenses') >= 3
    or (user_id = auth.uid() and public.tab_level(family_id, 'expenses') >= 2));

revoke all on public.expense_categories, public.expense_budgets, public.expense_recurring from anon;
grant select, insert, update, delete on public.expense_categories, public.expense_budgets,
  public.expense_recurring to authenticated;

-- ------------------------------------------------------ starter categories
-- Fills a family's category list the first time someone with edit access opens Expenses.
-- Does nothing if the family already has categories, so it is safe to call twice.
create function public.seed_expense_categories(p_family uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record; s text; cid uuid; n int := 0;
begin
  if public.tab_level(p_family, 'expenses') < 2 then raise exception 'not allowed'; end if;
  perform 1 from public.families where id = p_family for update;  -- one seeder at a time
  if exists (select 1 from public.expense_categories where family_id = p_family) then return; end if;
  for r in select * from jsonb_to_recordset('[
    {"n":"Food","i":"🍔","c":"#f97316","s":["Restaurant","Takeaway","Coffee"]},
    {"n":"Groceries","i":"🛒","c":"#16a34a","s":["Vegetables","Fruit","Meat"]},
    {"n":"Transport","i":"🚗","c":"#2563eb","s":["Fuel","Taxi","Parking"]},
    {"n":"Bills","i":"🧾","c":"#7c3aed","s":["Electricity","Water","Mobile","Internet"]},
    {"n":"Home","i":"🏠","c":"#0d9488","s":["Rent","Repairs"]},
    {"n":"School","i":"🎒","c":"#0ea5e9","s":["Fees","Books"]},
    {"n":"Health","i":"💊","c":"#dc2626","s":["Doctor","Medicine"]},
    {"n":"Shopping","i":"🛍️","c":"#db2777","s":["Clothes","Electronics"]},
    {"n":"Fun","i":"🎉","c":"#ca8a04","s":[]},
    {"n":"Other","i":"📦","c":"#64748b","s":[]}
  ]'::jsonb) as x(n text, i text, c text, s jsonb) loop
    n := n + 1;
    insert into public.expense_categories (family_id, name, icon, color, sort_order)
      values (p_family, r.n, r.i, r.c, n) returning id into cid;
    for s in select jsonb_array_elements_text(r.s) loop
      n := n + 1;
      insert into public.expense_categories (family_id, parent_id, name, icon, color, sort_order)
        values (p_family, cid, s, '', r.c, n);
    end loop;
  end loop;
end
$$;
revoke execute on function public.seed_expense_categories(uuid) from public, anon;
grant execute on function public.seed_expense_categories(uuid) to authenticated;
