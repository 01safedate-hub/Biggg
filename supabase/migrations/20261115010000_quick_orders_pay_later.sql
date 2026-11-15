-- Quick orders (agents take clothes in the field) and pay later (walk-in and quick orders).
-- Rules:
--   * Agents can never mark an order paid. "Customer has transferred" is only a claim; money staff confirm it.
--   * A pay-later order may be washed, but clothes are never handed over or sent out for delivery while money is owed.
--   * Limits: a customer may owe on 3 orders at once, an agent may have 5 open quick orders unpaid (settings 'pay_later').
--   * Quick orders are delivered back to the customer for the usual delivery fee, paid with the clothes.

-- ---------- columns ----------
alter table public.orders
  add column if not exists quick_order boolean not null default false,
  add column if not exists pay_later_at timestamptz,
  add column if not exists pay_later_by uuid references public.profiles(id),
  add column if not exists pay_later_reason text,
  add column if not exists payment_claim jsonb,
  add column if not exists paid_confirmed_at timestamptz,
  add column if not exists paid_confirmed_by uuid references public.profiles(id);
create index if not exists orders_pay_later_open_idx on public.orders (pay_later_at) where pay_later_at is not null and paid_confirmed_at is null;

insert into public.settings (key, value, description, is_public)
values ('pay_later', jsonb_build_object('customer_limit', 3, 'agent_limit', 5, 'bank_account_number', '4006372618', 'reminder_days', jsonb_build_array(1, 3)),
        'Pay later and quick orders: unpaid limits, the bank account customers transfer to (a money point), reminder days.', false)
on conflict (key) do nothing;

-- ---------- helpers ----------
-- Everything still owed on an order: unpaid items, plus the delivery fee of a quick order if not yet paid.
create or replace function private.order_amount_due(_o public.orders)
returns bigint language sql stable security definer set search_path = '' as $$
  select greatest(0, private.items_due(_o.id))
       + case when _o.quick_order and coalesce(_o.delivery_fare_kobo, 0) > 0
                   and not exists (select 1 from public.payments p where p.order_id = _o.id and p.purpose = 'delivery_fare' and p.kind = 'payment' and p.status = 'success')
              then _o.delivery_fare_kobo else 0 end
$$;

create or replace function private.pay_later_cfg()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.settings where key = 'pay_later'), '{}'::jsonb)
$$;

-- Open pay-later orders (owing money, not cancelled), optionally excluding one order.
create or replace function private.open_unpaid_for_customer(_customer uuid, _except uuid default null)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.orders o
   where o.customer_id = _customer and o.pay_later_at is not null and o.status <> 'cancelled'
     and o.id is distinct from _except and private.order_amount_due(o) > 0
$$;
create or replace function private.open_unpaid_for_agent(_agent uuid, _except uuid default null)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.orders o
   where o.pickup_agent_id = _agent and o.quick_order and o.pay_later_at is not null and o.status <> 'cancelled'
     and o.id is distinct from _except and private.order_amount_due(o) > 0
$$;

-- Delivery agents, and commission agents who passed hub verification, may take quick orders.
create or replace function public.quick_order_gate()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.is_active() and (
    private.has_role('delivery_agent'::public.staff_role)
    or (private.has_role('commission_agent'::public.staff_role) and public.agent_gate()))
$$;

-- Bank details customers transfer to, from the money point with the configured account number.
create or replace function public.pay_later_bank()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _cfg jsonb := private.pay_later_cfg(); _m public.money_points;
begin
  if not private.is_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into _m from public.money_points where account_number = _cfg->>'bank_account_number' and active limit 1;
  return jsonb_build_object('bank_name', _m.bank_name, 'account_number', _m.account_number, 'account_name', _m.account_name,
    'money_point_id', _m.id, 'customer_limit', coalesce((_cfg->>'customer_limit')::int, 3), 'agent_limit', coalesce((_cfg->>'agent_limit')::int, 5));
end $$;

-- ---------- quick orders ----------
create or replace function public.agent_quick_order_start(_customer uuid, _lat double precision, _lng double precision, _accuracy real, _address text, _notes text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare _uid uuid := auth.uid(); _cfg jsonb := private.pay_later_cfg(); _q jsonb; _fare bigint; _w public.transport_waivers; _id uuid; _no bigint;
        _a text := nullif(trim(coalesce(_address, '')), ''); _commission_only boolean;
begin
  if not public.quick_order_gate() then raise exception 'quick_order_not_allowed' using errcode = 'P0001'; end if;
  if _lat is null or _lng is null or _accuracy is null or _accuracy > 300 then raise exception 'location_required' using errcode = 'P0001'; end if;
  if _a is null or length(_a) < 5 or length(_a) > 300 then raise exception 'address_required' using errcode = 'P0001'; end if;
  if length(coalesce(_notes, '')) > 500 then raise exception 'notes_too_long' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles p where p.id = _customer and p.status = 'active'
                   and not exists (select 1 from public.user_roles r where r.user_id = p.id)) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  _commission_only := private.has_role('commission_agent'::public.staff_role) and not private.has_role('delivery_agent'::public.staff_role);
  if _commission_only and not exists (select 1 from public.profiles p where p.id = _customer and p.onboarded_by = _uid) then
    raise exception 'not_own_client' using errcode = 'P0001';
  end if;
  if private.open_unpaid_for_customer(_customer) >= coalesce((_cfg->>'customer_limit')::int, 3) then raise exception 'customer_unpaid_limit' using errcode = 'P0001'; end if;
  if private.open_unpaid_for_agent(_uid) >= coalesce((_cfg->>'agent_limit')::int, 5) then raise exception 'agent_unpaid_limit' using errcode = 'P0001'; end if;
  -- One unfinished quick order per agent at a time keeps counts honest.
  if exists (select 1 from public.orders where pickup_agent_id = _uid and quick_order and status in ('agent_arrived', 'counted')) then
    raise exception 'quick_order_unfinished' using errcode = 'P0001';
  end if;
  _q := public.quote_pickup(_lat, _lng);
  if not coalesce((_q->>'served')::boolean, false) then raise exception 'not_served' using errcode = 'P0001'; end if;
  if _q->>'delivery_fare_kobo' is null then raise exception 'hub_not_set' using errcode = 'P0001'; end if;
  _fare := greatest(0, coalesce((_q->>'delivery_fare_kobo')::bigint, 0));
  _w := private.transport_waiver('laundry', _customer, (_q->>'zone_id')::uuid);
  insert into public.orders (customer_id, source, status, zone_id, pickup_lat, pickup_lng, pickup_address, pickup_distance_km,
      pickup_fare_kobo, delivery_fare_kobo, delivery_fare_waived_kobo, transport_waiver_id, pickup_agent_id, created_by, notes, quick_order,
      fulfillment_choice, return_delivery_lat, return_delivery_lng, return_delivery_address, return_delivery_distance_km)
  values (_customer, 'one_time', 'agent_arrived', (_q->>'zone_id')::uuid, _lat, _lng, _a, (_q->>'distance_km')::numeric,
      0, case when _w.id is not null and _w.legs in ('delivery', 'both') then 0 else _fare end,
      case when _w.id is not null and _w.legs in ('delivery', 'both') then _fare else 0 end,
      case when _w.id is not null and _w.legs in ('delivery', 'both') then _w.id else null end,
      _uid, _uid, nullif(trim(coalesce(_notes, '')), ''), true,
      'deliver', _lat, _lng, _a, (_q->>'distance_km')::numeric)
  returning id, order_no into _id, _no;
  insert into public.order_events (order_id, actor_id, event, detail)
  values (_id, _uid, 'quick_order_started', jsonb_build_object('accuracy_m', _accuracy, 'delivery_fare_kobo', _fare, 'waived', _w.id is not null));
  return jsonb_build_object('order_id', _id, 'order_no', _no, 'delivery_fare_kobo', case when _w.id is not null and _w.legs in ('delivery', 'both') then 0 else _fare end,
                            'delivery_fare_waived_kobo', case when _w.id is not null and _w.legs in ('delivery', 'both') then _fare else 0 end);
end $$;

-- After counting: the customer transferred (a claim for the desk to confirm) or will pay later.
create or replace function public.agent_quick_order_finish(_order uuid, _choice text, _note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _cfg jsonb := private.pay_later_cfg(); _due bigint; _n text := nullif(trim(coalesce(_note, '')), '');
begin
  _o := private.agent_order(_order, array['counted']::public.order_status[]);
  if not _o.quick_order then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if _choice not in ('transferred', 'pay_later') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _choice = 'transferred' and (_n is null or length(_n) < 3) then raise exception 'note_required' using errcode = 'P0001'; end if;
  if _choice = 'pay_later' and (_n is null or length(_n) < 5) then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if length(coalesce(_n, '')) > 200 then raise exception 'notes_too_long' using errcode = 'P0001'; end if;
  _due := private.order_amount_due(_o);
  if _due > 0 then
    if private.open_unpaid_for_customer(_o.customer_id, _order) >= coalesce((_cfg->>'customer_limit')::int, 3) then raise exception 'customer_unpaid_limit' using errcode = 'P0001'; end if;
    if private.open_unpaid_for_agent(auth.uid(), _order) >= coalesce((_cfg->>'agent_limit')::int, 5) then raise exception 'agent_unpaid_limit' using errcode = 'P0001'; end if;
  end if;
  update public.orders set
      pay_later_at = now(), pay_later_by = auth.uid(),
      pay_later_reason = case when _choice = 'pay_later' then _n else 'Agent says the customer transferred' end,
      payment_claim = case when _choice = 'transferred' then jsonb_build_object('mode', 'transfer', 'sender', _n, 'amount_kobo', _due, 'at', now(), 'by', auth.uid()) else null end,
      status = 'count_confirmed'
   where id = _order;
  insert into public.order_events (order_id, actor_id, event, detail)
  values (_order, auth.uid(), case when _choice = 'transferred' then 'transfer_claimed' else 'pay_later' end, jsonb_build_object('amount_kobo', _due, 'note', _n));
  return jsonb_build_object('amount_kobo', _due, 'choice', _choice);
end $$;

-- An agent may drop an unfinished quick order (before the bag leaves the customer).
create or replace function public.agent_quick_order_cancel(_order uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare _o public.orders;
begin
  _o := private.agent_order(_order, array['agent_arrived', 'counted']::public.order_status[]);
  if not _o.quick_order then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_reason, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.orders set status = 'cancelled' where id = _order;
  insert into public.order_events (order_id, actor_id, event, detail) values (_order, auth.uid(), 'quick_order_cancelled', jsonb_build_object('reason', trim(_reason)));
end $$;

-- ---------- pay later at the desk ----------
create or replace function public.desk_pay_later(_order uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _cfg jsonb := private.pay_later_cfg(); _r text := nullif(trim(coalesce(_reason, '')), '');
begin
  _o := private.walkin_order(_order, array['counted']::public.order_status[]);
  if _o.source <> 'walk_in' then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if _r is null or length(_r) < 5 or length(_r) > 200 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if private.items_due(_order) <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;
  if private.open_unpaid_for_customer(_o.customer_id, _order) >= coalesce((_cfg->>'customer_limit')::int, 3) then raise exception 'customer_unpaid_limit' using errcode = 'P0001'; end if;
  update public.order_items set check_state = 'ok', check_note = 'Counted in front of the customer at the desk' where order_id = _order and removed_at is null;
  update public.orders set pay_later_at = now(), pay_later_by = auth.uid(), pay_later_reason = _r, status = 'count_confirmed' where id = _order;
  insert into public.order_events (order_id, actor_id, event, detail) values (_order, auth.uid(), 'pay_later', jsonb_build_object('amount_kobo', private.items_due(_order), 'note', _r));
end $$;

-- Money staff record or confirm payment for a pay-later order, at any step before it leaves.
create or replace function public.confirm_order_payment(_order uuid, _mode text, _money_point uuid, _note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _items bigint; _fare bigint := 0; _ref text; _n text := nullif(trim(coalesce(_note, '')), ''); _total bigint;
begin
  if not private.is_money_staff() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.pay_later_at is null then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if _o.status = 'cancelled' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if _mode not in ('cash', 'transfer', 'pos') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.money_points where id = _money_point and active and kind <> 'online') then raise exception 'money_point_required' using errcode = 'P0001'; end if;
  if _mode <> 'cash' and (_n is null or length(_n) < 3) then raise exception 'note_required' using errcode = 'P0001'; end if;
  _items := greatest(0, private.items_due(_order));
  if _o.quick_order and coalesce(_o.delivery_fare_kobo, 0) > 0
     and not exists (select 1 from public.payments p where p.order_id = _order and p.purpose = 'delivery_fare' and p.kind = 'payment' and p.status = 'success') then
    _fare := _o.delivery_fare_kobo;
  end if;
  _total := _items + _fare;
  if _total <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;
  _ref := 'PL-' || _o.order_no || '-' || encode(extensions.gen_random_bytes(4), 'hex');
  if _items > 0 then
    insert into public.payments (order_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id, note, recorded_by, paid_at)
    values (_order, _o.customer_id, 'items', 'payment', _mode, _items, _ref, 'success', _money_point, _n, auth.uid(), now());
  end if;
  if _fare > 0 then
    update public.payments set status = 'failed' where order_id = _order and purpose = 'delivery_fare' and kind = 'payment' and status = 'pending';
    insert into public.payments (order_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id, note, recorded_by, paid_at)
    values (_order, _o.customer_id, 'delivery_fare', 'payment', _mode, _fare, _ref || '-D', 'success', _money_point, _n, auth.uid(), now());
  end if;
  update public.orders set paid_confirmed_at = now(), paid_confirmed_by = auth.uid(),
         payment_claim = case when payment_claim is null then null else payment_claim || jsonb_build_object('confirmed_at', now(), 'confirmed_by', auth.uid()) end
   where id = _order;
  insert into public.order_events (order_id, actor_id, event, detail)
  values (_order, auth.uid(), 'pay_later_paid', jsonb_build_object('amount_kobo', _total, 'mode', _mode, 'reference', _ref));
  if _o.quick_order and _o.pickup_agent_id is not null then
    insert into public.user_notifications (user_id, title, body, kind, order_id)
    values (_o.pickup_agent_id, 'Quick order #' || _o.order_no || ' is paid', 'The office confirmed the customer''s payment.', 'job', _order);
  end if;
  -- A walk-in that was waiting at "count confirmed" can now move into the hub.
  if _o.status = 'count_confirmed' and _o.source = 'walk_in' then
    update public.orders set status = 'received' where id = _order and status = 'count_confirmed';
  end if;
  return jsonb_build_object('reference', _ref, 'amount_kobo', _total);
end $$;

-- Desk list of everything owed.
create or replace function public.unpaid_orders()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.is_money_staff() or private.is_shift_manager()) or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'since') from (
      select jsonb_build_object('id', o.id, 'order_no', o.order_no, 'status', o.status, 'quick', o.quick_order, 'source', o.source,
        'amount_kobo', private.order_amount_due(o), 'since', o.pay_later_at, 'reason', o.pay_later_reason, 'claim', o.payment_claim,
        'customer', c.full_name, 'phone', c.phone, 'no_email', coalesce(c.is_walk_in, false),
        'taken_by', (select full_name from public.profiles where id = o.pay_later_by)) x
      from public.orders o join public.profiles c on c.id = o.customer_id
      where o.pay_later_at is not null and o.status <> 'cancelled' and private.order_amount_due(o) > 0) t), '[]'::jsonb);
end $$;

-- ---------- existing rules taught about pay later ----------
-- Walk-ins: move straight into the hub after counting when paid OR marked pay later.
create or replace function private.desk_order_auto_receive()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'count_confirmed' or old.status = 'count_confirmed' then return null; end if;
  if not (new.source = 'walk_in'
          or (new.source = 'subscription' and new.pickup_lat is null and new.subscription_pickup_id is not null)) then
    return null;
  end if;
  -- Same money rule as mark_received: a walk-in with anything still owed waits for the desk, unless marked pay later.
  if new.source <> 'subscription' and new.pay_later_at is null and private.items_due(new.id) > 0 then return null; end if;
  update public.order_items
     set check_state = 'ok', check_note = coalesce(check_note, 'Counted in front of the customer at the desk')
   where order_id = new.id and removed_at is null and check_state <> 'ok';
  update public.orders set status = 'received' where id = new.id and status = 'count_confirmed';
  return null;
end $$;

create or replace function public.mark_received(_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare _o public.orders;
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.status <> 'count_confirmed' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if exists (select 1 from public.order_items where order_id = _order and removed_at is null and check_state <> 'ok') then raise exception 'items_not_checked' using errcode = 'P0001'; end if;
  if _o.source <> 'subscription' and _o.pay_later_at is null and private.items_due(_order) > 0 then raise exception 'balance_due' using errcode = 'P0001'; end if;
  update public.orders set status = 'received' where id = _order;
end $$;

create or replace function public.mark_ready(_order uuid, _shelves text[])
returns void language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _f jsonb; _round bigint; _min bigint; _fare bigint; _station uuid; _transport_paid boolean; _c public.customs;
begin
  if not private.is_active()
     or not (private.is_shift_manager() or private.has_role('washer'::public.staff_role)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.status <> 'in_house' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if private.has_role('washer'::public.staff_role) and not private.is_shift_manager() then
    select station_zone_id into _station from public.staff_profiles where user_id = auth.uid();
    if _station is null or _o.zone_id is distinct from _station then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  end if;
  -- Pay-later orders can be washed and shelved; they just cannot leave until paid.
  if _o.source <> 'subscription' and _o.pay_later_at is null and private.items_due(_order) > 0 then raise exception 'balance_due' using errcode = 'P0001'; end if;
  perform private.put_on_shelves(_order, _shelves);
  if _o.source = 'custom' then
    select * into _c from public.customs where id = _o.custom_id;
    if _c.delivery = 'deliver' then
      update public.orders set status = 'out_for_delivery', ready_at = now(), delivery_fare_kobo = 0, fulfillment_choice = 'deliver',
        return_delivery_address = _c.address, return_delivery_lat = _c.lat, return_delivery_lng = _c.lng where id = _order;
      perform private.custom_notify(_order, _c.name || ': batch #' || _o.order_no || ' is ready', 'It will be delivered to ' || coalesce(_c.address, 'your address') || '.');
    else
      update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = 0, fulfillment_choice = 'collect' where id = _order;
      perform private.custom_notify(_order, _c.name || ': batch #' || _o.order_no || ' is ready', 'Please collect it from the LaundryPoint hub.');
    end if;
    return;
  end if;
  if _o.source = 'walk_in' then
    update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = 0 where id = _order;
    return;
  end if;
  -- Quick orders keep the delivery fee set when the agent took the clothes.
  if _o.quick_order then
    update public.orders set status = 'ready', ready_at = now() where id = _order;
    return;
  end if;
  if _o.source = 'subscription' then
    select coalesce(sp.transport_paid, false) into _transport_paid from public.subscription_pickups sp where sp.id = _o.subscription_pickup_id;
    if _o.pickup_lat is null then
      update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = 0 where id = _order;
    else
      update public.orders set status = 'out_for_delivery', ready_at = now(),
        delivery_fare_kobo = case when coalesce(_transport_paid, false) then _o.delivery_fare_kobo else 0 end
      where id = _order;
    end if;
    return;
  end if;
  if _o.source = 'online' and coalesce(_o.delivery_fare_kobo, 0) > 0 then
    update public.orders set status = 'out_for_delivery', ready_at = now() where id = _order;
    return;
  end if;
  if _o.source = 'one_time' then
    if coalesce(_o.return_prepaid_kobo, 0) > 0 then
      update public.orders
         set status = 'ready', ready_at = now(), delivery_fare_kobo = 0,
             fulfillment_choice = coalesce(fulfillment_choice, 'deliver'),
             return_delivery_address = coalesce(return_delivery_address, pickup_address),
             return_delivery_lat = coalesce(return_delivery_lat, pickup_lat),
             return_delivery_lng = coalesce(return_delivery_lng, pickup_lng),
             return_delivery_distance_km = coalesce(return_delivery_distance_km, pickup_distance_km)
       where id = _order;
      insert into public.order_events (order_id, actor_id, event, detail)
      values (_order, auth.uid(), 'return_prepaid', jsonb_build_object('prepaid_kobo', _o.return_prepaid_kobo));
      return;
    end if;
    _fare := greatest(0, coalesce(_o.pickup_fare_kobo, 0));
    update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = _fare where id = _order;
    return;
  end if;
  select value into _f from public.settings where key = 'fare_delivery';
  _round := greatest(1, coalesce((_f->>'round_to_kobo')::bigint, 5000));
  _min := coalesce((_f->>'min_fare_kobo')::bigint, 0);
  _fare := greatest(_min, (round(coalesce(_o.pickup_distance_km, 0) * 2 * coalesce((_f->>'rate_per_km_kobo')::numeric, 0) / _round) * _round)::bigint);
  update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = _fare where id = _order;
end $$;

-- A one-time return can be dispatched only when the fare is covered, nothing is owed,
-- and the customer has an account (they confirm delivery with a code on their own phone).
create or replace function private.one_time_return_covered(_o public.orders)
returns boolean language sql stable security definer set search_path = '' as $$
  select _o.source = 'one_time' and _o.fulfillment_choice = 'deliver' and (
    (coalesce(_o.delivery_fare_kobo, 0) = 0 and (coalesce(_o.return_prepaid_kobo, 0) > 0 or coalesce(_o.delivery_fare_waived_kobo, 0) > 0))
    or exists (select 1 from public.payments p where p.order_id = _o.id and p.purpose = 'delivery_fare' and p.kind = 'payment' and p.status = 'success'))
  and (_o.pay_later_at is null or private.order_amount_due(_o) = 0)
  and not exists (select 1 from public.profiles c where c.id = _o.customer_id and coalesce(c.is_walk_in, false))
$$;

-- Hard stop: a pay-later order never goes out for delivery or is handed over while money is owed.
create or replace function private.orders_pay_later_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.pay_later_at is not null and new.status is distinct from old.status
     and new.status in ('out_for_delivery', 'delivered') and private.order_amount_due(new) > 0 then
    raise exception 'unpaid_balance' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists orders_pay_later_guard on public.orders;
create trigger orders_pay_later_guard before update of status on public.orders
  for each row execute function private.orders_pay_later_guard();

-- Agents start quick orders themselves: do not tell them "your customer booked a pickup".
create or replace function private.notify_commission_agent_pickup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.pickup_agent_id is not null and new.source <> 'walk_in' and new.pickup_lat is not null and not new.quick_order
     and new.pickup_agent_id = (select onboarded_by from public.profiles where id = new.customer_id)
     and private.is_verified_commission_agent(new.pickup_agent_id) then
    insert into public.user_notifications (user_id, title, body, kind, order_id)
    values (new.pickup_agent_id, 'New pickup for your customer',
            'A customer you onboarded has booked a pickup. Check the scheduled time and complete the pickup in your jobs.',
            'job', new.id);
  end if;
  return null;
end $$;

-- ---------- reminders ----------
-- Day 1 and day 3 emails to customers with a real email. Staff see every unpaid order on the Unpaid orders page.
create or replace function public.pay_later_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare _r record; _b jsonb; _n int := 0; _d int; _days jsonb := coalesce(private.pay_later_cfg()->'reminder_days', '[1,3]'::jsonb); _m public.money_points;
begin
  select * into _m from public.money_points where account_number = private.pay_later_cfg()->>'bank_account_number' and active limit 1;
  for _r in
    select o.id, o.order_no, o.customer_id, o.pay_later_at, private.order_amount_due(o) due, c.email, c.full_name
      from public.orders o join public.profiles c on c.id = o.customer_id
     where o.pay_later_at is not null and o.status <> 'cancelled' and o.payment_claim is null
       and c.email is not null and c.email not like '%.invalid' and not coalesce(c.is_walk_in, false)
  loop
    continue when _r.due <= 0;
    _d := floor(extract(epoch from (now() - _r.pay_later_at)) / 86400)::int;
    continue when not (_days @> to_jsonb(_d));
    perform private.custom_email(_r.customer_id, _r.email, 'Your LaundryPoint bill for order #' || _r.order_no,
      jsonb_build_array(
        'Hello ' || coalesce(split_part(_r.full_name, ' ', 1), 'there') || ', you have ₦' || to_char(_r.due / 100, 'FM999,999,990') || ' to pay for order #' || _r.order_no || '.',
        case when _m.id is not null then 'Please transfer to ' || coalesce(_m.bank_name, 'our bank') || ', account ' || _m.account_number || ' (' || coalesce(_m.account_name, 'LaundryPoint') || '), and send the receipt to us on WhatsApp.' else 'Please pay at our Ifite hub or call us.' end,
        'Your clothes are released or delivered once it is paid.'),
      null, null, 'pay-later-' || _r.id || '-d' || _d);
    _n := _n + 1;
  end loop;
  return _n;
end $$;
select cron.unschedule('pay-later-reminders') where exists (select 1 from cron.job where jobname = 'pay-later-reminders');
select cron.schedule('pay-later-reminders', '23 8 * * *', 'select public.pay_later_reminders()');

-- ---------- grants ----------
revoke all on function private.order_amount_due(public.orders) from public, anon, authenticated;
revoke all on function private.pay_later_cfg() from public, anon, authenticated;
revoke all on function private.open_unpaid_for_customer(uuid, uuid) from public, anon, authenticated;
revoke all on function private.open_unpaid_for_agent(uuid, uuid) from public, anon, authenticated;
revoke all on function private.orders_pay_later_guard() from public, anon, authenticated;
revoke all on function public.pay_later_reminders() from public, anon, authenticated;
revoke all on function public.quick_order_gate() from public, anon;
revoke all on function public.pay_later_bank() from public, anon;
revoke all on function public.agent_quick_order_start(uuid, double precision, double precision, real, text, text) from public, anon;
revoke all on function public.agent_quick_order_finish(uuid, text, text) from public, anon;
revoke all on function public.agent_quick_order_cancel(uuid, text) from public, anon;
revoke all on function public.desk_pay_later(uuid, text) from public, anon;
revoke all on function public.confirm_order_payment(uuid, text, uuid, text) from public, anon;
revoke all on function public.unpaid_orders() from public, anon;
grant execute on function public.quick_order_gate() to authenticated;
grant execute on function public.pay_later_bank() to authenticated;
grant execute on function public.agent_quick_order_start(uuid, double precision, double precision, real, text, text) to authenticated;
grant execute on function public.agent_quick_order_finish(uuid, text, text) to authenticated;
grant execute on function public.agent_quick_order_cancel(uuid, text) to authenticated;
grant execute on function public.desk_pay_later(uuid, text) to authenticated;
grant execute on function public.confirm_order_payment(uuid, text, uuid, text) to authenticated;
grant execute on function public.unpaid_orders() to authenticated;
