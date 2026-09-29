-- =====================================================================
-- M6 Motors — Start prep / Ready to go only for "Looks after sold cars"
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- (Admins no longer get it automatically; tick it for them on the Team
-- screen if they need to cover.)
-- =====================================================================

create or replace function public.can_ready() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select handles_sold from profiles where id = auth.uid()), false)
$$;
