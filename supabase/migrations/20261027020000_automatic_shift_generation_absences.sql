-- Automatic roster generation and absence recording.
-- Existing public.generate_shifts(date, date) and public.mark_absences() are
-- intentionally reused; this migration only adds the system wrappers/schedules.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.generate_shifts_system()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _today date := (now() at time zone 'Africa/Lagos')::date;
  _created integer := 0;
begin
  -- Generate today through the next 28 days. The existing function owns
  -- template expansion and idempotency/duplicate prevention.
  perform public.generate_shifts(_today, _today + 28);
  get diagnostics _created = row_count;
  return _created;
end;
$$;

revoke all on function private.generate_shifts_system() from public, anon, authenticated;

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

revoke all on function private.record_absences_system() from public, anon, authenticated;

-- Recreate named jobs idempotently when this migration is re-applied.
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
  '15 0 * * *',
  $job$ select private.generate_shifts_system(); $job$
);

select cron.schedule(
  'laundrypoint-record-absences-hourly',
  '0 * * * *',
  $job$ select private.record_absences_system(); $job$
);
