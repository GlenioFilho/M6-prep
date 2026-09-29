-- =====================================================================
-- M6 Motors — only admins can loan a car out or mark it returned
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- (Replaces vehicles_details_guard from 012 with the loan fields added.)
-- =====================================================================

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
    or new.estimate         is distinct from old.estimate
    -- loans
    or new.hold             is distinct from old.hold
    or new.loan_to          is distinct from old.loan_to
    or new.loan_phone       is distinct from old.loan_phone
    or new.loan_due         is distinct from old.loan_due
    or new.loan_since       is distinct from old.loan_since) then
    raise exception 'Only admins can do this' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists vehicles_details_guard on public.vehicles;
create trigger vehicles_details_guard before update on public.vehicles
  for each row execute function public.vehicles_details_guard();
