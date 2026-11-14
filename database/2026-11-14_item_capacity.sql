-- D42 (agreed 14 Nov 2026): capacity of each item that goes into the carton, e.g. 30 ML.
-- Optional. Size (unit_size) and packing stay as they are; size is no longer required by the app.
-- Safe to run more than once.
alter table public.products add column if not exists item_capacity numeric;
alter table public.products add column if not exists item_capacity_unit text;

-- Check
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'products' and column_name in ('item_capacity', 'item_capacity_unit');
