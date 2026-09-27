-- =====================================================================
-- M6 Motors — push notifications ("new car in stock")
-- Run once, after schema.sql: SQL Editor → New query → paste → Run.
-- Safe to run again.
-- =====================================================================

-- Phones that asked to be notified (one row per phone/browser)
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own subscriptions read"   on public.push_subscriptions;
drop policy if exists "own subscriptions add"    on public.push_subscriptions;
drop policy if exists "own subscriptions update" on public.push_subscriptions;
drop policy if exists "own subscriptions remove" on public.push_subscriptions;
create policy "own subscriptions read" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "own subscriptions add" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid() and public.is_staff());
create policy "own subscriptions update" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own subscriptions remove" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- Each vehicle/event is announced at most once. Written only by the Edge
-- Function (service role); no client policies on purpose.
create table if not exists public.push_sent (
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  event      text not null,
  sent_at    timestamptz not null default now(),
  primary key (vehicle_id, event)
);
alter table public.push_sent enable row level security;

-- When a car is added to stock, ask the Edge Function (deployed in Supabase
-- as "swift-responder"; code in supabase/functions/notify) to send the
-- notifications. The function re-checks the vehicle itself, so this call
-- carries no trust: it only passes the vehicle id.
create extension if not exists pg_net;

create or replace function public.notify_new_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'stock' then
    begin
      perform net.http_post(
        url     := 'https://tmqyymrnvcmyzjhfxeqo.supabase.co/functions/v1/swift-responder',
        body    := jsonb_build_object('vehicle_id', new.id, 'event', 'new_stock'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          -- public anon key (same one the app uses)
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtcXl5bXJudmNteXpqaGZ4ZXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjUyMDYsImV4cCI6MjEwNjAwMTIwNn0.0ZT9U60jhhAkSeLTsiyo1WyPswpEi1nfnqy_bvQxhiU'
        )
      );
    exception when others then
      -- Never block saving a vehicle because a notification failed
      raise warning 'notify_new_stock failed: %', sqlerrm;
    end;
  end if;
  return null;
end $$;

drop trigger if exists vehicles_notify_new_stock on public.vehicles;
create trigger vehicles_notify_new_stock after insert on public.vehicles
  for each row execute function public.notify_new_stock();
