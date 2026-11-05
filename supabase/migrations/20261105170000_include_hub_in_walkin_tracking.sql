create or replace function public.desk_walkin_recent()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc)
    from (
      select jsonb_build_object(
        'id', o.id,
        'order_no', o.order_no,
        'status', o.status,
        'customer', c.full_name,
        'phone', c.phone,
        'total_kobo', greatest(0, o.items_total_kobo - o.discount_kobo) + o.instant_fee_kobo,
        'created_at', o.created_at,
        'instant', o.instant,
        'zone_id', o.zone_id,
        'hub_name', z.name,
        'created_by', o.created_by,
        'created_by_name', creator.full_name
      ) x
      from public.orders o
      join public.profiles c on c.id = o.customer_id
      left join public.zones z on z.id = o.zone_id
      left join public.profiles creator on creator.id = o.created_by
      where o.source = 'walk_in'
        and (o.created_at > now() - interval '3 days' or o.status not in ('delivered', 'closed', 'cancelled'))
      order by o.created_at desc
      limit 200
    ) s
  ), '[]'::jsonb);
end $$;
revoke all on function public.desk_walkin_recent() from public, anon;
grant execute on function public.desk_walkin_recent() to authenticated;
