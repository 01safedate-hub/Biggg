-- Enforce core roster rules during automated generation and keep absence job
-- compatible with the existing mark_absences() return type.
create or replace function private.generate_shifts_system()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _tz text;
  _today date;
  _day date;
  _template record;
  _start timestamptz;
  _finish timestamptz;
  _duration interval;
  _created integer := 0;
begin
  select value->>'timezone'
    into _tz
    from public.settings
   where key = 'business';
  _tz := coalesce(nullif(_tz, ''), 'Africa/Lagos');
  _today := (now() at time zone _tz)::date;

  for _day in select d::date
                from generate_series(_today::timestamp, (_today + 28)::timestamp, interval '1 day') d
                order by d
  loop
    for _template in
      select t.staff_id, t.starts_at, t.ends_at
        from public.shift_templates t
        join public.profiles p on p.id = t.staff_id and p.status = 'active'
       where t.active
         and t.weekday = extract(dow from _day)::smallint
       order by t.staff_id
    loop
      _start := (_day + _template.starts_at) at time zone _tz;
      _finish := (_day + _template.ends_at
                  + case when _template.ends_at <= _template.starts_at
                         then interval '1 day' else interval '0' end) at time zone _tz;
      _duration := _finish - _start;

      -- Skip invalid-length shifts and approved leave.
      if _duration <= interval '0 hours' or _duration > interval '10 hours'
         or exists (
           select 1 from public.leave_requests l
            where l.staff_id = _template.staff_id
              and l.status = 'approved'
              and _day between l.start_date and l.end_date
         )
      then
        continue;
      end if;

      -- Maximum six shifts in the Monday-Sunday week.
      if (select count(*) from public.shifts s
           where s.staff_id = _template.staff_id
             and s.shift_date >= date_trunc('week', _day::timestamp)::date
             and s.shift_date < (date_trunc('week', _day::timestamp)::date + 7)) >= 6
      then
        continue;
      end if;

      -- Keep at least 11 hours between this shift and every existing shift.
      if exists (
        select 1 from public.shifts s
         where s.staff_id = _template.staff_id
           and s.shift_date <> _day
           and _start < s.ends_at + interval '11 hours'
           and _finish > s.starts_at - interval '11 hours'
      ) then
        continue;
      end if;

      insert into public.shifts (staff_id, shift_date, starts_at, ends_at, created_by)
      values (_template.staff_id, _day, _start, _finish, null)
      on conflict (staff_id, shift_date) do nothing;

      if found then
        _created := _created + 1;
      end if;
    end loop;
  end loop;

  return _created;
end;
$$;

create or replace function private.record_absences_system()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mark_absences();
end;
$$;

revoke all on function private.generate_shifts_system() from public, anon, authenticated;
revoke all on function private.record_absences_system() from public, anon, authenticated;

do $$
declare _job record;
begin
  for _job in
    select jobid from cron.job
     where jobname in ('laundrypoint-generate-shifts-nightly', 'laundrypoint-record-absences-hourly')
  loop
    perform cron.unschedule(_job.jobid);
  end loop;
end $$;

select cron.schedule(
  'laundrypoint-generate-shifts-nightly',
  '15 23 * * *',
  $job$ select private.generate_shifts_system(); $job$
);

select cron.schedule(
  'laundrypoint-record-absences-hourly',
  '0 * * * *',
  $job$ select private.record_absences_system(); $job$
);
