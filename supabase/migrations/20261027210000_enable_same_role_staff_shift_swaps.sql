create or replace function public.list_delivery_agents_for_swap()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _uid uuid := auth.uid();
begin
 if _uid is null or not private.is_active() or not (
   private.has_role('delivery_agent') or private.has_role('cashier') or private.has_role('secretary') or private.is_shift_manager()
 ) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
 return coalesce((
   select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email,'role',r.role) order by p.full_name)
   from public.profiles p join public.user_roles r on r.user_id=p.id
   where p.status='active' and r.role in ('delivery_agent','cashier','secretary')
 ),'[]'::jsonb);
end $$;
create or replace function public.request_shift_swap(_shift uuid,_target_staff uuid default null,_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _uid uuid:=auth.uid(); _swap uuid; _role text;
begin
 if _uid is null then raise exception 'not_authenticated'; end if;
 if not private.is_active() then raise exception 'staff_only'; end if;
 select r.role into _role from public.user_roles r where r.user_id=_uid and r.role in ('delivery_agent','cashier','secretary') order by case r.role when 'delivery_agent' then 1 when 'cashier' then 2 else 3 end limit 1;
 if _role is null then raise exception 'staff_role_not_eligible'; end if;
 if _target_staff is null then raise exception 'swap_target_required'; end if;
 if not exists(select 1 from public.shifts s where s.id=_shift and s.staff_id=_uid and s.starts_at>now()) then raise exception 'shift_not_found_or_started'; end if;
 if _target_staff=_uid then raise exception 'cannot_swap_with_self'; end if;
 if not exists(select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where r.user_id=_target_staff and r.role=_role and p.status='active') then raise exception 'invalid_target_staff'; end if;
 if exists(select 1 from public.shift_swaps ss where ss.shift_id=_shift and ss.status in ('pending','accepted')) then raise exception 'swap_already_pending'; end if;
 insert into public.shift_swaps(shift_id,requester_id,target_staff_id,reason,status) values(_shift,_uid,_target_staff,nullif(trim(coalesce(_reason,'')),''),'pending') returning id into _swap;
 return _swap;
end $$;
revoke all on function public.list_delivery_agents_for_swap() from public,anon;
grant execute on function public.list_delivery_agents_for_swap() to authenticated;
revoke all on function public.request_shift_swap(uuid,uuid,text) from public,anon;
grant execute on function public.request_shift_swap(uuid,uuid,text) to authenticated;