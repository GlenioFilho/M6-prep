-- =====================================================================
-- M6 Motors — "Repair / Body Shop" is no longer a job (the Bodyshop tab
-- replaced it). Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- =====================================================================
-- Takes it off every car's list of jobs and off everyone's jobs on the Team
-- screen, so cars aren't kept waiting for it ("All services done" and the
-- move to Sold count only the jobs a car still has). Old records stay.

update public.vehicles
set services = array_remove(services, 'repair')
where 'repair' = any(services);

update public.profiles
set services = array_remove(services, 'repair')
where 'repair' = any(services);

-- Check: both should be 0
select
  (select count(*) from public.vehicles where 'repair' = any(services)) as cars_still_with_repair,
  (select count(*) from public.profiles where 'repair' = any(services)) as people_still_with_repair;
