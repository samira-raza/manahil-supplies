-- Add two columns the app already saves but the live database does not have.
-- Without them, saving a supplier (opening balance) or a user (must reset password) fails
-- with "Could not find the ... column in the schema cache".
--
-- Run once in the Supabase SQL editor: on staging first (done 2026-11-10), then on live (after sign-off).
-- Safe to run again: each step skips what already exists. Nothing is removed.

alter table vendors add column if not exists opening_balance numeric not null default 0;
alter table users add column if not exists must_reset_password boolean not null default false;

-- Make the app see the new columns straight away
notify pgrst, 'reload schema';
