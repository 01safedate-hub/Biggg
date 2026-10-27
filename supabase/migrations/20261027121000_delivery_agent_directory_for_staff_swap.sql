create or replace function public.list_delivery_agents_for_swap()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare _uid uuid := auth.uid();
begin
  if _uid is null or not private.is_active() or not (
    private.has_role('delivery_agent') or private.has_role('cashier') or private.has_role('secretary') or private.is_shift_manager()
  ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(
      jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'role', r.role)
      order by p.full_name
    )
    from public.profiles p
    join public.user_roles r on r.user_id = p.id
    where p.status = 'active'
      and r.role in ('delivery_agent','cashier','secretary')
      and p.id <> _uid
      and (
        private.is_shift_manager()
        or exists (select 1 from public.user_roles mine where mine.user_id = _uid and mine.role = r.role)
      )
  ), '[]'::jsonb);
end
$function$;
revoke all on function public.list_delivery_agents_for_swap() from public, anon;
grant execute on function public.list_delivery_agents_for_swap() to authenticated;
