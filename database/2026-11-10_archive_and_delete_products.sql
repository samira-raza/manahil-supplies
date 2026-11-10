-- Archive and delete products
-- Notion: "Delete unused products, archive ordered products" (BUG-30)
--
-- Run once in the Supabase SQL editor: on staging first, then on live (after sign-off).
-- Safe to run again: every step skips what already exists. Nothing is removed.

begin;

-- 1. Archived products stay in the list but cannot be ordered (set and cleared by the Super Admin)
alter table products add column if not exists is_archived boolean not null default false;
alter table products add column if not exists archived_by text;
alter table products add column if not exists archived_at timestamptz;

-- 2. Record of deleted products. A deleted product's own activity log goes with it,
--    so this keeps who deleted what and when, with a copy of the product as it was.
create table if not exists deleted_products (
  id          text primary key,
  product_id  text not null,
  title       text not null,
  snapshot    jsonb not null default '{}'::jsonb,
  deleted_by  text,
  deleted_at  timestamptz not null default now()
);

-- 3. Access: the same open access the other tables have today (tightened by the security fix)
alter table deleted_products enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'deleted_products' and policyname = 'app access') then
    create policy "app access" on deleted_products for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on deleted_products to anon, authenticated;

commit;

-- Make the app see the new columns straight away
notify pgrst, 'reload schema';
