-- =====================================================================
-- M6 Motors — real delivery date for the "To deliver" tab
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- =====================================================================

-- A proper date (so the app knows what "today" is). The old free-text
-- delivery_day column is kept so older records still show what was typed.
alter table public.vehicles add column if not exists delivery_date date;

create index if not exists vehicles_delivery_date_idx on public.vehicles (delivery_date);
