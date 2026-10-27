-- Subscription pickup requests have zero transport fare, so cancellation must not attempt a transport refund.
-- Preserve the existing refund path for legacy paid online orders.
create or replace function public.cancel_my_order(_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _o public.orders;
begin
  select * into _o from public.orders where id = _order for update;
  if not found or _o.customer_id <> auth.uid() or _o.status not in ('awaiting_fare_payment', 'awaiting_dispatch') then
    raise exception 'cannot_cancel' using errcode = 'P0001';
  end if;
  update public.orders set status = 'cancelled' where id = _order;
  if _o.status = 'awaiting_dispatch' and _o.source <> 'subscription' then
    perform private.refund_transport(_order, true);
  end if;
end
$function$;
