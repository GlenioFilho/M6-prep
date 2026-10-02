-- =====================================================================
-- M6 Motors — the same car can't be in the app twice
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- =====================================================================
-- A car can't be added (or reopened, or have its plate changed) while another
-- car that isn't delivered yet has the same registration — IRL or IMP, ignoring
-- spaces, dashes and upper/lower case ("221-D-20541" = "221d20541").
-- Delivered cars don't count, so a car that comes back later can be added again.

create or replace function public.plate_key(p text) returns text
language sql immutable as $$
  select nullif(regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g'), '')
$$;

create or replace function public.vehicles_unique_plate() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dup record;
begin
  if new.status = 'delivered' then return new; end if;
  -- Nothing that matters changed (same plates, still not delivered)
  if tg_op = 'UPDATE' and old.status <> 'delivered'
     and plate_key(new.reg_ie) is not distinct from plate_key(old.reg_ie)
     and plate_key(new.reg_imp) is not distinct from plate_key(old.reg_imp) then
    return new;
  end if;

  select v.make, v.model, coalesce(nullif(btrim(v.reg_ie), ''), v.reg_imp) as plate into dup
  from vehicles v
  where v.id <> new.id and v.status <> 'delivered'
    and (plate_key(v.reg_ie)  in (plate_key(new.reg_ie), plate_key(new.reg_imp))
      or plate_key(v.reg_imp) in (plate_key(new.reg_ie), plate_key(new.reg_imp)))
  limit 1;

  if found then
    raise exception 'duplicate_plate: % % (%) is already in the app.',
      dup.make, dup.model, dup.plate using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists vehicles_unique_plate on public.vehicles;
create trigger vehicles_unique_plate before insert or update on public.vehicles
  for each row execute function public.vehicles_unique_plate();

-- Cars that are ALREADY in the app twice (not delivered). Fix these by hand:
-- delete the extra one in the app (Delete button) or correct its plate (Edit).
select plate_key(coalesce(nullif(btrim(reg_ie), ''), reg_imp)) as plate,
       count(*) as copies,
       string_agg(make || ' ' || model || ' [' || status || ']', '  |  ') as cars
from public.vehicles
where status <> 'delivered'
group by 1
having count(*) > 1
order by 1;
