-- D44 (agreed 14 Nov 2026): the Super Admin can allow an Admin to correct (not delete) price entries.
-- Default off, so nothing changes for existing users. Safe to run more than once.
alter table public.users add column if not exists can_correct_prices boolean not null default false;

-- Check
select column_name, data_type, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'users' and column_name = 'can_correct_prices';
