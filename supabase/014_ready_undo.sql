-- =====================================================================
-- M6 Motors — undoing "Ready to go" keeps the original prep start
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- (Replaces vehicles_ready_guard from 011.)
-- =====================================================================

create or replace function public.vehicles_ready_guard() returns trigger
language plpgsql as $$
begin
  if new.ready_state is distinct from old.ready_state then
    if auth.uid() is not null and not public.can_ready() then
      raise exception 'Only the person looking after sold cars can do this' using errcode = '42501';
    end if;
    if new.ready_state = 'doing' and old.ready_state = 'done' then
      -- Undo "Ready to go": back to in progress, same person and start time
      -- (so no new "started prep" notification is sent)
      new.ready_by := old.ready_by;
      new.ready_started_at := old.ready_started_at;
      new.ready_at := null;
    elsif new.ready_state = 'doing' then
      new.ready_by := auth.uid();
      new.ready_started_at := now();
      new.ready_at := null;
    elsif new.ready_state = 'done' then
      new.ready_by := coalesce(old.ready_by, auth.uid());
      new.ready_started_at := coalesce(old.ready_started_at, now());
      new.ready_at := now();
    else
      new.ready_by := null;
      new.ready_started_at := null;
      new.ready_at := null;
    end if;
  elsif auth.uid() is not null then
    new.ready_by := old.ready_by;
    new.ready_started_at := old.ready_started_at;
    new.ready_at := old.ready_at;
  end if;
  return new;
end $$;
