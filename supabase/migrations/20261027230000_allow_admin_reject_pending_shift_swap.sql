create or replace function public.decide_shift_swap(_swap uuid,_approve boolean,_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare _uid uuid:=auth.uid(); _row public.shift_swaps%rowtype; _shift public.shifts%rowtype;
begin
 if _uid is null or not exists(select 1 from public.user_roles r where r.user_id=_uid and r.role in ('admin','super_admin','secretary')) then raise exception 'manager_only'; end if;
 select * into _row from public.shift_swaps where id=_swap for update;
 if not found then raise exception 'swap_not_found'; end if;
 if _row.status not in ('pending','accepted') then raise exception 'swap_already_decided'; end if;
 if _approve and _row.status<>'accepted' then raise exception 'swap_not_accepted'; end if;
 if _approve then
  select * into _shift from public.shifts where id=_row.shift_id for update;
  if not found or _shift.starts_at<=now() then raise exception 'shift_already_started'; end if;
  if _row.target_staff_id is null then raise exception 'swap_target_missing'; end if;
  if exists(select 1 from public.shifts s where s.staff_id=_row.target_staff_id and s.id<>_shift.id and s.starts_at<_shift.ends_at and s.ends_at>_shift.starts_at) then raise exception 'swap_overlap'; end if;
  if exists(select 1 from public.shifts s where s.staff_id=_row.target_staff_id and s.id<>_shift.id and ((s.ends_at<=_shift.starts_at and _shift.starts_at-s.ends_at<interval '11 hours') or (s.starts_at>=_shift.ends_at and s.starts_at-_shift.ends_at<interval '11 hours'))) then raise exception 'swap_rest_rule'; end if;
  if _shift.ends_at-_shift.starts_at>interval '10 hours' then raise exception 'shift_too_long'; end if;
  if (select count(distinct s.shift_date) from public.shifts s where s.staff_id=_row.target_staff_id and s.shift_date between date_trunc('week',_shift.shift_date::timestamp)::date and (date_trunc('week',_shift.shift_date::timestamp)::date+6) and s.id<>_shift.id) >= 6 then raise exception 'swap_weekly_limit'; end if;
  update public.shifts set staff_id=_row.target_staff_id where id=_row.shift_id;
 end if;
 update public.shift_swaps set status=case when _approve then 'approved' else 'rejected' end,decided_by=_uid,decided_at=now(),decision_note=nullif(trim(coalesce(_note,'')),'') where id=_swap;
end $$;
revoke all on function public.decide_shift_swap(uuid,boolean,text) from public, anon;
grant execute on function public.decide_shift_swap(uuid,boolean,text) to authenticated;
