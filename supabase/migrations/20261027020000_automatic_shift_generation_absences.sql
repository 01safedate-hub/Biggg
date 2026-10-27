-- Automatic roster generation and absence recording.
-- The existing generate_shifts() RPC requires an authenticated shift manager,
-- so the scheduled job expands templates directly under this restricted private wrapper.
create extension if not exists pg_cron;

create or replace function private.generate_shifts_system()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _tz text;
  _today date;
  _created integer := 0;
begin
  select coalesce(value->>'timezone', 'Africa/Lagos')
    into _tz
    from public.settings
   where key = 'business';

  _tz := coalesce(_tz, 'Africa/Lagos');
  _today := (now() at time zone _tz)::date;

  insert into public.shifts (staff_id, shift_date, starts_at, ends_at, created_by)
  select t.staff_id,
         d::date,
         ((d::date + t.starts_at) at time zone _tz),
         ((d::date + t.ends_at + case when t.ends_at <= t.starts_at then interval '1 day' else interval '0' end) at time zone _tz),
         null
    from generate_series(_today::timestamp, (_today + 28)::timestamp, interval '1 day') d
    join public.shift_templates t
      on t.weekday = extract(dow from d)::smallint
     and t.active
    join public.profiles p
      on p.id = t.staff_id
     and p.status = 'active'
   where not exists (
     select 1 from public.leave_requests l
      where l.staff_id = t.staff_id
        and l.status = 'approved'
        and d::date between l.start_date and l.end_date
   )
  on conflict (staff_id, shift_date) do nothing;

  get diagnostics _created = row_count;
  return _created;
end;
$$;

create or replace function private.record_absences_system()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _created integer;
begin
  select public.mark_absences() into _created;
  return coalesce(_created, 0);
end;
$$;

revoke all on function private.generate_shifts_system() from public, anon, authenticated;
revoke all on function private.record_absences_system() from public, anon, authenticated;

-- Replace named jobs idempotently. Supabase's database timezone is UTC, so
-- 23:15 UTC is 00:15 the following day in Africa/Lagos.
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
