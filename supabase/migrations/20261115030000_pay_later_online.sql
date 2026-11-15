-- Pay later: customers can pay their outstanding bill in the app at any stage before release.
--   * create_payment_intent: 'items' is allowed for a pay-later order after counting (received, washing, ready...),
--     and 'delivery_fare' for an unpaid quick-order delivery fee.
--   * settle_online_payment: a successful payment on a pay-later order is recorded without moving the order,
--     and once nothing is owed the order is marked paid (paid_confirmed_at), which sends the real receipt.
-- Both functions are patched in place: each replaced text must appear exactly once, or the migration fails.

do $m$
declare _def text; _old text; _new text;
begin
  -- create_payment_intent: quick-order delivery fee
  _def := pg_get_functiondef('public.create_payment_intent(uuid,text,text)'::regprocedure);
  _old := $o$  if _purpose in ('pickup_fare', 'delivery_fare') then$o$;
  _new := $n$  if _purpose = 'delivery_fare' and _o.quick_order and _o.pay_later_at is not null
     and _o.status in ('count_confirmed', 'received', 'in_house', 'ready', 'failed_delivery') then
    _amt := case when exists (select 1 from public.payments p where p.order_id = _order and p.purpose = 'delivery_fare' and p.kind = 'payment' and p.status = 'success')
                 then 0 else coalesce(_o.delivery_fare_kobo, 0) end;
    _note := 'Quick order delivery fee';
  elsif _purpose in ('pickup_fare', 'delivery_fare') then$n$;
  if (length(_def) - length(replace(_def, _old, ''))) / length(_old) <> 1 then raise exception 'create_payment_intent: delivery anchor not found once'; end if;
  _def := replace(_def, _old, _new);
  -- create_payment_intent: items after counting for pay-later orders
  _old := $o$if _o.source = 'subscription' or _o.status not in ('counted', 'count_confirmed') then raise exception 'wrong_state' using errcode = 'P0001'; end if;$o$;
  _new := $n$if _o.source = 'subscription' or not (_o.status in ('counted', 'count_confirmed')
        or (_o.pay_later_at is not null and _o.status in ('received', 'in_house', 'ready', 'awaiting_delivery_fare', 'failed_delivery'))) then raise exception 'wrong_state' using errcode = 'P0001'; end if;$n$;
  if (length(_def) - length(replace(_def, _old, ''))) / length(_old) <> 1 then raise exception 'create_payment_intent: items anchor not found once'; end if;
  _def := replace(_def, _old, _new);
  execute _def;

  -- settle_online_payment: pay-later orders
  _def := pg_get_functiondef('public.settle_online_payment(text,text,bigint)'::regprocedure);
  _old := $o$  select * into _o from public.orders where id=_pay.order_id for update;$o$;
  _new := $n$  select * into _o from public.orders where id=_pay.order_id for update;
  if _o.pay_later_at is not null and _o.paid_confirmed_at is null and _pay.purpose in ('items', 'delivery_fare') and _o.status <> 'counted' then
    insert into public.order_events(order_id,event,detail)
    values(_o.id,'pay_later_paid_online',jsonb_build_object('reference',_reference,'purpose',_pay.purpose,'amount_kobo',_amount_kobo));
    if private.order_amount_due(_o) <= 0 then
      update public.orders set paid_confirmed_at=now() where id=_o.id;
      if _o.quick_order and _o.pickup_agent_id is not null then
        insert into public.user_notifications(user_id,title,body,kind,order_id)
        values(_o.pickup_agent_id,'Quick order #' || _o.order_no || ' is paid','The customer paid online.','job',_o.id);
      end if;
      if _o.status='count_confirmed' and _o.source='walk_in' then
        update public.orders set status='received' where id=_o.id and status='count_confirmed';
      end if;
    end if;
    return jsonb_build_object('ok',true);
  end if;$n$;
  if (length(_def) - length(replace(_def, _old, ''))) / length(_old) <> 1 then raise exception 'settle_online_payment: anchor not found once'; end if;
  _def := replace(_def, _old, _new);
  execute _def;
end $m$;
