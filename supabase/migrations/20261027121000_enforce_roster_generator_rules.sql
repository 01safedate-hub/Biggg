-- Enforce shared roster rules for both scheduled and manual generation.
create or replace function public.generate_shifts(_from date, _to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _tz text;
  _day date;
  _template record;
  _start timestamptz;
  _finish timestamptz;
  _created integer := 0;
begin
  if not private.is_shift_manager() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if _to < _from or _to - _from > 62 then raise exception 'range_too_large' using errcode = 'P0001'; end if;
  select value->>'timezone' into _tz from public.settings where key='business';
  _tz := coalesce(nullif(_tz,''),'Africa/Lagos');

  for _day in select d::date from generate_series(_from::timestamp,_to::timestamp,interval '1 day') d order by d loop
    for _template in
      select t.staff_id,t.starts_at,t.ends_at from public.shift_templates t
      join public.profiles p on p.id=t.staff_id and p.status='active'
      where t.active and t.weekday=extract(dow from _day)::smallint
      order by t.staff_id
    loop
      _start:=(_day+_template.starts_at) at time zone _tz;
      _finish:=(_day+_template.ends_at+case when _template.ends_at<=_template.starts_at then interval '1 day' else interval '0' end) at time zone _tz;
      if _finish<=_start or _finish-_start>interval '10 hours'
        or exists(select 1 from public.leave_requests l where l.staff_id=_template.staff_id and l.status='approved' and _day between l.start_date and l.end_date)
      then continue; end if;

      if (select count(*) from public.shifts s where s.staff_id=_template.staff_id
        and s.shift_date>=date_trunc('week',_day::timestamp)::date
        and s.shift_date<date_trunc('week',_day::timestamp)::date+7)>=6
      then continue; end if;

      if exists(select 1 from public.shifts s where s.staff_id=_template.staff_id and s.shift_date<>_day
        and _start<s.ends_at+interval '11 hours' and _finish>s.starts_at-interval '11 hours')
      then continue; end if;

      insert into public.shifts(staff_id,shift_date,starts_at,ends_at,created_by)
      values(_template.staff_id,_day,_start,_finish,auth.uid())
      on conflict(staff_id,shift_date) do nothing;
      if found then _created:=_created+1; end if;
    end loop;
  end loop;
  return _created;
end;
$$;