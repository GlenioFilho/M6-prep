-- =====================================================================
-- M6 Motors — six services
--   First Clean / Tar Remove, Window Tint / Dechrome, Polish / Compound,
--   Full Valet, Windscreen (new), Repair / Body Shop (new)
-- Existing keys keep their data; only the labels change (in the app).
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- =====================================================================

alter table public.vehicles
  add column if not exists windscreen_state   text not null default 'pending',
  add column if not exists windscreen_by      uuid references public.profiles(id) on delete set null,
  add column if not exists windscreen_done_at timestamptz,
  add column if not exists repair_state       text not null default 'pending',
  add column if not exists repair_by          uuid references public.profiles(id) on delete set null,
  add column if not exists repair_done_at     timestamptz;

alter table public.vehicles drop constraint if exists vehicles_windscreen_state_check;
alter table public.vehicles add constraint vehicles_windscreen_state_check
  check (windscreen_state in ('pending', 'doing', 'done'));
alter table public.vehicles drop constraint if exists vehicles_repair_state_check;
alter table public.vehicles add constraint vehicles_repair_state_check
  check (repair_state in ('pending', 'doing', 'done'));

-- Which services a vehicle may list
alter table public.vehicles drop constraint if exists vehicles_services_check;
alter table public.vehicles add constraint vehicles_services_check
  check (services <@ array['first', 'full', 'polish', 'decrome', 'windscreen', 'repair']);

create or replace function public.service_keys() returns text[]
language sql immutable as $$
  select array['first', 'full', 'polish', 'decrome', 'windscreen', 'repair']
$$;

-- Can the current user change the state of a service?
-- Admins: always. First Clean / Full Valet / Polish: members of that team.
-- Everything else (Dechrome, Windscreen, Repair): any staff member.
create or replace function public.can_mark(service text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() and (
    public.is_admin()
    or service not in ('first', 'full', 'polish')
    or exists (
      select 1 from team_members t
      where t.user_id = auth.uid()
        and t.role = case service
                       when 'first'  then 'firstClean'
                       when 'full'   then 'fullValet'
                       when 'polish' then 'polish'
                     end
    )
  )
$$;

create or replace function public.vehicles_guard() returns trigger
language plpgsql as $$
declare
  k        text;
  n        jsonb := to_jsonb(new);
  o        jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  st       text;
  ost      text;
  all_done boolean;
begin
  foreach k in array public.service_keys() loop
    st  := n->>(k || '_state');
    ost := coalesce(o->>(k || '_state'), 'pending');

    if st is distinct from ost then
      if auth.uid() is not null and not public.can_mark(k) then
        raise exception 'You are not allowed to update the % service', k using errcode = '42501';
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

create or replace function public.vehicles_log_completions() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k    text;
  n    jsonb := to_jsonb(new);
  o    jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  nst  text;
  ost  text;
  same boolean;
  uid  uuid;
begin
  foreach k in array public.service_keys() loop
    nst  := n->>(k || '_state');
    ost  := coalesce(o->>(k || '_state'), 'pending');
    same := (o->>(k || '_by')) is not distinct from (n->>(k || '_by'))
        and (o->>(k || '_done_at')) is not distinct from (n->>(k || '_done_at'));

    if ost = 'done' and not (nst = 'done' and same) then
      delete from service_completions where vehicle_id = new.id and service = k;
    end if;

    if nst = 'done' and not (ost = 'done' and same) then
      uid := (n->>(k || '_by'))::uuid;
      insert into service_completions (vehicle_id, service, user_id, user_name, plate, vehicle, done_at)
      values (
        new.id, k, uid,
        coalesce((select display_name from profiles where id = uid), ''),
        coalesce(nullif(btrim(new.reg_ie), ''), btrim(new.reg_imp), ''),
        btrim(new.make || ' ' || new.model),
        (n->>(k || '_done_at'))::timestamptz
      );
    end if;
  end loop;
  return null;
end $$;
