-- Extend an active subscription when its renewal invoice is settled.
-- Invoice dates are authoritative and are interpreted in the LaundryPoint business timezone.
create or replace function public.settle_online_payment(_reference text, _provider text, _amount_kobo bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  _pay public.payments;
  _o public.orders;
  _paid bigint;
  _invoice public.subscription_invoices;
  _sub public.subscriptions;
  _pickup public.subscription_pickups;
  _period_start timestamptz;
  _period_end timestamptz;
begin
  select * into _pay from public.payments where reference = _reference for update;
  if not found or _pay.mode <> _provider then raise exception 'payment_not_found' using errcode = 'P0001'; end if;
  if _pay.status = 'success' then return jsonb_build_object('ok', true, 'already', true); end if;
  if _pay.amount_kobo <> _amount_kobo then raise exception 'amount_mismatch' using errcode = 'P0001'; end if;

  if _pay.purpose in ('subscription', 'extra_clothes') then
    select * into _invoice from public.subscription_invoices where id = _pay.invoice_id for update;
    if not found then raise exception 'subscription_invoice_not_found' using errcode = 'P0001'; end if;
    select * into _sub from public.subscriptions where id = _invoice.subscription_id for update;
    if not found or _sub.customer_id <> _pay.customer_id then raise exception 'subscription_not_found' using errcode = 'P0001'; end if;

    -- Mark payment and invoice only after both linked records have been validated.
    update public.payments set status = 'success', paid_at = now() where id = _pay.id;
    update public.subscription_invoices set status = 'paid' where id = _invoice.id;

    if _pay.purpose = 'subscription' then
      _period_start := _invoice.period_start::timestamp at time zone 'Africa/Lagos';
      _period_end := (_invoice.period_end + 1)::timestamp at time zone 'Africa/Lagos';

      if _sub.status = 'pending' then
        update public.subscriptions
           set status = 'active',
               started_at = coalesce(started_at, now()),
               current_period_start = _period_start,
               current_period_end = _period_end,
               updated_at = now()
         where id = _sub.id;
      elsif _sub.status = 'active' and _invoice.period_start >= (_sub.current_period_end at time zone 'Africa/Lagos')::date then
        update public.subscriptions
           set current_period_start = _period_start,
               current_period_end = _period_end,
               updated_at = now()
         where id = _sub.id;
      end if;
    elsif _pay.purpose = 'extra_clothes' then
      select * into _pickup from public.subscription_pickups where id = _invoice.subscription_pickup_id for update;
      if found and _pickup.order_id is not null and _pickup.overage_kobo > 0 then
        update public.orders set status = 'count_confirmed' where id = _pickup.order_id and status = 'counted';
      end if;
    end if;
    return jsonb_build_object('ok', true, 'subscription_id', _sub.id, 'activated', _pay.purpose = 'subscription');
  end if;

  update public.payments set status = 'success', paid_at = now() where id = _pay.id;
  select * into _o from public.orders where id = _pay.order_id for update;
  if _pay.purpose = 'pickup_fare' and _o.source = 'one_time' and _o.status = 'awaiting_fare_payment' then
    update public.orders set status = 'awaiting_dispatch' where id = _o.id;
  elsif _pay.purpose = 'pickup_fare' and _o.status = 'awaiting_fare_payment' then
    raise exception 'subscription_only_booking' using errcode = 'P0001';
  elsif _pay.purpose = 'items' and _o.status = 'counted' then
    select coalesce(sum(case when kind = 'payment' then amount_kobo else -amount_kobo end), 0)
      into _paid from public.payments where order_id = _o.id and purpose = 'items' and status = 'success';
    if _paid >= greatest(0, _o.items_total_kobo - _o.discount_kobo) + _o.instant_fee_kobo then
      update public.orders set status = 'count_confirmed' where id = _o.id;
    end if;
  elsif _pay.purpose = 'items' and _o.status = 'count_confirmed' then
    insert into public.order_events(order_id, event, detail)
    values (_o.id, 'topup_received', jsonb_build_object('reference', _reference, 'amount_kobo', _amount_kobo));
  elsif _pay.purpose = 'delivery_fare' and _o.source = 'one_time'
    and _o.fulfillment_choice = 'deliver' and _o.status = 'awaiting_delivery_fare' then
    update public.orders set status = 'ready' where id = _o.id;
    insert into public.order_events(order_id, event, detail)
    values (_o.id, 'return_delivery_fee_paid',
      jsonb_build_object('reference', _reference, 'amount_kobo', _amount_kobo,
        'destination', _o.return_delivery_address, 'distance_km', _o.return_delivery_distance_km));
  elsif _pay.purpose = 'delivery_fare' and _o.source <> 'one_time'
    and _o.status in ('ready', 'awaiting_delivery_fare') then
    update public.orders set status = 'out_for_delivery' where id = _o.id;
  elsif _pay.purpose = 'demurrage' and _o.status = 'failed_delivery' then
    if private.demurrage_due(_o.id) = 0 then
      update public.demurrage_cases set status = 'paid', closed_at = now() where order_id = _o.id and status in ('grace', 'accruing');
      insert into public.user_notifications(user_id, title, body, kind, order_id)
      values (_o.customer_id, 'Storage fee paid', 'Thank you. We will call you to arrange your delivery.', 'demurrage', _o.id);
    end if;
    insert into public.order_events(order_id, event, detail)
    values (_o.id, 'demurrage_payment', jsonb_build_object('reference', _reference, 'amount_kobo', _amount_kobo));
  else
    insert into public.order_events(order_id, event, detail)
    values (_o.id, 'payment_needs_review', jsonb_build_object('reference', _reference, 'purpose', _pay.purpose, 'order_status', _o.status));
  end if;
  return jsonb_build_object('ok', true);
end
$function$;