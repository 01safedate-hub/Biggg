-- Correct one-time delivery pricing and enable the separate delivery payment.
-- This does not rewrite historical successful payment records.
-- Allow one-time delivery fare checkout as a separate payment after the customer selects delivery.
create or replace function public.create_payment_intent(_order uuid, _purpose text, _provider text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _o public.orders;
  _amt bigint;
  _paid bigint;
  _ref text;
  _mp uuid;
  _p public.profiles;
  _note text;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  if _provider not in ('paystack', 'flutterwave') then raise exception 'invalid_provider' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.customer_id <> auth.uid() then raise exception 'order_not_found' using errcode = 'P0001'; end if;

  if _purpose in ('pickup_fare', 'delivery_fare') then
    if _o.source <> 'one_time' then raise exception 'subscription_only_booking' using errcode = 'P0001'; end if;
    if _purpose = 'pickup_fare' then
      if _o.status <> 'awaiting_fare_payment' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
      _amt := _o.pickup_fare_kobo + coalesce(_o.delivery_fare_kobo, 0);
      _note := 'One-time pickup and delivery, transport prepaid';
    else
      if _o.status <> 'awaiting_delivery_fare' or _o.fulfillment_choice <> 'deliver' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
      _amt := _o.delivery_fare_kobo;
      _note := 'One-time delivery fare';
    end if;
  elsif _purpose = 'items' then
    if _o.source = 'subscription' or _o.status not in ('counted', 'count_confirmed') then raise exception 'wrong_state' using errcode = 'P0001'; end if;
    select coalesce(sum(case when kind = 'payment' then amount_kobo else -amount_kobo end), 0)
      into _paid from public.payments where order_id = _order and purpose = 'items' and status = 'success';
    _amt := (greatest(0, _o.items_total_kobo - _o.discount_kobo) + _o.instant_fee_kobo) - _paid;
  elsif _purpose = 'demurrage' then
    if _o.status <> 'failed_delivery' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
    _amt := private.demurrage_due(_order);
    _note := 'Storage fee';
  else
    raise exception 'invalid_purpose' using errcode = 'P0001';
  end if;
  if _amt is null or _amt <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;
  _mp := private.online_money_point();
  if _mp is null then raise exception 'no_online_money_point' using errcode = 'P0001'; end if;
  update public.payments set status = 'failed' where order_id = _order and purpose = _purpose and kind = 'payment' and status = 'pending';
  _ref := 'LP-' || _o.order_no || '-' || (case _purpose when 'items' then 'B' when 'delivery_fare' then 'D' when 'demurrage' then 'S' else 'F' end) || '-' || encode(extensions.gen_random_bytes(6), 'hex');
  insert into public.payments (order_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id, note)
  values (_order, auth.uid(), _purpose, 'payment', _provider, _amt, _ref, 'pending', _mp, _note);
  select * into _p from public.profiles where id = auth.uid();
  return jsonb_build_object('reference', _ref, 'amount_kobo', _amt, 'email', _p.email, 'name', _p.full_name, 'phone', _p.phone, 'order_no', _o.order_no);
end
$function$;

create or replace function public.settle_online_payment(_reference text,_provider text,_amount_kobo bigint)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare _pay public.payments; _o public.orders; _paid bigint; _invoice public.subscription_invoices; _sub public.subscriptions; _pickup public.subscription_pickups;
begin
  select * into _pay from public.payments where reference=_reference for update;
  if not found or _pay.mode<>_provider then raise exception 'payment_not_found' using errcode='P0001'; end if;
  if _pay.status='success' then return jsonb_build_object('ok',true,'already',true); end if;
  if _pay.amount_kobo<>_amount_kobo then raise exception 'amount_mismatch' using errcode='P0001'; end if;
  update public.payments set status='success',paid_at=now() where id=_pay.id;
  if _pay.purpose in ('subscription','extra_clothes') then
    select * into _invoice from public.subscription_invoices where id=_pay.invoice_id for update;
    if not found then raise exception 'subscription_invoice_not_found' using errcode='P0001'; end if;
    select * into _sub from public.subscriptions where id=_invoice.subscription_id for update;
    if not found or _sub.customer_id<>_pay.customer_id then raise exception 'subscription_not_found' using errcode='P0001'; end if;
    update public.subscription_invoices set status='paid' where id=_invoice.id;
    if _pay.purpose='subscription' and _sub.status<>'active' then
      update public.subscriptions set status='active',started_at=coalesce(started_at,now()),current_period_start=now(),
        current_period_end=now()+interval '1 month',updated_at=now() where id=_sub.id;
    elsif _pay.purpose='extra_clothes' then
      select * into _pickup from public.subscription_pickups where id=_invoice.subscription_pickup_id for update;
      if found and _pickup.order_id is not null and _pickup.overage_kobo>0 then update public.orders set status='count_confirmed' where id=_pickup.order_id and status='counted'; end if;
    end if;
    return jsonb_build_object('ok',true,'subscription_id',_sub.id,'activated',_pay.purpose='subscription');
  end if;
  select * into _o from public.orders where id=_pay.order_id for update;
  if _pay.purpose='pickup_fare' and _o.source='one_time' and _o.status='awaiting_fare_payment' then
    update public.orders set status='awaiting_dispatch' where id=_o.id;
  elsif _pay.purpose='pickup_fare' and _o.status='awaiting_fare_payment' then
    raise exception 'subscription_only_booking' using errcode='P0001';
  elsif _pay.purpose='items' and _o.status='counted' then
    select coalesce(sum(case when kind='payment' then amount_kobo else -amount_kobo end),0) into _paid from public.payments where order_id=_o.id and purpose='items' and status='success';
    if _paid>=greatest(0,_o.items_total_kobo-_o.discount_kobo)+_o.instant_fee_kobo then update public.orders set status='count_confirmed' where id=_o.id; end if;
  elsif _pay.purpose='items' and _o.status='count_confirmed' then
    insert into public.order_events(order_id,event,detail) values(_o.id,'topup_received',jsonb_build_object('reference',_reference,'amount_kobo',_amount_kobo));
  elsif _pay.purpose='delivery_fare' and _o.status='awaiting_delivery_fare' and _o.source='one_time' and _o.fulfillment_choice='deliver' then
    update public.orders set status='out_for_delivery' where id=_o.id;
  elsif _pay.purpose='delivery_fare' and _o.status in ('ready','awaiting_delivery_fare') and _o.source<>'one_time' then
    update public.orders set status='out_for_delivery' where id=_o.id;
  elsif _pay.purpose='demurrage' and _o.status='failed_delivery' then
    if private.demurrage_due(_o.id)=0 then
      update public.demurrage_cases set status='paid',closed_at=now() where order_id=_o.id and status in ('grace','accruing');
      insert into public.user_notifications(user_id,title,body,kind,order_id) values(_o.customer_id,'Storage fee paid','Thank you. We will call you to arrange your delivery.','demurrage',_o.id);
    end if;
    insert into public.order_events(order_id,event,detail) values(_o.id,'demurrage_payment',jsonb_build_object('reference',_reference,'amount_kobo',_amount_kobo));
  else
    insert into public.order_events(order_id,event,detail) values(_o.id,'payment_needs_review',jsonb_build_object('reference',_reference,'purpose',_pay.purpose,'order_status',_o.status));
  end if;
  return jsonb_build_object('ok',true);
end $function$;


revoke all on function public.create_payment_intent(uuid,text,text) from public, anon;
grant execute on function public.create_payment_intent(uuid,text,text) to authenticated;
