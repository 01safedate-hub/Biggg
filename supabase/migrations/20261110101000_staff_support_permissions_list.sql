create or replace function public.staff_support_permissions_list()
returns table(user_id uuid) language plpgsql security definer set search_path=''
as $$
begin
 if not exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role::text='super_admin') then raise exception 'super_admin_required' using errcode='42501'; end if;
 return query select p.user_id from public.whatsapp_support_permissions p;
end;
$$;
grant execute on function public.staff_support_permissions_list() to authenticated;