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

  -- Before the start-up capital is recovered, nothing is earned (even on a big order).
  delete from public.settings where key = 'capital_recovered';
  if not private.unlocked() then
    _o := pg_temp.delivered_order(_new, 2500000);
    perform pg_temp.check(not exists (select 1 from public.commissions where order_id = _o), 'commission: nothing before the start-up capital is recovered');
  end if;
  -- From here on, pretend the capital was recovered a minute before this test started.
  insert into public.settings (key, value) values ('capital_recovered', jsonb_build_object('at', now() - interval '1 minute'))
  on conflict (key) do update set value = excluded.value;
  -- An order delivered before recovery still never earns.
  insert into public.orders (customer_id, source, status, pickup_fare_kobo, delivery_fare_kobo)
  values (_new, 'one_time', 'received', 0, 0) returning id into _o;
  insert into public.order_items (order_id, name, qty, unit_price_kobo) values (_o, 'Money test bundle', 1, 2500000);
  insert into public.payments (order_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id)
  values (_o, _new, 'items', 'payment', 'paystack', 2500000, 'MONEYTEST-OLD-' || _o, 'success', private.online_money_point());
  update public.orders set delivered_at = now() - interval '1 day' where id = _o;
  perform pg_temp.check(not exists (select 1 from public.commissions where order_id = _o), 'commission: an order delivered before recovery never earns');

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

  -- Withdrawing: the agent asks in the app, 10% stays for running costs.
  update public.profiles set full_name = 'Money Test Agent' where id = _agent;
  update public.staff_profiles set bank_name = 'Test Bank', bank_account_number = '0123456789', bank_account_name = 'Money Test Agent' where user_id = _agent;
  update public.commissions set status = 'approved' where agent_id = _agent and status = 'pending';
  perform pg_temp.act_as(_agent);
  declare _w jsonb; _r jsonb; _gross bigint;
  begin
    select coalesce(sum(amount_kobo), 0) into _gross from public.commissions where agent_id = _agent and status = 'approved' and payout_id is null;
    _w := public.my_commission_wallet();
    perform pg_temp.check((_w->>'available_kobo')::bigint = _gross and (_w->>'bank_ok')::boolean, format('withdraw: wallet shows %s kobo available', _gross));
    perform pg_temp.check((_w->>'fee_kobo')::bigint = round(_gross * 0.10) and (_w->>'net_kobo')::bigint = _gross - round(_gross * 0.10), 'withdraw: wallet shows the 10% kept and what the agent receives');
    _r := public.request_commission_withdrawal();
    perform pg_temp.check((select gross_kobo = _gross and running_costs_kobo = round(_gross * 0.10) and amount_kobo = _gross - round(_gross * 0.10) and status = 'pending'
                             from public.commission_payouts where id = (_r->>'payout_id')::uuid), 'withdraw: payout is the total minus 10%, waiting for approval');
    perform pg_temp.check(not exists (select 1 from public.commissions where agent_id = _agent and status = 'approved' and payout_id is null), 'withdraw: every approved commission is in the payout');
    perform pg_temp.expect_error('select public.request_commission_withdrawal()', 'withdrawal_already_pending', 'withdraw: only one request at a time');
  end;
  perform pg_temp.act_as(_new);
  perform pg_temp.expect_error('select public.request_commission_withdrawal()', 'not_allowed', 'withdraw: customers cannot withdraw');
end $t$;

-- ---------- 5. Weekly team target ----------
do $t$
declare
  _owner uuid := (select nullif(value->>'user_id', '')::uuid from public.settings where key = 'weekly_target_owner');
  _boss uuid := pg_temp.new_user('Money test other super admin');
  _desk uuid := pg_temp.new_user('Money test desk 3');
  _cust uuid := pg_temp.new_user('Money test team customer');
  _m1 uuid := pg_temp.new_user('Money test washer A');
  _m2 uuid := pg_temp.new_user('Money test washer B');
  _w date := date_trunc('week', private.today_lagos())::date;
  _before int; _n int; _gross bigint; _fee bigint; _r jsonb; _order uuid; _item uuid; _cash uuid; _station uuid; _pay jsonb;
begin
  perform pg_temp.check(_owner is not null, 'team target: owner account is set');
  insert into public.user_roles (user_id, role) values (_boss, 'super_admin'), (_desk, 'secretary');
  insert into public.user_roles (user_id, role) values (_m1, 'washer'), (_m2, 'washer');
  insert into public.staff_pay (user_id, base_salary_kobo, active, earns_weekly_bonus) values (_m1, 5000000, true, true), (_m2, 5000000, true, true);
  select id into _station from public.zones where kind = 'area' and is_live and centre_lat is not null order by name limit 1;
  insert into public.staff_profiles (user_id, station_zone_id) values (_desk, _station);
  select id into _cash from public.money_points where active and kind = 'cash' order by name limit 1;
  select i.id into _item from public.items i where i.active and private.service_price_kobo(i.id, 'dry_clean') > 0 order by i.name limit 1;
  delete from public.team_weekly_targets where week_start = _w;
  _before := private.team_week_units(_w);
  select count(*) into _n from private.team_target_members();
  _gross := floor(10000000::numeric / _n); _fee := round(_gross * 0.10);

  perform pg_temp.act_as(_boss);
  perform pg_temp.expect_error(format('select public.set_team_weekly_target(%L, 100, 10000000)', _w), 'not_weekly_target_owner', 'team target: only the owner account can set it');
  perform pg_temp.act_as(_owner);
  if _before >= 1 then
    perform pg_temp.expect_error(format('select public.set_team_weekly_target(%L, %s, 10000000)', _w, _before), 'target_already_reached', 'team target: cannot set a target the team has already reached');
  end if;
  _r := public.set_team_weekly_target(_w, _before + 3, 10000000);
  perform pg_temp.check((_r->>'members')::int = _n and (_r->>'share_net_kobo')::bigint = _gross - _fee, format('team target: %s members, each would get %s kobo after 10%%', _n, _gross - _fee));
  perform pg_temp.check((select count(*) from public.email_outbox where template = 'weekly_target_set' and user_id in (_m1, _m2)) = 2, 'team target: members are emailed when it is set');
  _r := public.set_team_weekly_target(_w, _before + 4, 10000000);
  perform pg_temp.check((select count(*) from public.email_outbox where template = 'weekly_target_set' and user_id = _m1 and (payload->>'updated')::boolean) = 1, 'team target: members are emailed again when it changes');

  perform pg_temp.act_as(_m1);
  _pay := public.my_pay_overview();
  perform pg_temp.check((_pay->'team'->>'target_units')::int = _before + 4 and (_pay->>'weekly_enabled')::boolean, 'team target: members see it on their home page');

  -- 3 items in: not yet (target is +4).
  perform pg_temp.act_as(_desk);
  _order := public.desk_create_walkin_order(_cust, 'team target test');
  perform public.desk_set_item(_order, _item, 3, 'dry_clean');
  perform public.desk_submit_count(_order);
  perform public.desk_record_payment(_order, 'cash', _cash, null);
  perform pg_temp.check(private.team_week_units(_w) = _before + 3, 'team target: clothes entering the wash queue count automatically');
  perform pg_temp.check((select status from public.team_weekly_targets where week_start = _w) = 'open', 'team target: not hit one item short');
  -- One more item: hit.
  _order := public.desk_create_walkin_order(_cust, 'team target test 2');
  perform public.desk_set_item(_order, _item, 1, 'dry_clean');
  perform public.desk_submit_count(_order);
  perform public.desk_record_payment(_order, 'cash', _cash, null);
  perform pg_temp.check((select status from public.team_weekly_targets where week_start = _w) = 'hit', 'team target: hit the moment the team reaches it');
  perform pg_temp.check((select count(*) from public.weekly_payouts where week_start = _w) = _n, 'team target: every member gets a share');
  perform pg_temp.check((select bool_and(gross_kobo = _gross and running_costs_kobo = _fee and amount_kobo = _gross - _fee) from public.weekly_payouts where week_start = _w), 'team target: equal shares, 10% kept');
  perform pg_temp.check((select count(*) from public.email_outbox where template = 'weekly_target_hit' and user_id in (_m1, _m2)) = 2, 'team target: members are emailed when it is hit');
  perform pg_temp.act_as(_owner);
  perform pg_temp.expect_error(format('select public.set_team_weekly_target(%L, 999, 10000000)', _w), 'target_already_hit', 'team target: cannot be changed once hit');
end $t$;

-- ---------- 6. Savings ----------
do $t$
declare
  _boss uuid := pg_temp.new_user('Money test savings admin');
  _s uuid := pg_temp.new_user('Money test saver');
  _m date := date_trunc('month', private.today_lagos())::date;
  _sv jsonb; _paid bigint;
begin
  insert into public.user_roles (user_id, role) values (_boss, 'super_admin'), (_s, 'washer');
  insert into public.staff_pay (user_id, base_salary_kobo, active) values (_s, 10000000, true);
  perform pg_temp.act_as(_s);
  _sv := public.my_savings();
  perform pg_temp.check((_sv->>'pct')::int = 10 and (_sv->>'balance_kobo')::bigint = 0, 'savings: starts at 10%');
  perform pg_temp.expect_error('select public.set_my_savings_rate(12)', 'invalid_savings_rate', 'savings: only 15% or 20%');
  perform public.set_my_savings_rate(15);
  perform pg_temp.expect_error('select public.set_my_savings_rate(15)', 'savings_rate_cannot_decrease', 'savings: same rate again is refused');
  perform pg_temp.expect_error(format('update public.staff_pay set savings_pct = 10 where user_id = %L', _s), 'savings_rate_cannot_decrease', 'savings: nobody can lower a rate, even directly');
  perform pg_temp.expect_error(format('select public.confirm_salaries(%L, %L)', _m, jsonb_build_array(jsonb_build_object('staff_id', _s, 'salary_kobo', 10000000))), 'not_super_admin', 'savings: staff cannot confirm salaries');

  perform pg_temp.act_as(_boss);
  delete from public.salary_months where month = _m;
  perform public.confirm_salaries(_m, jsonb_build_array(jsonb_build_object('staff_id', _s, 'salary_kobo', 10000000)));
  perform pg_temp.check((select amount_kobo = 1500000 and take_home_kobo = 8500000 from public.savings_entries where staff_id = _s and kind = 'deposit'), 'savings: ₦100,000 salary at 15% saves ₦15,000, take-home ₦85,000');
  perform pg_temp.expect_error(format('select public.confirm_salaries(%L, %L)', _m, jsonb_build_array(jsonb_build_object('staff_id', _s, 'salary_kobo', 10000000))), 'month_already_confirmed', 'savings: a month cannot be confirmed twice');

  perform pg_temp.act_as(_s);
  perform pg_temp.expect_error(format('select public.give_notice(%L, null)', private.today_lagos() + 30), 'notice_too_short', 'savings: notice must be at least two months');
  perform public.give_notice((private.today_lagos() + interval '2 months')::date, 'Moving city');
  perform pg_temp.act_as(_boss);
  perform pg_temp.expect_error(format('select public.pay_out_savings(%L, %L)', _s, 'Transfer 123'), 'savings_not_due', 'savings: not paid before the last day');
  perform public.record_dismissal(_s, 'Test dismissal');
  _paid := public.pay_out_savings(_s, 'Transfer 123');
  perform pg_temp.check(_paid = 1500000 and private.savings_balance(_s) = 0, 'savings: a dismissed person is paid their full savings');
  perform pg_temp.expect_error(format('select public.pay_out_savings(%L, %L)', _s, 'Transfer 124'), 'savings_already_paid', 'savings: cannot be paid twice');
end $t$;


-- ---------- 7. Shelves, end to end: drop-off, wash, shelve, move, collect, deliver, fail, cancel ----------
do $t$
declare
  _desk uuid := pg_temp.new_user('Shelf test desk');
  _washer uuid := pg_temp.new_user('Shelf test washer');
  _far uuid := pg_temp.new_user('Shelf test washer elsewhere');
  _cust uuid := pg_temp.new_user('Shelf test customer');
  _station uuid; _other uuid; _cash uuid; _item uuid; _o1 uuid; _o2 uuid; _o3 uuid; _board jsonb; _n int;
begin
  select id into _station from public.zones where kind = 'area' and is_live and centre_lat is not null order by name limit 1;
  select id into _other from public.zones where id <> _station order by name limit 1;
  select id into _cash from public.money_points where active and kind = 'cash' order by name limit 1;
  select i.id into _item from public.items i where i.active and private.service_price_kobo(i.id, 'dry_clean') > 0 order by i.name limit 1;
  perform pg_temp.check(_station is not null and _other is not null and _cash is not null and _item is not null, 'shelves: fixtures exist');
  insert into public.user_roles (user_id, role) values (_desk, 'secretary'), (_washer, 'washer'), (_far, 'washer');
  insert into public.staff_profiles (user_id, station_zone_id) values (_desk, _station), (_washer, _station), (_far, _other);

  -- Three walk-in orders, counted, paid in cash and washing.
  perform pg_temp.act_as(_desk);
  _o1 := public.desk_create_walkin_order(_cust, 'shelf test 1');
  _o2 := public.desk_create_walkin_order(_cust, 'shelf test 2');
  _o3 := public.desk_create_walkin_order(_cust, 'shelf test 3');
  perform public.desk_set_item(_o1, _item, 2, 'dry_clean'); perform public.desk_submit_count(_o1); perform public.desk_record_payment(_o1, 'cash', _cash, null);
  perform public.desk_set_item(_o2, _item, 1, 'dry_clean'); perform public.desk_submit_count(_o2); perform public.desk_record_payment(_o2, 'cash', _cash, null);
  perform public.desk_set_item(_o3, _item, 1, 'dry_clean'); perform public.desk_submit_count(_o3); perform public.desk_record_payment(_o3, 'cash', _cash, null);
  perform pg_temp.check((select count(*) from public.orders where id in (_o1, _o2, _o3) and status = 'received') = 3, 'shelves: three paid walk-ins in the wash queue');

  -- The washer at this station starts and finishes them; a washer at another station cannot.
  perform pg_temp.act_as(_washer);
  perform public.start_washing(_o1); perform public.start_washing(_o2); perform public.start_washing(_o3);
  perform pg_temp.act_as(_far);
  perform pg_temp.expect_error(format('select public.mark_ready(%L, %L::text[])', _o1, '{A1}'), 'not_allowed', 'shelves: a washer at another station cannot mark it ready');
  perform pg_temp.act_as(_washer);
  perform pg_temp.expect_error(format('select public.mark_ready(%L, %L::text[])', _o1, '{}'), 'shelf_required', 'shelves: Mark ready needs a shelf');
  perform pg_temp.expect_error(format('select public.mark_ready(%L, null::text[])', _o1), 'shelf_required', 'shelves: Mark ready with no list needs a shelf');
  perform pg_temp.expect_error(format('select public.mark_ready(%L, %L::text[])', _o1, '{H1}'), 'invalid_shelf', 'shelves: row H does not exist');
  perform pg_temp.expect_error(format('select public.mark_ready(%L, %L::text[])', _o1, '{A0}'), 'invalid_shelf', 'shelves: shelf 0 does not exist');
  perform pg_temp.expect_error(format('select public.mark_ready(%L, %L::text[])', _o1, '{A1,A2,A3,A4,A5,A6,A7,A8,A9,B1,B2}'), 'too_many_shelves', 'shelves: at most 10 shelves');
  perform pg_temp.check((select status from public.orders where id = _o1) = 'in_house', 'shelves: a refused Mark ready leaves the order being washed');
  perform pg_temp.check(not exists (select 1 from public.order_shelves where order_id = _o1), 'shelves: nothing saved when Mark ready is refused');

  perform public.mark_ready(_o1, array[' a1', 'A1', 'c 4']);
  perform public.mark_ready(_o2, array['C4']);
  perform public.mark_ready(_o3, array['G9']);
  perform pg_temp.check((select count(*) from public.orders where id in (_o1, _o2, _o3) and status = 'ready') = 3, 'shelves: all three ready for collection');
  perform pg_temp.check((select array_agg(shelf order by shelf) from public.order_shelves where order_id = _o1 and released_at is null) = array['A1', 'C4'],
    'shelves: one order on two shelves, cleaned, no duplicates');
  perform pg_temp.check((select count(*) from public.order_shelves where shelf = 'C4' and released_at is null and order_id in (_o1, _o2)) = 2, 'shelves: one shelf holds two orders');
  perform pg_temp.check(exists (select 1 from public.order_events where order_id = _o1 and event = 'shelved' and actor_id = _washer), 'shelves: who shelved it is recorded');

  -- Washers see the map without customer names; desk staff see names.
  _board := public.shelf_board();
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(_board) e where (e->>'order_id')::uuid = _o3 and e->>'shelf' = 'G9' and e->>'customer' is null), 'shelves: washer map has no customer names');
  perform pg_temp.act_as(_desk);
  _board := public.shelf_board();
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(_board) e where (e->>'order_id')::uuid = _o1 and e->>'shelf' = 'C4' and e->>'customer' is not null and (e->>'pieces')::int = 2),
    'shelves: desk map shows order, customer and pieces');

  -- Move order 1 to B2: A1 and C4 are freed, order 2 stays on C4.
  perform public.set_order_shelves(_o1, array['B2']);
  perform pg_temp.check((select array_agg(shelf) from public.order_shelves where order_id = _o1 and released_at is null) = array['B2'], 'shelves: order 1 moved to B2');
  perform pg_temp.check(exists (select 1 from public.order_shelves where order_id = _o2 and shelf = 'C4' and released_at is null), 'shelves: moving one order leaves the other on C4');

  -- Customers can see their own order's shelf, but cannot move shelves or see the map.
  perform pg_temp.act_as(_cust);
  perform pg_temp.expect_error(format('select public.set_order_shelves(%L, %L::text[])', _o1, '{A1}'), 'not_allowed', 'shelves: customers cannot move shelves');
  perform pg_temp.expect_error('select public.shelf_board()', 'not_allowed', 'shelves: customers cannot see the shelf map');

  -- Order 1: the customer collects at the desk, and B2 is freed.
  perform pg_temp.act_as(_desk);
  perform public.desk_handover(_o1);
  perform pg_temp.check((select status from public.orders where id = _o1) = 'delivered', 'shelves: order 1 handed over at the desk');
  perform pg_temp.check(not exists (select 1 from public.order_shelves where order_id = _o1 and released_at is null), 'shelves: B2 freed when order 1 is collected');
  perform pg_temp.expect_error(format('select public.set_order_shelves(%L, %L::text[])', _o1, '{A1}'), 'wrong_state', 'shelves: a collected order cannot be put back on a shelf');

  -- Order 2: goes out for delivery (still on C4 until delivered), fails, comes back, is moved, then delivered.
  perform pg_temp.act_as(null);
  update public.orders set status = 'out_for_delivery' where id = _o2;
  perform pg_temp.check(exists (select 1 from public.order_shelves where order_id = _o2 and shelf = 'C4' and released_at is null), 'shelves: kept while out for delivery');
  update public.orders set status = 'failed_delivery' where id = _o2;
  perform pg_temp.act_as(_desk);
  perform public.set_order_shelves(_o2, array['D5']);
  perform pg_temp.check((select array_agg(shelf) from public.order_shelves where order_id = _o2 and released_at is null) = array['D5'], 'shelves: failed delivery put back on D5');
  perform pg_temp.act_as(null);
  update public.orders set status = 'delivered', delivered_at = now() where id = _o2;
  perform pg_temp.check(not exists (select 1 from public.order_shelves where order_id = _o2 and released_at is null), 'shelves: D5 freed on delivery');

  -- Order 3: cancelled, G9 is freed.
  update public.orders set status = 'cancelled' where id = _o3;
  perform pg_temp.check(not exists (select 1 from public.order_shelves where order_id = _o3 and released_at is null), 'shelves: G9 freed when cancelled');

  -- History is kept: every shelf each order was on.
  select count(*) into _n from public.order_shelves where order_id in (_o1, _o2, _o3);
  perform pg_temp.check(_n = 6, format('shelves: full history kept (6 entries, got %s)', _n));
end $t$;

do $$ begin raise notice 'ALL MONEY TESTS PASSED'; end $$;
rollback;
