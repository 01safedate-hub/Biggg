-- Online (one-time) orders: pickup and return are paid once, at booking.
--
-- Booking already charges pickup_fare_kobo + delivery_fare_kobo as one "transport prepaid" payment,
-- but everything after "Ready" treated the return as unpaid and asked for a second delivery fee.
-- From here on:
--   * orders.return_prepaid_kobo records the return leg paid at booking (kept in sync from payments).
--   * mark_ready sends prepaid online orders straight to "ready for delivery" to the booked address.
--   * A different address costs only the extra over what was prepaid; collecting refunds nothing.
--   * Dispatch, rider assignment and agent self-claim accept a return covered by the booking payment.
--   * A paid extra delivery fee on an online order now moves it to Ready (previously went to review).
-- Walk-in delivery fees are unchanged.

alter table public.orders add column if not exists return_prepaid_kobo bigint not null default 0;
comment on column public.orders.return_prepaid_kobo is
  'One-time online orders: return-delivery amount paid at booking (net pickup_fare payments minus pickup_fare_kobo).';

create or replace function private.one_time_return_prepaid(_order uuid)
returns bigint language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select greatest(0,
             coalesce(sum(case when p.kind = 'payment' then p.amount_kobo else -p.amount_kobo end), 0)
             - coalesce(o.pickup_fare_kobo, 0))::bigint
      from public.orders o
      left join public.payments p
        on p.order_id = o.id and p.purpose = 'pickup_fare' and p.status = 'success'
     where o.id = _order and o.source = 'one_time'
     group by o.pickup_fare_kobo), 0)
$$;

create or replace function private.one_time_return_covered(_o public.orders)
returns boolean language sql stable security definer set search_path = ''
as $$
  select _o.source = 'one_time' and _o.fulfillment_choice = 'deliver' and (
    (coalesce(_o.delivery_fare_kobo, 0) = 0 and coalesce(_o.return_prepaid_kobo, 0) > 0)
    or exists (select 1 from public.payments p
                where p.order_id = _o.id and p.purpose = 'delivery_fare'
                  and p.kind = 'payment' and p.status = 'success'))
$$;

create or replace function private.sync_return_prepaid()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.purpose = 'pickup_fare' and new.order_id is not null then
    update public.orders
       set return_prepaid_kobo = private.one_time_return_prepaid(new.order_id)
     where id = new.order_id and source = 'one_time'
       and return_prepaid_kobo is distinct from private.one_time_return_prepaid(new.order_id);
  end if;
  return new;
end
$$;

drop trigger if exists payments_sync_return_prepaid on public.payments;
create trigger payments_sync_return_prepaid
  after insert or update of status, amount_kobo on public.payments
  for each row execute function private.sync_return_prepaid();

update public.orders o
   set return_prepaid_kobo = private.one_time_return_prepaid(o.id)
 where o.source = 'one_time'
   and o.return_prepaid_kobo is distinct from private.one_time_return_prepaid(o.id);

-- mark_ready: identical to the live version except the one_time branch.
create or replace function public.mark_ready(_order uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare _o public.orders; _f jsonb; _round bigint; _min bigint; _fare bigint; _station uuid; _transport_paid boolean;
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
  if _o.source <> 'subscription' and private.items_due(_order) > 0 then raise exception 'balance_due' using errcode = 'P0001'; end if;
  if _o.source = 'walk_in' then
    update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = 0 where id = _order;
    return;
  end if;
  if _o.source = 'subscription' then
    select coalesce(sp.transport_paid, false) into _transport_paid from public.subscription_pickups sp where sp.id = _o.subscription_pickup_id;
    -- Hub drop-offs (no pickup address) are collected from the hub.
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
      -- Return was paid at booking: deliver to the booked address unless the customer changes it.
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
end
$$;

-- Shared: set a one-time order's return destination, charging only what the booking payment does not cover.
create or replace function private.set_one_time_return(_o public.orders, _actor uuid, _lat double precision, _lng double precision,
                                                        _address text, _channel text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare _q jsonb; _fare bigint; _prepaid bigint := coalesce(_o.return_prepaid_kobo, 0); _due bigint;
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
      'zone', _q->>'zone_name', 'customer_choice', true, 'journey', 'hub_to_customer', 'channel', _channel));

  return jsonb_build_object('choice', 'deliver', 'fare_kobo', _due, 'full_fare_kobo', _fare, 'prepaid_kobo', _prepaid,
    'covered', _due = 0, 'address', _address, 'zone', _q->>'zone_name', 'distance_km', _q->>'distance_km',
    'included_one_way_km', _q->>'included_one_way_km', 'extra_distance_km', _q->>'extra_distance_km',
    'base_delivery_fare_kobo', _q->>'base_delivery_fare_kobo', 'extra_distance_fare_kobo', _q->>'extra_distance_fare_kobo');
end
$$;

create or replace function public.choose_order_fulfillment(_order uuid, _choice text, _lat double precision default null, _lng double precision default null, _address text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare _o public.orders; _a text;
begin
  if auth.uid() is null then raise exception 'auth_required' using errcode = 'P0001'; end if;
  if _choice not in ('collect', 'deliver') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order and customer_id = auth.uid() for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if _o.status not in ('ready', 'awaiting_delivery_fare') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _o.source = 'subscription' then raise exception 'subscription_delivery_included' using errcode = 'P0001'; end if;
  -- Once a return-delivery payment succeeds, the destination and fulfillment choice are locked.
  if exists (select 1 from public.payments p where p.order_id = _order and p.purpose = 'delivery_fare'
              and p.kind = 'payment' and p.status = 'success') then
    raise exception 'delivery_already_paid' using errcode = 'P0001';
  end if;

  if _choice = 'collect' then
    update public.payments set status = 'failed'
     where order_id = _order and purpose = 'delivery_fare' and kind = 'payment' and status = 'pending';
    update public.orders
       set fulfillment_choice = 'collect', status = 'ready', delivery_fare_kobo = 0,
           return_delivery_lat = null, return_delivery_lng = null,
           return_delivery_address = null, return_delivery_distance_km = null
     where id = _order;
    insert into public.order_events(order_id, actor_id, event, detail)
    values (_order, auth.uid(), 'fulfillment_chosen', jsonb_build_object('choice', 'collect', 'prepaid_kobo', _o.return_prepaid_kobo));
    return jsonb_build_object('choice', 'collect', 'fare_kobo', 0, 'prepaid_kobo', _o.return_prepaid_kobo);
  end if;

  if _lat is null or _lng is null or _lat < -90 or _lat > 90 or _lng < -180 or _lng > 180 then
    raise exception 'location_required' using errcode = 'P0001';
  end if;
  _a := nullif(trim(coalesce(_address, '')), '');
  if _a is null or length(_a) < 5 or length(_a) > 300 then raise exception 'address_required' using errcode = 'P0001'; end if;
  return private.set_one_time_return(_o, auth.uid(), _lat, _lng, _a, 'web');
end
$$;

create or replace function public.whatsapp_set_return_delivery_for_customer(_customer uuid, _order uuid, _lat double precision, _lng double precision, _address text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare _v public.whatsapp_account_verifications; _o public.orders; _r jsonb;
begin
  select * into _v from public.whatsapp_account_verifications
  where customer_id=_customer and verified_until>now()
  order by verified_until desc limit 1 for update;
  if not found then raise exception 'whatsapp_identity_not_verified' using errcode='P0001'; end if;
  if not exists(select 1 from public.profiles where id=_customer and status='active') then
    raise exception 'account_restricted' using errcode='P0001';
  end if;
  select * into _o from public.orders where id=_order and customer_id=_customer for update;
  if not found then raise exception 'order_not_found' using errcode='P0001'; end if;
  if _o.source not in ('one_time','online') or _o.status not in ('ready','awaiting_delivery_fare') then
    raise exception 'order_not_ready_for_fulfillment' using errcode='P0001';
  end if;
  if _address is null or length(trim(_address))<5 or length(trim(_address))>300 then
    raise exception 'address_required' using errcode='P0001';
  end if;
  if exists (select 1 from public.payments p where p.order_id=_order and p.purpose='delivery_fare'
              and p.kind='payment' and p.status='success') then
    raise exception 'delivery_already_paid' using errcode='P0001';
  end if;
  begin
    _r := private.set_one_time_return(_o, _customer, _lat, _lng, trim(_address), 'whatsapp');
  exception when sqlstate 'P0001' then
    if sqlerrm in ('not_served', 'hub_not_set') then raise exception 'delivery_location_not_served' using errcode='P0001'; end if;
    if sqlerrm = 'nothing_to_pay' then raise exception 'delivery_fare_unavailable' using errcode='P0001'; end if;
    raise;
  end;
  return _r || jsonb_build_object('order_no', _o.order_no);
end;
$$;

-- A paid extra/legacy delivery fee on an online order makes it ready for dispatch (it used to fall to manual review).
do $patch$
declare
  _src text;
  _anchor text := '  elsif _pay.purpose=''delivery_fare'' and _o.status in (''ready'',''awaiting_delivery_fare'') and _o.source<>''one_time'' then';
  _branch text := '  elsif _pay.purpose=''delivery_fare'' and _o.status=''awaiting_delivery_fare'' and _o.source=''one_time'' and _o.fulfillment_choice=''deliver'' then' || chr(10) ||
                  '    update public.orders set status=''ready'' where id=_o.id;' || chr(10) ||
                  '    insert into public.order_events(order_id,event,detail) values(_o.id,''delivery_fare_paid'',jsonb_build_object(''reference'',_reference,''amount_kobo'',_amount_kobo));' || chr(10);
begin
  select prosrc into _src from pg_proc where oid = 'public.settle_online_payment(text,text,bigint)'::regprocedure;
  if position('''delivery_fare_paid''' in _src) > 0 then return; end if;
  if (length(_src) - length(replace(_src, _anchor, ''))) / length(_anchor) <> 1 then
    raise exception 'patch_failed_settle_online_payment';
  end if;
  execute format('create or replace function public.settle_online_payment(_reference text, _provider text, _amount_kobo bigint) returns jsonb language plpgsql security definer set search_path = '''' as %L',
                 replace(_src, _anchor, _branch || _anchor));
end
$patch$;

create or replace function public.assign_delivery_agent(_order uuid, _agent uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare _cust uuid;
begin
  if not private.is_shift_manager() or not private.is_active() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.user_roles where user_id = _agent and role = 'commission_agent') then
    raise exception 'commission_agents_are_not_dispatchable' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.user_roles r join public.profiles p on p.id = r.user_id
     where r.user_id = _agent and r.role = 'delivery_agent' and p.status = 'active'
  ) then
    raise exception 'agent_invalid' using errcode = 'P0001';
  end if;
  if private.has_open_dispute(_order) then
    raise exception 'dispute_open' using errcode = 'P0001';
  end if;

  update public.orders o
     set delivery_agent_id = _agent,
         status = case when o.status = 'ready' then 'out_for_delivery'::public.order_status else o.status end
   where o.id = _order
     and (o.status = 'out_for_delivery'
          or (o.status = 'ready' and private.one_time_return_covered(o)))
  returning o.customer_id into _cust;

  if not found then
    raise exception 'wrong_state' using errcode = 'P0001';
  end if;

  insert into public.user_notifications(user_id, title, kind, order_id)
  values (_agent, 'New delivery assigned to you', 'job', _order);
  insert into public.user_notifications(user_id, title, kind, order_id)
  values (_cust, 'Your delivery agent is on the way', 'order_status', _order);
end
$$;

create or replace function public.claim_own_client_return(_order uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare _o public.orders;
begin
  if auth.uid() is null or not public.agent_gate() then
    raise exception 'agent_verification_required' using errcode='42501';
  end if;
  select * into _o from public.orders where id=_order for update;
  if not found or _o.pickup_agent_id is distinct from auth.uid()
     or _o.delivery_agent_id is not null
     or _o.status not in ('ready','out_for_delivery') then
    raise exception 'return_job_not_available' using errcode='P0001';
  end if;
  if not exists(select 1 from public.profiles p where p.id=_o.customer_id and p.onboarded_by=auth.uid()) then
    raise exception 'not_own_client' using errcode='42501';
  end if;
  if _o.source <> 'subscription' and _o.fulfillment_choice is distinct from 'deliver' then
    raise exception 'customer_collects_order' using errcode='P0001';
  end if;
  if _o.source <> 'subscription'
     and not private.one_time_return_covered(_o)
     and not exists(select 1 from public.payments p where p.order_id=_order
                     and p.purpose='delivery_fare' and p.kind='payment' and p.status='success') then
    raise exception 'delivery_payment_required' using errcode='P0001';
  end if;
  if private.has_open_dispute(_order) then raise exception 'dispute_open' using errcode='P0001'; end if;

  update public.orders set delivery_agent_id=auth.uid(),
    status=case when status='ready' then 'out_for_delivery'::public.order_status else status end
    where id=_order and delivery_agent_id is null;
  if not found then raise exception 'return_job_not_available' using errcode='P0001'; end if;

  insert into public.user_notifications(user_id,title,body,kind,order_id)
    values(_o.customer_id,'Your agent is bringing your clean clothes',
      'Your LaundryPoint agent has taken responsibility for the return delivery. Do not pay cash.',
      'order_status',_order);
  insert into public.order_events(order_id,actor_id,event,detail)
    values(_order,auth.uid(),'agent_claimed_return_delivery',jsonb_build_object('agent_id',auth.uid()));
end;
$$;

-- Online orders already waiting for a second delivery fee: charge only what the booking did not cover.
with stuck as (
  select o.id, greatest(0, coalesce(o.delivery_fare_kobo, 0) - o.return_prepaid_kobo) as due, o.return_prepaid_kobo
    from public.orders o
   where o.source = 'one_time' and o.status = 'awaiting_delivery_fare' and o.fulfillment_choice = 'deliver'
     and o.return_prepaid_kobo > 0
     and not exists (select 1 from public.payments p where p.order_id = o.id and p.purpose = 'delivery_fare'
                      and p.kind = 'payment' and p.status = 'success')
), failed as (
  update public.payments p set status = 'failed'
    from stuck s where p.order_id = s.id and p.purpose = 'delivery_fare' and p.kind = 'payment' and p.status = 'pending'
  returning p.id
), moved as (
  update public.orders o
     set delivery_fare_kobo = s.due,
         status = case when s.due = 0 then 'ready'::public.order_status else o.status end
    from stuck s where o.id = s.id
  returning o.id, s.due, s.return_prepaid_kobo
)
insert into public.order_events(order_id, event, detail)
select id, 'return_prepaid_applied', jsonb_build_object('prepaid_kobo', return_prepaid_kobo, 'due_kobo', due) from moved;

-- "Partner with us": customers register interest in becoming a commission agent.
create table if not exists public.partner_interest (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.profiles(id) on delete cascade,
  message text check (message is null or length(message) <= 500),
  status text not null default 'new' check (status in ('new', 'contacted', 'invited', 'declined')),
  handled_by uuid references public.profiles(id),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.partner_interest enable row level security;
drop policy if exists partner_interest_read on public.partner_interest;
create policy partner_interest_read on public.partner_interest for select to authenticated
  using (customer_id = auth.uid() or private.is_admin());
revoke insert, update, delete on public.partner_interest from anon, authenticated;
grant select on public.partner_interest to authenticated;

create or replace function public.register_partner_interest(_message text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare _uid uuid := auth.uid(); _row public.partner_interest; _name text; _msg text := nullif(left(trim(coalesce(_message, '')), 500), '');
begin
  if _uid is null then raise exception 'auth_required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = _uid and status = 'active') then
    raise exception 'account_restricted' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.user_roles where user_id = _uid and role = 'commission_agent') then
    raise exception 'already_partner' using errcode = 'P0001';
  end if;
  select * into _row from public.partner_interest where customer_id = _uid;
  if found and _row.status in ('new', 'contacted', 'invited') then
    return jsonb_build_object('status', _row.status, 'created_at', _row.created_at, 'already', true);
  end if;
  insert into public.partner_interest (customer_id, message)
  values (_uid, _msg)
  on conflict (customer_id) do update
     set status = 'new', message = excluded.message, handled_by = null, handled_at = null,
         created_at = now(), updated_at = now()
  returning * into _row;
  select coalesce(full_name, email, 'A customer') into _name from public.profiles where id = _uid;
  insert into public.user_notifications (user_id, title, body, kind)
  select distinct r.user_id, 'New partner request', _name || ' wants to become a commission agent.', 'partner_interest'
    from public.user_roles r join public.profiles p on p.id = r.user_id
   where r.role in ('admin', 'super_admin') and p.status = 'active';
  return jsonb_build_object('status', _row.status, 'created_at', _row.created_at, 'already', false);
end
$$;
revoke all on function public.register_partner_interest(text) from public, anon;
grant execute on function public.register_partner_interest(text) to authenticated;

create or replace function public.set_partner_interest_status(_id uuid, _status text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if _status not in ('new', 'contacted', 'invited', 'declined') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  update public.partner_interest
     set status = _status, handled_by = auth.uid(), handled_at = now(), updated_at = now()
   where id = _id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
end
$$;
revoke all on function public.set_partner_interest_status(uuid, text) from public, anon;
grant execute on function public.set_partner_interest_status(uuid, text) to authenticated;

-- The public parts of the commission policy, for the customer "Partner with us" page (settings are staff-only).
create or replace function public.partner_programme_terms()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'commission_pct', coalesce((s.value->>'commission_pct')::numeric, 10),
    'months', coalesce((s.value->>'months')::int, 12),
    'hold_hours', coalesce((s.value->>'hold_hours')::int, 48),
    'min_payout_kobo', coalesce((s.value->>'min_payout_kobo')::bigint, 100000),
    'min_first_order_kobo', coalesce((s.value->>'min_first_order_kobo')::bigint, 200000))
  from public.settings s where s.key = 'commission'
$$;
revoke all on function public.partner_programme_terms() from public, anon;
grant execute on function public.partner_programme_terms() to authenticated;

revoke all on function private.one_time_return_prepaid(uuid) from public, anon, authenticated;
revoke all on function private.one_time_return_covered(public.orders) from public, anon, authenticated;
revoke all on function private.set_one_time_return(public.orders, uuid, double precision, double precision, text, text) from public, anon, authenticated;
