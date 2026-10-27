create or replace function private.generate_shifts_system()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare _tz text; _from date; _to date; _day date; _template record; _start timestamptz; _finish timestamptz; _created int:=0;
begin
 select value->>'timezone' into _tz from public.settings where key='business';
 _tz:=coalesce(nullif(_tz,''),'Africa/Lagos');
 _from:=(now() at time zone _tz)::date; _to:=_from+28;
 for _day in select d::date from generate_series(_from::timestamp,_to::timestamp,interval '1 day') d order by d loop
  if exists(select 1 from public.roster_blackouts b where b.blackout_date=_day and b.zone_id is null) then continue; end if;
  for _template in select t.staff_id,t.starts_at,t.ends_at from public.shift_templates t join public.profiles p on p.id=t.staff_id and p.status='active' where t.active and t.weekday=extract(dow from _day)::smallint order by t.staff_id loop
   _start:=(_day+_template.starts_at) at time zone _tz;
   _finish:=(_day+_template.ends_at+case when _template.ends_at<=_template.starts_at then interval '1 day' else interval '0' end) at time zone _tz;
   if _finish<=_start or _finish-_start>interval '10 hours' or exists(select 1 from public.leave_requests l where l.staff_id=_template.staff_id and l.status='approved' and _day between l.start_date and l.end_date) then continue; end if;
   if (select count(*) from public.shifts s where s.staff_id=_template.staff_id and s.shift_date>=date_trunc('week',_day::timestamp)::date and s.shift_date<date_trunc('week',_day::timestamp)::date+7)>=6 then continue; end if;
   if exists(select 1 from public.shifts s where s.staff_id=_template.staff_id and s.shift_date<>_day and _start<s.ends_at+interval '11 hours' and _finish>s.starts_at-interval '11 hours') then continue; end if;
   insert into public.shifts(staff_id,shift_date,starts_at,ends_at,created_by) values(_template.staff_id,_day,_start,_finish,null) on conflict(staff_id,shift_date) do nothing;
   if found then _created:=_created+1; end if;
  end loop;
 end loop; return _created;
end $$;
revoke all on function private.generate_shifts_system() from public, anon, authenticated;
