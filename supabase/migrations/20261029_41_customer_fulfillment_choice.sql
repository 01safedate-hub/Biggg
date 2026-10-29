-- Customer fulfillment choice and fresh delivery-fare quote for ready orders.
alter table public.orders
  add column if not exists fulfillment_choice text
  check (fulfillment_choice in ('collect', 'deliver'));

create or replace function public.choose_order_fulfillment(
  _order uuid, _choice text, _lat double precision default null,
  _lng double precision default null, _address text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare _o public.orders; _q jsonb; _a text; _fare bigint;
begin
  if auth.uid() is null then raise exception 'auth_required' using errcode = 'P0001'; end if;
  if _choice not in ('collect', 'deliver') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order and customer_id = auth.uid() for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if _o.status not in ('ready', 'awaiting_delivery_fare') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _o.source = 'subscription' then raise exception 'subscription_delivery_included' using errcode = 'P0001'; end if;
  if _choice = 'collect' then
    update public.payments set status = 'failed'
     where order_id = _order and purpose = 'delivery_fare' and kind = 'payment' and status = 'pending';
    update public.orders set fulfillment_choice='collect', status='ready', delivery_fare_kobo=0 where id=_order;
    insert into public.order_events(order_id,actor_id,event,detail)
    values(_order,auth.uid(),'fulfillment_chosen',jsonb_build_object('choice','collect'));
    return jsonb_build_object('choice','collect','fare_kobo',0);
  end if;
  if _lat is null or _lng is null or _lat < -90 or _lat > 90 or _lng < -180 or _lng > 180 then
    raise exception 'location_required' using errcode = 'P0001';
  end if;
  _a := nullif(trim(coalesce(_address,'')),'');
  if _a is null or length(_a)<5 or length(_a)>300 then raise exception 'address_required' using errcode='P0001'; end if;
  _q := public.quote_pickup(_lat,_lng);
  if not coalesce((_q->>'served')::boolean,false) then raise exception 'not_served' using errcode='P0001'; end if;
  if _q->>'delivery_fare_kobo' is null then raise exception 'hub_not_set' using errcode='P0001'; end if;
  _fare := coalesce((_q->>'delivery_fare_kobo')::bigint,0);
  if _fare<=0 then raise exception 'nothing_to_pay' using errcode='P0001'; end if;
  update public.payments set status='failed'
   where order_id=_order and purpose='delivery_fare' and kind='payment' and status='pending';
  update public.orders set fulfillment_choice='deliver',pickup_lat=_lat,pickup_lng=_lng,pickup_address=_a,
    pickup_distance_km=(_q->>'distance_km')::numeric,zone_id=(_q->>'zone_id')::uuid,
    delivery_fare_kobo=_fare,status='awaiting_delivery_fare' where id=_order;
  insert into public.order_events(order_id,actor_id,event,detail)
  values(_order,auth.uid(),'delivery_requested',jsonb_build_object('fare_kobo',_fare,'distance_km',_q->>'distance_km','customer_choice',true));
  return jsonb_build_object('choice','deliver','fare_kobo',_fare,'zone',_q->>'zone_name','distance_km',_q->>'distance_km');
end $function$;
revoke all on function public.choose_order_fulfillment(uuid,text,double precision,double precision,text) from public, anon;
grant execute on function public.choose_order_fulfillment(uuid,text,double precision,double precision,text) to authenticated;
