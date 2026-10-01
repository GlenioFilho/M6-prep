-- =====================================================================
-- M6 Motors — nobody can finish, undo or take over someone else's job
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- =====================================================================
-- A service that someone started (doing) or finished (done) can only be
-- changed by that person or by an admin. Starting a job that's still to do
-- stays open to everyone on staff. Same function as in 006, plus that check.

create or replace function public.vehicles_guard() returns trigger
language plpgsql as $$
declare
  k        text;
  n        jsonb := to_jsonb(new);
  o        jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  st       text;
  ost      text;
  owner    uuid;
  all_done boolean;
begin
  foreach k in array public.service_keys() loop
    st  := n->>(k || '_state');
    ost := coalesce(o->>(k || '_state'), 'pending');

    if st is distinct from ost then
      if auth.uid() is not null and not public.can_mark(k) then
        raise exception 'You are not allowed to update the % service', k using errcode = '42501';
      end if;
      -- Someone else's job (in progress or done): only they or an admin
      owner := (o->>(k || '_by'))::uuid;
      if auth.uid() is not null and not public.is_admin()
         and ost in ('doing', 'done') and owner is not null and owner <> auth.uid() then
        raise exception 'This job belongs to %. Only they or a manager can change it.',
          coalesce((select display_name from public.profiles where id = owner), 'someone else')
          using errcode = '42501';
      end if;
      if st = 'pending' then
        n := n || jsonb_build_object(k || '_by', null, k || '_done_at', null);
      elsif st = 'doing' then
        n := n || jsonb_build_object(k || '_by', auth.uid(), k || '_done_at', null);
      else -- done: credit whoever started it, otherwise whoever finished it
        n := n || jsonb_build_object(
          k || '_by', coalesce(o->>(k || '_by'), auth.uid()::text),
          k || '_done_at', now());
      end if;
    elsif auth.uid() is not null and not public.is_admin() then
      -- State unchanged: who/when can't be edited directly
      n := n || jsonb_build_object(k || '_by', o->(k || '_by'), k || '_done_at', o->(k || '_done_at'));
    end if;
  end loop;

  new := jsonb_populate_record(new, n);

  select coalesce(bool_and(n->>(s || '_state') = 'done'), true) into all_done
  from unnest(new.services) s;

  if all_done then
    new.done_at := coalesce(case when tg_op = 'UPDATE' then old.done_at end, now());
  else
    new.done_at := null;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
    new.sold_at      := case when new.status <> 'stock' then now() end;
    new.delivered_at := case when new.status = 'delivered' then now() end;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    if new.status is distinct from old.status then
      new.delivered_at := case when new.status = 'delivered' then now() end;
      if old.status = 'stock' then new.sold_at := now(); end if;
      if new.status = 'stock' then new.sold_at := null; end if;
    else
      new.sold_at := old.sold_at;
      new.delivered_at := old.delivered_at;
    end if;
  end if;

  return new;
end $$;
