create or replace function public.list_delivery_agents_for_swap()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.is_active() or not (private.has_role('delivery_agent') or private.is_shift_manager()) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email) order by p.full_name)
    from public.profiles p
    join public.user_roles r on r.user_id = p.id and r.role = 'delivery_agent'
    where p.status = 'active'
  ), '[]'::jsonb);
end
$function$;
revoke all on function public.list_delivery_agents_for_swap() from public, anon;
grant execute on function public.list_delivery_agents_for_swap() to authenticated;
