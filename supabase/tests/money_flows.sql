-- Money-path tests: walk-in desk payment, online prepayment, refunds and agent commission.
--
-- Runs against a real LaundryPoint database inside ONE transaction that always ends in ROLLBACK, so nothing it creates
-- is kept: test users, orders, payments, emails and WhatsApp messages all disappear. The only lasting trace is that
-- order numbers used by the test orders are skipped (Postgres sequences do not roll back).
--
-- Run:   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/money_flows.sql
-- Pass:  the last line printed is "ALL MONEY TESTS PASSED". Any failure stops with "TEST FAILED: <what>".
\set ON_ERROR_STOP on
\set QUIET on
begin;
set local statement_timeout = '120s';
set local client_min_messages = notice;

-- ---------- helpers (temporary: they vanish with the session) ----------
create function pg_temp.act_as(_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  perform set_config('request.jwt.claims', case when _uid is null then '{}' else json_build_object('sub', _uid, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', '{}', true);
end $$;

create function pg_temp.new_user(_name text) returns uuid language plpgsql as $$
declare _id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
  values (_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'money-test+' || _id || '@laundrypoint.invalid',
          jsonb_build_object('full_name', _name, 'phone', '+23480' || lpad((floor(random() * 1e8))::bigint::text, 8, '0')), '{}', now(), now(), now());
  return _id;
end $$;

create function pg_temp.check(_ok boolean, _what text) returns void language plpgsql as $$
begin
  if not coalesce(_ok, false) then raise exception 'TEST FAILED: %', _what; end if;
  raise notice 'ok - %', _what;
end $$;

-- Runs _sql and requires it to fail with an error whose message contains _code.
create function pg_temp.expect_error(_sql text, _code text, _what text) returns void language plpgsql as $$
declare _got text;
begin
  begin
    execute _sql;
    _got := '(no error)';
  exception when others then
    _got := sqlerrm;
  end;
  perform pg_temp.check(position(_code in _got) > 0, _what || ' [expected ' || _code || ', got ' || _got || ']');
end $$;

-- A delivered, fully paid (online) order of _amount kobo for _cust. Returns the order id.
create function pg_temp.delivered_order(_cust uuid, _amount bigint) returns uuid language plpgsql as $$
declare _id uuid;
begin
  insert into public.orders (customer_id, source, status, pickup_fare_kobo, delivery_fare_kobo)
  values (_cust, 'one_time', 'received', 0, 0) returning id into _id;
  insert into public.order_items (order_id, name, qty, unit_price_kobo) values (_id, 'Money test bundle', 1, _amount);
  insert into public.payments (order_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id)
  values (_id, _cust, 'items', 'payment', 'paystack', _amount, 'MONEYTEST-' || _id, 'success', private.online_money_point());
  update public.orders set delivered_at = now() where id = _id;
  return _id;
end $$;

create function pg_temp.sales(_mode text) returns table (gross bigint, refunded bigint) language sql as $$
  select coalesce(sum(gross_kobo), 0)::bigint, coalesce(sum(refunded_kobo), 0)::bigint
    from public.daily_sales_summary where day = private.today_lagos() and mode = _mode
$$;

-- ---------- 1. Walk-in order paid in cash at the desk ----------
do $t$
declare
  _desk uuid := pg_temp.new_user('Money test desk');
  _cust uuid := pg_temp.new_user('Money test walk-in');
  _station uuid; _cash uuid; _online uuid; _item uuid; _price bigint;
  _order uuid; _due bigint; _before record; _after record; _o public.orders;
begin
  select id into _station from public.zones where kind = 'area' and is_live and centre_lat is not null order by name limit 1;
  select id into _cash from public.money_points where active and kind = 'cash' order by name limit 1;
  _online := private.online_money_point();
  perform pg_temp.check(_station is not null and _cash is not null and _online is not null, 'walk-in: fixtures (station, cash drawer, online point) exist');
  select i.id, private.service_price_kobo(i.id, 'dry_clean') into _item, _price
    from public.items i where i.active and private.service_price_kobo(i.id, 'dry_clean') > 0 order by i.name limit 1;

  insert into public.user_roles (user_id, role) values (_desk, 'secretary');
  insert into public.staff_profiles (user_id, station_zone_id) values (_desk, _station);

  -- A desk member with no station cannot start a walk-in (the error the shop saw before stations were set).
  update public.staff_profiles set station_zone_id = null where user_id = _desk;
  perform pg_temp.act_as(_desk);
  perform pg_temp.expect_error(format('select public.desk_create_walkin_order(%L, null)', _cust), 'staff_station_required', 'walk-in: needs a station');
  update public.staff_profiles set station_zone_id = _station where user_id = _desk;

  _order := public.desk_create_walkin_order(_cust, 'money test');
  perform public.desk_set_item(_order, _item, 3, 'dry_clean');
  perform public.desk_submit_count(_order);
  _due := private.items_due(_order);
  perform pg_temp.check(_due = 3 * _price, format('walk-in: bill is 3 x %s = %s kobo (got %s)', _price, 3 * _price, _due));

  perform pg_temp.expect_error(format('select public.desk_record_payment(%L, %L, %L, null)', _order, 'cash', _online), 'money_point_required', 'walk-in: cannot record cash into an online money point');
  perform pg_temp.expect_error(format('select public.desk_record_payment(%L, %L, %L, %L)', _order, 'pos', _cash, ''), 'note_required', 'walk-in: POS/transfer needs a note');
  perform pg_temp.expect_error(format('select public.desk_record_payment(%L, %L, %L, null)', _order, 'paystack', _cash), 'invalid_step', 'walk-in: desk cannot record an online-provider payment');

  select * into _before from pg_temp.sales('cash');
  perform public.desk_record_payment(_order, 'cash', _cash, null);
  select * into _after from pg_temp.sales('cash');

  perform pg_temp.check((select count(*) = 1 and sum(amount_kobo) = _due from public.payments where order_id = _order and status = 'success' and kind = 'payment' and mode = 'cash'),
    'walk-in: exactly one cash payment for the full bill');
  perform pg_temp.check(private.items_due(_order) = 0, 'walk-in: nothing left to pay');
  perform pg_temp.check(_after.gross - _before.gross = _due, 'walk-in: today''s cash sales went up by the bill');
  select * into _o from public.orders where id = _order;
  perform pg_temp.check(_o.status = 'received', 'walk-in: goes straight to the wash queue (received), no Receiving step');
  perform pg_temp.check(not exists (select 1 from public.order_items where order_id = _order and removed_at is null and check_state <> 'ok'), 'walk-in: every line marked checked');
  perform pg_temp.expect_error(format('select public.desk_record_payment(%L, %L, %L, null)', _order, 'cash', _cash), 'wrong_state', 'walk-in: cannot be paid twice');

  -- Customer accounts cannot use desk actions.
  perform pg_temp.act_as(_cust);
  perform pg_temp.expect_error(format('select public.desk_create_walkin_order(%L, null)', _cust), 'not_allowed', 'walk-in: customers cannot create desk orders');
end $t$;

-- ---------- 2. Online order paid upfront (Paystack / Flutterwave) ----------
do $t$
declare
  _cust uuid := pg_temp.new_user('Money test online');
  _other uuid := pg_temp.new_user('Money test stranger');
  _order uuid; _intent jsonb; _ref text; _amt bigint; _r jsonb; _before record; _after record; _o public.orders;
begin
  insert into public.orders (customer_id, source, status, pickup_fare_kobo, delivery_fare_kobo)
  values (_cust, 'one_time', 'agent_arrived', 0, 0) returning id into _order;
  insert into public.order_items (order_id, name, qty, unit_price_kobo) values (_order, 'Money test shirt', 4, 125000);
  update public.orders set status = 'counted' where id = _order;

  perform pg_temp.act_as(_other);
  perform pg_temp.expect_error(format('select public.create_payment_intent(%L, %L, %L)', _order, 'items', 'paystack'), 'order_not_found', 'online: nobody else can pay (or see) your bill');
  perform pg_temp.act_as(_cust);
  perform pg_temp.expect_error(format('select public.create_payment_intent(%L, %L, %L)', _order, 'items', 'cash'), 'invalid_provider', 'online: only Paystack or Flutterwave');

  _intent := public.create_payment_intent(_order, 'items', 'paystack');
  _ref := _intent->>'reference'; _amt := (_intent->>'amount_kobo')::bigint;
  perform pg_temp.check(_amt = 500000, format('online: charge is the bill, 4 x 1,250 = 500000 kobo (got %s)', _amt));

  -- A second intent replaces the first: the old reference can no longer be settled.
  _intent := public.create_payment_intent(_order, 'items', 'paystack');
  perform pg_temp.check((select status from public.payments where reference = _ref) = 'failed', 'online: an abandoned checkout is voided when a new one starts');
  _ref := _intent->>'reference';

  perform pg_temp.act_as(null); -- the payment webhook runs with no signed-in user
  perform pg_temp.expect_error(format('select public.settle_online_payment(%L, %L, %s)', _ref, 'paystack', _amt - 1), 'amount_mismatch', 'online: underpayment is refused');
  perform pg_temp.expect_error(format('select public.settle_online_payment(%L, %L, %s)', _ref, 'flutterwave', _amt), 'payment_not_found', 'online: provider must match');

  select * into _before from pg_temp.sales('paystack');
  _r := public.settle_online_payment(_ref, 'paystack', _amt);
  select * into _after from pg_temp.sales('paystack');
  perform pg_temp.check((_r->>'ok')::boolean, 'online: correct payment settles');
  select * into _o from public.orders where id = _order;
  perform pg_temp.check(_o.status = 'count_confirmed', 'online: order becomes paid (count_confirmed) and still waits for Receiving');
  perform pg_temp.check(_after.gross - _before.gross = _amt, 'online: today''s Paystack sales went up by the payment');

  _r := public.settle_online_payment(_ref, 'paystack', _amt);
  perform pg_temp.check(coalesce((_r->>'already')::boolean, false), 'online: a repeated webhook is ignored');
  perform pg_temp.check((select count(*) from public.payments where order_id = _order and status = 'success') = 1, 'online: still exactly one successful payment');
  select * into _after from pg_temp.sales('paystack');
  perform pg_temp.check(_after.gross - _before.gross = _amt, 'online: a repeated webhook does not double-count sales');

  perform pg_temp.act_as(_cust);
  perform pg_temp.expect_error(format('select public.create_payment_intent(%L, %L, %L)', _order, 'items', 'paystack'), 'nothing_to_pay', 'online: a paid bill cannot be charged again');
end $t$;

-- ---------- 3. Refunds ----------
do $t$
declare
  _boss uuid := pg_temp.new_user('Money test super admin');
  _desk uuid := pg_temp.new_user('Money test desk 2');
  _cust uuid := pg_temp.new_user('Money test refund customer');
  _cash uuid; _order uuid; _refund uuid; _before record; _after record;
begin
  insert into public.user_roles (user_id, role) values (_boss, 'super_admin'), (_desk, 'secretary');
  select id into _cash from public.money_points where active and kind = 'cash' order by name limit 1;

  insert into public.orders (customer_id, source, status, pickup_fare_kobo, delivery_fare_kobo)
  values (_cust, 'one_time', 'received', 0, 0) returning id into _order;
  insert into public.order_items (order_id, name, qty, unit_price_kobo) values (_order, 'Money test duvet', 1, 800000);
  insert into public.payments (order_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id)
  values (_order, _cust, 'items', 'payment', 'cash', 800000, 'MONEYTEST-PAY-' || _order, 'success', _cash);
  -- A refund waiting to be paid out, as the dispute / cancellation flows raise it.
  insert into public.payments (order_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id, note)
  values (_order, _cust, 'items', 'refund', 'cash', 300000, 'MONEYTEST-REF-' || _order, 'pending', _cash, 'Money test refund')
  returning id into _refund;

  perform pg_temp.act_as(_desk);
  perform pg_temp.expect_error(format('select public.mark_refund_paid(%L, %L)', _refund, 'paid at desk'), 'not_super_admin', 'refund: only a super admin can mark a refund paid');
  perform pg_temp.act_as(_boss);
  perform pg_temp.expect_error(format('select public.mark_refund_paid(%L, %L)', _refund, 'ok'), 'note_required', 'refund: needs a note saying how it was paid');

  select * into _before from pg_temp.sales('cash');
  perform public.mark_refund_paid(_refund, 'Cash handed back at the desk');
  select * into _after from pg_temp.sales('cash');
  perform pg_temp.check((select status from public.payments where id = _refund) = 'success', 'refund: marked paid');
  perform pg_temp.check(_after.refunded - _before.refunded = 300000, 'refund: today''s cash refunds went up by the refund');
  perform pg_temp.check(_after.gross = _before.gross, 'refund: does not count as a sale');
  perform pg_temp.check(exists (select 1 from public.user_notifications where user_id = _cust and kind = 'refund'), 'refund: customer is told');
  perform pg_temp.expect_error(format('select public.mark_refund_paid(%L, %L)', _refund, 'again'), 'wrong_state', 'refund: cannot be paid out twice');
end $t$;

-- ---------- 4. Agent commission: 12 months from joining, orders of at least ₦20,000 ----------
do $t$
declare
  _boss uuid := pg_temp.new_user('Money test verifier');
  _agent uuid := pg_temp.new_user('Money test agent');
  _new uuid := pg_temp.new_user('Money test new customer');
  _old uuid := pg_temp.new_user('Money test old customer');
  _plain uuid := pg_temp.new_user('Money test unreferred customer');
  _rate numeric; _min bigint; _o uuid; _c public.commissions;
begin
  select commission_only_rate into _rate from public.commission_rules where active order by updated_at desc limit 1;
  select (value->>'min_order_kobo')::bigint into _min from public.settings where key = 'commission';
  perform pg_temp.check(_rate > 0 and _min = 2000000, format('commission: rules loaded (rate %s, minimum %s kobo)', _rate, _min));

  insert into public.user_roles (user_id, role) values (_boss, 'super_admin'), (_agent, 'commission_agent');
  insert into public.staff_profiles (user_id, onboarding_status) values (_agent, 'verified');
  insert into public.staff_hub_verifications (user_id, outcome, person_present, nin_document_checked, nin_matches_profile, photo_matches_person, verified_by)
  values (_agent, 'passed', true, true, true, true, _boss);
  update public.profiles set onboarded_by = _agent, onboarded_at = now() where id = _new;
  update public.profiles set onboarded_by = _agent, onboarded_at = now() - interval '13 months' where id = _old;

  -- A referred customer books a pickup: it goes to their agent, who is notified. (This used to crash the booking.)
  insert into public.orders (customer_id, source, status, pickup_fare_kobo, delivery_fare_kobo, pickup_lat, pickup_lng)
  values (_new, 'one_time', 'awaiting_dispatch', 0, 0, 6.2, 7.07) returning id into _o;
  perform pg_temp.check((select pickup_agent_id = _agent and status = 'agent_assigned' from public.orders where id = _o), 'commission: a referred customer''s pickup goes to their agent');
  perform pg_temp.check(exists (select 1 from public.user_notifications where user_id = _agent and order_id = _o and kind = 'job'), 'commission: the agent is told about the pickup');
  -- Clothes handed in at the hub (no pickup location) are not given to the agent.
  update public.profiles set onboarded_by = _agent, onboarded_at = now() where id = _plain;
  insert into public.orders (customer_id, source, status, pickup_fare_kobo, delivery_fare_kobo)
  values (_plain, 'walk_in', 'agent_arrived', 0, 0) returning id into _o;
  perform pg_temp.check((select pickup_agent_id is null from public.orders where id = _o), 'commission: walk-ins are not assigned to an agent');
  update public.profiles set onboarded_by = null, onboarded_at = null where id = _plain;

  -- ₦25,000 from a customer who joined this month: earns commission.
  _o := pg_temp.delivered_order(_new, 2500000);
  select * into _c from public.commissions where order_id = _o;
  perform pg_temp.check(_c.id is not null and _c.agent_id = _agent, 'commission: earned on a ₦25,000 order from a new referral');
  perform pg_temp.check(_c.amount_kobo = round(2500000 * _rate)::bigint, format('commission: amount is %s%% of the bill (%s kobo, got %s)', _rate * 100, round(2500000 * _rate), _c.amount_kobo));
  perform pg_temp.check(_c.status = 'pending' and _c.release_at > now(), 'commission: held as pending until the complaint window passes');

  -- Exactly ₦20,000: the minimum counts.
  _o := pg_temp.delivered_order(_new, 2000000);
  perform pg_temp.check(exists (select 1 from public.commissions where order_id = _o), 'commission: earned on exactly ₦20,000');

  -- ₦19,999.99: below the minimum.
  _o := pg_temp.delivered_order(_new, 1999999);
  perform pg_temp.check(not exists (select 1 from public.commissions where order_id = _o), 'commission: nothing below ₦20,000');

  -- Customer who joined 13 months ago: outside the 12-month window.
  _o := pg_temp.delivered_order(_old, 2500000);
  perform pg_temp.check(not exists (select 1 from public.commissions where order_id = _o), 'commission: nothing after 12 months');

  -- Customer nobody referred.
  _o := pg_temp.delivered_order(_plain, 2500000);
  perform pg_temp.check(not exists (select 1 from public.commissions where order_id = _o), 'commission: nothing for customers with no agent');
end $t$;

do $$ begin raise notice 'ALL MONEY TESTS PASSED'; end $$;
rollback;
