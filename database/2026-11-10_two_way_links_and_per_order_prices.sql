-- Two-way linked products, and products with no fixed price
-- Notion: "Related products: two-way links, removable from either side" (BUG-37)
--         "Products with no fixed price (e.g. stickers): price typed on each order" (BUG-33)
--
-- Run once in the Supabase SQL editor: on staging first, then on live (after sign-off).
-- Safe to run again: every step skips what already exists. Nothing is removed.
-- products.related_product_id stays and the app keeps it up to date (both directions),
-- so the previous version of the app still works if the release has to be rolled back.

begin;

-- 1. One row = one two-way link between two products (stored with the smaller id first)
create table if not exists product_links (
  product_a   text not null references products(id) on delete cascade,
  product_b   text not null references products(id) on delete cascade,
  created_by  text,
  created_at  timestamptz not null default now(),
  primary key (product_a, product_b),
  check (product_a < product_b)
);
create index if not exists product_links_b on product_links (product_b);

alter table product_links enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'product_links' and policyname = 'app access') then
    create policy "app access" on product_links for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on product_links to anon, authenticated;

-- 2. Move existing one-way links across (related_product_id holds a JSON list or a single id)
insert into product_links (product_a, product_b, created_at)
select distinct least(p.id, r.rid), greatest(p.id, r.rid), now()
from products p
cross join lateral (
  select jsonb_array_elements_text(p.related_product_id::jsonb) as rid
  where left(trim(p.related_product_id), 1) = '['
  union all
  select trim(p.related_product_id)
  where p.related_product_id is not null and trim(p.related_product_id) <> '' and left(trim(p.related_product_id), 1) <> '['
) r
where r.rid <> p.id
  and exists (select 1 from products t where t.id = r.rid)
on conflict do nothing;

-- Bring the old list column in step with the two-way links (both directions), for rollback
update products p
set related_product_id = (
  select jsonb_agg(case when l.product_a = p.id then l.product_b else l.product_a end order by l.created_at)::text
  from product_links l
  where l.product_a = p.id or l.product_b = p.id
)
where p.related_product_id is distinct from (
  select jsonb_agg(case when l.product_a = p.id then l.product_b else l.product_a end order by l.created_at)::text
  from product_links l
  where l.product_a = p.id or l.product_b = p.id
);

-- 3. Products with no fixed price: the price is typed on each order line
alter table products add column if not exists price_mode text not null default 'LIST';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_price_mode_check') then
    alter table products add constraint products_price_mode_check check (price_mode in ('LIST', 'PER_ORDER'));
  end if;
end $$;

commit;

-- Make the app see the new table and column straight away
notify pgrst, 'reload schema';

-- Check after running: every old link now exists as a two-way link
--   select count(*) from product_links;
