-- =====================================================================
-- M6 Motors — every service open to all staff; Dent becomes a written list
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- =====================================================================

-- Anyone on staff can mark any service (who/when is still recorded by
-- vehicles_guard, so the pay report stays accurate).
create or replace function public.can_mark(service text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff()
$$;

-- Dent no longer takes the car out of Stock/Sold: it's a to-do list entry
-- (dent_since set) with an optional day for the dent service.
alter table public.vehicles add column if not exists dent_date date;

-- Cars that were "at Dent" go back to their normal tab and stay on the list
update public.vehicles
set hold = null, dent_since = coalesce(dent_since, now())
where hold = 'dent';
