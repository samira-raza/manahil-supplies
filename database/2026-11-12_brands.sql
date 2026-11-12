-- Brands section: parent brands, child brands, brand sets, initials, disabling
-- Notion: BUG-27 "Brands list with parent brands, multi-brand products, new product name rule, packing optional"
--         BUG-41 "Brands section: brand initials, disable, brand page with products, permissions"
--         Decisions Log D22, D34, D37 (agreed 12 Nov 2026)
--
-- Run once in the Supabase SQL editor: on staging first, then on live (after sign-off).
-- Safe to run again: every step skips what already exists. Nothing is removed.
-- products.brand (the typed brand) stays and the app keeps it equal to the parent brand's
-- name, so the previous version of the app still works if the release has to be rolled back.

begin;

-- 1. Brands. Parent brands have no parent_id and have initials. Child brands have a parent_id.
create table if not exists brands (
  id          text primary key,
  name        text not null check (length(trim(name)) > 0),
  parent_id   text references brands(id),
  initials    text,
  label       text,
  is_active   boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  check (parent_id is null or initials is null),
  check (parent_id is not null or initials ~ '^[A-Z]{2,3}$')
);
-- Parent names unique; parent initials unique; a child brand name is unique across all parents
create unique index if not exists brands_parent_name on brands (lower(trim(name))) where parent_id is null;
create unique index if not exists brands_parent_initials on brands (initials) where parent_id is null;
create unique index if not exists brands_child_name on brands (lower(trim(name))) where parent_id is not null;

-- Only two levels: a child's parent must itself be a parent brand
create or replace function brands_two_levels() returns trigger language plpgsql as $$
begin
  if new.parent_id is not null and exists (select 1 from brands b where b.id = new.parent_id and b.parent_id is not null) then
    raise exception 'A child brand can only sit under a parent brand';
  end if;
  return new;
end $$;
drop trigger if exists brands_two_levels on brands;
create trigger brands_two_levels before insert or update on brands for each row execute function brands_two_levels();

-- 2. Brand sets: a parent plus chosen child brands. Fixed once saved (members are never edited).
create table if not exists brand_sets (
  id          text primary key,
  parent_id   text not null references brands(id),
  is_active   boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now()
);
create table if not exists brand_set_members (
  set_id    text not null references brand_sets(id) on delete cascade,
  child_id  text not null references brands(id),
  primary key (set_id, child_id)
);

-- 3. History of brand changes (initials changes, renames, disabling)
create table if not exists brand_activity (
  id         text primary key,
  brand_id   text,
  set_id     text,
  type       text not null,
  details    text not null default '',
  user_id    text,
  user_name  text,
  at         timestamptz not null default now()
);

-- 4. Each product picks one entry: a parent brand alone, or a brand set
alter table products add column if not exists brand_parent_id text references brands(id);
alter table products add column if not exists brand_set_id text references brand_sets(id);

-- 5. Access: the same open access the other tables have today (tightened by the security fix)
alter table brands enable row level security;
alter table brand_sets enable row level security;
alter table brand_set_members enable row level security;
alter table brand_activity enable row level security;
do $$
declare t text;
begin
  foreach t in array array['brands','brand_sets','brand_set_members','brand_activity'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'app access') then
      execute format('create policy "app access" on %I for all using (true) with check (true)', t);
    end if;
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;

-- 6. Starting list: Hemani and Common (agreed 1 Nov 2026), plus every brand already typed on a product.
--    Initials = first + last letter. If those are taken, first + second + last letter.
create or replace function pg_temp.brand_initials(n text) returns text language sql as $$
  select upper(left(regexp_replace(n, '[^A-Za-z]', '', 'g'), 1) || right(regexp_replace(n, '[^A-Za-z]', '', 'g'), 1))
$$;
create or replace function pg_temp.brand_initials3(n text) returns text language sql as $$
  select upper(left(regexp_replace(n, '[^A-Za-z]', '', 'g'), 2) || right(regexp_replace(n, '[^A-Za-z]', '', 'g'), 1))
$$;

do $$
declare n text; ini text;
begin
  for n in
    select x.name from (
      select 'Hemani' as name, 0 as ord union all select 'Common', 1
      union all
      select distinct trim(p.brand), 2 from products p where p.brand is not null and trim(p.brand) <> ''
    ) x
    order by x.ord, x.name
  loop
    if exists (select 1 from brands where parent_id is null and lower(trim(name)) = lower(n)) then
      continue;
    end if;
    ini := pg_temp.brand_initials(n);
    if length(ini) < 2 or exists (select 1 from brands where parent_id is null and initials = ini) then
      ini := pg_temp.brand_initials3(n);
    end if;
    if length(ini) < 2 or exists (select 1 from brands where parent_id is null and initials = ini) then
      raise notice 'Brand % needs initials set by hand (suggested ones are taken)', n;
      continue;
    end if;
    insert into brands (id, name, initials, created_by) values ('br_' || md5(lower(n)), n, ini, 'Set-up');
  end loop;
end $$;

-- Connect existing products to their parent brand (only those not connected yet)
update products p
set brand_parent_id = b.id
from brands b
where p.brand_parent_id is null
  and b.parent_id is null
  and lower(trim(b.name)) = lower(trim(p.brand));

commit;

-- Make the app see the new tables and columns straight away
notify pgrst, 'reload schema';

-- Checks after running (each should return 0 rows):
--   select id, title, brand from products where brand_parent_id is null;
