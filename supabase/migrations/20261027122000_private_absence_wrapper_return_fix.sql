-- Match public.mark_absences()'s integer result without changing its behavior.
drop function if exists private.record_absences_system();
create or replace function private.record_absences_system()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _created integer;
begin
  select public.mark_absences() into _created;
end;
$$;
revoke all on function private.record_absences_system() from public, anon, authenticated;