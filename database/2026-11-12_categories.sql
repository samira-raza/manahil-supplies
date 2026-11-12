-- Categories: full name, word used in product names, short code; safe rename and delete
-- Notion: card "Categories: full name, product-name word and short code; safe rename and delete; move products between categories"
--         Decisions Log D38 (agreed 12 Nov 2026)
--
-- Run once in the Supabase SQL editor: on staging first, then on live (after sign-off).
-- Safe to run again: every step skips what already exists. Nothing is removed.
-- categories.name stays the word used in product names (e.g. MTCN), and products.category keeps
-- that word, so the previous version of the app still works if the release has to be rolled back.

begin;

-- 1. Each category gets a full name (lists and filters) and a short code (product codes)
alter table categories add column if not exists full_name text;
alter table categories add column if not exists short_code text;
alter table categories add column if not exists created_by text;
alter table categories add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_short_code_format') then
    alter table categories add constraint categories_short_code_format check (short_code is null or short_code ~ '^[A-Z]{2,3}$');
  end if;
end $$;

-- 2. The agreed list (D38): word in product names, full name, short code
create temp table agreed_categories (word text, full_name text, short_code text) on commit drop;
insert into agreed_categories values
  ('MTCN', 'Master Carton', 'MC'),
  ('Inner', 'Inner Carton', 'IC'),
  ('SBX', 'Single Box', 'SB'),
  ('DBX', 'Dozen Box', 'DB'),
  ('Tray', 'Tray', 'TR'),
  ('Sheet', 'Sheet', 'SH'),
  ('Separator', 'Separator', 'SE'),
  ('Sticker', 'Sticker', 'ST'),
  ('Honey Comb', 'Honey Comb', 'HC');

-- 2a. Existing categories that match the list (by their current name or by the full name) get its full name and code.
--     Their current name is kept, because product names already use it.
update categories c
set full_name  = coalesce(c.full_name, a.full_name),
    short_code = coalesce(c.short_code, a.short_code)
from agreed_categories a
where lower(trim(c.name)) in (lower(a.word), lower(a.full_name))
  and (c.full_name is null or c.short_code is null)
  and not exists (select 1 from categories o where o.id <> c.id and o.short_code = a.short_code);

-- 2b. Categories missing from the list get their name as full name and a free short code:
--     first letters of the words for longer names, the first two letters for one-word names,
--     then first letter + another letter if those are taken.
do $$
declare r record; words text[]; letters text; cands text[]; cand text; chosen text; i int;
begin
  update categories set full_name = trim(name) where full_name is null;
  for r in select id, name from categories where short_code is null order by name loop
    words   := regexp_split_to_array(trim(regexp_replace(r.name, '[^A-Za-z]+', ' ', 'g')), ' ');
    letters := upper(regexp_replace(r.name, '[^A-Za-z]', '', 'g'));
    cands   := array[]::text[];
    if coalesce(array_length(words, 1), 0) >= 2 then
      cands := cands || upper(left(words[1], 1) || left(words[2], 1));
      if array_length(words, 1) >= 3 then
        cands := cands || upper(left(words[1], 1) || left(words[2], 1) || left(words[3], 1));
      end if;
    end if;
    if length(letters) >= 2 then
      cands := cands || left(letters, 2);
      for i in 3..length(letters) loop
        cands := cands || (left(letters, 1) || substr(letters, i, 1));
      end loop;
    end if;
    chosen := null;
    foreach cand in array cands loop
      if not exists (select 1 from categories where short_code = cand) then chosen := cand; exit; end if;
    end loop;
    if chosen is null then
      raise notice 'Category % needs a short code set by hand (suggested ones are taken)', r.name;
    else
      update categories set short_code = chosen where id = r.id;
    end if;
  end loop;
end $$;

-- 2c. Add the agreed categories that don't exist yet (on live: Sheet, Separator, Sticker, Honey Comb)
insert into categories (id, name, full_name, short_code, created_by)
select 'cat_' || md5(lower(a.full_name)), a.word, a.full_name, a.short_code, 'Set-up'
from agreed_categories a
where not exists (
        select 1 from categories c
        where lower(trim(c.name)) in (lower(a.word), lower(a.full_name))
           or lower(trim(coalesce(c.full_name, ''))) = lower(a.full_name))
  and not exists (select 1 from categories c where c.short_code = a.short_code)
on conflict (id) do nothing;

-- 3. Each of the three names is unique
create unique index if not exists categories_name_unique on categories (lower(trim(name)));
create unique index if not exists categories_full_name_unique on categories (lower(trim(full_name))) where full_name is not null;
create unique index if not exists categories_short_code_unique on categories (short_code) where short_code is not null;

-- 4. History of category changes
create table if not exists category_activity (
  id           text primary key,
  category_id  text,
  type         text not null,
  details      text not null default '',
  user_id      text,
  user_name    text,
  at           timestamptz not null default now()
);
alter table category_activity enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'category_activity' and policyname = 'app access') then
    create policy "app access" on category_activity for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on category_activity to anon, authenticated;

-- One history line per category for this set-up (fixed id, so running again adds nothing)
insert into category_activity (id, category_id, type, details, user_name)
select 'ca_setup_' || md5(c.id), c.id, 'SET_UP',
       'Set up with full name ' || c.full_name || ', word in product names ' || c.name || ', short code ' || coalesce(c.short_code, '(none)') ||
       case when c.created_by = 'Set-up' then ' (added with the agreed list)' else '' end,
       'Set-up'
from categories c
on conflict (id) do nothing;

-- 5. Products are linked to the category itself. The database refuses to delete a category while a product uses it.
alter table products add column if not exists category_id text references categories(id) on delete restrict;
update products p
set category_id = c.id
from categories c
where p.category_id is null
  and lower(trim(p.category)) = lower(trim(c.name));
create index if not exists products_category_id on products (category_id);

commit;

-- Make the app see the new columns and table straight away
notify pgrst, 'reload schema';

-- Checks after running (each should return 0 rows):
--   select id, name, full_name, short_code from categories where full_name is null or short_code is null;
--   select id, title, category from products where category_id is null;
