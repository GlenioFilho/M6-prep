-- =====================================================================
-- M6 Motors — admins can clear pay-report records (trash button)
-- Run once: SQL Editor → New query → paste → Run. Safe to run again.
-- =====================================================================
-- The Pay report's 🗑 button deletes one person's records for the period on
-- screen. Only admins may delete; nobody else can touch this table.

drop policy if exists "admin delete completions" on public.service_completions;
create policy "admin delete completions" on public.service_completions
  for delete to authenticated using (public.is_admin());
