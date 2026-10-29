-- Allow desk staff to confirm collection for customer-booked one-time orders.
-- Keep the existing desk_handover RPC unchanged for true walk-in orders.
create or replace function public.confirm_one_time_collection(_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _o public.orders;
begin
  if not public.desk_gate() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into _o
  from public.orders
  where id = _order
    and source = 'one_time'
  for update;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if _o.status <> 'ready' then
    raise exception 'invalid_step' using errcode = 'P0001';
  end if;

  if _o.fulfillment_choice = 'deliver' then
    raise exception 'customer_requested_delivery' using errcode = 'P0001';
  end if;

  update public.orders
  set fulfillment_choice = 'collect',
      status = 'delivered'
  where id = _order;

  insert into public.order_events(order_id, actor_id, event, detail)
  values (
    _order,
    auth.uid(),
    'collection_handover_confirmed',
    jsonb_build_object('choice', 'collect', 'source', 'staff')
  );
end
$function$;

revoke all on function public.confirm_one_time_collection(uuid) from public, anon;
grant execute on function public.confirm_one_time_collection(uuid) to authenticated;
