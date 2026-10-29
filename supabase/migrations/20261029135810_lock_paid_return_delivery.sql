-- Dedicated single-leg hub-to-customer quote for return delivery.
-- Original pickup coordinates, address, zone, distance and fare remain unchanged.
alter table public.orders
  add column if not exists return_delivery_lat double precision,
  add column if not exists return_delivery_lng double precision,
  add column if not exists return_delivery_address text,
  add column if not exists return_delivery_distance_km numeric;

create or replace function public.quote_one_time_return_delivery(_lat double precision, _lng double precision)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  _base jsonb;
  _hub jsonb;
  _z record;
  _dist numeric;
  _included_one_way numeric;
  _extra_rate bigint;
  _base_fare bigint;
  _extra_km numeric;
  _extra bigint;
  _total bigint;
begin
  if _lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180 then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;

  select value into _base from public.settings where key = 'one_time_pickup';
  select value into _hub from public.settings where key = 'hub';
  if _hub->>'lat' is null or _hub->>'lng' is null then
    return jsonb_build_object('served', false, 'reason', 'hub_not_set');
  end if;

  select z.id, z.name into _z
  from public.zones z
  where z.is_live and z.centre_lat is not null and z.centre_lng is not null and z.radius_m is not null
    and private.distance_km(z.centre_lat, z.centre_lng, _lat, _lng) * 1000 <= z.radius_m
  order by private.distance_km(z.centre_lat, z.centre_lng, _lat, _lng)
  limit 1;

  if not found then
    return jsonb_build_object('served', false, 'reason', 'not_served');
  end if;

  _dist := private.distance_km((_hub->>'lat')::float8, (_hub->>'lng')::float8, _lat, _lng)::numeric;
  -- The existing setting is a round-trip allowance. Return delivery is one leg,
  -- so its included distance is half that allowance.
  _included_one_way := greatest(0, coalesce((_base->>'included_round_trip_km')::numeric, 100) / 2);
  _extra_rate := greatest(0, coalesce((_base->>'extra_km_kobo')::bigint, 5000));
  _base_fare := greatest(180000, coalesce((_base->>'base_delivery_kobo')::bigint, 180000));
  _extra_km := ceil(greatest(0, _dist - _included_one_way));
  _extra := _extra_km::bigint * _extra_rate;
  _total := _base_fare + _extra;

  return jsonb_build_object(
    'served', true,
    'zone_id', _z.id,
    'zone_name', _z.name,
    'distance_km', round(_dist, 2),
    'included_one_way_km', _included_one_way,
    'extra_distance_km', _extra_km,
    'base_delivery_fare_kobo', _base_fare,
    'extra_distance_fare_kobo', _extra,
    'delivery_fare_kobo', _total
  );
end
$function$;

create or replace function public.choose_order_fulfillment(
  _order uuid, _choice text, _lat double precision default null,
  _lng double precision default null, _address text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare _o public.orders; _q jsonb; _a text; _fare bigint;
begin
  if auth.uid() is null then raise exception 'auth_required' using errcode = 'P0001'; end if;
  if _choice not in ('collect', 'deliver') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order and customer_id = auth.uid() for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if _o.status not in ('ready', 'awaiting_delivery_fare') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _o.source = 'subscription' then raise exception 'subscription_delivery_included' using errcode = 'P0001'; end if;
  -- Once a return-delivery payment succeeds, the destination and fulfillment choice are locked.
  if exists (
    select 1 from public.payments p
    where p.order_id = _order
      and p.purpose = 'delivery_fare'
      and p.kind = 'payment'
      and p.status = 'success'
  ) then
    raise exception 'delivery_already_paid' using errcode = 'P0001';
  end if;

  if _choice = 'collect' then
    update public.payments set status = 'failed'
    where order_id = _order and purpose = 'delivery_fare' and kind = 'payment' and status = 'pending';
    update public.orders
      set fulfillment_choice = 'collect', status = 'ready',
          return_delivery_lat = null, return_delivery_lng = null,
          return_delivery_address = null, return_delivery_distance_km = null
    where id = _order;
    insert into public.order_events(order_id, actor_id, event, detail)
    values (_order, auth.uid(), 'fulfillment_chosen', jsonb_build_object('choice', 'collect'));
    return jsonb_build_object('choice', 'collect', 'fare_kobo', 0);
  end if;

  if _lat is null or _lng is null or _lat < -90 or _lat > 90 or _lng < -180 or _lng > 180 then
    raise exception 'location_required' using errcode = 'P0001';
  end if;
  _a := nullif(trim(coalesce(_address, '')), '');
  if _a is null or length(_a) < 5 or length(_a) > 300 then
    raise exception 'address_required' using errcode = 'P0001';
  end if;

  _q := public.quote_one_time_return_delivery(_lat, _lng);
  if not coalesce((_q->>'served')::boolean, false) then
    if _q->>'reason' = 'not_served' then raise exception 'not_served' using errcode = 'P0001'; end if;
    raise exception 'hub_not_set' using errcode = 'P0001';
  end if;
  if _q->>'delivery_fare_kobo' is null or _q->>'zone_id' is null then
    raise exception 'hub_not_set' using errcode = 'P0001';
  end if;
  _fare := (_q->>'delivery_fare_kobo')::bigint;
  if _fare <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;

  update public.payments set status = 'failed'
  where order_id = _order and purpose = 'delivery_fare' and kind = 'payment' and status = 'pending';

  update public.orders
  set fulfillment_choice = 'deliver',
      return_delivery_lat = _lat,
      return_delivery_lng = _lng,
      return_delivery_address = _a,
      return_delivery_distance_km = (_q->>'distance_km')::numeric,
      delivery_fare_kobo = _fare,
      status = 'awaiting_delivery_fare'
  where id = _order;

  insert into public.order_events(order_id, actor_id, event, detail)
  values (_order, auth.uid(), 'delivery_requested',
    jsonb_build_object('fare_kobo', _fare, 'distance_km', _q->>'distance_km',
      'zone', _q->>'zone_name', 'customer_choice', true, 'journey', 'hub_to_customer'));

  return jsonb_build_object('choice', 'deliver', 'fare_kobo', _fare,
    'zone', _q->>'zone_name', 'distance_km', _q->>'distance_km',
    'included_one_way_km', _q->>'included_one_way_km',
    'extra_distance_km', _q->>'extra_distance_km',
    'base_delivery_fare_kobo', _q->>'base_delivery_fare_kobo',
    'extra_distance_fare_kobo', _q->>'extra_distance_fare_kobo');
end
$function$;

revoke all on function public.quote_one_time_return_delivery(double precision, double precision) from public, anon;
grant execute on function public.quote_one_time_return_delivery(double precision, double precision) to authenticated;
revoke all on function public.choose_order_fulfillment(uuid, text, double precision, double precision, text) from public, anon;
grant execute on function public.choose_order_fulfillment(uuid, text, double precision, double precision, text) to authenticated;

-- Successful return-delivery payment must not rewrite the completed laundry lifecycle.
create or replace function public.settle_online_payment(_reference text, _provider text, _amount_kobo bigint)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  _pay public.payments;
  _o public.orders;
  _paid bigint;
  _invoice public.subscription_invoices;
  _sub public.subscriptions;
  _pickup public.subscription_pickups;
begin
  select * into _pay from public.payments where reference = _reference for update;
  if not found or _pay.mode <> _provider then raise exception 'payment_not_found' using errcode = 'P0001'; end if;
  if _pay.status = 'success' then return jsonb_build_object('ok', true, 'already', true); end if;
  if _pay.amount_kobo <> _amount_kobo then raise exception 'amount_mismatch' using errcode = 'P0001'; end if;
  update public.payments set status = 'success', paid_at = now() where id = _pay.id;

  if _pay.purpose in ('subscription', 'extra_clothes') then
    select * into _invoice from public.subscription_invoices where id = _pay.invoice_id for update;
    if not found then raise exception 'subscription_invoice_not_found' using errcode = 'P0001'; end if;
    select * into _sub from public.subscriptions where id = _invoice.subscription_id for update;
    if not found or _sub.customer_id <> _pay.customer_id then raise exception 'subscription_not_found' using errcode = 'P0001'; end if;
    update public.subscription_invoices set status = 'paid' where id = _invoice.id;
    if _pay.purpose = 'subscription' and _sub.status <> 'active' then
      update public.subscriptions set status = 'active', started_at = coalesce(started_at, now()),
        current_period_start = now(), current_period_end = now() + interval '1 month', updated_at = now()
      where id = _sub.id;
    elsif _pay.purpose = 'extra_clothes' then
      select * into _pickup from public.subscription_pickups where id = _invoice.subscription_pickup_id for update;
      if found and _pickup.order_id is not null and _pickup.overage_kobo > 0 then
        update public.orders set status = 'count_confirmed' where id = _pickup.order_id and status = 'counted';
      end if;
    end if;
    return jsonb_build_object('ok', true, 'subscription_id', _sub.id, 'activated', _pay.purpose = 'subscription');
  end if;

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
    -- Keep the completed laundry lifecycle at Ready; staff can now arrange delivery.
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

revoke all on function public.settle_online_payment(text, text, bigint) from public, anon;
grant execute on function public.settle_online_payment(text, text, bigint) to authenticated, service_role;
