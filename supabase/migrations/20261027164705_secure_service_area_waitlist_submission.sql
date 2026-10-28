-- RECONSTRUCTED SOURCE — not byte-for-byte recovery of the lost original migration.
-- Current production catalog (2026-10-28) shows only admin SELECT/DELETE policies on
-- public.waitlist; INSERT/SELECT/UPDATE/DELETE grants remain server-side-oriented.
-- The public write path must use a server-controlled endpoint or narrowly scoped RPC
-- with input validation, and must never permit anonymous direct table insertion.
-- This migration documents a deny-by-default baseline; the original endpoint/policy
-- design could not be recovered from Git history and is intentionally not invented.

alter table public.waitlist enable row level security;

drop policy if exists waitlist_read on public.waitlist;
create policy waitlist_read
  on public.waitlist for select
  to authenticated
  using ((select private.is_admin()));

drop policy if exists waitlist_delete on public.waitlist;
create policy waitlist_delete
  on public.waitlist for delete
  to authenticated
  using ((select private.is_admin()));

revoke all on table public.waitlist from anon, authenticated;
grant select, delete on table public.waitlist to authenticated;
grant all on table public.waitlist to service_role;
