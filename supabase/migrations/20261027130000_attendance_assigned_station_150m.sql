create or replace function public.check_in(_lat double precision, _lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _cfg jsonb;
  _early int;
  _dist double precision;
  _s public.shifts;
  _late int;
  _sur bigint := 0;
  _id uuid;
  _next timestamptz;
  _station record;
begin
  if not private.is_staff() then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if _lat is null or _lng is null or abs(_lat) > 90 or abs(_lng) > 180 then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;

  select z.id, z.name, z.centre_lat, z.centre_lng
    into _station
    from public.staff_profiles sp
    join public.zones z on z.id = sp.station_zone_id
   where sp.user_id = auth.uid();

  if not found or _station.centre_lat is null or _station.centre_lng is null then
    raise exception 'station_not_configured' using errcode = 'P0001';
  end if;

  _dist := private.distance_km(_station.centre_lat::float8, _station.centre_lng::float8, _lat, _lng) * 1000;
  if _dist > 150 then
    raise exception 'outside_zone' using errcode = 'P0001',
      detail = round(_dist)::text || ' m from assigned station ' || _station.name;
  end if;

  select value into _cfg from public.settings where key = 'attendance';
  _early := coalesce((_cfg->>'checkin_early_minutes')::int, 15);

  select * into _s from public.shifts
   where staff_id = auth.uid()
     and now() >= starts_at - make_interval(mins => _early)
     and now() < ends_at
   order by starts_at limit 1;

  if not found then
    select min(starts_at) into _next from public.shifts
     where staff_id = auth.uid() and starts_at > now() and starts_at < now() + interval '1 day';
    if _next is not null then
      raise exception 'shift_not_started' using errcode = 'P0001', detail = _next::text;
    end if;
    raise exception 'no_shift' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.attendance where shift_id = _s.id) then
    raise exception 'already_checked_in' using errcode = 'P0001';
  end if;

  _late := greatest(0, floor(extract(epoch from (now() - _s.starts_at)) / 60))::int;
  if _late > 0 then
    select coalesce(amount_kobo, 0) into _sur from public.surcharge_rules
     where kind = 'late' and active and _late >= from_minutes and _late <= coalesce(to_minutes, 2147483647)
     order by from_minutes desc limit 1;
    _sur := coalesce(_sur, 0);
  end if;

  insert into public.attendance (staff_id, shift_id, checked_in_at, in_lat, in_lng, minutes_late, status, surcharge_kobo)
  values (auth.uid(), _s.id, now(), _lat, _lng, _late, case when _late > 0 then 'late' else 'present' end, _sur)
  returning id into _id;

  return jsonb_build_object('attendance_id', _id, 'shift_id', _s.id, 'minutes_late', _late, 'surcharge_kobo', _sur, 'station_id', _station.id, 'distance_m', round(_dist));
end
$function$;