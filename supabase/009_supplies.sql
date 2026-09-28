-- =====================================================================
-- M6 Motors — supplies list (the team asks for materials, the boss prints it)
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- =====================================================================

create table if not exists public.supplies (
  id           bigint generated always as identity primary key,
  item         text not null check (btrim(item) <> ''),
  qty          text not null default '',
  note         text not null default '',
  status       text not null default 'needed' check (status in ('needed', 'ordered', 'done')),
  requested_by uuid default auth.uid() references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null,
  updated_at   timestamptz
);

create index if not exists supplies_status_idx on public.supplies (status);

-- Who asked and when can't be faked; who changed the status is stamped here.
create or replace function public.supplies_stamp() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.requested_by := coalesce(auth.uid(), new.requested_by);
    new.requested_at := now();
    new.status := 'needed';
    new.updated_by := null;
    new.updated_at := null;
  else
    new.requested_by := old.requested_by;
    new.requested_at := old.requested_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists supplies_stamp on public.supplies;
create trigger supplies_stamp before insert or update on public.supplies
  for each row execute function public.supplies_stamp();

alter table public.supplies enable row level security;

drop policy if exists "staff read supplies"        on public.supplies;
drop policy if exists "staff add supplies"         on public.supplies;
drop policy if exists "own or admin edit supplies" on public.supplies;
drop policy if exists "own or admin remove supplies" on public.supplies;
create policy "staff read supplies" on public.supplies
  for select to authenticated using (public.is_staff());
create policy "staff add supplies" on public.supplies
  for insert to authenticated with check (public.is_staff());
create policy "own or admin edit supplies" on public.supplies
  for update to authenticated
  using (public.is_admin() or requested_by = auth.uid())
  with check (public.is_admin() or requested_by = auth.uid());
create policy "own or admin remove supplies" on public.supplies
  for delete to authenticated using (public.is_admin() or requested_by = auth.uid());

-- Live updates between phones
do $$
begin
  alter publication supabase_realtime add table public.supplies;
exception when duplicate_object then null;
end $$;
