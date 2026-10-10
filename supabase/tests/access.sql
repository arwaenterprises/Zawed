-- Run after stub.sql + migrations on a scratch database. Raises an error on the first failed check.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner@x.test'),
  ('00000000-0000-0000-0000-000000000002', 'wife@x.test'),
  ('00000000-0000-0000-0000-000000000003', 'son@x.test'),
  ('00000000-0000-0000-0000-000000000004', 'stranger@x.test'),
  ('00000000-0000-0000-0000-000000000005', 'super@x.test');
update public.profiles set is_super_admin = true where email = 'super@x.test';

create function pg_temp.as_user(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000' || n, false);
  execute 'set role authenticated';
end $$;
create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create function pg_temp.denied(label text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then perform pg_temp.check(label, true); return; end;
  raise exception 'FAILED (was allowed): %', label;
end $$;

-- owner creates a family; it starts pending
select pg_temp.as_user(1);
select set_config('app.fid', public.create_family('Ansari')::text, false);
select pg_temp.denied('pending family: owner cannot add expense yet',
  format($q$insert into public.expenses (family_id,user_id,amount,currency) values (%L,auth.uid(),10,'SAR')$q$, current_setting('app.fid')));

-- only the super-admin can approve
select pg_temp.as_user(4);
with u as (update public.families set status='active' returning 1) select pg_temp.check('stranger cannot approve family', count(*)=0) from u;
select pg_temp.as_user(1);
with u as (update public.families set status='active' returning 1) select pg_temp.check('owner cannot approve own family', count(*)=0) from u;
select pg_temp.as_user(5);
with u as (update public.families set status='active' returning 1) select pg_temp.check('super-admin approves family', count(*)=1) from u;

-- owner adds wife (edit on expenses) and son (no grants: restricted by default)
select pg_temp.as_user(1);
insert into public.members (family_id,user_id,role,relation) values
  (current_setting('app.fid')::uuid,'00000000-0000-0000-0000-000000000002','adult','Wife'),
  (current_setting('app.fid')::uuid,'00000000-0000-0000-0000-000000000003','child','Son');
insert into public.tab_permissions values (current_setting('app.fid')::uuid,'00000000-0000-0000-0000-000000000002','expenses','edit');
insert into public.expenses (family_id,user_id,amount,currency,category,is_private) values
  (current_setting('app.fid')::uuid, auth.uid(), 100, 'SAR', 'Food', false),
  (current_setting('app.fid')::uuid, auth.uid(), 900, 'INR', 'Gift', true);

-- wife
select pg_temp.as_user(2);
insert into public.expenses (family_id,user_id,amount,currency,category,is_private) values
  (current_setting('app.fid')::uuid, auth.uid(), 50, 'SAR', 'Fuel', false),
  (current_setting('app.fid')::uuid, auth.uid(), 70, 'SAR', 'Surprise', true);
select pg_temp.check('wife sees her 2 + owner shared, not owner private', (select count(*) from public.expenses)=3);
select pg_temp.denied('wife cannot record as someone else',
  format($q$insert into public.expenses (family_id,user_id,amount,currency) values (%L,'00000000-0000-0000-0000-000000000001',1,'SAR')$q$, current_setting('app.fid')));
with u as (update public.expenses set amount=1 where user_id='00000000-0000-0000-0000-000000000001' returning 1)
  select pg_temp.check('wife cannot edit owner expense', count(*)=0) from u;
with u as (update public.tab_permissions set level='full' where family_id=current_setting('app.fid')::uuid returning 1)
  select pg_temp.check('wife cannot grant herself full access', count(*)=0) from u;
select pg_temp.check('wife cannot read activity log', (select count(*) from public.activity_log)=0);
select pg_temp.denied('nobody can make themselves super-admin', $q$update public.profiles set is_super_admin=true where id=auth.uid()$q$);

-- son has no grants
select pg_temp.as_user(3);
select pg_temp.check('son sees no expenses', (select count(*) from public.expenses)=0);
select pg_temp.denied('son cannot add expense',
  format($q$insert into public.expenses (family_id,user_id,amount,currency) values (%L,auth.uid(),1,'SAR')$q$, current_setting('app.fid')));

-- stranger
select pg_temp.as_user(4);
select pg_temp.check('stranger sees no expenses', (select count(*) from public.expenses)=0);
select pg_temp.check('stranger sees no family', (select count(*) from public.families)=0);

-- owner sees everything, including private items and the activity log
select pg_temp.as_user(1);
select pg_temp.check('owner sees all 4 expenses', (select count(*) from public.expenses)=4);
select pg_temp.check('activity log records the 4 additions', (select count(*) from public.activity_log where action='insert')=4);
with u as (update public.expenses set amount=amount where user_id='00000000-0000-0000-0000-000000000002' returning 1)
  select pg_temp.check('owner can edit wife expense', count(*)=2) from u;

-- ------------------------------------------------ 0002: categories, budgets, repeating
select pg_temp.as_user(1);
select public.seed_expense_categories(current_setting('app.fid')::uuid);
select pg_temp.check('starter categories exist with sub-categories',
  (select count(*) from public.expense_categories where parent_id is null)=10
  and (select count(*) from public.expense_categories where parent_id is not null)=21);
select public.seed_expense_categories(current_setting('app.fid')::uuid);
select pg_temp.check('seed twice does not duplicate', (select count(*) from public.expense_categories)=31);
select pg_temp.denied('no sub-sub-categories',
  format($q$insert into public.expense_categories (family_id,parent_id,name) select family_id,id,'Deep' from public.expense_categories where name='Fuel' and family_id=%L$q$, current_setting('app.fid')));
select pg_temp.denied('no duplicate category names',
  format($q$insert into public.expense_categories (family_id,name) values (%L,'food')$q$, current_setting('app.fid')));
insert into public.expense_budgets values (current_setting('app.fid')::uuid, '', 3000);

select pg_temp.as_user(2);  -- wife: edit level
select pg_temp.check('wife sees categories and budget', (select count(*) from public.expense_categories)=31 and (select count(*) from public.expense_budgets)=1);
insert into public.expense_categories (family_id,name,icon) values (current_setting('app.fid')::uuid,'Pets','🐶');
select pg_temp.check('wife can add a category', (select count(*) from public.expense_categories where name='Pets')=1);
with u as (update public.expense_categories set name='Hacked' where name='Food' returning 1)
  select pg_temp.check('wife cannot rename a category', count(*)=0) from u;
with d as (delete from public.expense_categories where name='Pets' returning 1)
  select pg_temp.check('wife cannot delete a category', count(*)=0) from d;
select pg_temp.denied('wife cannot set a budget', format($q$insert into public.expense_budgets values (%L,'Food',1)$q$, current_setting('app.fid')));
select pg_temp.denied('wife cannot seed another family', $q$select public.seed_expense_categories(gen_random_uuid())$q$);
insert into public.expense_recurring (id,family_id,user_id,amount,currency,every,next_on,is_private)
  values (gen_random_uuid(), current_setting('app.fid')::uuid, auth.uid(), 25, 'SAR', 'monthly', current_date, true);
select pg_temp.check('wife sees her repeating expense', (select count(*) from public.expense_recurring)=1);
select pg_temp.denied('wife cannot add a repeating expense for someone else',
  format($q$insert into public.expense_recurring (id,family_id,user_id,amount,currency,every,next_on) values (gen_random_uuid(),%L,'00000000-0000-0000-0000-000000000001',1,'SAR','daily',current_date)$q$, current_setting('app.fid')));

select pg_temp.as_user(3);  -- son: nothing
select pg_temp.check('son sees no categories/budgets/repeating',
  (select count(*) from public.expense_categories)+(select count(*) from public.expense_budgets)+(select count(*) from public.expense_recurring)=0);
select pg_temp.denied('son cannot add a category', format($q$insert into public.expense_categories (family_id,name) values (%L,'Sneaky')$q$, current_setting('app.fid')));

select pg_temp.as_user(4);  -- stranger
select pg_temp.check('stranger sees no categories', (select count(*) from public.expense_categories)=0);

select pg_temp.as_user(1);  -- owner
select pg_temp.check('owner sees wife private repeating expense', (select count(*) from public.expense_recurring)=1);
with u as (update public.expense_categories set name='Meals' where name='Food' returning 1)
  select pg_temp.check('owner can rename a category', count(*)=1) from u;
with d as (delete from public.expense_categories where name='Bills' returning 1)
  select pg_temp.check('owner deletes a category', count(*)=1) from d;
select pg_temp.check('deleting a category deletes its sub-categories',
  (select count(*) from public.expense_categories where name in ('Electricity','Water','Mobile','Internet'))=0);
\echo ALL ACCESS CHECKS PASSED
