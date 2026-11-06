-- Subscription fixes, part 1.
-- 1. Included pickups are counted per monthly cycle (not per paid term) and the
--    number comes from plans.pickups_per_month. The 14-day gap is removed.
--    After the included pickups are used, a subscriber can still book a pickup
--    that is covered by the plan's piece allowance but pays pickup and delivery
--    transport up front (subscription_pickups.transport_paid).
-- 2. Pieces above a category cap are billed at that category's own prices.
-- 3. Paying for the next term (renewal, upgrade or downgrade) never changes the
--    current term. The new term, plan and price start when the current term
--    ends (private.roll_subscription). One live subscription per customer.
-- 4. Customers can schedule or undo a cancellation through an RPC (the website
--    previously tried a direct table update that RLS always rejected).

create table if not exists public.subscription_events (
  id bigint generated always as identity primary key,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  subscription_id uuid generated always as ((detail->>'subscription_id')::uuid) stored,
  customer_id uuid generated always as ((detail->>'customer_id')::uuid) stored,
  created_at timestamptz not null default now()
);
create index if not exists subscription_events_sub_idx on public.subscription_events (subscription_id, event);
alter table public.subscription_events enable row level security;
drop policy if exists subscription_events_read on public.subscription_events;
create policy subscription_events_read on public.subscription_events for select to authenticated
  using (customer_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete on public.subscription_events from anon, authenticated;

alter table public.plans
  add column if not exists pickups_per_month integer not null default 2;
alter table public.plans drop constraint if exists plans_pickups_per_month_check;
alter table public.plans add constraint plans_pickups_per_month_check check (pickups_per_month between 0 and 31);

alter table public.subscription_pickups
  add column if not exists transport_paid boolean not null default false;

alter table public.subscription_invoices
  add column if not exists plan_id uuid references public.plans(id),
  add column if not exists billing_period text,
  add column if not exists monthly_price_kobo bigint;
alter table public.subscription_invoices drop constraint if exists subscription_invoices_billing_period_check;
alter table public.subscription_invoices add constraint subscription_invoices_billing_period_check
  check (billing_period is null or billing_period in ('monthly','three_month','six_month','yearly'));

-- The old spacing trigger was never applied live; make sure it can't come back.
drop trigger if exists subscription_pickups_enforce_spacing on public.subscription_pickups;
drop function if exists private.enforce_subscription_pickup_spacing();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.subscription_cycle(_period_start timestamptz, _at timestamptz,
  out cycle_start timestamptz, out cycle_end timestamptz)
language sql stable set search_path = ''
as $$
  select _period_start + make_interval(months => m), _period_start + make_interval(months => m + 1)
  from (select greatest(0, extract(year from age(_at, _period_start))::integer * 12
                         + extract(month from age(_at, _period_start))::integer) as m) x
$$;

create or replace function private.subscription_included_pickups_used(_sub uuid, _from timestamptz, _to timestamptz)
returns integer language sql stable set search_path = ''
as $$
  select count(*)::integer from public.subscription_pickups sp
   where sp.subscription_id = _sub and sp.scheduled_for >= _from and sp.scheduled_for < _to
     and sp.status not in ('missed','skipped') and not sp.transport_paid
$$;

create or replace function private.plan_term_amount(_plan public.plans, _billing_period text,
  out months integer, out discount_pct numeric, out total_kobo bigint)
language plpgsql stable set search_path = ''
as $$
begin
  if _billing_period not in ('monthly','three_month','six_month','yearly') then
    raise exception 'invalid_billing_period' using errcode = 'P0001';
  end if;
  months := case _billing_period when 'three_month' then 3 when 'six_month' then 6 when 'yearly' then 12 else 1 end;
  discount_pct := case _billing_period
    when 'three_month' then coalesce(_plan.three_month_discount_pct, 2)
    when 'six_month' then coalesce(_plan.six_month_discount_pct, 5)
    when 'yearly' then coalesce(_plan.yearly_discount_pct, 10)
    else coalesce(_plan.monthly_discount_pct, 0) end;
  if discount_pct < 0 or discount_pct >= 100 then
    raise exception 'invalid_subscription_discount' using errcode = 'P0001';
  end if;
  total_kobo := round(_plan.monthly_price_kobo * months * (1 - discount_pct / 100));
end
$$;

-- Moves an active subscription into its next paid term once the current term
-- has ended, applying any plan change bought for that term. With no paid next
-- term it expires (or cancels, if the customer asked to cancel).
create or replace function private.roll_subscription(_sub uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  s public.subscriptions; inv public.subscription_invoices; _result text := 'unchanged'; _guard integer := 0;
begin
  loop
    _guard := _guard + 1;
    exit when _guard > 36;
    select * into s from public.subscriptions where id = _sub for update;
    exit when not found or s.status <> 'active' or s.current_period_end is null or s.current_period_end > now();
    select * into inv from public.subscription_invoices i
     where i.subscription_id = s.id and i.status = 'paid' and i.subscription_pickup_id is null
       and i.period_start = (s.current_period_end at time zone 'Africa/Lagos')::date
     order by i.created_at desc limit 1;
    if not found then
      update public.subscription_invoices set status = 'void'
       where subscription_id = s.id and status = 'due' and subscription_pickup_id is null;
      update public.payments set status = 'failed'
       where status = 'pending' and purpose = 'subscription'
         and invoice_id in (select id from public.subscription_invoices where subscription_id = s.id);
      update public.subscriptions
         set status = case when s.cancel_at_period_end then 'cancelled' else 'expired' end, updated_at = now()
       where id = s.id;
      _result := case when s.cancel_at_period_end then 'cancelled' else 'expired' end;
      insert into public.subscription_events(event, detail)
      values ('subscription_' || _result, jsonb_build_object('subscription_id', s.id, 'customer_id', s.customer_id, 'plan_id', s.plan_id));
      exit;
    end if;
    update public.subscriptions
       set current_period_start = (inv.period_start::timestamp at time zone 'Africa/Lagos'),
           current_period_end = ((inv.period_end + 1)::timestamp at time zone 'Africa/Lagos'),
           plan_id = coalesce(inv.plan_id, s.plan_id),
           billing_period = coalesce(inv.billing_period, s.billing_period),
           price_kobo = coalesce(inv.monthly_price_kobo, s.price_kobo),
           term_amount_kobo = inv.amount_kobo,
           cancel_at_period_end = false,
           updated_at = now()
     where id = s.id;
    _result := case when inv.plan_id is not null and inv.plan_id <> s.plan_id then 'plan_changed' else 'renewed' end;
    insert into public.subscription_events(event, detail)
    values ('subscription_' || _result, jsonb_build_object('subscription_id', s.id, 'customer_id', s.customer_id,
      'from_plan_id', s.plan_id, 'to_plan_id', coalesce(inv.plan_id, s.plan_id), 'invoice_id', inv.id));
  end loop;
  return _result;
end
$$;

create or replace function private.roll_customer_subscriptions(_customer uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  for r in select id from public.subscriptions
            where customer_id = _customer and status = 'active' and current_period_end <= now()
  loop
    perform private.roll_subscription(r.id);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Booking
-- ---------------------------------------------------------------------------
create or replace function private.book_subscription_pickup(
  _customer uuid, _lat double precision, _lng double precision, _address text, _notes text,
  _slot timestamptz, _allow_paid boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  _a text := nullif(trim(_address), '');
  _sub public.subscriptions; _plan public.plans; _q jsonb; _f jsonb;
  _scheduled timestamptz; _cycle record; _used integer; _paid boolean := false;
  _order uuid; _pickup uuid; _tz text := 'Africa/Lagos';
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
    _f := public.quote_one_time_pickup(_lat, _lng);
    if not coalesce((_f->>'served')::boolean, false) or _f->>'total_fare_kobo' is null then
      raise exception 'service_area_unavailable' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(value->>'timezone', 'Africa/Lagos') into _tz from public.settings where key = 'business';
  _tz := coalesce(_tz, 'Africa/Lagos');

  insert into public.orders (
    customer_id, source, status, zone_id, pickup_lat, pickup_lng, pickup_address, pickup_distance_km,
    after_hours, scheduled_for, pickup_fare_kobo, delivery_fare_kobo, notes, created_by
  ) values (
    _customer, 'subscription', (case when _paid then 'awaiting_fare_payment' else 'awaiting_dispatch' end)::public.order_status,
    (_q->>'zone_id')::uuid, _lat, _lng, _a, nullif(_q->>'distance_km','')::numeric,
    case when _slot is not null then false else coalesce((_q->>'after_hours')::boolean, false) end, _scheduled,
    case when _paid then (_f->>'pickup_fare_kobo')::bigint + coalesce((_f->>'extra_distance_fare_kobo')::bigint, 0) else 0 end,
    case when _paid then (_f->>'delivery_fare_kobo')::bigint else 0 end,
    nullif(trim(_notes), ''), _customer
  ) returning id into _order;

  insert into public.subscription_pickups (subscription_id, week_start, scheduled_for, status, order_id,
    pieces_counted, overage_pieces, overage_kobo, transport_paid)
  values (_sub.id, date_trunc('week', _scheduled at time zone _tz)::date, _scheduled, 'scheduled', _order, 0, 0, 0, _paid)
  returning id into _pickup;
  update public.orders set subscription_pickup_id = _pickup where id = _order;

  return jsonb_build_object('order_id', _order, 'transport_paid', _paid,
    'fare_kobo', case when _paid then (_f->>'total_fare_kobo')::bigint else 0 end,
    'included_pickups_used', _used + case when _paid then 0 else 1 end,
    'included_pickups', coalesce(_plan.pickups_per_month, 2));
end
$$;
revoke all on function private.book_subscription_pickup(uuid, double precision, double precision, text, text, timestamptz, boolean) from public, anon, authenticated;

create or replace function public.book_pickup(_lat double precision, _lng double precision, _address text, _notes text)
returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  return (private.book_subscription_pickup(auth.uid(), _lat, _lng, _address, _notes, null, false)->>'order_id')::uuid;
end
$$;

create or replace function public.book_pickup_scheduled(_lat double precision, _lng double precision, _address text, _notes text, _slot timestamptz)
returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  return (private.book_subscription_pickup(auth.uid(), _lat, _lng, _address, _notes, _slot, false)->>'order_id')::uuid;
end
$$;

-- Subscriber pickup after the plan's included pickups are used: pieces still
-- count against the plan, transport is prepaid (pickup_fare payment).
create or replace function public.book_subscription_paid_pickup(_lat double precision, _lng double precision, _address text, _notes text, _slot timestamptz default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  return (private.book_subscription_pickup(auth.uid(), _lat, _lng, _address, _notes, _slot, true)->>'order_id')::uuid;
end
$$;
revoke all on function public.book_subscription_paid_pickup(double precision, double precision, text, text, timestamptz) from public, anon;
grant execute on function public.book_subscription_paid_pickup(double precision, double precision, text, text, timestamptz) to authenticated;

-- What the customer screens show: this cycle's usage, using the same rules as billing.
create or replace function public.subscription_usage()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare _sub public.subscriptions; _plan public.plans; _cycle record; _used_pieces integer; _next public.subscription_invoices; _next_plan text;
begin
  if auth.uid() is null then return null; end if;
  perform private.roll_customer_subscriptions(auth.uid());
  select * into _sub from public.subscriptions s
   where s.customer_id = auth.uid() and s.status = 'active' and s.current_period_start <= now() and s.current_period_end > now()
   order by s.current_period_end desc limit 1;
  if not found then return null; end if;
  select * into _plan from public.plans where id = _sub.plan_id;
  select * into _cycle from private.subscription_cycle(_sub.current_period_start, now());
  select coalesce(sum(greatest(coalesce(sp.pieces_counted,0) - coalesce(sp.overage_pieces,0) - coalesce(sp.excluded_pieces,0), 0)), 0)::integer
    into _used_pieces from public.subscription_pickups sp
   where sp.subscription_id = _sub.id and sp.scheduled_for >= _cycle.cycle_start and sp.scheduled_for < _cycle.cycle_end
     and sp.status not in ('missed','skipped');
  select * into _next from public.subscription_invoices i
   where i.subscription_id = _sub.id and i.subscription_pickup_id is null and i.status in ('due','paid')
     and i.period_start = (_sub.current_period_end at time zone 'Africa/Lagos')::date
   order by (i.status = 'paid') desc, i.created_at desc limit 1;
  if found then select name into _next_plan from public.plans where id = coalesce(_next.plan_id, _sub.plan_id); end if;
  return jsonb_build_object(
    'subscription_id', _sub.id, 'plan_id', _plan.id, 'plan_name', _plan.name, 'plan_slug', _plan.slug,
    'cycle_start', _cycle.cycle_start, 'cycle_end', _cycle.cycle_end,
    'period_end', _sub.current_period_end, 'cancel_at_period_end', _sub.cancel_at_period_end,
    'pieces_per_month', _plan.pieces_per_month, 'pieces_used', _used_pieces,
    'pieces_left', greatest(0, _plan.pieces_per_month - _used_pieces),
    'per_pickup_limit', least(coalesce(_plan.weekly_allowance, _plan.pieces_per_month), _plan.pieces_per_month),
    'included_pickups', _plan.pickups_per_month,
    'included_pickups_used', private.subscription_included_pickups_used(_sub.id, _cycle.cycle_start, _cycle.cycle_end),
    'next_term', case when _next.id is null then null else jsonb_build_object(
      'invoice_id', _next.id, 'status', _next.status, 'plan_name', _next_plan,
      'billing_period', coalesce(_next.billing_period, _sub.billing_period),
      'amount_kobo', _next.amount_kobo, 'starts_on', _next.period_start) end);
end
$$;
revoke all on function public.subscription_usage() from public, anon;
grant execute on function public.subscription_usage() to authenticated;

-- WhatsApp booking: same core. A booking after the included pickups returns
-- source 'one_time_allowance_exhausted' so the existing WhatsApp payment step
-- still runs, but the order stays a subscription order (pieces use the plan).
create or replace function public.whatsapp_create_pickup_for_customer(_customer uuid, _lat double precision, _lng double precision, _address text, _notes text, _slot timestamptz, _force_one_time boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare _order uuid; _order_no bigint; _source text; _r jsonb; _has_sub boolean;
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
  select order_no into _order_no from public.orders where id = _order and customer_id = _customer;
  if _order_no is null then raise exception 'booking_creation_failed' using errcode = 'P0001'; end if;
  return jsonb_build_object('order_id', _order, 'order_no', _order_no, 'source', _source,
    'subscription_pickups_used', coalesce((_r->>'included_pickups_used')::integer, 0),
    'transport_paid', coalesce((_r->>'transport_paid')::boolean, _source <> 'subscription'));
end
$$;

create or replace function public.whatsapp_create_pickup_for_customer(_customer uuid, _lat double precision, _lng double precision, _address text, _notes text, _slot timestamptz)
returns jsonb language sql security definer set search_path = ''
as $$ select public.whatsapp_create_pickup_for_customer(_customer, _lat, _lng, _address, _notes, _slot, false) $$;

-- ---------------------------------------------------------------------------
-- Payments for paid-transport subscription pickups
-- ---------------------------------------------------------------------------
create or replace function public.create_payment_intent(_order uuid, _purpose text, _provider text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  _o public.orders; _amt bigint; _paid bigint; _ref text; _mp uuid; _p public.profiles; _note text;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  if _provider not in ('paystack', 'flutterwave') then raise exception 'invalid_provider' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.customer_id <> auth.uid() then raise exception 'order_not_found' using errcode = 'P0001'; end if;

  if _purpose in ('pickup_fare', 'delivery_fare') then
    if _purpose = 'pickup_fare' and _o.source = 'subscription' then
      if _o.status <> 'awaiting_fare_payment' or coalesce(_o.pickup_fare_kobo, 0) <= 0 then raise exception 'wrong_state' using errcode = 'P0001'; end if;
      _amt := _o.pickup_fare_kobo + coalesce(_o.delivery_fare_kobo, 0);
      _note := 'Extra subscription pickup, transport prepaid';
    elsif _o.source <> 'one_time' then raise exception 'subscription_only_booking' using errcode = 'P0001';
    elsif _purpose = 'pickup_fare' then
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
$$;

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

-- ---------------------------------------------------------------------------
-- Counting: per-cycle allowance, category caps billed at their own prices
-- ---------------------------------------------------------------------------
create or replace function private.finalize_subscription_pickup_count()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  _sp public.subscription_pickups; _sub public.subscriptions; _plan public.plans;
  _pieces integer; _used integer; _available integer; _total_overage integer;
  _excluded_pieces integer := 0; _category_overage integer := 0; _category_overage_kobo bigint := 0;
  _included_pieces integer := 0; _excluded_kobo bigint := 0; _over integer;
  _overage integer; _price bigint; _line record; _category_limit integer; _category_used integer;
  _cycle record;
begin
  if new.status <> 'counted' or old.status = 'counted' or new.source <> 'subscription' or new.subscription_pickup_id is null then return new; end if;
  select * into _sp from public.subscription_pickups where id = new.subscription_pickup_id for update;
  if not found then return new; end if;
  select * into _sub from public.subscriptions where id = _sp.subscription_id for update;
  if not found then raise exception 'subscription_not_found' using errcode = 'P0001'; end if;
  select * into _plan from public.plans where id = _sub.plan_id;
  if not found then raise exception 'subscription_plan_invalid' using errcode = 'P0001'; end if;
  select * into _cycle from private.subscription_cycle(_sub.current_period_start, _sp.scheduled_for);

  select coalesce(sum(qty),0)::integer into _pieces from public.order_items where order_id = new.id and removed_at is null;
  select coalesce(sum(greatest(coalesce(prior.pieces_counted, 0) - coalesce(prior.overage_pieces, 0) - coalesce(prior.excluded_pieces, 0), 0)), 0)::integer
    into _used from public.subscription_pickups prior
   where prior.subscription_id = _sub.id and prior.id <> _sp.id
     and prior.scheduled_for >= _cycle.cycle_start and prior.scheduled_for < _cycle.cycle_end
     and prior.status not in ('missed','skipped');
  _available := greatest(0, least(_plan.pieces_per_month - _used, coalesce(_plan.weekly_allowance, _plan.pieces_per_month)));

  for _line in
    select lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')) as category_key,
           sum(oi.qty)::integer as qty, sum(oi.line_total_kobo)::bigint as total_kobo
      from public.order_items oi left join public.items i on i.id = oi.item_id left join public.item_categories ic on ic.id = i.category_id
     where oi.order_id = new.id and oi.removed_at is null group by 1
  loop
    if _plan.category_limits ? _line.category_key then
      begin _category_limit := greatest(0, (_plan.category_limits ->> _line.category_key)::integer);
      exception when others then raise exception 'invalid_category_limit_for_%', _line.category_key using errcode = '22023'; end;
      if _category_limit = 0 then
        _excluded_pieces := _excluded_pieces + _line.qty;
        _excluded_kobo := _excluded_kobo + _line.total_kobo;
      else
        select coalesce(sum(oi.qty),0)::integer into _category_used
          from public.order_items oi left join public.items i on i.id = oi.item_id left join public.item_categories ic on ic.id = i.category_id
         where oi.removed_at is null
           and lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')) = _line.category_key
           and oi.order_id in (select prior_order.id from public.subscription_pickups prior
                                 join public.orders prior_order on prior_order.subscription_pickup_id = prior.id
                                where prior.subscription_id = _sub.id and prior.id <> _sp.id
                                  and prior.scheduled_for >= _cycle.cycle_start and prior.scheduled_for < _cycle.cycle_end
                                  and prior.status not in ('missed','skipped'));
        _over := greatest(0, _line.qty + _category_used - _category_limit);
        _over := least(_over, _line.qty);
        _category_overage := _category_overage + _over;
        -- Over-cap pieces are charged at this category's own average price on this pickup.
        _category_overage_kobo := _category_overage_kobo + round(_line.total_kobo::numeric * _over / nullif(_line.qty, 0))::bigint;
        _included_pieces := _included_pieces + (_line.qty - _over);
      end if;
    else
      _included_pieces := _included_pieces + _line.qty;
    end if;
  end loop;

  _total_overage := greatest(0, _included_pieces - _available);
  _overage := _category_overage + _total_overage;
  -- Pieces above the monthly / per-pickup allowance: average catalogue price of
  -- this pickup's eligible pieces (excluded categories are billed separately).
  select coalesce(round(sum(oi.line_total_kobo)::numeric / nullif(sum(oi.qty), 0)), 0)::bigint into _price
    from public.order_items oi left join public.items i on i.id = oi.item_id left join public.item_categories ic on ic.id = i.category_id
   where oi.order_id = new.id and oi.removed_at is null
     and not (_plan.category_limits ? lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g'))
              and coalesce((_plan.category_limits ->> lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')))::integer, 0) = 0);

  update public.subscription_pickups
     set pieces_counted = _pieces, overage_pieces = _overage,
         overage_kobo = _category_overage_kobo + _total_overage::bigint * _price,
         excluded_kobo = _excluded_kobo, excluded_pieces = _excluded_pieces, status = 'collected'
   where id = _sp.id;
  if _overage = 0 and _excluded_kobo = 0 then update public.orders set status = 'count_confirmed' where id = new.id and status = 'counted'; end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Buying: new subscription, or the next term (renewal / plan change)
-- ---------------------------------------------------------------------------
-- The two-argument RPC creates a brand-new subscription; never allow a second
-- live one.
do $$
declare _src text;
begin
  select p.prosrc into _src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_subscription_payment_intent'
     and pg_get_function_identity_arguments(p.oid) = '_plan_slug text, _provider text';
  if _src is null or position('subscription_already_active' in _src) > 0 then return; end if;
  _src := replace(_src,
    '  select * into _plan' || chr(10) || '  from public.plans',
    '  if exists (select 1 from public.subscriptions s where s.customer_id = auth.uid() and s.status in (''active'',''pending_review'')) then' || chr(10) ||
    '    raise exception ''subscription_already_active'' using errcode = ''P0001'';' || chr(10) ||
    '  end if;' || chr(10) || chr(10) ||
    '  select * into _plan' || chr(10) || '  from public.plans');
  if position('subscription_already_active' in _src) = 0 then raise exception 'patch_failed_create_subscription_payment_intent'; end if;
  execute format('create or replace function public.create_subscription_payment_intent(_plan_slug text, _provider text) returns jsonb language plpgsql security definer set search_path = '''' as %L', _src);
end $$;

-- Pays for the term after the current one, on any plan. Nothing changes now:
-- the plan, price and allowance switch when the current term ends.
create or replace function private.create_next_term_intent(_customer uuid, _plan_slug text, _provider text, _billing_period text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  _sub public.subscriptions; _plan public.plans; _term record; _start date; _end date;
  _invoice public.subscription_invoices; _reference text; _payment uuid; _profile public.profiles;
begin
  if _provider not in ('paystack','flutterwave') then raise exception 'invalid_provider' using errcode = 'P0001'; end if;
  perform private.roll_customer_subscriptions(_customer);
  select * into _sub from public.subscriptions where customer_id = _customer and status = 'active'
   order by current_period_end desc limit 1 for update;
  if not found then raise exception 'subscription_not_found' using errcode = 'P0001'; end if;
  select * into _plan from public.plans where slug = _plan_slug and active for share;
  if not found then raise exception 'plan_not_found' using errcode = 'P0001'; end if;
  if coalesce(_plan.monthly_price_kobo, 0) <= 0 then raise exception 'invalid_plan_price' using errcode = 'P0001'; end if;
  if private.online_money_point() is null then raise exception 'no_online_money_point' using errcode = 'P0001'; end if;
  select * into _term from private.plan_term_amount(_plan, _billing_period);

  _start := (_sub.current_period_end at time zone 'Africa/Lagos')::date;
  _end := (_start + make_interval(months => _term.months))::date - 1;
  if exists (select 1 from public.subscription_invoices i where i.subscription_id = _sub.id and i.status = 'paid'
               and i.subscription_pickup_id is null and i.period_start = _start) then
    raise exception 'next_term_already_paid' using errcode = 'P0001';
  end if;

  select * into _invoice from public.subscription_invoices i
   where i.subscription_id = _sub.id and i.status = 'due' and i.subscription_pickup_id is null and i.period_start = _start
   order by i.created_at desc limit 1 for update;
  if found then
    update public.subscription_invoices
       set period_end = _end, amount_kobo = _term.total_kobo, plan_id = _plan.id,
           billing_period = _billing_period, monthly_price_kobo = _plan.monthly_price_kobo
     where id = _invoice.id;
    update public.payments set status = 'failed' where invoice_id = _invoice.id and status = 'pending';
  else
    insert into public.subscription_invoices (subscription_id, period_start, period_end, amount_kobo, status, plan_id, billing_period, monthly_price_kobo)
    values (_sub.id, _start, _end, _term.total_kobo, 'due', _plan.id, _billing_period, _plan.monthly_price_kobo)
    returning * into _invoice;
  end if;

  _reference := 'LP-NEXT-' || replace(_sub.id::text, '-', '') || '-' || encode(extensions.gen_random_bytes(5), 'hex');
  insert into public.payments (invoice_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id, note)
  values (_invoice.id, _customer, 'subscription', 'payment', _provider, _term.total_kobo, _reference, 'pending',
          private.online_money_point(), 'Next term: ' || _plan.name || ' (' || _billing_period || ')')
  returning id into _payment;
  update public.subscription_invoices set payment_id = _payment where id = _invoice.id;
  select * into _profile from public.profiles where id = _customer;
  return jsonb_build_object('reference', _reference, 'amount_kobo', _term.total_kobo,
    'email', _profile.email, 'name', _profile.full_name, 'phone', _profile.phone,
    'plan_name', _plan.name, 'subscription_id', _sub.id, 'next_term', true,
    'starts_on', _start, 'period_end', _end, 'billing_period', _billing_period,
    'months', _term.months, 'discount_pct', _term.discount_pct);
end
$$;
revoke all on function private.create_next_term_intent(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.create_subscription_payment_intent(_plan_slug text, _provider text, _billing_period text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  _result jsonb; _sub_id uuid; _invoice_id uuid; _plan public.plans; _term record; _end_date date;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  if _billing_period not in ('monthly', 'three_month', 'six_month', 'yearly') then
    raise exception 'invalid_billing_period' using errcode = 'P0001';
  end if;
  perform private.roll_customer_subscriptions(auth.uid());
  -- Already subscribed: this purchase is the next term (renewal or plan change).
  if exists (select 1 from public.subscriptions where customer_id = auth.uid() and status = 'active') then
    return private.create_next_term_intent(auth.uid(), _plan_slug, _provider, _billing_period);
  end if;

  update public.subscriptions set status = 'cancelled', updated_at = now()
   where customer_id = auth.uid() and status = 'pending';
  _result := public.create_subscription_payment_intent(_plan_slug, _provider);
  _sub_id := (_result->>'subscription_id')::uuid;
  select * into _plan from public.plans where slug = _plan_slug;
  select * into _term from private.plan_term_amount(_plan, _billing_period);
  select i.id into _invoice_id from public.subscription_invoices i
   where i.subscription_id = _sub_id order by i.created_at desc limit 1 for update;
  if _invoice_id is null then raise exception 'subscription_invoice_not_found' using errcode = 'P0001'; end if;
  _end_date := (current_date + make_interval(months => _term.months))::date - 1;

  update public.subscriptions
     set billing_period = _billing_period, price_kobo = _plan.monthly_price_kobo, term_amount_kobo = _term.total_kobo,
         current_period_start = date_trunc('day', now()),
         current_period_end = (_end_date + 1)::timestamp at time zone 'Africa/Lagos', updated_at = now()
   where id = _sub_id;
  update public.subscription_invoices
     set period_start = current_date, period_end = _end_date, amount_kobo = _term.total_kobo,
         plan_id = _plan.id, billing_period = _billing_period, monthly_price_kobo = _plan.monthly_price_kobo
   where id = _invoice_id;
  update public.payments set amount_kobo = _term.total_kobo, note = 'Subscription ' || _billing_period || ' plan'
   where reference = _result->>'reference' and status = 'pending';
  return _result || jsonb_build_object('amount_kobo', _term.total_kobo, 'billing_period', _billing_period,
    'months', _term.months, 'discount_pct', _term.discount_pct, 'period_end', _end_date, 'next_term', false);
end
$$;

-- WhatsApp: an active subscriber buying a plan is buying the next term.
create or replace function public.whatsapp_create_subscription_payment_intent_for_customer(_customer uuid, _plan_slug text, _provider text, _billing_period text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if _provider not in ('paystack','flutterwave') then raise exception 'invalid_provider' using errcode = 'P0001'; end if;
  if _billing_period not in ('monthly','three_month','six_month','yearly') then raise exception 'invalid_billing_period' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.whatsapp_account_verifications where customer_id = _customer and verified_until > now()) then
    raise exception 'whatsapp_identity_not_verified' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = _customer and status = 'active') then
    raise exception 'account_restricted' using errcode = 'P0001';
  end if;
  perform set_config('request.jwt.claim.sub', _customer::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  return public.create_subscription_payment_intent(_plan_slug, _provider, _billing_period);
end
$$;

create or replace function public.set_subscription_cancellation(_cancel boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare _sub public.subscriptions;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  select * into _sub from public.subscriptions where customer_id = auth.uid() and status = 'active'
   order by current_period_end desc limit 1 for update;
  if not found then raise exception 'subscription_not_found' using errcode = 'P0001'; end if;
  if _cancel and exists (select 1 from public.subscription_invoices i where i.subscription_id = _sub.id and i.status = 'paid'
        and i.subscription_pickup_id is null and i.period_start = (_sub.current_period_end at time zone 'Africa/Lagos')::date) then
    raise exception 'next_term_already_paid' using errcode = 'P0001';
  end if;
  update public.subscriptions set cancel_at_period_end = _cancel, updated_at = now() where id = _sub.id;
  if _cancel then
    update public.subscription_invoices set status = 'void'
     where subscription_id = _sub.id and status = 'due' and subscription_pickup_id is null;
  end if;
  insert into public.subscription_events(event, detail) values (case when _cancel then 'subscription_cancel_scheduled' else 'subscription_cancel_reversed' end,
    jsonb_build_object('subscription_id', _sub.id, 'customer_id', _sub.customer_id, 'ends_at', _sub.current_period_end));
  return jsonb_build_object('ok', true, 'cancel_at_period_end', _cancel, 'ends_at', _sub.current_period_end);
end
$$;
revoke all on function public.set_subscription_cancellation(boolean) from public, anon;
grant execute on function public.set_subscription_cancellation(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Settlement
-- ---------------------------------------------------------------------------
create or replace function public.settle_online_payment(_reference text, _provider text, _amount_kobo bigint)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  _pay public.payments; _o public.orders; _paid bigint; _invoice public.subscription_invoices;
  _sub public.subscriptions; _pickup public.subscription_pickups;
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
    -- Money received is always recorded. If the invoice was voided meanwhile,
    -- it is flagged for staff instead of failing the provider callback.
    if _invoice.status = 'void' then
      insert into public.subscription_events(event, detail) values ('subscription_payment_needs_review',
        jsonb_build_object('reference',_reference,'invoice_id',_invoice.id,'subscription_id',_sub.id,'reason','invoice_void'));
      return jsonb_build_object('ok',true,'needs_review',true);
    end if;
    update public.subscription_invoices set status='paid' where id=_invoice.id;
    if _pay.purpose='subscription' then
      if _sub.status='active' and _invoice.period_start=(_sub.current_period_end at time zone 'Africa/Lagos')::date then
        -- Next term paid in advance. It starts when the current term ends.
        update public.subscriptions set cancel_at_period_end=false, updated_at=now() where id=_sub.id;
        insert into public.subscription_events(event, detail) values ('subscription_next_term_paid',
          jsonb_build_object('subscription_id',_sub.id,'customer_id',_sub.customer_id,'invoice_id',_invoice.id,
            'plan_id',coalesce(_invoice.plan_id,_sub.plan_id),'starts_on',_invoice.period_start));
        perform private.roll_subscription(_sub.id);
      elsif _sub.status in ('pending','expired') then
        update public.subscriptions
           set status='active', started_at=coalesce(started_at,now()),
               plan_id=coalesce(_invoice.plan_id,plan_id),
               billing_period=coalesce(_invoice.billing_period,billing_period),
               price_kobo=coalesce(_invoice.monthly_price_kobo,price_kobo),
               term_amount_kobo=_invoice.amount_kobo,
               current_period_start=(_invoice.period_start::timestamp at time zone 'Africa/Lagos'),
               current_period_end=((_invoice.period_end+1)::timestamp at time zone 'Africa/Lagos'),
               updated_at=now()
         where id=_sub.id;
        insert into public.subscription_events(event, detail) values ('subscription_activated',
          jsonb_build_object('subscription_id',_sub.id,'customer_id',_sub.customer_id,'invoice_id',_invoice.id));
      else
        insert into public.subscription_events(event, detail) values ('subscription_payment_needs_review',
          jsonb_build_object('reference',_reference,'invoice_id',_invoice.id,'subscription_id',_sub.id,'reason','not_current_term'));
        return jsonb_build_object('ok',true,'needs_review',true);
      end if;
    elsif _pay.purpose='extra_clothes' then
      select * into _pickup from public.subscription_pickups where id=_invoice.subscription_pickup_id for update;
      if found and _pickup.order_id is not null and (_pickup.overage_kobo>0 or _pickup.excluded_kobo>0) then
        update public.orders set status='count_confirmed' where id=_pickup.order_id and status='counted';
      end if;
    end if;
    return jsonb_build_object('ok',true,'subscription_id',_sub.id,'activated',_pay.purpose='subscription');
  end if;
  select * into _o from public.orders where id=_pay.order_id for update;
  if _pay.purpose='pickup_fare' and _o.source='one_time' and _o.status='awaiting_fare_payment' then
    update public.orders set status='awaiting_dispatch' where id=_o.id;
  elsif _pay.purpose='pickup_fare' and _o.source='subscription' and _o.status='awaiting_fare_payment' then
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
end
$$;

-- ---------------------------------------------------------------------------
-- Lifecycle (runs hourly)
-- ---------------------------------------------------------------------------
create or replace function public.process_subscription_lifecycle()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_sub record; v_invoice public.subscription_invoices; v_created integer := 0; v_reminded integer := 0;
  v_rolled integer := 0; v_stage integer; v_days integer; v_body text; v_term interval; r text;
begin
  for v_sub in select id from public.subscriptions where status = 'active' and current_period_end <= now() loop
    r := private.roll_subscription(v_sub.id);
    if r <> 'unchanged' then v_rolled := v_rolled + 1; end if;
  end loop;

  for v_sub in
    select s.* from public.subscriptions s
     where s.status = 'active' and not s.cancel_at_period_end and s.current_period_end is not null
       and (s.current_period_end at time zone 'Africa/Lagos')::date
           between (now() at time zone 'Africa/Lagos')::date and (now() at time zone 'Africa/Lagos')::date + 5
  loop
    v_term := case v_sub.billing_period when 'three_month' then interval '3 months' when 'six_month' then interval '6 months'
                when 'yearly' then interval '12 months' else interval '1 month' end;
    if not exists (select 1 from public.subscription_invoices i where i.subscription_id = v_sub.id
                    and i.subscription_pickup_id is null and i.status in ('due','paid')
                    and i.period_start = (v_sub.current_period_end at time zone 'Africa/Lagos')::date) then
      insert into public.subscription_invoices (subscription_id, period_start, period_end, amount_kobo, status, plan_id, billing_period, monthly_price_kobo)
      values (v_sub.id, (v_sub.current_period_end at time zone 'Africa/Lagos')::date,
              (((v_sub.current_period_end + v_term) at time zone 'Africa/Lagos')::date - 1),
              coalesce(v_sub.term_amount_kobo, v_sub.price_kobo), 'due', v_sub.plan_id, v_sub.billing_period, v_sub.price_kobo);
      v_created := v_created + 1;
    end if;
  end loop;

  for v_invoice in
    select i.* from public.subscription_invoices i join public.subscriptions s on s.id = i.subscription_id
     where i.status = 'due' and i.subscription_pickup_id is null and s.status = 'active' and not s.cancel_at_period_end
       and i.period_start = (s.current_period_end at time zone 'Africa/Lagos')::date
       and i.period_start between (now() at time zone 'Africa/Lagos')::date and (now() at time zone 'Africa/Lagos')::date + 5
  loop
    v_days := v_invoice.period_start - (now() at time zone 'Africa/Lagos')::date;
    v_stage := case when v_days <= 0 then 3 when v_days <= 2 then 2 else 1 end;
    if not exists (select 1 from public.subscription_events e where e.event = 'subscription_renewal_reminder'
                    and e.detail->>'invoice_id' = v_invoice.id::text and e.detail->>'stage' = v_stage::text) then
      v_body := case v_stage when 1 then 'Your LaundryPoint plan renews in 5 days.'
                when 2 then 'Your LaundryPoint plan renews in 2 days.' else 'Your LaundryPoint plan ends today. Renew to keep your pickups.' end;
      insert into public.user_notifications (user_id, title, body, kind)
      select s.customer_id, 'Plan renewal reminder', v_body, 'subscription' from public.subscriptions s where s.id = v_invoice.subscription_id;
      insert into public.subscription_events(event, detail)
      values ('subscription_renewal_reminder', jsonb_build_object('invoice_id', v_invoice.id, 'stage', v_stage,
              'subscription_id', v_invoice.subscription_id));
      v_reminded := v_reminded + 1;
    end if;
  end loop;

  return jsonb_build_object('renewal_invoices_created', v_created, 'reminders_sent', v_reminded, 'terms_rolled', v_rolled);
end
$$;

do $$
begin
  perform cron.unschedule('laundrypoint-subscription-lifecycle-daily');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('laundrypoint-subscription-lifecycle-hourly');
exception when others then null;
end $$;
select cron.schedule('laundrypoint-subscription-lifecycle-hourly', '7 * * * *', 'select public.process_subscription_lifecycle();');

revoke all on function private.subscription_cycle(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.subscription_included_pickups_used(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.plan_term_amount(public.plans, text) from public, anon, authenticated;
revoke all on function private.roll_subscription(uuid) from public, anon, authenticated;
revoke all on function private.roll_customer_subscriptions(uuid) from public, anon, authenticated;
