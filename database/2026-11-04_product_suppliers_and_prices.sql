-- Product suppliers, dated prices and product activity log
-- Notion: "Product suppliers: any number per product..." (BUG-29) and "Prices with effective dates" (BUG-28)
--
-- Run once in the Supabase SQL editor: on staging first, then on live (after sign-off).
-- Safe to run again: every step skips what already exists.
-- Nothing is removed. The old columns on products (primary_vendor_id, primary_price,
-- secondary_vendor_id, secondary_price, price_history) stay and the app keeps them up to date,
-- so the previous version of the app still works if the release has to be rolled back.

begin;

-- 1. Who may create products and add suppliers (set by the Super Admin in Team Access)
alter table users add column if not exists can_create_products boolean not null default false;
alter table users add column if not exists can_add_product_suppliers boolean not null default false;

-- 2. Suppliers of each product. Never deleted, only switched off (is_active = false).
create table if not exists product_suppliers (
  id          text primary key,
  product_id  text not null references products(id) on delete cascade,
  vendor_id   text not null references vendors(id),
  is_main     boolean not null default false,
  is_active   boolean not null default true,
  added_by    text,
  added_at    timestamptz not null default now(),
  unique (product_id, vendor_id)
);
-- At most one main supplier per product
create unique index if not exists product_suppliers_one_main
  on product_suppliers (product_id) where is_main;

-- 3. Every price of every supplier, with the date it starts
create table if not exists product_prices (
  id              text primary key,
  product_id      text not null references products(id) on delete cascade,
  vendor_id       text not null references vendors(id),
  price           numeric not null check (price >= 0),
  effective_date  date not null,
  note            text,
  created_by      text,
  created_at      timestamptz not null default now()
);
create index if not exists product_prices_product_vendor on product_prices (product_id, vendor_id);

-- 4. Activity log: every supplier and price change on a product, with who made it
create table if not exists product_activity (
  id          text primary key,
  product_id  text not null references products(id) on delete cascade,
  type        text not null,
  details     text not null default '',
  user_id     text,
  user_name   text,
  at          timestamptz not null default now()
);
create index if not exists product_activity_product on product_activity (product_id, at desc);

-- 5. Access: the same open access the other tables have today (the app has no server).
--    This is tightened by the security fix "Vendor logins receive every other vendor's data".
alter table product_suppliers enable row level security;
alter table product_prices    enable row level security;
alter table product_activity  enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'product_suppliers' and policyname = 'app access') then
    create policy "app access" on product_suppliers for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'product_prices' and policyname = 'app access') then
    create policy "app access" on product_prices for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'product_activity' and policyname = 'app access') then
    create policy "app access" on product_activity for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on product_suppliers, product_prices, product_activity to anon, authenticated;

-- 6. Move existing products across: today's primary supplier becomes the main supplier,
--    the secondary supplier becomes another supplier. Ids match what the app uses for
--    products that have not been moved yet, so nothing is duplicated.
insert into product_suppliers (id, product_id, vendor_id, is_main, is_active, added_at)
select 'ps_' || p.id || '_' || p.primary_vendor_id, p.id, p.primary_vendor_id, true, true,
       coalesce(left(p.date_added::text, 10)::date, current_date)
from products p
where p.primary_vendor_id is not null and p.primary_vendor_id <> ''
  and not exists (select 1 from product_suppliers s where s.product_id = p.id)
on conflict do nothing;

insert into product_suppliers (id, product_id, vendor_id, is_main, is_active, added_at)
select 'ps_' || p.id || '_' || p.secondary_vendor_id, p.id, p.secondary_vendor_id, false, true,
       coalesce(left(p.date_added::text, 10)::date, current_date)
from products p
where p.secondary_vendor_id is not null and p.secondary_vendor_id <> ''
  and p.secondary_vendor_id is distinct from p.primary_vendor_id
on conflict do nothing;

-- Prices from the existing price history (each old entry's date becomes its start date)
insert into product_prices (id, product_id, vendor_id, price, effective_date, note, created_at)
select 'pp_' || s.product_id || '_' || s.vendor_id || '_' || (h.ord - 1),
       s.product_id, s.vendor_id,
       coalesce((h.rec->>'price')::numeric, 0),
       left(coalesce(h.rec->>'effectiveDate', h.rec->>'date', p.date_added::text), 10)::date,
       nullif(h.rec->>'note', ''),
       left(coalesce(h.rec->>'date', p.date_added::text), 10)::date + make_interval(secs => h.ord - 1)
from product_suppliers s
join products p on p.id = s.product_id
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(p.price_history::jsonb -> s.vendor_id) = 'array'
       then p.price_history::jsonb -> s.vendor_id else '[]'::jsonb end
) with ordinality as h(rec, ord)
where s.id = 'ps_' || s.product_id || '_' || s.vendor_id
on conflict do nothing;

-- Suppliers with no price history get their current price, starting on the product's added date
insert into product_prices (id, product_id, vendor_id, price, effective_date, created_at)
select 'pp_' || s.product_id || '_' || s.vendor_id || '_0', s.product_id, s.vendor_id,
       coalesce(case when s.is_main then p.primary_price else p.secondary_price end, 0),
       coalesce(left(p.date_added::text, 10)::date, current_date),
       coalesce(left(p.date_added::text, 10)::date, current_date)
from product_suppliers s
join products p on p.id = s.product_id
where not exists (select 1 from product_prices pr where pr.product_id = s.product_id and pr.vendor_id = s.vendor_id)
on conflict do nothing;

commit;

-- Checks after running (each should return 0 rows):
-- Products with no supplier rows:
--   select id, title from products p where not exists (select 1 from product_suppliers s where s.product_id = p.id);
-- Suppliers with no price:
--   select * from product_suppliers s where not exists (select 1 from product_prices pr where pr.product_id = s.product_id and pr.vendor_id = s.vendor_id);
