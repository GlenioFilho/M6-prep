-- =====================================================================
-- M6 Motors — which jobs each person does (they only see those on the cards)
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- =====================================================================

-- Empty = sees every job (e.g. salespeople). Admins always see every job.
-- This only decides what each person SEES; anyone on staff can still mark any
-- service, and who/when is still recorded for the pay report.
alter table public.profiles
  add column if not exists services text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_services_check;
alter table public.profiles add constraint profiles_services_check
  check (services <@ array['first', 'full', 'polish', 'decrome', 'windscreen', 'repair']);
