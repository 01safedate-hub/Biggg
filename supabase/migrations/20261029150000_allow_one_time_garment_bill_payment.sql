-- Allow one-time pickup customers to pay their garment bill after the agent has counted items.
-- Transport remains prepaid; only the items-purpose eligibility is expanded.
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
      raise exception 'invalid_purpose' using errcode = 'P0001';
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