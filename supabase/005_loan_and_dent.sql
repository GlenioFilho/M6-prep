-- =====================================================================
-- M6 Motors — Loan (customer courtesy car) and Dent (paintless dent repair)
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- =====================================================================

-- A car on loan or at dent leaves Stock/Sold until it comes back.
alter table public.vehicles
  add column if not exists hold       text check (hold in ('loan', 'dent')),
  add column if not exists loan_to    text not null default '',
  add column if not exists loan_phone text not null default '',
  add column if not exists loan_since timestamptz,
  add column if not exists loan_due   date,
  add column if not exists dent_notes text not null default '',
  add column if not exists dent_since timestamptz;

create index if not exists vehicles_hold_idx on public.vehicles (hold);
