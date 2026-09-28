-- =====================================================================
-- M6 Motors — Vehicle Prep System — database schema
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Profiles (one per Supabase Auth user)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill users created before this script ran
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid())
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

-- Only admins may grant/revoke admin rights. Requests without a user
-- (SQL editor, service role) are trusted, so the first admin can be set here.
create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admins can change admin rights' using errcode = '42501';
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- Team: which staff may mark each restricted service
-- ---------------------------------------------------------------------
create table if not exists public.team_members (
  role    text not null check (role in ('fullValet', 'firstClean', 'polish')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (role, user_id)
);

-- Every service a vehicle can need. Labels live in the app:
--   first = First Clean / Tar Remove, decrome = Window Tint / Dechrome,
--   polish = Polish / Compound, full = Full Valet, windscreen = Windscreen,
--   repair = Repair / Body Shop
create or replace function public.service_keys() returns text[]
language sql immutable as $$
  select array['first', 'full', 'polish', 'decrome', 'windscreen', 'repair']
$$;

-- Can the current user change the state of a service? Any staff member
-- (see 008_*.sql); who/when is still recorded by vehicles_guard.
create or replace function public.can_mark(service text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff()
$$;

-- ---------------------------------------------------------------------
-- Vehicles: one table, status moves stock → in_prep → delivered
-- ---------------------------------------------------------------------
create table if not exists public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  status           text not null default 'stock' check (status in ('stock', 'in_prep', 'delivered')),

  reg_imp          text,
  reg_ie           text,
  make             text not null default '',
  model            text not null default '',
  color            text not null default '',
  notes            text not null default '',
  photo_path       text,

  -- Which services this vehicle needs
  services         text[] not null default '{}'
                   check (services <@ array['first', 'full', 'polish', 'decrome', 'windscreen', 'repair']),

  -- Per-service state (flat columns; kept correct by vehicles_guard)
  first_state      text not null default 'pending' check (first_state   in ('pending', 'doing', 'done')),
  first_by         uuid references public.profiles(id) on delete set null,
  first_done_at    timestamptz,
  full_state       text not null default 'pending' check (full_state    in ('pending', 'doing', 'done')),
  full_by          uuid references public.profiles(id) on delete set null,
  full_done_at     timestamptz,
  polish_state     text not null default 'pending' check (polish_state  in ('pending', 'doing', 'done')),
  polish_by        uuid references public.profiles(id) on delete set null,
  polish_done_at   timestamptz,
  decrome_state    text not null default 'pending' check (decrome_state in ('pending', 'doing', 'done')),
  decrome_by       uuid references public.profiles(id) on delete set null,
  decrome_done_at  timestamptz,
  windscreen_state   text not null default 'pending' check (windscreen_state in ('pending', 'doing', 'done')),
  windscreen_by      uuid references public.profiles(id) on delete set null,
  windscreen_done_at timestamptz,
  repair_state     text not null default 'pending' check (repair_state  in ('pending', 'doing', 'done')),
  repair_by        uuid references public.profiles(id) on delete set null,
  repair_done_at   timestamptz,

  -- Sold vehicles only
  urgent           boolean not null default false,
  delivery_day     text not null default '',
  delivery_time    text not null default '',
  delivery_date    date,

  -- Out of the normal flow: on loan to a customer, or at dent repair (005_*.sql)
  hold             text check (hold in ('loan', 'dent')),
  loan_to          text not null default '',
  loan_phone       text not null default '',
  loan_since       timestamptz,
  loan_due         date,
  dent_notes       text not null default '',
  dent_since       timestamptz,   -- set = on the Dent list (car stays in its tab)
  dent_date        date,          -- day of the dent service
  stock_status     text not null default 'in_stock' check (stock_status in ('in_stock', 'due_in')),
  seller           text not null default '',
  vrt_nct          text not null default '',
  mechanical_notes text not null default '',
  estimate         text not null default '',

  sold_at          timestamptz,
  delivered_at     timestamptz,
  done_at          timestamptz,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.profiles(id) on delete set null,

  constraint plate_required check (
    coalesce(btrim(reg_imp), '') <> '' or coalesce(btrim(reg_ie), '') <> ''
  )
);

create index if not exists vehicles_status_idx on public.vehicles (status);
create index if not exists vehicles_delivered_at_idx on public.vehicles (delivered_at);

-- Enforces the service rules server-side:
--  * only allowed users can change a service's state
--  * who/when is always set by the server (can't be forged by the client)
--  * done_at / sold_at / delivered_at maintained automatically
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

drop trigger if exists vehicles_guard on public.vehicles;
create trigger vehicles_guard before insert or update on public.vehicles
  for each row execute function public.vehicles_guard();

-- ---------------------------------------------------------------------
-- Service completion log — the source for the monthly/commission report.
-- Survives vehicle deletion (including the 30-day purge of delivered cars),
-- so a month's figures never change after the cars are cleaned up.
-- ---------------------------------------------------------------------
create table if not exists public.service_completions (
  id          bigint generated always as identity primary key,
  vehicle_id  uuid references public.vehicles(id) on delete set null,
  service     text not null,
  user_id     uuid references public.profiles(id) on delete set null,
  user_name   text not null default '',
  plate       text not null default '',
  vehicle     text not null default '',
  done_at     timestamptz not null
);

create index if not exists service_completions_done_at_idx on public.service_completions (done_at);
create index if not exists service_completions_vehicle_idx on public.service_completions (vehicle_id, service);

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

drop trigger if exists vehicles_log_completions on public.vehicles;
create trigger vehicles_log_completions after insert or update on public.vehicles
  for each row execute function public.vehicles_log_completions();

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.team_members        enable row level security;
alter table public.vehicles            enable row level security;
alter table public.service_completions enable row level security;

drop policy if exists "staff read profiles"   on public.profiles;
drop policy if exists "update own or admin"   on public.profiles;
create policy "staff read profiles" on public.profiles
  for select to authenticated using (public.is_staff());
create policy "update own or admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "staff read team"   on public.team_members;
drop policy if exists "admin add team"    on public.team_members;
drop policy if exists "admin remove team" on public.team_members;
create policy "staff read team" on public.team_members
  for select to authenticated using (public.is_staff());
create policy "admin add team" on public.team_members
  for insert to authenticated with check (public.is_admin());
create policy "admin remove team" on public.team_members
  for delete to authenticated using (public.is_admin());

drop policy if exists "staff read vehicles"   on public.vehicles;
drop policy if exists "staff add vehicles"    on public.vehicles;
drop policy if exists "admin add vehicles"    on public.vehicles;
drop policy if exists "staff update vehicles" on public.vehicles;
drop policy if exists "admin delete vehicles" on public.vehicles;
create policy "staff read vehicles" on public.vehicles
  for select to authenticated using (public.is_staff());
-- Adding vehicles and marking them sold is admin-only (see 003_*.sql)
create policy "admin add vehicles" on public.vehicles
  for insert to authenticated with check (public.is_admin());
create policy "staff update vehicles" on public.vehicles
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "admin delete vehicles" on public.vehicles
  for delete to authenticated using (public.is_admin());

-- Report data is admin-only; rows are written only by the trigger above.
drop policy if exists "admin read completions" on public.service_completions;
create policy "admin read completions" on public.service_completions
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Photo storage (private bucket, staff only)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', false)
on conflict (id) do nothing;

drop policy if exists "staff read photos"   on storage.objects;
drop policy if exists "staff upload photos" on storage.objects;
drop policy if exists "staff delete photos" on storage.objects;
create policy "staff read photos" on storage.objects
  for select to authenticated using (bucket_id = 'vehicle-photos' and public.is_staff());
create policy "staff upload photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'vehicle-photos' and public.is_staff());
create policy "staff delete photos" on storage.objects
  for delete to authenticated using (bucket_id = 'vehicle-photos' and public.is_staff());

-- ---------------------------------------------------------------------
-- Live updates between phones
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.vehicles;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.team_members;
exception when duplicate_object then null;
end $$;
