-- =====================================================================
-- M6 Motors — only chosen people can use Dent (add to the list / mark done)
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- =====================================================================

alter table public.profiles
  add column if not exists can_dent boolean not null default false;

-- Starting list (change later on the Team screen): Glenio, Lucas, Rimmas,
-- Bart, Marcelo, Yann — matched by first name.
update public.profiles
set can_dent = true
where split_part(lower(btrim(display_name)), ' ', 1)
      in ('glenio', 'lucas', 'rimmas', 'bart', 'marcelo', 'yann');

-- Only admins may change admin rights and the permission flags.
create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.is_admin     is distinct from old.is_admin
    or new.handles_sold is distinct from old.handles_sold
    or new.sold_alerts  is distinct from old.sold_alerts
    or new.can_dent     is distinct from old.can_dent) then
    raise exception 'Only admins can change this' using errcode = '42501';
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end $$;

-- Adding to / removing from the Dent list needs the permission.
create or replace function public.can_dent() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select can_dent from profiles where id = auth.uid()), false)
$$;

create or replace function public.vehicles_dent_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.can_dent() and (
       new.dent_notes is distinct from old.dent_notes
    or new.dent_date  is distinct from old.dent_date
    or new.dent_since is distinct from old.dent_since) then
    raise exception 'You don''t have permission to use Dent' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists vehicles_dent_guard on public.vehicles;
create trigger vehicles_dent_guard before update on public.vehicles
  for each row execute function public.vehicles_dent_guard();

-- Who has it now
select display_name, can_dent from public.profiles order by display_name;
