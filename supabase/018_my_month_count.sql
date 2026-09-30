-- =====================================================================
-- M6 Motors — "my cars this month" counter for chosen people
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- =====================================================================

-- Who sees the counter (set on the Team screen)
alter table public.profiles
  add column if not exists show_count boolean not null default false;

-- Starting list: Marcelo, Rimmas, Lucas — matched by first name.
update public.profiles
set show_count = true
where split_part(lower(btrim(display_name)), ' ', 1) in ('marcelo', 'rimmas', 'lucas');

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
    or new.show_count   is distinct from old.show_count) then
    raise exception 'Only admins can change this' using errcode = '42501';
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end $$;

-- Everyone can read their OWN completed jobs (the pay report still shows
-- everybody's to admins only).
drop policy if exists "read own completions" on public.service_completions;
create policy "read own completions" on public.service_completions
  for select to authenticated using (user_id = auth.uid());

-- Who has it now
select display_name, show_count from public.profiles order by display_name;
