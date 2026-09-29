-- =====================================================================
-- M6 Motors — Bodyshop (car goes out for panel beating & paint)
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- =====================================================================

-- A car at the bodyshop leaves Stock/Sold (like a loan) until it's back.
alter table public.vehicles drop constraint if exists vehicles_hold_check;
alter table public.vehicles add constraint vehicles_hold_check
  check (hold in ('loan', 'dent', 'bodyshop'));

alter table public.vehicles
  add column if not exists body_notes text not null default '',   -- what's being done
  add column if not exists body_place text not null default '',   -- which bodyshop
  add column if not exists body_since timestamptz,                -- when it went
  add column if not exists body_due   date;                       -- when it's due back

-- Who can send cars to the bodyshop / mark them back (set on the Team screen)
alter table public.profiles
  add column if not exists can_bodyshop boolean not null default false;

create or replace function public.can_bodyshop() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select can_bodyshop from profiles where id = auth.uid()), false)
$$;

-- Only admins may change admin rights and the permission flags.
create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.is_admin     is distinct from old.is_admin
    or new.handles_sold is distinct from old.handles_sold
    or new.sold_alerts  is distinct from old.sold_alerts
    or new.can_dent     is distinct from old.can_dent
    or new.can_bodyshop is distinct from old.can_bodyshop) then
    raise exception 'Only admins can change this' using errcode = '42501';
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end $$;

-- Car details stay admin-only (as in 012). Holds get their own guard below.
create or replace function public.vehicles_details_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.reg_ie           is distinct from old.reg_ie
    or new.reg_imp          is distinct from old.reg_imp
    or new.make             is distinct from old.make
    or new.model            is distinct from old.model
    or new.color            is distinct from old.color
    or new.notes            is distinct from old.notes
    or new.photo_path       is distinct from old.photo_path
    or new.urgent           is distinct from old.urgent
    or new.delivery_day     is distinct from old.delivery_day
    or new.delivery_time    is distinct from old.delivery_time
    or new.delivery_date    is distinct from old.delivery_date
    or new.stock_status     is distinct from old.stock_status
    or new.seller           is distinct from old.seller
    or new.vrt_nct          is distinct from old.vrt_nct
    or new.mechanical_notes is distinct from old.mechanical_notes
    or new.estimate         is distinct from old.estimate) then
    raise exception 'Only admins can edit a car' using errcode = '42501';
  end if;
  return new;
end $$;

-- Loans: admins only. Bodyshop: people with "Can use Bodyshop".
create or replace function public.vehicles_hold_guard() returns trigger
language plpgsql as $$
declare
  loan_change boolean := (old.hold = 'loan' or new.hold = 'loan') and new.hold is distinct from old.hold
    or new.loan_to    is distinct from old.loan_to
    or new.loan_phone is distinct from old.loan_phone
    or new.loan_due   is distinct from old.loan_due
    or new.loan_since is distinct from old.loan_since;
  body_change boolean := (old.hold = 'bodyshop' or new.hold = 'bodyshop') and new.hold is distinct from old.hold
    or new.body_notes is distinct from old.body_notes
    or new.body_place is distinct from old.body_place
    or new.body_since is distinct from old.body_since
    or new.body_due   is distinct from old.body_due;
begin
  if auth.uid() is null then return new; end if;
  if loan_change and not public.is_admin() then
    raise exception 'Only admins can loan cars' using errcode = '42501';
  end if;
  if body_change and not public.can_bodyshop() then
    raise exception 'You don''t have permission to use Bodyshop' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists vehicles_hold_guard on public.vehicles;
create trigger vehicles_hold_guard before update on public.vehicles
  for each row execute function public.vehicles_hold_guard();
