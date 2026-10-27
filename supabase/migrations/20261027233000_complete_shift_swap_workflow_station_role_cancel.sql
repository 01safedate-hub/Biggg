create or replace function public.list_delivery_agents_for_swap()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _uid uuid:=auth.uid(); _my_role public.staff_role; _my_station uuid;
begin
 if _uid is null or not private.is_active() then raise exception 'not_allowed'; end if;
 select r.role into _my_role from public.user_roles r where r.user_id=_uid and r.role in ('delivery_agent','cashier','secretary') limit 1;
 select sp.station_zone_id into _my_station from public.staff_profiles sp where sp.user_id=_uid;
 if _my_role is null and not private.is_shift_manager() then raise exception 'not_allowed'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email,'role',r.role,'station_zone_id',sp.station_zone_id) order by p.full_name)
 from public.profiles p join public.user_roles r on r.user_id=p.id left join public.staff_profiles sp on sp.user_id=p.id
 where p.status='active' and r.role in ('delivery_agent','cashier','secretary') and p.id<>_uid
 and (_my_role is null or (r.role=_my_role and sp.station_zone_id is not distinct from _my_station))
 and (private.is_shift_manager() or (r.role=_my_role and sp.station_zone_id is not distinct from _my_station))), '[]'::jsonb);
end $$;
revoke all on function public.list_delivery_agents_for_swap() from public,anon;
grant execute on function public.list_delivery_agents_for_swap() to authenticated;
create or replace function public.request_shift_swap(_shift uuid,_target_staff uuid default null,_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _uid uuid:=auth.uid(); _swap uuid; _requester_role public.staff_role; _target_role public.staff_role; _my_station uuid; _target_station uuid;
begin
 if _uid is null then raise exception 'not_authenticated'; end if;
 select r.role into _requester_role from public.user_roles r where r.user_id=_uid and r.role in ('delivery_agent','cashier','secretary') limit 1;
 if _requester_role is null then raise exception 'staff_role_not_eligible'; end if;
 if not exists(select 1 from public.profiles p where p.id=_uid and p.status='active') then raise exception 'not_allowed'; end if;
 if _target_staff is null then raise exception 'swap_target_required'; end if;
 if not exists(select 1 from public.shifts s where s.id=_shift and s.staff_id=_uid and s.starts_at>now()) then raise exception 'shift_not_found_or_started'; end if;
 if _target_staff=_uid then raise exception 'cannot_swap_with_self'; end if;
 select station_zone_id into _my_station from public.staff_profiles where user_id=_uid;
 select r.role,sp.station_zone_id into _target_role,_target_station from public.user_roles r join public.profiles p on p.id=r.user_id left join public.staff_profiles sp on sp.user_id=p.id where r.user_id=_target_staff and p.status='active' and r.role in ('delivery_agent','cashier','secretary') limit 1;
 if _target_role is null or _target_role<>_requester_role then raise exception 'invalid_target_staff'; end if;
 if _target_station is distinct from _my_station then raise exception 'invalid_target_station'; end if;
 if exists(select 1 from public.shift_swaps ss where ss.shift_id=_shift and ss.status in ('pending','accepted')) then raise exception 'swap_already_pending'; end if;
 insert into public.shift_swaps(shift_id,requester_id,target_staff_id,reason,status) values(_shift,_uid,_target_staff,nullif(trim(coalesce(_reason,'')),''),'pending') returning id into _swap;
 return _swap;
end $$;
revoke all on function public.request_shift_swap(uuid,uuid,text) from public,anon;
grant execute on function public.request_shift_swap(uuid,uuid,text) to authenticated;
create or replace function public.cancel_shift_swap(_swap uuid,_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare _uid uuid:=auth.uid(); _row public.shift_swaps%rowtype; _manager boolean;
begin
 if _uid is null then raise exception 'not_authenticated'; end if;
 if length(trim(coalesce(_reason,'')))<2 then raise exception 'cancellation_reason_required'; end if;
 _manager:=exists(select 1 from public.user_roles r where r.user_id=_uid and r.role in ('admin','super_admin','secretary'));
 select * into _row from public.shift_swaps where id=_swap for update;
 if not found then raise exception 'swap_not_found'; end if;
 if _row.status not in ('pending','accepted') then raise exception 'swap_not_cancellable'; end if;
 if _row.requester_id<>_uid and not _manager then raise exception 'not_allowed'; end if;
 update public.shift_swaps set status='cancelled',decided_by=_uid,decided_at=now(),decision_note=trim(_reason) where id=_swap;
end $$;
revoke all on function public.cancel_shift_swap(uuid,text) from public,anon;
grant execute on function public.cancel_shift_swap(uuid,text) to authenticated;
create or replace function public.respond_shift_swap(_swap uuid,_accept boolean,_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare _uid uuid:=auth.uid(); _row public.shift_swaps%rowtype;
begin
 if _uid is null then raise exception 'not_authenticated'; end if;
 select * into _row from public.shift_swaps where id=_swap for update;
 if not found or _row.target_staff_id<>_uid then raise exception 'swap_not_found'; end if;
 if _row.status<>'pending' then raise exception 'swap_not_pending'; end if;
 if _accept and not exists(select 1 from public.user_roles mine join public.user_roles target on target.user_id=_row.requester_id and target.role=mine.role where mine.user_id=_uid and mine.role in ('delivery_agent','cashier','secretary')) then raise exception 'invalid_target_staff'; end if;
 if _accept and (select station_zone_id from public.staff_profiles where user_id=_uid) is distinct from (select station_zone_id from public.staff_profiles where user_id=_row.requester_id) then raise exception 'invalid_target_station'; end if;
 if not _accept and length(trim(coalesce(_note,'')))<2 then raise exception 'cancellation_reason_required'; end if;
 update public.shift_swaps set status=case when _accept then 'accepted' else 'rejected' end,decided_by=_uid,decided_at=now(),decision_note=nullif(trim(coalesce(_note,'')),'') where id=_swap;
end $$;
revoke all on function public.respond_shift_swap(uuid,boolean,text) from public,anon;
grant execute on function public.respond_shift_swap(uuid,boolean,text) to authenticated;