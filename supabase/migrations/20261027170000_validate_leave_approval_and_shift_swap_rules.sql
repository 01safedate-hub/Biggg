create or replace function public.decide_leave_request(_request uuid,_approve boolean,_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare _request_row public.leave_requests%rowtype; _manager uuid := auth.uid(); _type public.leave_types%rowtype;
begin
 if _manager is null or not exists(select 1 from public.user_roles r where r.user_id=_manager and r.role in ('admin','super_admin','secretary')) then raise exception 'manager_only'; end if;
 select * into _request_row from public.leave_requests where id=_request for update;
 if not found then raise exception 'leave_request_not_found'; end if;
 if _request_row.status <> 'pending' then raise exception 'leave_request_not_pending'; end if;
 if _approve and exists(select 1 from public.leave_requests l where l.staff_id=_request_row.staff_id and l.id<>_request_row.id and l.status='approved' and daterange(l.start_date,l.end_date,'[]') && daterange(_request_row.start_date,_request_row.end_date,'[]')) then raise exception 'leave_dates_overlap'; end if;
 if _approve and _request_row.leave_type_id is not null then
   select * into _type from public.leave_types where id=_request_row.leave_type_id;
   if _type.annual_allowance_days > 0 then
     insert into public.leave_balances(staff_id,leave_type_id,year,allowance_days) values(_request_row.staff_id,_request_row.leave_type_id,extract(year from _request_row.start_date)::int,_type.annual_allowance_days) on conflict(staff_id,leave_type_id,year) do nothing;
     if exists(select 1 from public.leave_balances b where b.staff_id=_request_row.staff_id and b.leave_type_id=_request_row.leave_type_id and b.year=extract(year from _request_row.start_date)::int and b.allowance_days+b.adjustment_days - coalesce((select sum(l.days_requested) from public.leave_requests l where l.staff_id=b.staff_id and l.leave_type_id=b.leave_type_id and l.status='approved' and l.id<>_request_row.id and extract(year from l.start_date)::int=b.year),0) < coalesce(_request_row.days_requested,(_request_row.end_date-_request_row.start_date+1)::numeric)) then raise exception 'insufficient_leave_balance'; end if;
   end if;
 end if;
 update public.leave_requests set status=case when _approve then 'approved' else 'rejected' end,decided_by=_manager,decided_at=now(),decision_note=nullif(trim(coalesce(_note,'')),'') where id=_request;
end $$;
create or replace function public.request_shift_swap(_shift uuid,_target_staff uuid default null,_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _uid uuid:=auth.uid(); _swap uuid;
begin
 if _uid is null then raise exception 'not_authenticated'; end if;
 if not exists(select 1 from public.user_roles r where r.user_id=_uid and r.role='delivery_agent') then raise exception 'delivery_agent_only'; end if;
 if _target_staff is null then raise exception 'swap_target_required'; end if;
 if not exists(select 1 from public.shifts s where s.id=_shift and s.staff_id=_uid and s.starts_at>now()) then raise exception 'shift_not_found_or_started'; end if;
 if _target_staff=_uid then raise exception 'cannot_swap_with_self'; end if;
 if not exists(select 1 from public.user_roles r where r.user_id=_target_staff and r.role='delivery_agent') then raise exception 'invalid_target_staff'; end if;
 if exists(select 1 from public.shift_swaps ss where ss.shift_id=_shift and ss.status in ('pending','accepted')) then raise exception 'swap_already_pending'; end if;
 insert into public.shift_swaps(shift_id,requester_id,target_staff_id,reason,status) values(_shift,_uid,_target_staff,nullif(trim(coalesce(_reason,'')),''),'pending') returning id into _swap;
 return _swap;
end $$;
create or replace function public.decide_shift_swap(_swap uuid,_approve boolean,_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare _uid uuid:=auth.uid(); _row public.shift_swaps%rowtype; _shift public.shifts%rowtype;
begin
 if _uid is null or not exists(select 1 from public.user_roles r where r.user_id=_uid and r.role in ('admin','super_admin','secretary')) then raise exception 'manager_only'; end if;
 select * into _row from public.shift_swaps where id=_swap for update;
 if not found or _row.status<>'accepted' then raise exception 'swap_not_accepted'; end if;
 select * into _shift from public.shifts where id=_row.shift_id for update;
 if not found or _shift.starts_at<=now() then raise exception 'shift_already_started'; end if;
 if _approve then
  if _row.target_staff_id is null then raise exception 'swap_target_missing'; end if;
  if exists(select 1 from public.shifts s where s.staff_id=_row.target_staff_id and s.id<>_shift.id and s.starts_at<_shift.ends_at and s.ends_at>_shift.starts_at) then raise exception 'swap_overlap'; end if;
  if exists(select 1 from public.shifts s where s.staff_id=_row.target_staff_id and s.id<>_shift.id and ((s.ends_at<=_shift.starts_at and _shift.starts_at-s.ends_at<interval '11 hours') or (s.starts_at>=_shift.ends_at and s.starts_at-_shift.ends_at<interval '11 hours'))) then raise exception 'swap_rest_rule'; end if;
  if _shift.ends_at-_shift.starts_at>interval '10 hours' then raise exception 'shift_too_long'; end if;
  if (select count(distinct s.shift_date) from public.shifts s where s.staff_id=_row.target_staff_id and s.shift_date between date_trunc('week',_shift.shift_date::timestamp)::date and (date_trunc('week',_shift.shift_date::timestamp)::date+6) and s.id<>_shift.id) >= 6 then raise exception 'swap_weekly_limit'; end if;
  update public.shifts set staff_id=_row.target_staff_id where id=_row.shift_id;
 end if;
 update public.shift_swaps set status=case when _approve then 'approved' else 'rejected' end,decided_by=_uid,decided_at=now(),decision_note=nullif(trim(coalesce(_note,'')),'') where id=_swap;
end $$;
revoke all on function public.decide_leave_request(uuid,boolean,text) from public, anon;
revoke all on function public.request_shift_swap(uuid,uuid,text) from public, anon;
revoke all on function public.decide_shift_swap(uuid,boolean,text) from public, anon;
grant execute on function public.decide_leave_request(uuid,boolean,text) to authenticated;
grant execute on function public.request_shift_swap(uuid,uuid,text) to authenticated;
grant execute on function public.decide_shift_swap(uuid,boolean,text) to authenticated;
