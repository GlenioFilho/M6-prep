-- =====================================================================
-- M6 Motors — only admins add vehicles and mark them as sold
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- =====================================================================

-- Adding a vehicle (to stock, or straight to "sold"): admins only
drop policy if exists "staff add vehicles" on public.vehicles;
drop policy if exists "admin add vehicles" on public.vehicles;
create policy "admin add vehicles" on public.vehicles
  for insert to authenticated with check (public.is_admin());

-- Moving a car out of stock (mark as sold) or back into stock: admins only.
-- Staff can still mark services, edit notes, deliver and reopen.
create or replace function public.vehicles_stock_guard() returns trigger
language plpgsql as $$
begin
  if (old.status = 'stock') is distinct from (new.status = 'stock')
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admins can mark a vehicle as sold' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists vehicles_stock_guard on public.vehicles;
create trigger vehicles_stock_guard before update on public.vehicles
  for each row execute function public.vehicles_stock_guard();
