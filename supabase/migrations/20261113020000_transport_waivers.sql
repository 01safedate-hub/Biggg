-- Free transport switch.
-- Admins create rules that make pickup and/or delivery transport free for everyone, a zone,
-- a plan or one customer, for laundry or cleaning, optionally between two dates.
-- The fare is still worked out and stored as "waived" on each order, so reports show the cost.
-- Orders keep the price they were booked at: a rule only affects new bookings.

create table if not exists public.transport_waivers (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(trim(label)) between 2 and 80),
  service text not null default 'laundry' check (service in ('laundry', 'cleaning')),
  scope text not null check (scope in ('all', 'zone', 'plan', 'customer')),
  zone_id uuid references public.zones(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete cascade,
  customer_id uuid references public.profiles(id) on delete cascade,
  legs text not null default 'both' check (legs in ('pickup', 'delivery', 'both')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  public_message text check (public_message is null or length(public_message) <= 140),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  ended_by uuid references public.profiles(id) on delete set null,
  ended_at timestamptz,
  check (ends_at is null or ends_at > starts_at),
  check ((scope = 'zone') = (zone_id is not null)),
  check ((scope = 'plan') = (plan_id is not null)),
  check ((scope = 'customer') = (customer_id is not null))
);
create index if not exists transport_waivers_live on public.transport_waivers (service, active, starts_at);
alter table public.transport_waivers enable row level security;
drop policy if exists transport_waivers_staff_read on public.transport_waivers;
create policy transport_waivers_staff_read on public.transport_waivers for select to authenticated using ((select private.is_staff()));

alter table public.orders
  add column if not exists pickup_fare_waived_kobo bigint not null default 0 check (pickup_fare_waived_kobo >= 0),
  add column if not exists delivery_fare_waived_kobo bigint not null default 0 check (delivery_fare_waived_kobo >= 0),
  add column if not exists transport_waiver_id uuid references public.transport_waivers(id) on delete set null;

-- The most specific live rule for this booking: customer, then plan, then zone, then everyone.
-- For laundry, "plan" means the customer's active laundry subscription plan.
create or replace function private.transport_waiver(_service text, _customer uuid, _zone uuid, _at timestamptz default now())
returns public.transport_waivers
language sql stable security definer set search_path = ''
as $$
  select w.* from public.transport_waivers w
   where w.service = _service and w.active and w.starts_at <= _at and (w.ends_at is null or w.ends_at > _at)
     and (w.scope = 'all'
       or (w.scope = 'zone' and w.zone_id = _zone)
       or (w.scope = 'customer' and w.customer_id = _customer)
       or (w.scope = 'plan' and _service = 'laundry' and exists (
             select 1 from public.subscriptions s where s.customer_id = _customer and s.plan_id = w.plan_id
                and s.status = 'active' and s.current_period_start <= _at and s.current_period_end > _at)))
   order by case w.scope when 'customer' then 1 when 'plan' then 2 when 'zone' then 3 else 4 end, w.created_at desc
   limit 1
$$;

-- Moves a booking whose transport is fully waived past the payment step, exactly as a successful
-- transport payment would (including handing it to a pre-assigned commission agent).
create or replace function private.release_free_transport_order(_order uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare _o public.orders;
begin
  select * into _o from public.orders where id = _order for update;
  if not found or _o.status <> 'awaiting_fare_payment' then return; end if;
  if coalesce(_o.pickup_fare_kobo, 0) + coalesce(_o.delivery_fare_kobo, 0) > 0 then return; end if;
  update public.orders set status = 'awaiting_dispatch' where id = _order;
  insert into public.order_events(order_id, actor_id, event, detail)
  values (_order, auth.uid(), 'transport_waived', jsonb_build_object('pickup_waived_kobo', _o.pickup_fare_waived_kobo,
    'delivery_waived_kobo', _o.delivery_fare_waived_kobo, 'waiver_id', _o.transport_waiver_id));
  if _o.pickup_agent_id is not null and private.is_verified_commission_agent(_o.pickup_agent_id) then
    update public.orders set status = 'agent_assigned' where id = _order and status = 'awaiting_dispatch';
  end if;
end
$$;

-- One-time pickup quote, now with the transport switch applied. Everything else is unchanged.
create or replace function public.quote_one_time_pickup(_lat double precision, _lng double precision)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare
  _base jsonb; _hub jsonb; _business jsonb; _z record; _dist numeric; _included numeric; _extra_rate bigint;
  _pickup bigint; _delivery bigint; _extra bigint; _total bigint; _tz text; _local timestamp; _open time; _close time;
  _is_open boolean; _scheduled timestamptz; _w public.transport_waivers;
  _pw bigint := 0; _dw bigint := 0; _full_pickup bigint; _full_delivery bigint; _full_extra bigint;
begin
  if _lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180 then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;
  select value into _base from public.settings where key = 'one_time_pickup';
  select value into _hub from public.settings where key = 'hub';
  select value into _business from public.settings where key = 'business';

  select z.id, z.name into _z
  from public.zones z
  where z.is_live and z.centre_lat is not null and z.centre_lng is not null and z.radius_m is not null
    and private.distance_km(z.centre_lat, z.centre_lng, _lat, _lng) * 1000 <= z.radius_m
  order by private.distance_km(z.centre_lat, z.centre_lng, _lat, _lng)
  limit 1;
  if not found then
    return jsonb_build_object('served', false, 'reason', 'not_served');
  end if;
  if _hub->>'lat' is null or _hub->>'lng' is null then
    return jsonb_build_object('served', true, 'zone_id', _z.id, 'zone_name', _z.name, 'reason', 'hub_not_set');
  end if;

  _dist := private.distance_km((_hub->>'lat')::float8, (_hub->>'lng')::float8, _lat, _lng)::numeric;
  _included := greatest(0, coalesce((_base->>'included_round_trip_km')::numeric, 100));
  _extra_rate := greatest(0, coalesce((_base->>'extra_km_kobo')::bigint, 5000));
  _pickup := greatest(180000, coalesce((_base->>'base_pickup_kobo')::bigint, 180000));
  _delivery := greatest(180000, coalesce((_base->>'base_delivery_kobo')::bigint, 180000));
  -- Distance is the full round-trip journey, not one-way distance.
  _extra := ceil(greatest(0, (_dist * 2) - _included))::bigint * _extra_rate;
  _full_pickup := _pickup; _full_delivery := _delivery; _full_extra := _extra;

  -- Free transport switch. Extra distance is split evenly between the two legs.
  _w := private.transport_waiver('laundry', auth.uid(), _z.id);
  if _w.id is not null then
    if _w.legs in ('pickup', 'both') then _pw := _pickup + (_extra - _extra / 2); _pickup := 0; end if;
    if _w.legs in ('delivery', 'both') then _dw := _delivery + (_extra / 2); _delivery := 0; end if;
    _extra := case when _w.legs = 'both' then 0 when _w.legs = 'pickup' then _extra / 2 else _extra - _extra / 2 end;
  end if;
  _total := _pickup + _delivery + _extra;

  _tz := coalesce(_business->>'timezone', 'Africa/Lagos');
  _open := coalesce((_business->>'opening_time')::time, time '08:00');
  _close := coalesce((_business->>'closing_time')::time, time '18:00');
  _local := now() at time zone _tz;
  _is_open := _local::time >= _open and _local::time < _close;
  if not _is_open then
    _scheduled := ((_local::date + case when _local::time < _open then 0 else 1 end) + _open) at time zone _tz;
  end if;

  return jsonb_build_object(
    'served', true, 'zone_id', _z.id, 'zone_name', _z.name,
    'distance_km', round(_dist, 2), 'round_trip_km', round(_dist * 2, 2),
    'included_round_trip_km', _included, 'extra_distance_km', ceil(greatest(0, (_dist * 2) - _included)),
    'pickup_fare_kobo', _pickup, 'delivery_fare_kobo', _delivery,
    'extra_distance_fare_kobo', _extra, 'total_fare_kobo', _total,
    'full_total_fare_kobo', _full_pickup + _full_delivery + _full_extra,
    'pickup_waived_kobo', _pw, 'delivery_waived_kobo', _dw,
    'waiver_id', _w.id, 'waiver_legs', _w.legs, 'waiver_message', _w.public_message,
    'is_open', _is_open, 'after_hours', not _is_open, 'scheduled_for', _scheduled
  );
end
$function$;

create or replace function public.book_one_time_pickup(_lat double precision, _lng double precision, _address text, _notes text, _slot timestamp with time zone default null::timestamp with time zone)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  _a text := nullif(trim(_address), '');
  _q jsonb;
  _id uuid;
  _scheduled timestamptz;
begin
  if auth.uid() is null or not private.is_active() then
    raise exception 'account_restricted' using errcode = 'P0001';
  end if;
  if _a is null or length(_a) < 5 or length(_a) > 300 then
    raise exception 'address_required' using errcode = 'P0001';
  end if;
  if length(coalesce(_notes, '')) > 500 then
    raise exception 'notes_too_long' using errcode = 'P0001';
  end if;

  _q := public.quote_one_time_pickup(_lat, _lng);
  if not coalesce((_q->>'served')::boolean, false) then
    raise exception 'not_served' using errcode = 'P0001';
  end if;
  if _q->>'zone_id' is null or _q->>'total_fare_kobo' is null then
    raise exception 'service_area_unavailable' using errcode = 'P0001';
  end if;

  _scheduled := coalesce(_slot, nullif(_q->>'scheduled_for', '')::timestamptz, now());
  if _slot is not null then
    perform pg_advisory_xact_lock(hashtext('slot:' || _slot::text));
    if private.slot_remaining(_slot, null) <= 0 then
      raise exception 'slot_unavailable' using errcode = 'P0001';
    end if;
    if _slot <= now() then
      raise exception 'slot_invalid' using errcode = 'P0001';
    end if;
  end if;

  insert into public.orders (
    customer_id, source, status, zone_id, pickup_lat, pickup_lng, pickup_address,
    pickup_distance_km, after_hours, scheduled_for, pickup_fare_kobo,
    delivery_fare_kobo, notes, created_by,
    pickup_fare_waived_kobo, delivery_fare_waived_kobo, transport_waiver_id
  ) values (
    auth.uid(), 'one_time', 'awaiting_fare_payment', (_q->>'zone_id')::uuid,
    _lat, _lng, _a, nullif(_q->>'distance_km','')::numeric,
    coalesce((_q->>'after_hours')::boolean, false), _scheduled,
    (_q->>'pickup_fare_kobo')::bigint + (_q->>'extra_distance_fare_kobo')::bigint,
    (_q->>'delivery_fare_kobo')::bigint, nullif(trim(_notes), ''), auth.uid(),
    coalesce((_q->>'pickup_waived_kobo')::bigint, 0), coalesce((_q->>'delivery_waived_kobo')::bigint, 0),
    nullif(_q->>'waiver_id', '')::uuid
  ) returning id into _id;
  -- Fully free transport: nothing to pay, so the booking moves on as if paid.
  perform private.release_free_transport_order(_id);
  return _id;
end
$function$;

create or replace function private.book_subscription_pickup(_customer uuid, _lat double precision, _lng double precision, _address text, _notes text, _slot timestamp with time zone, _allow_paid boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  _a text := nullif(trim(_address), '');
  _sub public.subscriptions; _plan public.plans; _q jsonb; _f jsonb;
  _scheduled timestamptz; _cycle record; _used integer; _paid boolean := false;
  _order uuid; _pickup uuid; _tz text := 'Africa/Lagos'; _w public.transport_waivers;
  _pf bigint := 0; _df bigint := 0; _pw bigint := 0; _dw bigint := 0;
begin
  if _customer is null then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  if _a is null or length(_a) < 5 or length(_a) > 300 then raise exception 'address_required' using errcode = 'P0001'; end if;
  if length(coalesce(_notes, '')) > 500 then raise exception 'notes_too_long' using errcode = 'P0001'; end if;
  perform private.roll_customer_subscriptions(_customer);
  select * into _sub from public.subscriptions s
   where s.customer_id = _customer and s.status = 'active'
     and s.current_period_start <= now() and s.current_period_end > now()
   order by s.current_period_end desc limit 1 for update;
  if not found then raise exception 'subscription_required' using errcode = 'P0001'; end if;
  select * into _plan from public.plans where id = _sub.plan_id;
  if not found or coalesce(_plan.pieces_per_month, 0) < 1 then
    raise exception 'subscription_plan_invalid' using errcode = 'P0001';
  end if;
  _q := public.quote_pickup(_lat, _lng);
  if not coalesce((_q->>'served')::boolean, false) then raise exception 'not_served' using errcode = 'P0001'; end if;
  if _q->>'zone_id' is null then raise exception 'service_area_unavailable' using errcode = 'P0001'; end if;
  if _slot is not null then
    if _slot <= now() then raise exception 'slot_invalid' using errcode = 'P0001'; end if;
    perform pg_advisory_xact_lock(hashtext('slot:' || _slot::text));
    if private.slot_remaining(_slot, null) <= 0 then raise exception 'slot_unavailable' using errcode = 'P0001'; end if;
  end if;
  _scheduled := coalesce(_slot, nullif(_q->>'scheduled_for','')::timestamptz, now());
  if _scheduled >= _sub.current_period_end then
    raise exception 'pickup_outside_subscription_period' using errcode = 'P0001';
  end if;
  select * into _cycle from private.subscription_cycle(_sub.current_period_start, _scheduled);
  _used := private.subscription_included_pickups_used(_sub.id, _cycle.cycle_start, _cycle.cycle_end);
  if _used >= coalesce(_plan.pickups_per_month, 2) then
    if not _allow_paid then raise exception 'monthly_pickup_limit_reached' using errcode = 'P0001'; end if;
    _paid := true;
    -- quote_one_time_pickup uses auth.uid(); desk and WhatsApp callers book for another customer,
    -- so the switch is checked here for the actual customer and the full fare recomputed if needed.
    _f := public.quote_one_time_pickup(_lat, _lng);
    if not coalesce((_f->>'served')::boolean, false) or _f->>'total_fare_kobo' is null then
      raise exception 'service_area_unavailable' using errcode = 'P0001';
    end if;
    _pf := (_f->>'pickup_fare_kobo')::bigint + coalesce((_f->>'extra_distance_fare_kobo')::bigint, 0);
    _df := (_f->>'delivery_fare_kobo')::bigint;
    _pw := coalesce((_f->>'pickup_waived_kobo')::bigint, 0);
    _dw := coalesce((_f->>'delivery_waived_kobo')::bigint, 0);
    if auth.uid() is distinct from _customer then
      -- Undo any waiver computed for the caller, then apply the customer's own.
      _pf := _pf + _pw; _df := _df + _dw; _pw := 0; _dw := 0;
      _w := private.transport_waiver('laundry', _customer, (_q->>'zone_id')::uuid);
      if _w.id is not null then
        if _w.legs in ('pickup', 'both') then _pw := _pf; _pf := 0; end if;
        if _w.legs in ('delivery', 'both') then _dw := _df; _df := 0; end if;
      end if;
    else
      _w.id := nullif(_f->>'waiver_id', '')::uuid;
    end if;
  end if;
  select coalesce(value->>'timezone', 'Africa/Lagos') into _tz from public.settings where key = 'business';
  _tz := coalesce(_tz, 'Africa/Lagos');
  insert into public.orders (
    customer_id, source, status, zone_id, pickup_lat, pickup_lng, pickup_address, pickup_distance_km,
    after_hours, scheduled_for, pickup_fare_kobo, delivery_fare_kobo, notes, created_by,
    pickup_fare_waived_kobo, delivery_fare_waived_kobo, transport_waiver_id
  ) values (
    _customer, 'subscription', (case when _paid then 'awaiting_fare_payment' else 'awaiting_dispatch' end)::public.order_status,
    (_q->>'zone_id')::uuid, _lat, _lng, _a, nullif(_q->>'distance_km','')::numeric,
    case when _slot is not null then false else coalesce((_q->>'after_hours')::boolean, false) end, _scheduled,
    _pf, _df, nullif(trim(_notes), ''), _customer, _pw, _dw, _w.id
  ) returning id into _order;
  insert into public.subscription_pickups (subscription_id, week_start, scheduled_for, status, order_id,
    pieces_counted, overage_pieces, overage_kobo, transport_paid)
  values (_sub.id, date_trunc('week', _scheduled at time zone _tz)::date, _scheduled, 'scheduled', _order, 0, 0, 0, _paid)
  returning id into _pickup;
  update public.orders set subscription_pickup_id = _pickup where id = _order;
  if _paid then perform private.release_free_transport_order(_order); end if;
  return jsonb_build_object('order_id', _order, 'transport_paid', _paid,
    'fare_kobo', case when _paid then _pf + _df else 0 end,
    'transport_waived_kobo', _pw + _dw,
    'included_pickups_used', _used + case when _paid then 0 else 1 end,
    'included_pickups', coalesce(_plan.pickups_per_month, 2));
end
$function$;

-- A waived delivery counts as prepaid for the return journey; a further address pays only the difference.
create or replace function private.set_one_time_return(_o orders, _actor uuid, _lat double precision, _lng double precision, _address text, _channel text)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare _q jsonb; _fare bigint; _prepaid bigint := coalesce(_o.return_prepaid_kobo, 0) + coalesce(_o.delivery_fare_waived_kobo, 0); _due bigint;
begin
  _q := public.quote_one_time_return_delivery(_lat, _lng);
  if not coalesce((_q->>'served')::boolean, false) then
    if _q->>'reason' = 'not_served' then raise exception 'not_served' using errcode = 'P0001'; end if;
    raise exception 'hub_not_set' using errcode = 'P0001';
  end if;
  if _q->>'delivery_fare_kobo' is null or _q->>'zone_id' is null then raise exception 'hub_not_set' using errcode = 'P0001'; end if;
  _fare := (_q->>'delivery_fare_kobo')::bigint;
  _due := greatest(0, _fare - _prepaid);
  if _prepaid = 0 and _due <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;

  update public.payments set status = 'failed'
   where order_id = _o.id and purpose = 'delivery_fare' and kind = 'payment' and status = 'pending';

  update public.orders
     set fulfillment_choice = 'deliver',
         return_delivery_lat = _lat, return_delivery_lng = _lng, return_delivery_address = _address,
         return_delivery_distance_km = (_q->>'distance_km')::numeric,
         delivery_fare_kobo = _due,
         status = case when _due = 0 then 'ready'::public.order_status else 'awaiting_delivery_fare'::public.order_status end,
         updated_at = now()
   where id = _o.id;

  insert into public.order_events(order_id, actor_id, event, detail)
  values (_o.id, _actor, case when _channel = 'whatsapp' then 'return_delivery_requested' else 'delivery_requested' end,
    jsonb_build_object('fare_kobo', _fare, 'prepaid_kobo', _prepaid, 'due_kobo', _due, 'distance_km', _q->>'distance_km',
      'zone', _q->>'zone_name', 'customer_choice', true, 'journey', 'hub_to_customer', 'channel', _channel,
      'waived_kobo', coalesce(_o.delivery_fare_waived_kobo, 0)));

  return jsonb_build_object('choice', 'deliver', 'fare_kobo', _due, 'full_fare_kobo', _fare, 'prepaid_kobo', _prepaid,
    'covered', _due = 0, 'address', _address, 'zone', _q->>'zone_name', 'distance_km', _q->>'distance_km',
    'included_one_way_km', _q->>'included_one_way_km', 'extra_distance_km', _q->>'extra_distance_km',
    'base_delivery_fare_kobo', _q->>'base_delivery_fare_kobo', 'extra_distance_fare_kobo', _q->>'extra_distance_fare_kobo');
end
$function$;

create or replace function private.one_time_return_covered(_o orders)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select _o.source = 'one_time' and _o.fulfillment_choice = 'deliver' and (
    (coalesce(_o.delivery_fare_kobo, 0) = 0 and (coalesce(_o.return_prepaid_kobo, 0) > 0 or coalesce(_o.delivery_fare_waived_kobo, 0) > 0))
    or exists (select 1 from public.payments p
                where p.order_id = _o.id and p.purpose = 'delivery_fare'
                  and p.kind = 'payment' and p.status = 'success'))
$function$;

-- Desk delivery for walk-in orders: a waived delivery goes straight out, as a paid one would.
create or replace function public.desk_request_delivery(_order uuid, _lat double precision, _lng double precision, _address text)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare _o public.orders; _q jsonb; _a text := nullif(trim(coalesce(_address, '')), ''); _walk boolean;
        _fare bigint; _w public.transport_waivers;
begin
  _o := private.walkin_order(_order, array['ready', 'awaiting_delivery_fare']::public.order_status[]);
  select is_walk_in into _walk from public.profiles where id = _o.customer_id;
  if coalesce(_walk, false) then raise exception 'customer_needs_account' using errcode = 'P0001'; end if;
  if _a is null or length(_a) < 5 or length(_a) > 300 then raise exception 'address_required' using errcode = 'P0001'; end if;
  _q := public.quote_pickup(_lat, _lng);
  if not coalesce((_q->>'served')::boolean, false) then raise exception 'not_served' using errcode = 'P0001'; end if;
  if _q->>'delivery_fare_kobo' is null then raise exception 'hub_not_set' using errcode = 'P0001'; end if;
  _fare := coalesce((_q->>'delivery_fare_kobo')::bigint, 0);
  if _fare <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;
  _w := private.transport_waiver('laundry', _o.customer_id, (_q->>'zone_id')::uuid);
  update public.payments set status = 'failed' where order_id = _order and purpose = 'delivery_fare' and kind = 'payment' and status = 'pending';
  if _w.id is not null and _w.legs in ('delivery', 'both') then
    update public.orders set pickup_lat = _lat, pickup_lng = _lng, pickup_address = _a, pickup_distance_km = (_q->>'distance_km')::numeric, zone_id = (_q->>'zone_id')::uuid,
           delivery_fare_kobo = 0, delivery_fare_waived_kobo = _fare, transport_waiver_id = _w.id, status = 'out_for_delivery' where id = _order;
    insert into public.order_events (order_id, actor_id, event, detail) values (_order, auth.uid(), 'delivery_requested',
      jsonb_build_object('fare_kobo', 0, 'waived_kobo', _fare, 'waiver_id', _w.id, 'distance_km', _q->>'distance_km'));
    return jsonb_build_object('fare_kobo', 0, 'waived_kobo', _fare, 'zone', _q->>'zone_name', 'distance_km', _q->>'distance_km', 'free', true);
  end if;
  update public.orders set pickup_lat = _lat, pickup_lng = _lng, pickup_address = _a, pickup_distance_km = (_q->>'distance_km')::numeric, zone_id = (_q->>'zone_id')::uuid,
         delivery_fare_kobo = _fare, status = 'awaiting_delivery_fare' where id = _order;
  insert into public.order_events (order_id, actor_id, event, detail) values (_order, auth.uid(), 'delivery_requested', jsonb_build_object('fare_kobo', _fare, 'distance_km', _q->>'distance_km'));
  return jsonb_build_object('fare_kobo', _fare, 'zone', _q->>'zone_name', 'distance_km', _q->>'distance_km');
end $function$;

-- ---------- Admin ----------
create or replace function public.transport_waivers_list()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', w.id, 'label', w.label, 'service', w.service, 'scope', w.scope, 'legs', w.legs,
      'zone', z.name, 'plan', p.name, 'customer', c.full_name, 'customer_phone', c.phone,
      'starts_at', w.starts_at, 'ends_at', w.ends_at, 'public_message', w.public_message,
      'live', w.active and w.starts_at <= now() and (w.ends_at is null or w.ends_at > now()),
      'active', w.active, 'ended_at', w.ended_at, 'created_by', cb.full_name, 'created_at', w.created_at,
      'orders', (select count(*) from public.orders o where o.transport_waiver_id = w.id),
      'waived_kobo', (select coalesce(sum(o.pickup_fare_waived_kobo + o.delivery_fare_waived_kobo), 0) from public.orders o
                       where o.transport_waiver_id = w.id and o.status <> 'cancelled'))
    order by (w.active and (w.ends_at is null or w.ends_at > now())) desc, w.created_at desc)
    from public.transport_waivers w
    left join public.zones z on z.id = w.zone_id left join public.plans p on p.id = w.plan_id
    left join public.profiles c on c.id = w.customer_id left join public.profiles cb on cb.id = w.created_by), '[]'::jsonb);
end $$;

create or replace function public.create_transport_waiver(_label text, _service text, _scope text, _target uuid, _legs text,
  _starts_at timestamptz, _ends_at timestamptz, _message text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare _id uuid;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if _scope not in ('all', 'zone', 'plan', 'customer') then raise exception 'invalid_scope' using errcode = 'P0001'; end if;
  if _scope <> 'all' and _target is null then raise exception 'waiver_target_required' using errcode = 'P0001'; end if;
  if _scope = 'plan' and _service <> 'laundry' then raise exception 'invalid_scope' using errcode = 'P0001'; end if;
  if _ends_at is not null and _ends_at <= coalesce(_starts_at, now()) then raise exception 'waiver_dates_invalid' using errcode = 'P0001'; end if;
  insert into public.transport_waivers (label, service, scope, zone_id, plan_id, customer_id, legs, starts_at, ends_at, public_message, created_by)
  values (trim(_label), coalesce(_service, 'laundry'), _scope,
    case when _scope = 'zone' then _target end, case when _scope = 'plan' then _target end, case when _scope = 'customer' then _target end,
    coalesce(_legs, 'both'), coalesce(_starts_at, now()), _ends_at, nullif(trim(coalesce(_message, '')), ''), auth.uid())
  returning id into _id;
  insert into public.audit_log (actor_id, action, table_name, row_id, new_data)
  select auth.uid(), 'transport_waiver_created', 'transport_waivers', _id::text, to_jsonb(w) from public.transport_waivers w where w.id = _id;
  return _id;
end $$;

create or replace function public.end_transport_waiver(_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update public.transport_waivers set active = false, ended_at = now(), ended_by = auth.uid() where id = _id and active;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.audit_log (actor_id, action, table_name, row_id) values (auth.uid(), 'transport_waiver_ended', 'transport_waivers', _id::text);
end $$;

-- Waive transport on one unpaid order (complaints, goodwill). Paid fares are refunded through the normal refund flow instead.
create or replace function public.waive_order_transport(_order uuid, _reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare _o public.orders; _r text := nullif(trim(coalesce(_reason, '')), '');
begin
  if not (private.is_admin() or private.has_role('cashier')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if _r is null or length(_r) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if _o.status = 'awaiting_fare_payment' then
    update public.payments set status = 'failed' where order_id = _order and purpose = 'pickup_fare' and kind = 'payment' and status = 'pending';
    update public.orders set pickup_fare_waived_kobo = pickup_fare_waived_kobo + coalesce(pickup_fare_kobo, 0),
           delivery_fare_waived_kobo = delivery_fare_waived_kobo + coalesce(delivery_fare_kobo, 0),
           pickup_fare_kobo = 0, delivery_fare_kobo = 0 where id = _order;
    perform private.release_free_transport_order(_order);
  elsif _o.status = 'awaiting_delivery_fare' then
    update public.payments set status = 'failed' where order_id = _order and purpose = 'delivery_fare' and kind = 'payment' and status = 'pending';
    update public.orders set delivery_fare_waived_kobo = delivery_fare_waived_kobo + coalesce(delivery_fare_kobo, 0), delivery_fare_kobo = 0,
           status = case when source = 'one_time' then 'ready'::public.order_status else 'out_for_delivery'::public.order_status end
     where id = _order;
  else
    raise exception 'nothing_to_pay' using errcode = 'P0001';
  end if;
  insert into public.order_events(order_id, actor_id, event, detail)
  values (_order, auth.uid(), 'transport_waived_by_staff', jsonb_build_object('reason', _r, 'from_status', _o.status,
    'pickup_kobo', _o.pickup_fare_kobo, 'delivery_kobo', _o.delivery_fare_kobo));
  return jsonb_build_object('ok', true);
end $$;

-- Live promo messages for the booking page and home page banner. Public, messages only.
create or replace function public.active_transport_promos()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('service', w.service, 'scope', w.scope, 'legs', w.legs, 'zone', z.name,
           'zone_id', w.zone_id, 'message', w.public_message, 'ends_at', w.ends_at) order by w.created_at desc), '[]'::jsonb)
    from public.transport_waivers w left join public.zones z on z.id = w.zone_id
   where w.active and w.scope in ('all', 'zone') and w.public_message is not null
     and w.starts_at <= now() and (w.ends_at is null or w.ends_at > now())
$$;

create or replace function public.transport_waived_report(_from date, _to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'waived_kobo', (select coalesce(sum(pickup_fare_waived_kobo + delivery_fare_waived_kobo), 0) from public.orders
                     where status <> 'cancelled' and (created_at at time zone 'Africa/Lagos')::date between _from and _to),
    'orders', (select count(*) from public.orders where status <> 'cancelled' and pickup_fare_waived_kobo + delivery_fare_waived_kobo > 0
                and (created_at at time zone 'Africa/Lagos')::date between _from and _to),
    'collected_kobo', (select coalesce(sum(case when kind = 'payment' then amount_kobo else -amount_kobo end), 0) from public.payments
                        where purpose in ('pickup_fare', 'delivery_fare') and status = 'success'
                          and (coalesce(paid_at, created_at) at time zone 'Africa/Lagos')::date between _from and _to));
end $$;

revoke all on function private.transport_waiver(text, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.release_free_transport_order(uuid) from public, anon, authenticated;
grant execute on function public.transport_waivers_list() to authenticated;
grant execute on function public.create_transport_waiver(text, text, text, uuid, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.end_transport_waiver(uuid) to authenticated;
grant execute on function public.waive_order_transport(uuid, text) to authenticated;
grant execute on function public.transport_waived_report(date, date) to authenticated;
grant execute on function public.active_transport_promos() to anon, authenticated;

-- WhatsApp booking: report when transport turned out free, so the bot confirms instead of starting checkout.
create or replace function public.whatsapp_create_pickup_for_customer(_customer uuid, _lat double precision, _lng double precision, _address text, _notes text, _slot timestamp with time zone, _force_one_time boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare _order uuid; _order_no bigint; _source text; _r jsonb; _has_sub boolean; _status public.order_status; _waived bigint;
begin
  if not exists (select 1 from public.whatsapp_account_verifications where customer_id = _customer and verified_until > now()) then
    raise exception 'whatsapp_identity_not_verified' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = _customer and p.status = 'active') then
    raise exception 'account_restricted' using errcode = 'P0001';
  end if;
  perform set_config('request.jwt.claim.sub', _customer::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform private.roll_customer_subscriptions(_customer);
  select exists (select 1 from public.subscriptions s where s.customer_id = _customer and s.status = 'active'
                   and s.current_period_start <= now() and s.current_period_end > now()) into _has_sub;
  if _has_sub and not coalesce(_force_one_time, false) then
    _r := private.book_subscription_pickup(_customer, _lat, _lng, _address, _notes, _slot, true);
    _order := (_r->>'order_id')::uuid;
    _source := case when (_r->>'transport_paid')::boolean then 'one_time_allowance_exhausted' else 'subscription' end;
  else
    _order := public.book_one_time_pickup(_lat, _lng, _address, _notes, _slot);
    _source := case when _has_sub then 'one_time_allowance_exhausted' else 'one_time' end;
  end if;
  select order_no, status, pickup_fare_waived_kobo + delivery_fare_waived_kobo into _order_no, _status, _waived
    from public.orders where id = _order and customer_id = _customer;
  if _order_no is null then raise exception 'booking_creation_failed' using errcode = 'P0001'; end if;
  return jsonb_build_object('order_id', _order, 'order_no', _order_no, 'source', _source,
    'subscription_pickups_used', coalesce((_r->>'included_pickups_used')::integer, 0),
    'transport_paid', coalesce((_r->>'transport_paid')::boolean, _source <> 'subscription'),
    'transport_free', _source <> 'subscription' and _status <> 'awaiting_fare_payment',
    'transport_waived_kobo', coalesce(_waived, 0));
end
$function$;
