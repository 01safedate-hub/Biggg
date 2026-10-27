revoke all on table public.leave_types, public.leave_balances, public.public_holidays, public.roster_blackouts, public.shift_swaps from anon;
grant select on table public.leave_types, public.leave_balances, public.public_holidays, public.roster_blackouts, public.shift_swaps to authenticated;
create or replace function public.submit_leave_request(_leave_type uuid, _start date, _end date, _reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _uid uuid := auth.uid(); _days numeric; _type public.leave_types%rowtype; _id uuid;
begin
 if _uid is null then raise exception 'not_authenticated'; end if;
 if _start is null or _end is null or _end < _start or _start < (now() at time zone 'Africa/Lagos')::date then raise exception 'invalid_leave_dates'; end if;
 if extract(year from _start) <> extract(year from _end) then raise exception 'leave_must_stay_within_year'; end if;
 if not exists(select 1 from public.user_roles r where r.user_id=_uid and r.role in ('delivery_agent','cashier','secretary','admin','super_admin')) then raise exception 'staff_only'; end if;
 select * into _type from public.leave_types where id=_leave_type and active;
 if not found then raise exception 'invalid_leave_type'; end if;
 _days := (_end - _start + 1)::numeric;
 if exists(select 1 from public.leave_requests l where l.staff_id=_uid and l.status in ('pending','approved') and daterange(l.start_date,l.end_date,'[]') && daterange(_start,_end,'[]')) then raise exception 'leave_dates_overlap'; end if;
 if _type.annual_allowance_days > 0 then
   insert into public.leave_balances(staff_id,leave_type_id,year,allowance_days) values(_uid,_leave_type,extract(year from _start)::int,_type.annual_allowance_days) on conflict(staff_id,leave_type_id,year) do nothing;
   if exists(select 1 from public.leave_balances b where b.staff_id=_uid and b.leave_type_id=_leave_type and b.year=extract(year from _start)::int and b.allowance_days+b.adjustment_days - coalesce((select sum(l.days_requested) from public.leave_requests l where l.staff_id=_uid and l.leave_type_id=_leave_type and l.status='approved' and extract(year from l.start_date)::int=b.year),0) < _days) then raise exception 'insufficient_leave_balance'; end if;
 end if;
 insert into public.leave_requests(staff_id,start_date,end_date,reason,status,leave_type_id,days_requested) values(_uid,_start,_end,nullif(trim(coalesce(_reason,'')),''),case when _type.requires_approval then 'pending' else 'approved' end,_leave_type,_days) returning id into _id;
 return _id;
end $$;
revoke all on function public.submit_leave_request(uuid,date,date,text) from public, anon;
grant execute on function public.submit_leave_request(uuid,date,date,text) to authenticated;
