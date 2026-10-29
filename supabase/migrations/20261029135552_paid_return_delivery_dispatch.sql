-- Allow staff to assign a paid one-time return delivery while preserving Ready until dispatch.
-- Assignment is the moment the order moves back into the delivery lifecycle.
create or replace function public.assign_delivery_agent(_order uuid, _agent uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare _cust uuid;
begin
  if not private.is_shift_manager() or not private.is_active() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = _agent and r.role = 'delivery_agent' and p.status = 'active'
  ) then
    raise exception 'agent_invalid' using errcode = 'P0001';
  end if;
  if private.has_open_dispute(_order) then
    raise exception 'dispute_open' using errcode = 'P0001';
  end if;

  update public.orders o
  set delivery_agent_id = _agent,
      status = case when o.status = 'ready' then 'out_for_delivery'::public.order_status else o.status end
  where o.id = _order
    and (
      o.status = 'out_for_delivery'
      or (
        o.status = 'ready'
        and o.source = 'one_time'
        and o.fulfillment_choice = 'deliver'
        and exists (
          select 1 from public.payments p
          where p.order_id = o.id
            and p.purpose = 'delivery_fare'
            and p.kind = 'payment'
            and p.status = 'success'
        )
      )
    )
  returning o.customer_id into _cust;

  if not found then raise exception 'wrong_state' using errcode = 'P0001'; end if;

  insert into public.user_notifications (user_id, title, kind, order_id)
  values (_agent, 'New delivery assigned to you', 'job', _order);
  insert into public.user_notifications (user_id, title, kind, order_id)
  values (_cust, 'Your delivery agent is on the way', 'order_status', _order);
end
$function$;
