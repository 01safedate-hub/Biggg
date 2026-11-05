-- Allow active subscribers to request a separately paid one-time pickup after
-- their two included subscription pickup requests have been used.
-- The app gates this option in the customer booking flow; the RPC still enforces
-- authentication, active-account status, coverage, slot capacity and fare quoting.
create or replace function public.book_one_time_pickup(
  _lat double precision,
  _lng double precision,
  _address text,
  _notes text,
  _slot timestamp with time zone default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _a text := nullif(trim(_address), '');
  _q jsonb;
  _id uuid;
  _scheduled timestamptz;
begin
  if auth.uid() is null or not private.is_active() then
    raise exception 'account_restricted' using errcode = 'P0001';
  end if;
  if _a is null or length(_a) < 5 or length(_a) > 300 then
    raise exception 'address_required' using errcode = 'P0001';
  end if;
  if length(coalesce(_notes, '')) > 500 then
    raise exception 'notes_too_long' using errcode = 'P0001';
  end if;
  _q := public.quote_one_time_pickup(_lat, _lng);
  if not coalesce((_q->>'served')::boolean, false) then
    raise exception 'not_served' using errcode = 'P0001';
  end if;
  if _q->>'zone_id' is null or _q->>'total_fare_kobo' is null then
    raise exception 'service_area_unavailable' using errcode = 'P0001';
  end if;
  _scheduled := coalesce(_slot, nullif(_q->>'scheduled_for', '')::timestamptz, now());
  if _slot is not null then
    perform pg_advisory_xact_lock(hashtext('slot:' || _slot::text));
    if private.slot_remaining(_slot, null) <= 0 then
      raise exception 'slot_unavailable' using errcode = 'P0001';
    end if;
    if _slot <= now() then raise exception 'slot_invalid' using errcode = 'P0001'; end if;
  end if;
  insert into public.orders (
    customer_id, source, status, zone_id, pickup_lat, pickup_lng, pickup_address,
    pickup_distance_km, after_hours, scheduled_for, pickup_fare_kobo,
    delivery_fare_kobo, notes, created_by
  ) values (
    auth.uid(), 'one_time', 'awaiting_fare_payment', (_q->>'zone_id')::uuid,
    _lat, _lng, _a, nullif(_q->>'distance_km','')::numeric,
    coalesce((_q->>'after_hours')::boolean, false), _scheduled,
    (_q->>'pickup_fare_kobo')::bigint + (_q->>'extra_distance_fare_kobo')::bigint,
    (_q->>'delivery_fare_kobo')::bigint, nullif(trim(_notes), ''), auth.uid()
  ) returning id into _id;
  return _id;
end
$function$;
grant execute on function public.book_one_time_pickup(double precision,double precision,text,text,timestamptz) to authenticated;
revoke execute on function public.book_one_time_pickup(double precision,double precision,text,text,timestamptz) from anon, public;
