-- One-time transport checkout (kept separate from subscription bookings).
-- This migration has already been applied to the LaundryPoint project through the Supabase
-- migration API; the file is checked in so fresh environments receive the same functions/settings.
insert into public.settings (key, value, description, is_public)
values ('one_time_pickup',
  '{"base_pickup_kobo":180000,"base_delivery_kobo":180000,"included_round_trip_km":100,"extra_km_kobo":5000}'::jsonb,
  'One-time pickup and delivery pricing: ₦1,800 per transport leg, 100 km round trip included, ₦50/km excess.', true)
on conflict (key) do nothing;

create or replace function public.quote_one_time_pickup(_lat double precision, _lng double precision)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare _base jsonb; _hub jsonb; _business jsonb; _z record; _dist numeric; _included numeric;
  _extra_rate bigint; _pickup bigint; _delivery bigint; _extra bigint; _total bigint;
  _tz text; _local timestamp; _open time; _close time; _is_open boolean; _scheduled timestamptz;
begin
  if _lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180 then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;
  select value into _base from public.settings where key = 'one_time_pickup';
  select value into _hub from public.settings where key = 'hub';
  select value into _business from public.settings where key = 'business';
  select z.id, z.name into _z from public.zones z
    where z.is_live and z.centre_lat is not null and z.centre_lng is not null and z.radius_m is not null
      and private.distance_km(z.centre_lat, z.centre_lng, _lat, _lng) * 1000 <= z.radius_m
    order by private.distance_km(z.centre_lat, z.centre_lng, _lat, _lng) limit 1;
  if not found then return jsonb_build_object('served', false, 'reason', 'not_served'); end if;
  if _hub->>'lat' is null or _hub->>'lng' is null then
    return jsonb_build_object('served', true, 'zone_id', _z.id, 'zone_name', _z.name, 'reason', 'hub_not_set');
  end if;
  _dist := private.distance_km((_hub->>'lat')::float8, (_hub->>'lng')::float8, _lat, _lng)::numeric;
  _included := greatest(0, coalesce((_base->>'included_round_trip_km')::numeric, 100));
  _extra_rate := greatest(0, coalesce((_base->>'extra_km_kobo')::bigint, 5000));
  _pickup := greatest(180000, coalesce((_base->>'base_pickup_kobo')::bigint, 180000));
  _delivery := greatest(180000, coalesce((_base->>'base_delivery_kobo')::bigint, 180000));
  _extra := ceil(greatest(0, (_dist * 2) - _included))::bigint * _extra_rate;
  _total := _pickup + _delivery + _extra;
  _tz := coalesce(_business->>'timezone', 'Africa/Lagos');
  _open := coalesce((_business->>'opening_time')::time, time '08:00');
  _close := coalesce((_business->>'closing_time')::time, time '18:00');
  _local := now() at time zone _tz;
  _is_open := _local::time >= _open and _local::time < _close;
  if not _is_open then _scheduled := ((_local::date + case when _local::time < _open then 0 else 1 end) + _open) at time zone _tz; end if;
  return jsonb_build_object('served', true, 'zone_id', _z.id, 'zone_name', _z.name,
    'distance_km', round(_dist,2), 'round_trip_km',round(_dist*2,2),'included_round_trip_km',_included,
    'extra_distance_km',ceil(greatest(0,(_dist*2)-_included)),'pickup_fare_kobo',_pickup,
    'delivery_fare_kobo',_delivery,'extra_distance_fare_kobo',_extra,'total_fare_kobo',_total,
    'is_open',_is_open,'after_hours',not _is_open,'scheduled_for',_scheduled);
end $function$;

create or replace function public.book_one_time_pickup(
  _lat double precision,_lng double precision,_address text,_notes text,_slot timestamptz default null
) returns uuid language plpgsql security definer set search_path = ''
as $function$
declare _a text := nullif(trim(_address),''); _q jsonb; _id uuid; _sub_id uuid; _scheduled timestamptz;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode='P0001'; end if;
  if _a is null or length(_a)<5 or length(_a)>300 then raise exception 'address_required' using errcode='P0001'; end if;
  if length(coalesce(_notes,''))>500 then raise exception 'notes_too_long' using errcode='P0001'; end if;
  select s.id into _sub_id from public.subscriptions s where s.customer_id=auth.uid() and s.status='active'
    and s.current_period_start<=now() and s.current_period_end>now()
    order by s.current_period_end desc limit 1;
  if found then raise exception 'subscription_use_plan_booking' using errcode='P0001'; end if;
  _q := public.quote_one_time_pickup(_lat,_lng);
  if not coalesce((_q->>'served')::boolean,false) then raise exception 'not_served' using errcode='P0001'; end if;
  if _q->>'zone_id' is null or _q->>'total_fare_kobo' is null then raise exception 'service_area_unavailable' using errcode='P0001'; end if;
  _scheduled := coalesce(_slot,nullif(_q->>'scheduled_for','')::timestamptz,now());
  if _slot is not null then
    if _slot<=now() then raise exception 'slot_invalid' using errcode='P0001'; end if;
    perform pg_advisory_xact_lock(hashtext('slot:'||_slot::text));
    if private.slot_remaining(_slot,null)<=0 then raise exception 'slot_unavailable' using errcode='P0001'; end if;
  end if;
  insert into public.orders(customer_id,source,status,zone_id,pickup_lat,pickup_lng,pickup_address,pickup_distance_km,
    after_hours,scheduled_for,pickup_fare_kobo,delivery_fare_kobo,notes,created_by)
  values(auth.uid(),'one_time','awaiting_fare_payment',(_q->>'zone_id')::uuid,_lat,_lng,_a,
    nullif(_q->>'distance_km','')::numeric,coalesce((_q->>'after_hours')::boolean,false),_scheduled,
    (_q->>'pickup_fare_kobo')::bigint+(_q->>'extra_distance_fare_kobo')::bigint,
    (_q->>'delivery_fare_kobo')::bigint,nullif(trim(_notes),''),auth.uid()) returning id into _id;
  return _id;
end $function$;

create or replace function public.create_payment_intent(_order uuid,_purpose text,_provider text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare _o public.orders; _amt bigint; _paid bigint; _ref text; _mp uuid; _p public.profiles; _note text;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode='P0001'; end if;
  if _provider not in ('paystack','flutterwave') then raise exception 'invalid_provider' using errcode='P0001'; end if;
  select * into _o from public.orders where id=_order for update;
  if not found or _o.customer_id<>auth.uid() then raise exception 'order_not_found' using errcode='P0001'; end if;
  if _purpose in ('pickup_fare','delivery_fare') then
    if _o.source<>'one_time' then raise exception 'subscription_only_booking' using errcode='P0001'; end if;
    if _purpose='pickup_fare' then
      if _o.status<>'awaiting_fare_payment' then raise exception 'wrong_state' using errcode='P0001'; end if;
      _amt := _o.pickup_fare_kobo+coalesce(_o.delivery_fare_kobo,0); _note := 'One-time pickup and delivery, transport prepaid';
    else raise exception 'invalid_purpose' using errcode='P0001'; end if;
  elsif _purpose='items' then
    if _o.source in ('subscription','one_time') or _o.status not in ('counted','count_confirmed') then raise exception 'wrong_state' using errcode='P0001'; end if;
    select coalesce(sum(case when kind='payment' then amount_kobo else -amount_kobo end),0) into _paid
      from public.payments where order_id=_order and purpose='items' and status='success';
    _amt := greatest(0,_o.items_total_kobo-_o.discount_kobo)+_o.instant_fee_kobo-_paid;
  elsif _purpose='demurrage' then
    if _o.status<>'failed_delivery' then raise exception 'wrong_state' using errcode='P0001'; end if;
    _amt := private.demurrage_due(_order); _note := 'Storage fee';
  else raise exception 'invalid_purpose' using errcode='P0001'; end if;
  if _amt is null or _amt<=0 then raise exception 'nothing_to_pay' using errcode='P0001'; end if;
  _mp := private.online_money_point(); if _mp is null then raise exception 'no_online_money_point' using errcode='P0001'; end if;
  update public.payments set status='failed' where order_id=_order and purpose=_purpose and kind='payment' and status='pending';
  _ref := 'LP-'||_o.order_no||'-'||(case _purpose when 'items' then 'B' when 'delivery_fare' then 'D' when 'demurrage' then 'S' else 'F' end)||'-'||encode(extensions.gen_random_bytes(6),'hex');
  insert into public.payments(order_id,customer_id,purpose,kind,mode,amount_kobo,reference,status,money_point_id,note)
  values(_order,auth.uid(),_purpose,'payment',_provider,_amt,_ref,'pending',_mp,_note);
  select * into _p from public.profiles where id=auth.uid();
  return jsonb_build_object('reference',_ref,'amount_kobo',_amt,'email',_p.email,'name',_p.full_name,'phone',_p.phone,'order_no',_o.order_no);
end $function$;

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

grant execute on function public.quote_one_time_pickup(double precision,double precision) to authenticated;
grant execute on function public.book_one_time_pickup(double precision,double precision,text,text,timestamptz) to authenticated;
revoke execute on function public.quote_one_time_pickup(double precision,double precision) from anon,public;
revoke execute on function public.book_one_time_pickup(double precision,double precision,text,text,timestamptz) from anon,public;
