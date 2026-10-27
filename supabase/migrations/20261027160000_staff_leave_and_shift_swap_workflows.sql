create or replace function public.submit_leave_request(_leave_type uuid, _start date, _end date, _reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _uid uuid := auth.uid(); _days numeric; _type public.leave_types%rowtype; _id uuid;
begin
 if _uid is null then raise exception 'not_authenticated'; end if;
 if _start is null or _end is null or _end < _start or _start < (now() at time zone 'Africa/Lagos')::date then raise exception 'invalid_leave_dates'; end if;
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
create or replace function public.decide_leave_request(_request uuid,_approve boolean,_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare _request_row public.leave_requests%rowtype; _manager uuid := auth.uid();
begin
 if _manager is null or not exists(select 1 from public.user_roles r where r.user_id=_manager and r.role in ('admin','super_admin','secretary')) then raise exception 'manager_only'; end if;
 select * into _request_row from public.leave_requests where id=_request for update;
 if not found then raise exception 'leave_request_not_found'; end if;
 if _request_row.status <> 'pending' then raise exception 'leave_request_not_pending'; end if;
 if _approve and exists(select 1 from public.leave_requests l where l.staff_id=_request_row.staff_id and l.id<>_request_row.id and l.status='approved' and daterange(l.start_date,l.end_date,'[]') && daterange(_request_row.start_date,_request_row.end_date,'[]')) then raise exception 'leave_dates_overlap'; end if;
 update public.leave_requests set status=case when _approve then 'approved' else 'rejected' end,decided_by=_manager,decided_at=now(),decision_note=nullif(trim(coalesce(_note,'')),'') where id=_request;
end $$;
create or replace function public.cancel_leave_request(_request uuid,_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare _uid uuid := auth.uid(); _row public.leave_requests%rowtype;
begin
 if _uid is null then raise exception 'not_authenticated'; end if;
 select * into _row from public.leave_requests where id=_request for update;
 if not found or (_row.staff_id<>_uid and not exists(select 1 from public.user_roles r where r.user_id=_uid and r.role in ('admin','super_admin','secretary'))) then raise exception 'leave_request_not_found'; end if;
 if _row.status not in ('pending','approved') then raise exception 'leave_not_cancellable'; end if;
 if _row.status='approved' and _row.start_date <= (now() at time zone 'Africa/Lagos')::date then raise exception 'leave_already_started'; end if;
 update public.leave_requests set status='cancelled',cancelled_at=now(),cancellation_note=nullif(trim(coalesce(_note,'')),'') where id=_request;
end $$;
create or replace function public.request_shift_swap(_shift uuid,_target_staff uuid default null,_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _uid uuid:=auth.uid(); _swap uuid;
begin
 if _uid is null then raise exception 'not_authenticated'; end if;
 if not exists(select 1 from public.user_roles r where r.user_id=_uid and r.role in ('delivery_agent','cashier','secretary','admin','super_admin')) then raise exception 'staff_only'; end if;
 if not exists(select 1 from public.shifts s where s.id=_shift and s.staff_id=_uid and s.starts_at>now()) then raise exception 'shift_not_found_or_started'; end if;
 if _target_staff=_uid then raise exception 'cannot_swap_with_self'; end if;
 if _target_staff is not null and not exists(select 1 from public.user_roles r where r.user_id=_target_staff and r.role in ('delivery_agent','cashier','secretary','admin','super_admin')) then raise exception 'invalid_target_staff'; end if;
 if exists(select 1 from public.shift_swaps ss where ss.shift_id=_shift and ss.status in ('pending','accepted')) then raise exception 'swap_already_pending'; end if;
 insert into public.shift_swaps(shift_id,requester_id,target_staff_id,reason,status) values(_shift,_uid,_target_staff,nullif(trim(coalesce(_reason,'')),''),'pending') returning id into _swap;
 return _swap;
end $$;
create or replace function public.respond_shift_swap(_swap uuid,_accept boolean,_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare _uid uuid:=auth.uid(); _row public.shift_swaps%rowtype;
begin
 if _uid is null then raise exception 'not_authenticated'; end if;
 select * into _row from public.shift_swaps where id=_swap for update;
 if not found or (_row.target_staff_id is not null and _row.target_staff_id<>_uid) then raise exception 'swap_not_found'; end if;
 if _row.status<>'pending' then raise exception 'swap_not_pending'; end if;
 if _row.target_staff_id is null and not exists(select 1 from public.user_roles r where r.user_id=_uid and r.role in ('admin','super_admin','secretary')) then raise exception 'manager_or_target_only'; end if;
 update public.shift_swaps set status=case when _accept then 'accepted' else 'rejected' end,decided_by=_uid,decided_at=now(),decision_note=nullif(trim(coalesce(_note,'')),'') where id=_swap;
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
  if _row.target_staff_id is not null then update public.shifts set staff_id=_row.target_staff_id where id=_row.shift_id;
  elsif _row.target_shift_id is not null then update public.shifts set staff_id=_row.requester_id where id=_row.target_shift_id; update public.shifts set staff_id=_row.requester_id where id=_row.shift_id;
  else raise exception 'swap_target_missing'; end if;
 end if;
 update public.shift_swaps set status=case when _approve then 'approved' else 'rejected' end,decided_by=_uid,decided_at=now(),decision_note=nullif(trim(coalesce(_note,'')),'') where id=_swap;
end $$;
revoke all on function public.submit_leave_request(uuid,date,date,text) from public, anon;
revoke all on function public.decide_leave_request(uuid,boolean,text) from public, anon;
revoke all on function public.cancel_leave_request(uuid,text) from public, anon;
revoke all on function public.request_shift_swap(uuid,uuid,text) from public, anon;
revoke all on function public.respond_shift_swap(uuid,boolean,text) from public, anon;
revoke all on function public.decide_shift_swap(uuid,boolean,text) from public, anon;
grant execute on function public.submit_leave_request(uuid,date,date,text) to authenticated;
grant execute on function public.decide_leave_request(uuid,boolean,text) to authenticated;
grant execute on function public.cancel_leave_request(uuid,text) to authenticated;
grant execute on function public.request_shift_swap(uuid,uuid,text) to authenticated;
grant execute on function public.respond_shift_swap(uuid,boolean,text) to authenticated;
grant execute on function public.decide_shift_swap(uuid,boolean,text) to authenticated;
