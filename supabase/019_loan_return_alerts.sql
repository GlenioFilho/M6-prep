-- =====================================================================
-- M6 Motors — notification when a car comes back from loan
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- Then redeploy the Edge Function (swift-responder) with the new
-- supabase/functions/notify/index.ts.
-- =====================================================================

-- Who gets it (set on the Team screen). Starting list: Glenio and Yann.
alter table public.profiles
  add column if not exists loan_alerts boolean not null default false;

update public.profiles
set loan_alerts = true
where split_part(lower(btrim(display_name)), ' ', 1) in ('glenio', 'yann');

-- Only admins may change admin rights and the permission flags.
create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.is_admin     is distinct from old.is_admin
    or new.handles_sold is distinct from old.handles_sold
    or new.sold_alerts  is distinct from old.sold_alerts
    or new.can_dent     is distinct from old.can_dent
    or new.can_bodyshop is distinct from old.can_bodyshop
    or new.show_count   is distinct from old.show_count
    or new.loan_alerts  is distinct from old.loan_alerts) then
    raise exception 'Only admins can change this' using errcode = '42501';
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end $$;

-- When and by whom a loan was last closed (set by the database, not the app)
alter table public.vehicles
  add column if not exists loan_returned_at timestamptz,
  add column if not exists loan_returned_by uuid references public.profiles(id) on delete set null;

create or replace function public.vehicles_loan_return_stamp() returns trigger
language plpgsql as $$
begin
  if old.hold = 'loan' and new.hold is distinct from 'loan' then
    new.loan_returned_at := now();
    new.loan_returned_by := auth.uid();
  else
    new.loan_returned_at := old.loan_returned_at;
    new.loan_returned_by := old.loan_returned_by;
  end if;
  return new;
end $$;

drop trigger if exists vehicles_loan_return_stamp on public.vehicles;
create trigger vehicles_loan_return_stamp before update on public.vehicles
  for each row execute function public.vehicles_loan_return_stamp();

-- Ask the Edge Function to announce it (it re-checks everything itself)
create or replace function public.notify_loan_return() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.hold = 'loan' and new.hold is distinct from 'loan' and new.status <> 'delivered' then
    perform public.call_notify(jsonb_build_object('vehicle_id', new.id, 'event', 'loan_returned'));
  end if;
  return null;
end $$;

drop trigger if exists vehicles_notify_loan_return on public.vehicles;
create trigger vehicles_notify_loan_return after update of hold on public.vehicles
  for each row execute function public.notify_loan_return();

-- Who gets it now
select display_name, loan_alerts from public.profiles order by display_name;
