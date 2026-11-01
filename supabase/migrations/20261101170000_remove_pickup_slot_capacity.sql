-- Pickup times are customer preferences; do not reject bookings because a slot is full.
-- Keep date, lead-time, opening-hours and interval-alignment validation.
create or replace function private.slot_remaining(_start timestamp with time zone, _exclude uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  _s jsonb;
  _b jsonb;
  _tz text;
  _w int;
  _open time;
  _close time;
  _local timestamp;
  _today date;
  _mins int;
begin
  select value into _s from public.settings where key = 'slots';
  select value into _b from public.settings where key = 'business';
  if not coalesce((_s->>'enabled')::boolean, false) then return -1; end if;

  _tz := coalesce(_b->>'timezone', 'Africa/Lagos');
  _w := greatest(15, coalesce((_s->>'window_minutes')::int, 60));
  _open := (_b->>'opening_time')::time;
  _close := (_b->>'closing_time')::time;
  _local := _start at time zone _tz;
  _today := (now() at time zone _tz)::date;

  -- Capacity is deliberately not enforced: the selected time is a preference
  -- and operations assigns an agent after the request is created.
  if _local::date < _today
     or _local::date > _today + coalesce((_s->>'max_days_ahead')::int, 7) then return -1; end if;
  if _start < now() + make_interval(mins => coalesce((_s->>'min_lead_minutes')::int, 120)) then return -1; end if;
  if _local::time < _open or (_local::time + make_interval(mins => _w)) > _close then return -1; end if;

  _mins := (extract(epoch from (_local::time - _open)) / 60)::int;
  if _mins % _w <> 0 then return -1; end if;
  return 1;
end
$function$;

comment on function private.slot_remaining(timestamp with time zone, uuid) is
'Validates pickup time windows without enforcing per-slot capacity; requests await agent assignment.';
