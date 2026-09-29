-- =====================================================================
-- M6 Motors — "Ready to go" for sold cars, sold alerts and the 8am summary
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- Then update the Edge Function "swift-responder" with
-- supabase/functions/notify/index.ts (Edge Functions → swift-responder → Code → Deploy).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Who looks after sold cars / who gets the sold alerts
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists handles_sold boolean not null default false,  -- can Start prep / Ready to go
  add column if not exists sold_alerts  boolean not null default false;  -- gets prep alerts + 8am summary

-- Only admins may change admin rights or these two flags.
create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.is_admin     is distinct from old.is_admin
    or new.handles_sold is distinct from old.handles_sold
    or new.sold_alerts  is distinct from old.sold_alerts) then
    raise exception 'Only admins can change this' using errcode = '42501';
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. "Ready to go": pending → doing (prep started) → done (ready to go)
-- ---------------------------------------------------------------------
alter table public.vehicles
  add column if not exists ready_state      text not null default 'pending',
  add column if not exists ready_by         uuid references public.profiles(id) on delete set null,
  add column if not exists ready_started_at timestamptz,
  add column if not exists ready_at         timestamptz;

alter table public.vehicles drop constraint if exists vehicles_ready_state_check;
alter table public.vehicles add constraint vehicles_ready_state_check
  check (ready_state in ('pending', 'doing', 'done'));

create or replace function public.can_ready() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or coalesce((select handles_sold from profiles where id = auth.uid()), false)
$$;

-- Who/when is set by the server; only the sold-cars person or an admin can change it.
create or replace function public.vehicles_ready_guard() returns trigger
language plpgsql as $$
begin
  if new.ready_state is distinct from old.ready_state then
    if auth.uid() is not null and not public.can_ready() then
      raise exception 'Only the person looking after sold cars can do this' using errcode = '42501';
    end if;
    if new.ready_state = 'doing' then
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

drop trigger if exists vehicles_ready_guard on public.vehicles;
create trigger vehicles_ready_guard before update on public.vehicles
  for each row execute function public.vehicles_ready_guard();

-- ---------------------------------------------------------------------
-- 3. Notifications: prep started / ready to go, and the 8am summary
-- ---------------------------------------------------------------------
-- One row per announcement already sent (the Edge Function uses it so nothing
-- is sent twice). Written only by the Edge Function; no client access.
create table if not exists public.push_log (
  key     text primary key,
  sent_at timestamptz not null default now()
);
alter table public.push_log enable row level security;

create extension if not exists pg_net;

-- Ask the Edge Function to send something. It re-checks everything itself,
-- so the request only carries an event name (and a vehicle id).
create or replace function public.call_notify(payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url     := 'https://tmqyymrnvcmyzjhfxeqo.supabase.co/functions/v1/swift-responder',
    body    := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- public anon key (same one the app uses)
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtcXl5bXJudmNteXpqaGZ4ZXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjUyMDYsImV4cCI6MjEwNjAwMTIwNn0.0ZT9U60jhhAkSeLTsiyo1WyPswpEi1nfnqy_bvQxhiU'
    )
  );
exception when others then
  raise warning 'call_notify failed: %', sqlerrm;  -- never block the app
end $$;

create or replace function public.notify_ready() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ready_state is distinct from old.ready_state and new.ready_state in ('doing', 'done') then
    perform public.call_notify(jsonb_build_object('vehicle_id', new.id,
      'event', case new.ready_state when 'doing' then 'ready_doing' else 'ready_done' end));
  end if;
  return null;
end $$;

drop trigger if exists vehicles_notify_ready on public.vehicles;
create trigger vehicles_notify_ready after update of ready_state on public.vehicles
  for each row execute function public.notify_ready();

-- 8am (Irish time) summary of today's deliveries. Cron runs in UTC, so it
-- fires at 07:00 and 08:00 UTC; the Edge Function only sends when it's 8am in
-- Dublin (summer or winter) and at most once a day.
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('m6-morning-sold');
exception when others then null;
end $$;

select cron.schedule('m6-morning-sold', '0 7,8 * * *',
  $$select public.call_notify('{"event": "morning"}'::jsonb)$$);
