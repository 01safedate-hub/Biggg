-- RECONSTRUCTED SOURCE — not byte-for-byte recovery of the lost original migration.
-- Reconstructed from live catalog on 2026-10-28.
-- The public waitlist write path is an explicit, validated SECURITY DEFINER RPC;
-- direct table writes remain revoked from anon/authenticated users.
-- Do not replay against production; this functionality is already deployed there.

create or replace function public.join_service_waitlist(
  _email text,
  _lat double precision,
  _lng double precision,
  _detected_area text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _id uuid;
begin
  if _email is null
     or length(trim(_email)) < 5
     or length(trim(_email)) > 254
     or trim(_email) !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  if _lat is null or _lng is null
     or _lat not between -90 and 90
     or _lng not between -180 and 180 then
    raise exception 'invalid_location' using errcode = '22023';
  end if;

  insert into public.waitlist (email, lat, lng, detected_area)
  values (
    lower(trim(_email)),
    _lat,
    _lng,
    left(coalesce(nullif(trim(_detected_area), ''), 'Uncovered area'), 160)
  )
  returning id into _id;

  return _id;
end;
$function$;

alter table public.waitlist enable row level security;
drop policy if exists waitlist_read on public.waitlist;
create policy waitlist_read on public.waitlist for select to authenticated
using ((select private.is_admin()));
drop policy if exists waitlist_delete on public.waitlist;
create policy waitlist_delete on public.waitlist for delete to authenticated
using ((select private.is_admin()));

revoke all on table public.waitlist from anon, authenticated;
grant select, delete on table public.waitlist to authenticated;
grant all on table public.waitlist to service_role;

revoke execute on function public.join_service_waitlist(text, double precision, double precision, text) from public;
revoke execute on function public.join_service_waitlist(text, double precision, double precision, text) from authenticated;
grant execute on function public.join_service_waitlist(text, double precision, double precision, text) to anon;
