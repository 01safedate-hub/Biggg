-- Cleaning service: accepting quotes, payments, plans, visits, crews, issues, admin settings, daily upkeep.

-- ---------- Plan visit generation ----------
-- Months in a term.
create or replace function private.cl_term_months(_term text) returns integer
language sql immutable as $$
  select case _term when 'three_month' then 3 when 'six_month' then 6 when 'yearly' then 12 else 1 end
$$;

-- Creates plan visits on the chosen weekday, up to the planning horizon and never past the paid term.
-- Each billing month (counted from the period start) gets exactly the plan's number of visits.
create or replace function private.cl_generate_visits(_sub uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare _s public.cleaning_subscriptions; _horizon date := (now() at time zone 'Africa/Lagos')::date + private.cl_int('plan_horizon_days', 42)::int;
        _step integer; _d date; _last date; _cycle_start date; _cycle_idx integer; _count integer; _made integer := 0; _deep boolean; _first_in_cycle boolean;
        _pr public.cleaning_properties;
begin
  select * into _s from public.cleaning_subscriptions where id = _sub for update;
  if not found or _s.status <> 'active' or _s.current_period_end is null then return 0; end if;
  select * into _pr from public.cleaning_properties where id = _s.property_id;
  _step := greatest(1, floor(28.0 / _s.visits_per_month))::int;
  select max(scheduled_date) into _last from public.cleaning_visits where subscription_id = _sub and kind in ('plan', 'plan_first');
  _d := coalesce(_last + _step, _s.start_date);
  -- keep the weekday: move forward to the plan's weekday when the step is a whole number of weeks
  if _step % 7 = 0 then
    while extract(isodow from _d)::int <> _s.weekday loop _d := _d + 1; end loop;
  end if;
  while _d <= least(_horizon, _s.current_period_end) loop
    if extract(isodow from _d) = 7 then _d := _d + 1; continue; end if;
    if _s.paused_from is not null and _d between _s.paused_from and coalesce(_s.paused_until, _s.paused_from) then _d := _d + _step; continue; end if;
    _cycle_idx := (extract(year from age(_d, _s.start_date)) * 12 + extract(month from age(_d, _s.start_date)))::int;
    _cycle_start := (_s.start_date + make_interval(months => _cycle_idx))::date;
    -- the paid first deep clean is extra; only regular plan visits fill the month
    select count(*) into _count from public.cleaning_visits
     where subscription_id = _sub and kind = 'plan' and status not in ('cancelled')
       and scheduled_date >= _cycle_start and scheduled_date < (_cycle_start + interval '1 month')::date;
    _first_in_cycle := _count = 0;
    if _count < _s.visits_per_month and not exists (select 1 from public.cleaning_visits where subscription_id = _sub and scheduled_date = _d and status <> 'cancelled') then
      _deep := _s.deep_every_months is not null and _cycle_idx > 0 and _cycle_idx % _s.deep_every_months = 0 and _first_in_cycle;
      insert into public.cleaning_visits (customer_id, property_id, subscription_id, quote_id, kind, service, scheduled_date, time_window,
        crew_size, duration_min, zone_id, status, bundle_laundry)
      values (_s.customer_id, _s.property_id, _sub, _s.quote_id, 'plan', case when _deep then 'deep' else _s.service end, _d, _s.time_window,
        _s.crew_size, case when _deep then coalesce(_s.deep_duration_min, _s.duration_min) else _s.duration_min end, _pr.zone_id, 'scheduled', _s.bundle);
      _made := _made + 1;
    end if;
    _d := _d + _step;
  end loop;
  return _made;
end $$;

-- Home Complete: free laundry pickups and delivery while the cleaning plan is paid up.
create or replace function private.cl_sync_bundle_waiver(_sub uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare _s public.cleaning_subscriptions; _end timestamptz; _w uuid;
begin
  select * into _s from public.cleaning_subscriptions where id = _sub;
  if not found or not _s.bundle then return; end if;
  _end := ((_s.current_period_end + 1)::timestamp at time zone 'Africa/Lagos');
  if _s.bundle_waiver_id is not null and exists (select 1 from public.transport_waivers where id = _s.bundle_waiver_id and active) then
    update public.transport_waivers set ends_at = _end where id = _s.bundle_waiver_id;
  elsif _s.status = 'active' then
    insert into public.transport_waivers (label, service, scope, customer_id, legs, starts_at, ends_at, created_by)
    values ('Home Complete (cleaning + laundry)', 'laundry', 'customer', _s.customer_id, 'both', now(), _end, auth.uid())
    returning id into _w;
    update public.cleaning_subscriptions set bundle_waiver_id = _w where id = _sub;
  end if;
end $$;

-- ---------- Customer: view and accept a quote ----------
create or replace function public.cleaning_quote_for_customer(_quote uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _q public.cleaning_quotes; _pr public.cleaning_properties; _pt public.cleaning_plan_types; _crew integer; _dur integer;
begin
  select * into _q from public.cleaning_quotes where id = _quote and (customer_id = auth.uid() or private.is_cleaning_staff());
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _q.status = 'sent' and _q.valid_until < now() then
    update public.cleaning_quotes set status = 'expired', updated_at = now() where id = _quote;
    _q.status := 'expired';
  end if;
  select * into _pr from public.cleaning_properties where id = _q.property_id;
  select * into _pt from public.cleaning_plan_types where id = _q.plan_type_id;
  _crew := _q.crew_size; _dur := case when _q.kind = 'plan' then coalesce(_q.deep_duration_min, _q.duration_min) else _q.duration_min end;
  return jsonb_build_object('quote', to_jsonb(_q) - 'created_by' - 'approved_by', 'property', jsonb_build_object('address', _pr.address, 'kind', _pr.kind, 'zone_id', _pr.zone_id),
    'plan', case when _pt.id is null then null else jsonb_build_object('name', _pt.name, 'blurb', _pt.blurb, 'deep_every_months', _pt.deep_every_months) end,
    'total_kobo', private.cl_quote_total(_q), 'credit_kobo', _q.inspection_credit_kobo,
    'deposit_allowed', _q.kind = 'one_off' and private.cl_quote_total(_q) >= private.cl_int('deposit_threshold_kobo', 10000000),
    'deposit_pct', private.cl_int('deposit_pct', 50), 'term_discounts', private.cl_set()->'term_discounts',
    'first_visit', jsonb_build_object('crew_size', _crew, 'duration_min', _dur),
    'open_invoice', (select jsonb_build_object('id', i.id, 'amount_kobo', i.amount_kobo) from public.cleaning_invoices i where i.quote_id = _quote and i.purpose = 'quote' and i.status = 'open' order by i.created_at desc limit 1));
end $$;

create or replace function public.cleaning_accept_quote(_quote uuid, _p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _q public.cleaning_quotes; _pr public.cleaning_properties; _d date := nullif(_p->>'date', '')::date; _win text := coalesce(nullif(_p->>'window', ''), 'morning');
        _term text := coalesce(nullif(_p->>'term', ''), 'monthly'); _deposit boolean := coalesce((_p->>'deposit')::boolean, false);
        _crew integer; _dur integer; _visit uuid; _sub uuid; _amount bigint; _months integer; _tdisc numeric; _term_amt bigint; _inv uuid;
        _first bigint; _desc text; _balance bigint := 0; _today date := (now() at time zone 'Africa/Lagos')::date;
        _hold integer := private.cl_int('hold_minutes', 30)::int; _pay_now bigint;
begin
  if auth.uid() is null then raise exception 'auth_required' using errcode = 'P0001'; end if;
  select * into _q from public.cleaning_quotes where id = _quote and customer_id = auth.uid() for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _q.status <> 'sent' then raise exception 'cleaning_quote_not_open' using errcode = 'P0001'; end if;
  if _q.valid_until < now() then
    update public.cleaning_quotes set status = 'expired', updated_at = now() where id = _quote;
    raise exception 'cleaning_quote_expired' using errcode = 'P0001';
  end if;
  if _d is null or _d <= _today or _d > _today + 60 or extract(isodow from _d) = 7 then raise exception 'slot_invalid' using errcode = 'P0001'; end if;
  if _win not in ('morning', 'afternoon') then raise exception 'slot_invalid' using errcode = 'P0001'; end if;
  select * into _pr from public.cleaning_properties where id = _q.property_id;
  -- Release any earlier attempt on this quote.
  update public.cleaning_visits set status = 'cancelled', cancelled_reason = 'replaced_by_new_choice' where quote_id = _quote and status = 'held';
  update public.cleaning_invoices set status = 'void' where quote_id = _quote and purpose = 'quote' and status = 'open';
  delete from public.cleaning_subscriptions where quote_id = _quote and status = 'pending_payment';
  _crew := _q.crew_size;
  _dur := case when _q.kind = 'plan' then coalesce(_q.deep_duration_min, _q.duration_min) else _q.duration_min end;
  perform pg_advisory_xact_lock(hashtext('cleaning-day:' || _d::text));
  if not private.cl_fits(_d, _crew, _dur) then raise exception 'slot_unavailable' using errcode = 'P0001'; end if;

  if _q.kind = 'one_off' then
    _amount := _q.visit_price_kobo;
    if _deposit then
      if _amount < private.cl_int('deposit_threshold_kobo', 10000000) then raise exception 'invalid_step' using errcode = 'P0001'; end if;
      _pay_now := private.cl_round(_amount * private.cl_int('deposit_pct', 50) / 100.0, 5000);
      _balance := _amount - _pay_now;
    else
      _pay_now := _amount;
    end if;
    insert into public.cleaning_visits (customer_id, property_id, quote_id, kind, service, scheduled_date, time_window, crew_size, duration_min,
      zone_id, status, hold_until, balance_due_kobo, created_by)
    values (_q.customer_id, _q.property_id, _quote, 'one_off', _q.service, _d, _win, _crew, _dur, _pr.zone_id, 'held', now() + make_interval(mins => _hold), _balance, auth.uid())
    returning id into _visit;
    _desc := 'Cleaning (quote #' || _q.quote_no || ') on ' || to_char(_d, 'Dy DD Mon') || case when _deposit then ', ' || private.cl_int('deposit_pct', 50) || '% deposit' else '' end;
  else
    if _term not in ('monthly', 'three_month', 'six_month', 'yearly') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
    _months := private.cl_term_months(_term);
    _tdisc := coalesce((private.cl_set()->'term_discounts'->>_term)::numeric, 0);
    _term_amt := private.cl_round(_q.monthly_kobo * _months * (1 - _tdisc / 100), 50000);
    _first := coalesce(_q.first_deep_kobo, 0);
    _pay_now := _first + _term_amt;
    insert into public.cleaning_subscriptions (customer_id, property_id, quote_id, plan_type_id, service, monthly_kobo, visits_per_month, deep_every_months,
      crew_size, duration_min, deep_duration_min, weekday, time_window, term, start_date, status, bundle)
    select _q.customer_id, _q.property_id, _quote, _q.plan_type_id, _q.service, _q.monthly_kobo, _q.visits_per_month, pt.deep_every_months,
      _q.crew_size, _q.duration_min, _q.deep_duration_min, extract(isodow from _d)::int, _win, _term, _d, 'pending_payment', _q.bundle
      from public.cleaning_plan_types pt where pt.id = _q.plan_type_id
    returning id into _sub;
    if _sub is null then raise exception 'plan_not_found' using errcode = 'P0001'; end if;
    insert into public.cleaning_visits (customer_id, property_id, quote_id, subscription_id, kind, service, scheduled_date, time_window, crew_size, duration_min,
      zone_id, status, hold_until, bundle_laundry, created_by)
    values (_q.customer_id, _q.property_id, _quote, _sub, 'plan_first', 'deep', _d, _win, _crew, _dur, _pr.zone_id, 'held', now() + make_interval(mins => _hold), _q.bundle, auth.uid())
    returning id into _visit;
    _desc := 'Cleaning plan (quote #' || _q.quote_no || '): first deep clean + ' || _months || ' month' || case when _months > 1 then 's' else '' end || ' from ' || to_char(_d, 'DD Mon');
  end if;

  _pay_now := greatest(0, _pay_now - _q.inspection_credit_kobo);
  if _pay_now = 0 then
    insert into public.cleaning_invoices (customer_id, purpose, quote_id, subscription_id, visit_id, amount_kobo, description, detail, status, paid_at)
    values (_q.customer_id, 'quote', _quote, _sub, _visit, 1, _desc, jsonb_build_object('term', _term, 'deposit', _deposit, 'balance_kobo', _balance, 'covered_by_credit', true), 'paid', now())
    returning id into _inv;
    perform private.cl_invoice_paid(_inv, 'credit');
    return jsonb_build_object('invoice_id', _inv, 'amount_kobo', 0, 'paid', true, 'visit_id', _visit, 'subscription_id', _sub);
  end if;
  insert into public.cleaning_invoices (customer_id, purpose, quote_id, subscription_id, visit_id, amount_kobo, description, detail)
  values (_q.customer_id, 'quote', _quote, _sub, _visit, _pay_now, _desc,
          jsonb_build_object('term', _term, 'deposit', _deposit, 'balance_kobo', _balance, 'credit_kobo', _q.inspection_credit_kobo, 'hold_until', now() + make_interval(mins => _hold)))
  returning id into _inv;
  perform private.cl_event('quote', _quote, 'accept_started', jsonb_build_object('invoice', _inv, 'date', _d, 'term', _term));
  return jsonb_build_object('invoice_id', _inv, 'amount_kobo', _pay_now, 'paid', false, 'visit_id', _visit, 'subscription_id', _sub, 'hold_minutes', _hold);
end $$;

create or replace function public.cleaning_decline_quote(_quote uuid, _reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare _q public.cleaning_quotes;
begin
  select * into _q from public.cleaning_quotes where id = _quote and customer_id = auth.uid() for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _q.status not in ('sent', 'expired') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  update public.cleaning_quotes set status = 'declined', declined_reason = left(nullif(trim(coalesce(_reason, '')), ''), 300), updated_at = now() where id = _quote;
  update public.cleaning_visits set status = 'cancelled', cancelled_reason = 'quote_declined' where quote_id = _quote and status = 'held';
  update public.cleaning_invoices set status = 'void' where quote_id = _quote and status = 'open';
  update public.cleaning_requests set status = 'lost', lost_reason = coalesce(nullif(trim(coalesce(_reason, '')), ''), 'Declined by customer'), updated_at = now() where id = _q.request_id;
  perform private.cl_event('quote', _quote, 'declined', jsonb_build_object('reason', _reason));
  perform private.cl_notify_admin('Cleaning quote #' || _q.quote_no || ' declined', jsonb_build_array('Reason: ' || coalesce(nullif(trim(coalesce(_reason, '')), ''), 'not given')),
    '/staff/cleaning/requests/' || _q.request_id, 'cleaning-quote-declined-' || _quote);
end $$;

-- ---------- Payments ----------
create or replace function public.create_cleaning_payment_intent(_invoice uuid, _provider text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _i public.cleaning_invoices; _mp uuid; _ref text; _p public.profiles;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  if _provider not in ('paystack', 'flutterwave') then raise exception 'invalid_provider' using errcode = 'P0001'; end if;
  select * into _i from public.cleaning_invoices where id = _invoice and customer_id = auth.uid() for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _i.status <> 'open' then raise exception 'already_paid' using errcode = 'P0001'; end if;
  if _i.purpose = 'quote' and exists (select 1 from public.cleaning_visits v where v.id = _i.visit_id and v.status = 'held' and v.hold_until < now()) then
    raise exception 'cleaning_hold_expired' using errcode = 'P0001';
  end if;
  _mp := private.online_money_point();
  if _mp is null then raise exception 'no_online_money_point' using errcode = 'P0001'; end if;
  update public.payments set status = 'failed' where cleaning_invoice_id = _invoice and kind = 'payment' and status = 'pending';
  _ref := 'LC-' || upper(substr(replace(_invoice::text, '-', ''), 1, 8)) || '-' || encode(extensions.gen_random_bytes(6), 'hex');
  insert into public.payments (customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id, note, cleaning_invoice_id)
  values (auth.uid(), 'cleaning', 'payment', _provider, _i.amount_kobo, _ref, 'pending', _mp, left(_i.description, 200), _invoice);
  select * into _p from public.profiles where id = auth.uid();
  return jsonb_build_object('reference', _ref, 'amount_kobo', _i.amount_kobo, 'email', _p.email, 'name', _p.full_name, 'phone', _p.phone, 'description', _i.description);
end $$;

-- Cash, transfer or POS at the desk, for anyone (including walk-in customers without online accounts).
create or replace function public.cleaning_desk_pay(_invoice uuid, _mode text, _money_point uuid, _note text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _i public.cleaning_invoices; _ref text;
begin
  if not private.is_money_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if _mode not in ('cash', 'transfer', 'pos') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.money_points where id = _money_point and active and kind <> 'online') then raise exception 'money_point_required' using errcode = 'P0001'; end if;
  if _mode <> 'cash' and length(trim(coalesce(_note, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  select * into _i from public.cleaning_invoices where id = _invoice for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _i.status <> 'open' then raise exception 'already_paid' using errcode = 'P0001'; end if;
  update public.payments set status = 'failed' where cleaning_invoice_id = _invoice and kind = 'payment' and status = 'pending';
  _ref := 'DC-' || upper(substr(replace(_invoice::text, '-', ''), 1, 8)) || '-' || encode(extensions.gen_random_bytes(4), 'hex');
  insert into public.payments (customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id, note, recorded_by, paid_at, cleaning_invoice_id)
  values (_i.customer_id, 'cleaning', 'payment', _mode, _i.amount_kobo, _ref, 'success', _money_point, nullif(trim(coalesce(_note, '')), ''), auth.uid(), now(), _invoice);
  perform private.cl_invoice_paid(_invoice, _ref);
  return jsonb_build_object('reference', _ref, 'amount_kobo', _i.amount_kobo);
end $$;

-- What a paid invoice unlocks.
create or replace function private.cl_invoice_paid(_invoice uuid, _reference text) returns void
language plpgsql security definer set search_path = '' as $$
declare _i public.cleaning_invoices; _q public.cleaning_quotes; _s public.cleaning_subscriptions; _months integer; _no bigint; _v public.cleaning_visits;
        _new_end date;
begin
  select * into _i from public.cleaning_invoices where id = _invoice for update;
  if not found then return; end if;
  if _i.status = 'open' then update public.cleaning_invoices set status = 'paid', paid_at = now() where id = _invoice; end if;
  if _i.status = 'void' then
    perform private.cl_event('invoice', _invoice, 'paid_after_void', jsonb_build_object('reference', _reference));
    perform private.cl_notify_admin('Cleaning payment needs review', jsonb_build_array('A payment arrived for a cancelled cleaning invoice. Reference: ' || coalesce(_reference, '')),
      '/staff/cleaning', 'cleaning-void-paid-' || _invoice);
    return;
  end if;
  perform private.cl_event('invoice', _invoice, 'paid', jsonb_build_object('reference', _reference, 'purpose', _i.purpose, 'amount_kobo', _i.amount_kobo));

  if _i.purpose = 'inspection' then
    update public.cleaning_inspections set fee_paid = true, status = case when status = 'awaiting_fee' then 'scheduled' else status end where id = _i.inspection_id;
    -- the fee becomes credit on any quote not yet accepted
    update public.cleaning_quotes q set inspection_credit_kobo = inspection_credit_kobo + _i.amount_kobo
      from public.cleaning_inspections i where i.id = _i.inspection_id and q.request_id = i.request_id and q.status in ('draft', 'awaiting_approval', 'sent');
    return;
  end if;

  if _i.purpose = 'quote' then
    select * into _q from public.cleaning_quotes where id = _i.quote_id for update;
    update public.cleaning_quotes set status = 'accepted', accepted_at = now(), updated_at = now() where id = _q.id;
    update public.cleaning_requests set status = 'accepted', updated_at = now() where id = _q.request_id;
    select * into _v from public.cleaning_visits where id = _i.visit_id;
    if _v.status in ('held', 'cancelled') then
      update public.cleaning_visits set status = 'scheduled', hold_until = null, cancelled_reason = null,
             balance_due_kobo = coalesce((_i.detail->>'balance_kobo')::bigint, 0) where id = _v.id;
      if _v.status = 'cancelled' or not private.cl_fits(_v.scheduled_date, _v.crew_size, _v.duration_min, _v.id) then
        perform private.cl_notify_admin('Paid cleaning visit needs a crew check', jsonb_build_array('Visit on ' || to_char(_v.scheduled_date, 'Dy DD Mon') || ' was paid after its hold expired. Check capacity and assign a crew.'),
          '/staff/cleaning/board', 'cleaning-late-paid-' || _v.id);
      end if;
    end if;
    if _i.subscription_id is not null then
      select * into _s from public.cleaning_subscriptions where id = _i.subscription_id for update;
      _months := private.cl_term_months(_s.term);
      update public.cleaning_subscriptions set status = 'active', current_period_start = start_date,
             current_period_end = (start_date + make_interval(months => _months) - interval '1 day')::date, updated_at = now()
       where id = _s.id;
      perform private.cl_generate_visits(_s.id);
      perform private.cl_sync_bundle_waiver(_s.id);
    end if;
    perform private.cl_notify_customer(_i.customer_id, 'Your cleaning is booked',
      case when _i.subscription_id is not null then 'Your plan is active. Your first visit is a deep clean on ' || to_char(_v.scheduled_date, 'Dy DD Mon') || '. Your arrival code is in My cleaning.'
           else 'Your clean is booked for ' || to_char(_v.scheduled_date, 'Dy DD Mon') || ' (' || _v.time_window || '). Your arrival code is in My cleaning.' end,
      null, '/cleaning/my', 'See my cleaning', 'cleaning-booked-' || _invoice);
    perform private.cl_notify_admin('Cleaning quote #' || _q.quote_no || ' accepted and paid',
      jsonb_build_array('First visit: ' || to_char(_v.scheduled_date, 'Dy DD Mon') || ' (' || _v.time_window || ')', 'Assign a crew on the visit board.'),
      '/staff/cleaning/board', 'cleaning-accepted-' || _invoice);
    return;
  end if;

  if _i.purpose = 'balance' then
    update public.cleaning_visits set balance_due_kobo = 0 where id = _i.visit_id;
    return;
  end if;

  if _i.purpose = 'renewal' then
    select * into _s from public.cleaning_subscriptions where id = _i.subscription_id for update;
    _months := private.cl_term_months(_s.term);
    _new_end := (coalesce(_i.period_start, _s.current_period_end + 1) + make_interval(months => _months) - interval '1 day')::date;
    update public.cleaning_subscriptions set status = 'active', current_period_start = coalesce(_i.period_start, current_period_end + 1),
           current_period_end = _new_end, updated_at = now() where id = _s.id;
    perform private.cl_generate_visits(_s.id);
    perform private.cl_sync_bundle_waiver(_s.id);
    perform private.cl_notify_customer(_i.customer_id, 'Cleaning plan renewed', 'Thank you. Your plan now runs to ' || to_char(_new_end, 'DD Mon YYYY') || '.', null, '/cleaning/my', 'See my cleaning', 'cleaning-renewed-' || _invoice);
    return;
  end if;

  if _i.purpose = 'extra_work' then
    perform private.cl_event('extra', _i.extra_id, 'paid', jsonb_build_object('invoice', _invoice));
  end if;
end $$;

-- settle_online_payment: cleaning payments branch added at the top; the rest is unchanged.
create or replace function public.settle_online_payment(_reference text, _provider text, _amount_kobo bigint)
returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  _pay public.payments; _o public.orders; _paid bigint; _invoice public.subscription_invoices;
  _sub public.subscriptions; _pickup public.subscription_pickups;
begin
  select * into _pay from public.payments where reference=_reference for update;
  if not found or _pay.mode<>_provider then raise exception 'payment_not_found' using errcode='P0001'; end if;
  if _pay.status='success' then return jsonb_build_object('ok',true,'already',true); end if;
  if _pay.amount_kobo<>_amount_kobo then raise exception 'amount_mismatch' using errcode='P0001'; end if;
  update public.payments set status='success',paid_at=now() where id=_pay.id;
  if _pay.purpose='cleaning' then
    perform private.cl_invoice_paid(_pay.cleaning_invoice_id, _reference);
    return jsonb_build_object('ok',true,'cleaning_invoice_id',_pay.cleaning_invoice_id);
  end if;
  if _pay.purpose in ('subscription','extra_clothes') then
    select * into _invoice from public.subscription_invoices where id=_pay.invoice_id for update;
    if not found then raise exception 'subscription_invoice_not_found' using errcode='P0001'; end if;
    select * into _sub from public.subscriptions where id=_invoice.subscription_id for update;
    if not found or _sub.customer_id<>_pay.customer_id then raise exception 'subscription_not_found' using errcode='P0001'; end if;
    if _invoice.status = 'void' then
      insert into public.subscription_events(event, detail) values ('subscription_payment_needs_review',
        jsonb_build_object('reference',_reference,'invoice_id',_invoice.id,'subscription_id',_sub.id,'reason','invoice_void'));
      return jsonb_build_object('ok',true,'needs_review',true);
    end if;
    update public.subscription_invoices set status='paid' where id=_invoice.id;
    if _pay.purpose='subscription' then
      if _sub.status='active' and _invoice.period_start=(_sub.current_period_end at time zone 'Africa/Lagos')::date then
        update public.subscriptions set cancel_at_period_end=false, updated_at=now() where id=_sub.id;
        insert into public.subscription_events(event, detail) values ('subscription_next_term_paid',
          jsonb_build_object('subscription_id',_sub.id,'customer_id',_sub.customer_id,'invoice_id',_invoice.id,
            'plan_id',coalesce(_invoice.plan_id,_sub.plan_id),'starts_on',_invoice.period_start));
        perform private.roll_subscription(_sub.id);
      elsif _sub.status in ('pending','expired')
            and exists (select 1 from public.plans p where p.id = coalesce(_invoice.plan_id, _sub.plan_id) and p.requires_student_id)
            and private.student_status(_sub.customer_id) <> 'approved' then
        update public.subscriptions set status = 'pending_review', plan_id = coalesce(_invoice.plan_id, plan_id),
               billing_period = coalesce(_invoice.billing_period, billing_period), price_kobo = coalesce(_invoice.monthly_price_kobo, price_kobo),
               term_amount_kobo = _invoice.amount_kobo, updated_at = now() where id = _sub.id;
        insert into public.subscription_events(event, detail) values ('subscription_pending_review',
          jsonb_build_object('subscription_id',_sub.id,'customer_id',_sub.customer_id,'invoice_id',_invoice.id));
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
  elsif _pay.purpose='delivery_fare' and _o.status='awaiting_delivery_fare' and _o.source='one_time' and _o.fulfillment_choice='deliver' then
    update public.orders set status='ready' where id=_o.id;
    insert into public.order_events(order_id,event,detail) values(_o.id,'delivery_fare_paid',jsonb_build_object('reference',_reference,'amount_kobo',_amount_kobo));
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
$function$;

-- ---------- Customer: my cleaning ----------
create or replace function public.my_cleaning()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _me uuid := auth.uid();
begin
  if _me is null then raise exception 'auth_required' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'request_no', r.request_no, 'service', r.service, 'status', r.status, 'created_at', r.created_at, 'address', r.address,
        'inspection', (select jsonb_build_object('id', i.id, 'mode', i.mode, 'scheduled_for', i.scheduled_for, 'status', i.status, 'fee_kobo', i.fee_kobo, 'fee_paid', i.fee_paid,
             'invoice_id', (select inv.id from public.cleaning_invoices inv where inv.inspection_id = i.id and inv.status = 'open' limit 1))
           from public.cleaning_inspections i where i.request_id = r.id and i.status <> 'cancelled' order by i.created_at desc limit 1))
        order by r.created_at desc) from public.cleaning_requests r where r.customer_id = _me and r.status not in ('accepted', 'cancelled')), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'quote_no', q.quote_no, 'kind', q.kind, 'status', case when q.status = 'sent' and q.valid_until < now() then 'expired' else q.status end,
        'total_kobo', private.cl_quote_total(q), 'valid_until', q.valid_until) order by q.created_at desc)
        from public.cleaning_quotes q where q.customer_id = _me and q.status in ('sent', 'accepted', 'expired', 'declined') and q.created_at > now() - interval '120 days'), '[]'::jsonb),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'visit_no', v.visit_no, 'kind', v.kind, 'service', v.service, 'date', v.scheduled_date, 'window', v.time_window,
        'start_time', v.start_time, 'status', v.status, 'address', p.address,
        'arrival_code', case when v.status in ('scheduled', 'on_the_way') then v.arrival_code end,
        'completion_code', case when v.status in ('in_progress', 'awaiting_signoff') then v.completion_code end,
        'rating', v.rating, 'balance_due_kobo', v.balance_due_kobo, 'finished_at', v.finished_at,
        'crew', (select jsonb_agg(pr.full_name) from public.cleaning_visit_crew c join public.profiles pr on pr.id = c.staff_id where c.visit_id = v.id),
        'extras', (select jsonb_agg(jsonb_build_object('id', e.id, 'amount_kobo', e.amount_kobo, 'lines', e.lines, 'status', e.status)) from public.cleaning_extras e where e.visit_id = v.id and e.status = 'pending'),
        'can_reschedule', v.status = 'scheduled' and (v.scheduled_date::timestamp at time zone 'Africa/Lagos') > now() + make_interval(hours => private.cl_int('reschedule_cutoff_hours', 24)::int),
        'can_complain', v.status = 'done' and v.finished_at > now() - make_interval(hours => private.cl_int('complaint_window_hours', 24)::int))
        order by v.scheduled_date) from public.cleaning_visits v join public.cleaning_properties p on p.id = v.property_id
        where v.customer_id = _me and v.status <> 'held' and (v.status not in ('cancelled') or v.scheduled_date >= current_date - 7)
          and v.scheduled_date >= current_date - 45), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'status', s.status, 'plan', pt.name, 'monthly_kobo', s.monthly_kobo, 'visits_per_month', s.visits_per_month,
        'weekday', s.weekday, 'window', s.time_window, 'term', s.term, 'period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end,
        'paused_from', s.paused_from, 'paused_until', s.paused_until, 'bundle', s.bundle, 'address', p.address,
        'credits', (select count(*) from public.cleaning_credits c where c.subscription_id = s.id and c.used_visit_id is null and c.expires_on >= current_date)))
        from public.cleaning_subscriptions s join public.cleaning_properties p on p.id = s.property_id left join public.cleaning_plan_types pt on pt.id = s.plan_type_id
        where s.customer_id = _me and s.status in ('active', 'past_due', 'paused')), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'purpose', i.purpose, 'amount_kobo', i.amount_kobo, 'description', i.description, 'created_at', i.created_at) order by i.created_at desc)
        from public.cleaning_invoices i where i.customer_id = _me and i.status = 'open' and i.purpose in ('inspection', 'balance', 'renewal', 'extra_work')), '[]'::jsonb),
    'credits', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'reason', c.reason, 'expires_on', c.expires_on, 'subscription_id', c.subscription_id))
        from public.cleaning_credits c where c.customer_id = _me and c.used_visit_id is null and c.expires_on >= current_date), '[]'::jsonb),
    'properties', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'address', p.address, 'kind', p.kind)) from public.cleaning_properties p where p.customer_id = _me and not p.archived), '[]'::jsonb));
end $$;

create or replace function public.cleaning_reschedule(_visit uuid, _date date, _window text)
returns void
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits; _today date := (now() at time zone 'Africa/Lagos')::date;
begin
  select * into _v from public.cleaning_visits where id = _visit and (customer_id = auth.uid() or private.is_cleaning_manager()) for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _v.status <> 'scheduled' then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if not private.is_cleaning_manager() and (_v.scheduled_date::timestamp at time zone 'Africa/Lagos') <= now() + make_interval(hours => private.cl_int('reschedule_cutoff_hours', 24)::int) then
    raise exception 'cleaning_reschedule_too_late' using errcode = 'P0001';
  end if;
  if _date is null or _date <= _today or _date > _today + 60 or extract(isodow from _date) = 7 or _window not in ('morning', 'afternoon') then raise exception 'slot_invalid' using errcode = 'P0001'; end if;
  if _v.subscription_id is not null and not private.is_cleaning_manager() and exists (select 1 from public.cleaning_subscriptions s where s.id = _v.subscription_id and _date > s.current_period_end) then
    raise exception 'cleaning_outside_plan_period' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('cleaning-day:' || _date::text));
  if not private.cl_fits(_date, _v.crew_size, _v.duration_min, _visit) then raise exception 'slot_unavailable' using errcode = 'P0001'; end if;
  update public.cleaning_visits set scheduled_date = _date, time_window = _window, start_time = null, updated_at = now() where id = _visit;
  if _date <> _v.scheduled_date then delete from public.cleaning_visit_crew where visit_id = _visit; end if;
  perform private.cl_event('visit', _visit, 'rescheduled', jsonb_build_object('from', _v.scheduled_date, 'to', _date, 'window', _window));
end $$;

create or replace function public.cleaning_signoff(_visit uuid, _rating integer, _note text)
returns void
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits;
begin
  select * into _v from public.cleaning_visits where id = _visit and customer_id = auth.uid() for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _v.status not in ('awaiting_signoff', 'done') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _rating is not null and (_rating < 1 or _rating > 5) then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  update public.cleaning_visits set status = 'done', signoff = coalesce(signoff, 'code'), signed_off_at = coalesce(signed_off_at, now()),
         rating = coalesce(_rating, rating), rating_note = coalesce(left(nullif(trim(coalesce(_note, '')), ''), 500), rating_note), updated_at = now() where id = _visit;
  if _rating is not null and _rating <= 2 then
    insert into public.cleaning_issues (visit_id, kind, description, raised_by) values (_visit, 'complaint', 'Low rating (' || _rating || '/5): ' || coalesce(nullif(trim(coalesce(_note, '')), ''), 'no comment'), auth.uid());
    perform private.cl_notify_admin('Low cleaning rating', jsonb_build_array(_rating || '/5 for visit #' || _v.visit_no, coalesce(_note, '')), '/staff/cleaning/issues', 'cleaning-low-rating-' || _visit);
  end if;
end $$;

create or replace function public.cleaning_complain(_visit uuid, _description text, _photos text[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits; _id uuid;
begin
  select * into _v from public.cleaning_visits where id = _visit and customer_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _v.status not in ('done', 'awaiting_signoff') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _v.status = 'done' and _v.finished_at < now() - make_interval(hours => private.cl_int('complaint_window_hours', 24)::int) then raise exception 'cleaning_complaint_window_closed' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_description, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(coalesce(_photos, '{}')) x where x !~ ('^requests/' || auth.uid()::text || '/[A-Za-z0-9._/-]+$')) then raise exception 'evidence_path_invalid' using errcode = 'P0001'; end if;
  insert into public.cleaning_issues (visit_id, kind, description, photos, raised_by) values (_visit, 'complaint', left(trim(_description), 2000), coalesce(_photos, '{}'), auth.uid()) returning id into _id;
  update public.cleaning_visits set status = 'done', signoff = coalesce(signoff, 'code'), signed_off_at = coalesce(signed_off_at, now()) where id = _visit and status = 'awaiting_signoff';
  perform private.cl_notify_admin('Cleaning complaint', jsonb_build_array('Visit #' || _v.visit_no || ': ' || left(trim(_description), 300)), '/staff/cleaning/issues', 'cleaning-complaint-' || _id);
  return _id;
end $$;

create or replace function public.cleaning_extra_decide(_extra uuid, _approve boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _e public.cleaning_extras; _v public.cleaning_visits; _inv uuid;
begin
  select e.* into _e from public.cleaning_extras e join public.cleaning_visits v on v.id = e.visit_id where e.id = _extra and v.customer_id = auth.uid() for update of e;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _e.status <> 'pending' then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  select * into _v from public.cleaning_visits where id = _e.visit_id;
  if not _approve then
    update public.cleaning_extras set status = 'declined', decided_at = now() where id = _extra;
    perform private.cl_event('extra', _extra, 'declined', '{}'::jsonb);
    return jsonb_build_object('status', 'declined');
  end if;
  insert into public.cleaning_invoices (customer_id, purpose, visit_id, extra_id, amount_kobo, description)
  values (_v.customer_id, 'extra_work', _v.id, _extra, _e.amount_kobo, 'Extra cleaning work on visit #' || _v.visit_no) returning id into _inv;
  update public.cleaning_extras set status = 'approved', decided_at = now(), invoice_id = _inv where id = _extra;
  update public.cleaning_visits set duration_min = least(960, duration_min + _e.minutes / greatest(crew_size, 1)) where id = _v.id;
  perform private.cl_event('extra', _extra, 'approved', jsonb_build_object('invoice', _inv));
  return jsonb_build_object('status', 'approved', 'invoice_id', _inv, 'amount_kobo', _e.amount_kobo);
end $$;

create or replace function public.cleaning_plan_cancel(_sub uuid, _undo boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.cleaning_subscriptions set cancel_at_period_end = not coalesce(_undo, false), updated_at = now()
   where id = _sub and (customer_id = auth.uid() or private.is_cleaning_manager()) and status in ('active', 'past_due', 'paused');
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.cl_event('plan', _sub, case when _undo then 'cancel_undone' else 'cancel_at_period_end' end, '{}'::jsonb);
end $$;

-- Pause up to 31 days a year, booked at least 7 days ahead. Paused visits are removed and the term end moves back.
create or replace function public.cleaning_plan_pause(_sub uuid, _from date, _until date)
returns void
language plpgsql security definer set search_path = '' as $$
declare _s public.cleaning_subscriptions; _days integer; _today date := (now() at time zone 'Africa/Lagos')::date;
begin
  select * into _s from public.cleaning_subscriptions where id = _sub and (customer_id = auth.uid() or private.is_cleaning_manager()) for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _s.status <> 'active' then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _from is null or _until is null or _until < _from then raise exception 'slot_invalid' using errcode = 'P0001'; end if;
  if _from < _today + 7 and not private.is_cleaning_manager() then raise exception 'cleaning_pause_notice' using errcode = 'P0001'; end if;
  _days := _until - _from + 1;
  if _s.pauses_used_days + _days > 31 and not private.is_cleaning_manager() then raise exception 'cleaning_pause_limit' using errcode = 'P0001'; end if;
  update public.cleaning_visits set status = 'cancelled', cancelled_reason = 'plan_paused', counts_as_used = false
   where subscription_id = _sub and status = 'scheduled' and scheduled_date between _from and _until;
  update public.cleaning_subscriptions set paused_from = _from, paused_until = _until, pauses_used_days = pauses_used_days + _days,
         current_period_end = current_period_end + _days, updated_at = now() where id = _sub;
  perform private.cl_generate_visits(_sub);
  perform private.cl_sync_bundle_waiver(_sub);
  perform private.cl_event('plan', _sub, 'paused', jsonb_build_object('from', _from, 'until', _until));
end $$;

create or replace function public.cleaning_use_credit(_credit uuid, _date date, _window text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare _c public.cleaning_credits; _s public.cleaning_subscriptions; _pr public.cleaning_properties; _id uuid; _today date := (now() at time zone 'Africa/Lagos')::date;
begin
  select * into _c from public.cleaning_credits where id = _credit and (customer_id = auth.uid() or private.is_cleaning_manager()) for update;
  if not found or _c.used_visit_id is not null or _c.expires_on < _today then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into _s from public.cleaning_subscriptions where id = _c.subscription_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _date is null or _date <= _today or _date > _c.expires_on or extract(isodow from _date) = 7 or _window not in ('morning', 'afternoon') then raise exception 'slot_invalid' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('cleaning-day:' || _date::text));
  if not private.cl_fits(_date, _s.crew_size, _s.duration_min) then raise exception 'slot_unavailable' using errcode = 'P0001'; end if;
  select * into _pr from public.cleaning_properties where id = _s.property_id;
  insert into public.cleaning_visits (customer_id, property_id, subscription_id, quote_id, kind, service, scheduled_date, time_window, crew_size, duration_min, zone_id, status, bundle_laundry, created_by)
  values (_s.customer_id, _s.property_id, _s.id, _s.quote_id, 'credit', _s.service, _date, _window, _s.crew_size, _s.duration_min, _pr.zone_id, 'scheduled', _s.bundle, auth.uid())
  returning id into _id;
  update public.cleaning_credits set used_visit_id = _id where id = _credit;
  return _id;
end $$;

-- ---------- Staff: requests list and detail ----------
create or replace function public.cleaning_requests_list(_status text default null, _q text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _s text := nullif(trim(coalesce(_q, '')), '');
begin
  if not private.is_cleaning_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(x order by (x->>'created_at') desc) from (
    select jsonb_build_object('id', r.id, 'request_no', r.request_no, 'service', r.service, 'wants_plan', r.wants_plan, 'status', r.status, 'source', r.source,
      'customer', coalesce(p.full_name, r.contact_name), 'phone', coalesce(p.phone, r.contact_phone), 'address', r.address, 'zone', z.name,
      'assigned', a.full_name, 'created_at', r.created_at,
      'next_inspection', (select min(i.scheduled_for) from public.cleaning_inspections i where i.request_id = r.id and i.status in ('scheduled', 'awaiting_fee')),
      'latest_quote', (select jsonb_build_object('id', q.id, 'status', q.status, 'total_kobo', private.cl_quote_total(q)) from public.cleaning_quotes q where q.request_id = r.id order by q.version desc limit 1)) x
      from public.cleaning_requests r
      left join public.profiles p on p.id = r.customer_id left join public.profiles a on a.id = r.assigned_to left join public.zones z on z.id = r.zone_id
     where (_status is null and r.status not in ('accepted', 'lost', 'cancelled') or r.status = _status or _status = 'all')
       and (_s is null or r.request_no::text = _s or coalesce(p.full_name, r.contact_name, '') ilike '%' || _s || '%' or coalesce(p.phone, r.contact_phone, '') ilike '%' || _s || '%'
            or coalesce(r.address, '') ilike '%' || _s || '%')
     order by r.created_at desc limit 200) t), '[]'::jsonb);
end $$;

create or replace function public.cleaning_request_detail(_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _r public.cleaning_requests;
begin
  if not private.is_cleaning_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into _r from public.cleaning_requests where id = _id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'request', to_jsonb(_r),
    'customer', (select jsonb_build_object('id', p.id, 'name', p.full_name, 'phone', p.phone, 'email', p.email, 'walk_in', coalesce(p.is_walk_in, false)) from public.profiles p where p.id = _r.customer_id),
    'property', (select to_jsonb(pp) from public.cleaning_properties pp where pp.id = _r.property_id),
    'zone', (select name from public.zones where id = _r.zone_id),
    'assigned', (select full_name from public.profiles where id = _r.assigned_to),
    'inspections', coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object('inspector', pr.full_name,
         'invoice', (select jsonb_build_object('id', inv.id, 'status', inv.status, 'amount_kobo', inv.amount_kobo) from public.cleaning_invoices inv where inv.inspection_id = i.id order by inv.created_at desc limit 1))
         order by i.created_at desc) from public.cleaning_inspections i left join public.profiles pr on pr.id = i.inspector_id where i.request_id = _id), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(to_jsonb(q) || jsonb_build_object('total_kobo', private.cl_quote_total(q), 'plan_name', pt.name,
         'invoice', (select jsonb_build_object('id', inv.id, 'status', inv.status, 'amount_kobo', inv.amount_kobo) from public.cleaning_invoices inv where inv.quote_id = q.id and inv.purpose = 'quote' order by inv.created_at desc limit 1))
         order by q.version desc) from public.cleaning_quotes q left join public.cleaning_plan_types pt on pt.id = q.plan_type_id where q.request_id = _id), '[]'::jsonb),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'visit_no', v.visit_no, 'date', v.scheduled_date, 'window', v.time_window, 'status', v.status, 'kind', v.kind) order by v.scheduled_date)
         from public.cleaning_visits v where v.quote_id in (select id from public.cleaning_quotes where request_id = _id) and v.status <> 'held'), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('event', e.event, 'at', e.created_at, 'by', p.full_name, 'detail', e.detail) order by e.created_at desc)
         from public.cleaning_events e left join public.profiles p on p.id = e.actor_id
        where (e.entity = 'request' and e.entity_id = _id)
           or (e.entity = 'quote' and e.entity_id in (select id from public.cleaning_quotes where request_id = _id))
           or (e.entity = 'inspection' and e.entity_id in (select id from public.cleaning_inspections where request_id = _id))), '[]'::jsonb),
    'rate', (select data from public.cleaning_rate_versions where active),
    'plan_types', (select jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'visits_per_month', visits_per_month, 'discount_pct', discount_pct, 'custom', custom) order by sort_order) from public.cleaning_plan_types where active),
    'inspection_fee_kobo', private.cl_inspection_fee(_r.distance_km));
end $$;

-- ---------- Staff: visit board, crews, capacity ----------
create or replace function public.cleaning_board(_from date, _to date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_cleaning_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if _to < _from or _to - _from > 62 then raise exception 'date_invalid' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'days', (select jsonb_agg(jsonb_build_object('date', d::date, 'capacity', private.cl_day_capacity(d::date), 'booked', private.cl_day_booked(d::date)) order by d)
             from generate_series(_from, _to, interval '1 day') d),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'visit_no', v.visit_no, 'date', v.scheduled_date, 'window', v.time_window, 'start_time', v.start_time,
        'status', v.status, 'kind', v.kind, 'service', v.service, 'crew_size', v.crew_size, 'duration_min', v.duration_min, 'customer', c.full_name, 'phone', c.phone,
        'address', p.address, 'zone', z.name, 'bundle_laundry', v.bundle_laundry, 'balance_due_kobo', v.balance_due_kobo,
        'crew', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.full_name, 'role', vc.role) order by vc.role) from public.cleaning_visit_crew vc join public.profiles s on s.id = vc.staff_id where vc.visit_id = v.id), '[]'::jsonb))
        order by v.scheduled_date, v.time_window, v.start_time nulls last)
        from public.cleaning_visits v join public.profiles c on c.id = v.customer_id join public.cleaning_properties p on p.id = v.property_id left join public.zones z on z.id = v.zone_id
       where v.scheduled_date between _from and _to and v.status not in ('cancelled') and not (v.status = 'held' and v.hold_until < now())), '[]'::jsonb),
    'inspections', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'at', i.scheduled_for, 'status', i.status, 'mode', i.mode, 'request_id', i.request_id, 'request_no', r.request_no,
        'inspector', pr.full_name, 'address', r.address, 'customer', coalesce(cu.full_name, r.contact_name)) order by i.scheduled_for)
        from public.cleaning_inspections i join public.cleaning_requests r on r.id = i.request_id left join public.profiles pr on pr.id = i.inspector_id left join public.profiles cu on cu.id = r.customer_id
       where i.status in ('scheduled', 'awaiting_fee') and (i.scheduled_for at time zone 'Africa/Lagos')::date between _from and _to), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'roles', roles) order by p.full_name) from (
        select r.user_id, jsonb_agg(r.role::text) roles from public.user_roles r where r.role::text in ('cleaner', 'cleaning_lead', 'inspector', 'scheduler', 'admin', 'super_admin') group by r.user_id) x
        join public.profiles p on p.id = x.user_id where p.status = 'active'), '[]'::jsonb));
end $$;

create or replace function public.cleaning_assign_crew(_visit uuid, _lead uuid, _cleaners uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits; _all uuid[]; _x uuid; _c public.profiles;
begin
  if not private.is_cleaning_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into _v from public.cleaning_visits where id = _visit for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _v.status not in ('scheduled', 'on_the_way', 'in_progress', 'held') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _lead is null then raise exception 'cleaning_lead_required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.user_roles where user_id = _lead and role::text in ('cleaning_lead', 'admin', 'super_admin', 'scheduler')) then raise exception 'cleaning_not_lead' using errcode = 'P0001'; end if;
  _all := array(select distinct x from unnest(array_append(coalesce(_cleaners, '{}'), _lead)) x where x is not null);
  foreach _x in array _all loop
    if not exists (select 1 from public.user_roles where user_id = _x and role::text in ('cleaner', 'cleaning_lead', 'admin', 'super_admin', 'scheduler')) then raise exception 'cleaning_not_cleaner' using errcode = 'P0001'; end if;
    if exists (select 1 from public.leave_requests l where l.staff_id = _x and l.status = 'approved' and _v.scheduled_date between l.start_date and l.end_date) then raise exception 'cleaning_staff_on_leave' using errcode = 'P0001'; end if;
  end loop;
  delete from public.cleaning_visit_crew where visit_id = _visit;
  insert into public.cleaning_visit_crew (visit_id, staff_id, role, assigned_by)
  select _visit, x, case when x = _lead then 'lead' else 'cleaner' end, auth.uid() from unnest(_all) x;
  select * into _c from public.profiles where id = _v.customer_id;
  insert into public.user_notifications (user_id, title, body, kind)
  select x, 'New cleaning job', 'Visit #' || _v.visit_no || ' on ' || to_char(_v.scheduled_date, 'Dy DD Mon') || ' (' || _v.time_window || ')' || case when x = _lead then '. You are the lead.' else '.' end, 'cleaning'
    from unnest(_all) x;
  perform private.cl_event('visit', _visit, 'crew_assigned', jsonb_build_object('lead', _lead, 'crew', to_jsonb(_all)));
end $$;

create or replace function public.cleaning_set_start_time(_visit uuid, _time time)
returns void
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits;
begin
  if not private.is_cleaning_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into _v from public.cleaning_visits where id = _visit for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _time is not null and (_time < time '08:00' or _time > time '17:00') then raise exception 'slot_invalid' using errcode = 'P0001'; end if;
  update public.cleaning_visits set start_time = _time, time_window = case when _time is null then time_window when _time < time '12:00' then 'morning' else 'afternoon' end, updated_at = now() where id = _visit;
  if _time is not null and _time is distinct from _v.start_time then
    perform private.cl_notify_customer(_v.customer_id, 'Cleaning time confirmed', 'Your cleaners will arrive at about ' || to_char(_time, 'HH12:MI AM') || ' on ' || to_char(_v.scheduled_date, 'Dy DD Mon') || '.',
      null, '/cleaning/my', 'See my cleaning', 'cleaning-time-' || _visit || '-' || _time::text);
  end if;
end $$;

-- Staff cancel. By us on a plan = credit visit; by the customer late = counts as used.
create or replace function public.cleaning_cancel_visit(_visit uuid, _reason text, _by_us boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits;
begin
  if not private.is_cleaning_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_reason, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into _v from public.cleaning_visits where id = _visit for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _v.status not in ('scheduled', 'on_the_way', 'held') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  update public.cleaning_visits set status = 'cancelled', cancelled_reason = trim(_reason), cancelled_by_us = _by_us, counts_as_used = not _by_us, updated_at = now() where id = _visit;
  if _by_us and _v.subscription_id is not null then
    insert into public.cleaning_credits (customer_id, subscription_id, source_visit_id, reason, expires_on, created_by)
    values (_v.customer_id, _v.subscription_id, _visit, 'Visit on ' || to_char(_v.scheduled_date, 'DD Mon') || ' cancelled by us: ' || trim(_reason),
            current_date + private.cl_int('credit_valid_days', 60)::int, auth.uid());
  end if;
  perform private.cl_notify_customer(_v.customer_id, 'Cleaning visit cancelled',
    'Your visit on ' || to_char(_v.scheduled_date, 'Dy DD Mon') || ' is cancelled. ' ||
      case when _by_us and _v.subscription_id is not null then 'We are sorry. You have a free credit visit to book in My cleaning.'
           when _by_us then 'We are sorry. We will call you to choose a new date.' else trim(_reason) end,
    null, '/cleaning/my', 'See my cleaning', 'cleaning-cancel-' || _visit);
  perform private.cl_event('visit', _visit, 'cancelled', jsonb_build_object('reason', _reason, 'by_us', _by_us));
end $$;

-- ---------- Crew app ----------
create or replace function public.my_cleaning_jobs(_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _d date := coalesce(_date, (now() at time zone 'Africa/Lagos')::date);
begin
  if not private.is_cleaning_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'visit_no', v.visit_no, 'date', v.scheduled_date, 'window', v.time_window, 'start_time', v.start_time,
      'status', v.status, 'kind', v.kind, 'service', v.service, 'duration_min', v.duration_min, 'crew_size', v.crew_size, 'my_role', mc.role,
      'customer', c.full_name, 'phone', c.phone, 'address', p.address, 'lat', p.lat, 'lng', p.lng, 'property', jsonb_build_object('kind', p.kind, 'water', p.water_note, 'power', p.power_note,
        'access', p.access_note, 'keys_allowed', p.keys_allowed, 'key_holder', p.key_holder, 'pets', p.pets, 'estate', p.estate_name, 'gate', p.gate_contact, 'people', p.people_note),
      'bundle_laundry', v.bundle_laundry, 'checklist', v.checklist, 'before', cardinality(v.before_photos), 'after', cardinality(v.after_photos),
      'lines', coalesce(case when q.kind = 'plan' then (case when v.service = 'deep' then q.lines->'deep' else q.lines->'regular' end) else q.lines end, '[]'::jsonb),
      'crew', (select jsonb_agg(jsonb_build_object('name', s.full_name, 'role', vc.role)) from public.cleaning_visit_crew vc join public.profiles s on s.id = vc.staff_id where vc.visit_id = v.id),
      'extras', (select jsonb_agg(jsonb_build_object('id', e.id, 'amount_kobo', e.amount_kobo, 'status', e.status, 'lines', e.lines)) from public.cleaning_extras e where e.visit_id = v.id))
      order by v.time_window, v.start_time nulls last)
    from public.cleaning_visits v
    join public.cleaning_visit_crew mc on mc.visit_id = v.id and mc.staff_id = auth.uid()
    join public.profiles c on c.id = v.customer_id join public.cleaning_properties p on p.id = v.property_id
    left join public.cleaning_quotes q on q.id = v.quote_id
   where v.scheduled_date = _d and v.status not in ('cancelled', 'held')), '[]'::jsonb);
end $$;

create or replace function private.cl_crew_visit(_visit uuid, _lead_only boolean) returns public.cleaning_visits
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits;
begin
  select * into _v from public.cleaning_visits where id = _visit for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not private.is_cleaning_manager() and not exists (select 1 from public.cleaning_visit_crew where visit_id = _visit and staff_id = auth.uid()
         and (not _lead_only or role = 'lead')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return _v;
end $$;

create or replace function public.cleaning_visit_on_way(_visit uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits := private.cl_crew_visit(_visit, true);
begin
  if _v.status <> 'scheduled' then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _v.balance_due_kobo > 0 then raise exception 'cleaning_balance_due' using errcode = 'P0001'; end if;
  update public.cleaning_visits set status = 'on_the_way', updated_at = now() where id = _visit;
  perform private.cl_notify_customer(_v.customer_id, 'Your cleaners are on the way', 'Have your arrival code ready: you will find it in My cleaning. Please make sure water is available.',
    null, '/cleaning/my', 'See my arrival code', 'cleaning-onway-' || _visit);
end $$;

-- Default checklist from the quote's rooms when the crew arrives.
create or replace function private.cl_default_checklist(_v public.cleaning_visits) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _q public.cleaning_quotes; _lines jsonb; _l jsonb; _out jsonb := '[]'::jsonb; _i integer;
begin
  select * into _q from public.cleaning_quotes where id = _v.quote_id;
  _lines := coalesce(case when _q.kind = 'plan' then (case when _v.service = 'deep' then _q.lines->'deep' else _q.lines->'regular' end) else _q.lines end, '[]'::jsonb);
  for _l in select * from jsonb_array_elements(_lines) loop
    for _i in 1..coalesce((_l->>'qty')::int, 1) loop
      _out := _out || jsonb_build_object('item', (_l->>'label') || case when (_l->>'qty')::int > 1 then ' ' || _i else '' end, 'done', false, 'note', null);
    end loop;
  end loop;
  if _v.bundle_laundry then _out := _out || jsonb_build_object('item', 'Collect laundry bag and return last week''s clean laundry', 'done', false, 'note', null); end if;
  return _out;
end $$;

create or replace function public.cleaning_visit_arrive(_visit uuid, _code text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits := private.cl_crew_visit(_visit, true);
begin
  if _v.status not in ('scheduled', 'on_the_way') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _v.scheduled_date <> (now() at time zone 'Africa/Lagos')::date then raise exception 'cleaning_not_today' using errcode = 'P0001'; end if;
  if _v.balance_due_kobo > 0 then raise exception 'cleaning_balance_due' using errcode = 'P0001'; end if;
  if _v.code_attempts >= 5 then raise exception 'too_many_attempts' using errcode = 'P0001'; end if;
  if coalesce(_code, '') <> _v.arrival_code then
    update public.cleaning_visits set code_attempts = code_attempts + 1 where id = _visit;
    return jsonb_build_object('ok', false, 'attempts_left', 4 - _v.code_attempts);
  end if;
  update public.cleaning_visits set status = 'in_progress', started_at = now(), code_attempts = 0,
         checklist = case when jsonb_array_length(checklist) = 0 then private.cl_default_checklist(_v) else checklist end, updated_at = now() where id = _visit;
  perform private.cl_event('visit', _visit, 'arrived', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cleaning_visit_photos(_visit uuid, _phase text, _paths text[])
returns void
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits := private.cl_crew_visit(_visit, false);
begin
  if _phase not in ('before', 'after') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _v.status not in ('in_progress') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(coalesce(_paths, '{}')) x where x !~ ('^visits/' || _v.customer_id::text || '/' || _visit::text || '/[A-Za-z0-9._-]+$')) then raise exception 'evidence_path_invalid' using errcode = 'P0001'; end if;
  if _phase = 'before' then
    update public.cleaning_visits set before_photos = (select array_agg(distinct x) from unnest(before_photos || _paths) x) where id = _visit;
  else
    update public.cleaning_visits set after_photos = (select array_agg(distinct x) from unnest(after_photos || _paths) x) where id = _visit;
  end if;
  if (select cardinality(before_photos) + cardinality(after_photos) from public.cleaning_visits where id = _visit) > 80 then raise exception 'too_many_photos' using errcode = 'P0001'; end if;
end $$;

create or replace function public.cleaning_visit_checklist(_visit uuid, _checklist jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits := private.cl_crew_visit(_visit, false);
begin
  if _v.status <> 'in_progress' then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if jsonb_typeof(_checklist) <> 'array' or jsonb_array_length(_checklist) > 200 then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  update public.cleaning_visits set checklist = _checklist, updated_at = now() where id = _visit;
end $$;

-- Extra work found on site: priced from the rate card add-ons, or a custom amount with a description.
create or replace function public.cleaning_visit_extra(_visit uuid, _addons jsonb, _custom_label text, _custom_kobo bigint, _custom_minutes integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits := private.cl_crew_visit(_visit, true); _rate jsonb; _p jsonb; _lines jsonb; _amt bigint; _mins integer; _id uuid;
begin
  if _v.status <> 'in_progress' then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  select data into _rate from public.cleaning_rate_versions where active;
  _p := private.cl_price(_rate, 'standard', 'light', '{}'::jsonb, coalesce(_addons, '{}'::jsonb));
  _lines := _p->'lines'; _amt := (_p->>'subtotal_kobo')::bigint; _mins := (_p->>'minutes')::int;
  if coalesce(_custom_kobo, 0) > 0 then
    if length(trim(coalesce(_custom_label, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
    _lines := _lines || jsonb_build_object('kind', 'custom', 'label', left(trim(_custom_label), 120), 'qty', 1, 'unit_kobo', _custom_kobo, 'amount_kobo', _custom_kobo);
    _amt := _amt + _custom_kobo; _mins := _mins + greatest(0, coalesce(_custom_minutes, 0));
  end if;
  if _amt <= 0 then raise exception 'amount_invalid' using errcode = 'P0001'; end if;
  insert into public.cleaning_extras (visit_id, lines, amount_kobo, minutes, created_by) values (_visit, _lines, _amt, _mins, auth.uid()) returning id into _id;
  perform private.cl_notify_customer(_v.customer_id, 'Extra cleaning work needs your OK',
    'The crew found more to do: ₦' || to_char(_amt / 100, 'FM999,999') || '. Approve or decline in My cleaning. Nothing extra is done until you approve.',
    null, '/cleaning/my', 'Approve or decline', 'cleaning-extra-' || _id);
  return _id;
end $$;

create or replace function public.cleaning_visit_finish(_visit uuid, _code text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits := private.cl_crew_visit(_visit, true);
begin
  if _v.status <> 'in_progress' then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if cardinality(_v.before_photos) = 0 or cardinality(_v.after_photos) = 0 then raise exception 'cleaning_photos_required' using errcode = 'P0001'; end if;
  if exists (select 1 from public.cleaning_extras where visit_id = _visit and status = 'pending') then raise exception 'cleaning_extra_pending' using errcode = 'P0001'; end if;
  if nullif(trim(coalesce(_code, '')), '') is not null then
    if _v.code_attempts >= 5 then raise exception 'too_many_attempts' using errcode = 'P0001'; end if;
    if trim(_code) <> _v.completion_code then
      update public.cleaning_visits set code_attempts = code_attempts + 1 where id = _visit;
      return jsonb_build_object('ok', false, 'attempts_left', 4 - _v.code_attempts);
    end if;
    update public.cleaning_visits set status = 'done', finished_at = now(), signoff = 'code', signed_off_at = now(), updated_at = now() where id = _visit;
  else
    update public.cleaning_visits set status = 'awaiting_signoff', finished_at = now(), updated_at = now() where id = _visit;
  end if;
  perform private.cl_event('visit', _visit, 'finished', jsonb_build_object('with_code', nullif(trim(coalesce(_code, '')), '') is not null));
  perform private.cl_notify_customer(_v.customer_id, 'Cleaning finished', 'Please rate your visit. If anything was missed, tell us within 24 hours with a photo and we will come back to fix it free.',
    null, '/cleaning/my', 'Rate the visit', 'cleaning-finished-' || _visit);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cleaning_visit_no_show(_visit uuid, _note text)
returns void
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits := private.cl_crew_visit(_visit, true);
begin
  if _v.status not in ('scheduled', 'on_the_way') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_note, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.cleaning_visits set status = 'no_show', counts_as_used = true, cancelled_reason = trim(_note), updated_at = now() where id = _visit;
  perform private.cl_notify_customer(_v.customer_id, 'We could not get in', 'Our crew could not start your clean: ' || trim(_note) || '. Call 0913 258 4627 if this is a mistake.',
    null, '/cleaning/my', 'See my cleaning', 'cleaning-noshow-' || _visit);
  perform private.cl_notify_admin('Cleaning no-show', jsonb_build_array('Visit #' || _v.visit_no || ': ' || trim(_note)), '/staff/cleaning/board', 'cleaning-noshow-' || _visit);
end $$;

create or replace function public.cleaning_report_issue(_visit uuid, _kind text, _description text, _photos text[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare _v public.cleaning_visits := private.cl_crew_visit(_visit, false); _id uuid;
begin
  if _kind not in ('damage', 'unsafe', 'other') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_description, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(coalesce(_photos, '{}')) x where x !~ ('^visits/' || _v.customer_id::text || '/' || _visit::text || '/[A-Za-z0-9._-]+$')) then raise exception 'evidence_path_invalid' using errcode = 'P0001'; end if;
  insert into public.cleaning_issues (visit_id, kind, description, photos, raised_by) values (_visit, _kind, left(trim(_description), 2000), coalesce(_photos, '{}'), auth.uid()) returning id into _id;
  if _kind = 'unsafe' then
    update public.cleaning_visits set status = 'unsafe', counts_as_used = false, cancelled_reason = left(trim(_description), 300), updated_at = now() where id = _visit and status in ('scheduled', 'on_the_way', 'in_progress');
  end if;
  perform private.cl_notify_admin(case _kind when 'damage' then 'Damage reported on a cleaning visit' when 'unsafe' then 'Crew left a visit as unsafe' else 'Cleaning visit issue' end,
    jsonb_build_array('Visit #' || _v.visit_no || ': ' || left(trim(_description), 300)), '/staff/cleaning/issues', 'cleaning-issue-' || _id);
  return _id;
end $$;

-- ---------- Issues ----------
create or replace function public.cleaning_issues_list(_open boolean default true)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_cleaning_desk() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'description', i.description, 'photos', i.photos, 'status', i.status, 'outcome', i.outcome,
      'payout_kobo', i.payout_kobo, 'created_at', i.created_at, 'raised_by', rb.full_name, 'visit_id', v.id, 'visit_no', v.visit_no, 'date', v.scheduled_date,
      'customer', c.full_name, 'phone', c.phone, 'address', p.address, 'before', v.before_photos, 'after', v.after_photos) order by i.created_at desc)
    from public.cleaning_issues i join public.cleaning_visits v on v.id = i.visit_id join public.profiles c on c.id = v.customer_id
    join public.cleaning_properties p on p.id = v.property_id left join public.profiles rb on rb.id = i.raised_by
   where (_open and i.status in ('open', 'reclean_booked')) or (not _open)), '[]'::jsonb);
end $$;

create or replace function public.cleaning_issue_resolve(_issue uuid, _action text, _outcome text, _date date, _window text, _payout_kobo bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare _i public.cleaning_issues; _v public.cleaning_visits; _new uuid; _cap bigint := private.cl_int('damage_cap_kobo', 5000000);
begin
  if not private.is_cleaning_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if _action not in ('reclean', 'payout', 'resolve', 'reject') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_outcome, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into _i from public.cleaning_issues where id = _issue for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into _v from public.cleaning_visits where id = _i.visit_id;
  if _action = 'reclean' then
    if _date is null or _date <= (now() at time zone 'Africa/Lagos')::date or extract(isodow from _date) = 7 then raise exception 'slot_invalid' using errcode = 'P0001'; end if;
    insert into public.cleaning_visits (customer_id, property_id, subscription_id, quote_id, kind, service, scheduled_date, time_window, crew_size, duration_min, zone_id, status, counts_as_used, created_by)
    values (_v.customer_id, _v.property_id, _v.subscription_id, _v.quote_id, 'reclean', _v.service, _date, coalesce(_window, 'morning'), _v.crew_size, greatest(30, _v.duration_min / 2), _v.zone_id, 'scheduled', false, auth.uid())
    returning id into _new;
    update public.cleaning_issues set status = 'reclean_booked', outcome = trim(_outcome), reclean_visit_id = _new, resolved_by = auth.uid(), resolved_at = now() where id = _issue;
    perform private.cl_notify_customer(_v.customer_id, 'Free re-clean booked', 'We will come back on ' || to_char(_date, 'Dy DD Mon') || ' to fix it, at no cost.', null, '/cleaning/my', 'See my cleaning', 'cleaning-reclean-' || _new);
  elsif _action = 'payout' then
    if coalesce(_payout_kobo, 0) <= 0 then raise exception 'amount_invalid' using errcode = 'P0001'; end if;
    if _payout_kobo > _cap and not private.is_super_admin() then raise exception 'cleaning_payout_over_cap' using errcode = 'P0001'; end if;
    update public.cleaning_issues set status = 'resolved', outcome = trim(_outcome), payout_kobo = _payout_kobo, resolved_by = auth.uid(), resolved_at = now() where id = _issue;
  else
    update public.cleaning_issues set status = case when _action = 'reject' then 'rejected' else 'resolved' end, outcome = trim(_outcome), resolved_by = auth.uid(), resolved_at = now() where id = _issue;
  end if;
  perform private.cl_event('issue', _issue, _action, jsonb_build_object('outcome', _outcome, 'payout_kobo', _payout_kobo));
end $$;

-- ---------- Plans list for staff ----------
create or replace function public.cleaning_plans_list()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_cleaning_desk() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'customer', c.full_name, 'phone', c.phone, 'address', p.address, 'plan', pt.name, 'status', s.status,
      'monthly_kobo', s.monthly_kobo, 'visits_per_month', s.visits_per_month, 'weekday', s.weekday, 'window', s.time_window, 'term', s.term,
      'period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end, 'bundle', s.bundle,
      'next_visit', (select min(v.scheduled_date) from public.cleaning_visits v where v.subscription_id = s.id and v.status = 'scheduled'),
      'used_this_month', (select count(*) from public.cleaning_visits v where v.subscription_id = s.id and v.counts_as_used and v.status in ('done', 'no_show', 'awaiting_signoff')
                            and v.scheduled_date >= date_trunc('month', current_date)),
      'credits', (select count(*) from public.cleaning_credits cr where cr.subscription_id = s.id and cr.used_visit_id is null and cr.expires_on >= current_date),
      'open_invoice', (select jsonb_build_object('id', i.id, 'amount_kobo', i.amount_kobo) from public.cleaning_invoices i where i.subscription_id = s.id and i.status = 'open' and i.purpose = 'renewal' limit 1))
      order by s.created_at desc)
    from public.cleaning_subscriptions s join public.profiles c on c.id = s.customer_id join public.cleaning_properties p on p.id = s.property_id
    left join public.cleaning_plan_types pt on pt.id = s.plan_type_id where s.status in ('active', 'past_due', 'paused')), '[]'::jsonb);
end $$;

-- Open cleaning invoices for the desk to take payment.
create or replace function public.cleaning_open_invoices(_q text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _s text := nullif(trim(coalesce(_q, '')), '');
begin
  if not private.is_money_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'purpose', i.purpose, 'amount_kobo', i.amount_kobo, 'description', i.description, 'created_at', i.created_at,
      'customer', c.full_name, 'phone', c.phone) order by i.created_at desc)
    from public.cleaning_invoices i join public.profiles c on c.id = i.customer_id
   where i.status = 'open' and (_s is null or c.full_name ilike '%' || _s || '%' or c.phone ilike '%' || _s || '%')), '[]'::jsonb);
end $$;

-- ---------- Admin settings ----------
create or replace function public.cleaning_admin_config()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_cleaning_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return jsonb_build_object('settings', private.cl_set(),
    'rate', (select jsonb_build_object('id', id, 'version', version, 'data', data, 'created_at', created_at) from public.cleaning_rate_versions where active),
    'rate_history', (select jsonb_agg(jsonb_build_object('version', r.version, 'note', r.note, 'by', p.full_name, 'at', r.created_at) order by r.version desc) from public.cleaning_rate_versions r left join public.profiles p on p.id = r.created_by),
    'plan_types', (select jsonb_agg(to_jsonb(pt) order by pt.sort_order) from public.cleaning_plan_types pt),
    'zones', (select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'days', coalesce((select jsonb_agg(d.weekday order by d.weekday) from public.cleaning_zone_days d where d.zone_id = z.id), '[]'::jsonb)) order by z.name)
              from public.zones z where z.is_live));
end $$;

create or replace function public.cleaning_settings_save(_patch jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare _allowed text[] := array['admin_email', 'hotline', 'whatsapp', 'inspection_fee_bands', 'quote_valid_days', 'inspector_limit_kobo', 'override_floor_pct', 'min_job_kobo',
  'deposit_threshold_kobo', 'deposit_pct', 'travel_buffer_min', 'daily_cap_min', 'max_minutes_per_cleaner', 'fallback_daily_crew_minutes', 'fallback_cleaners',
  'reschedule_cutoff_hours', 'complaint_window_hours', 'credit_valid_days', 'renewal_grace_days', 'damage_cap_kobo', 'bundle_discount_pct', 'hold_minutes', 'plan_horizon_days',
  'term_discounts', 'crew_hour_rate_kobo', 'crew_min_visit_kobo', 'five_star_bonus_kobo', 'inspection_pay_kobo', 'inspection_accept_bonus_kobo'];
  _k text;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  for _k in select jsonb_object_keys(_patch) loop
    if not _k = any(_allowed) then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  end loop;
  if _patch ? 'inspection_fee_bands' and (jsonb_typeof(_patch->'inspection_fee_bands') <> 'array' or jsonb_array_length(_patch->'inspection_fee_bands') = 0) then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  update public.settings set value = value || _patch, updated_by = auth.uid(), updated_at = now() where key = 'cleaning';
  insert into public.audit_log (actor_id, action, table_name, row_id, new_data) values (auth.uid(), 'cleaning_settings_saved', 'settings', 'cleaning', _patch);
end $$;

-- New rate card version. Existing quotes keep the version they were priced with.
create or replace function public.cleaning_rate_save(_data jsonb, _note text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare _v integer; _k text; _x jsonb;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if jsonb_typeof(_data->'spaces') <> 'object' or jsonb_typeof(_data->'services') <> 'object' or jsonb_typeof(_data->'conditions') <> 'object' or jsonb_typeof(_data->'addons') <> 'object' then
    raise exception 'invalid_step' using errcode = 'P0001';
  end if;
  for _k, _x in select key, value from jsonb_each(_data->'spaces') union all select key, value from jsonb_each(_data->'addons') loop
    if coalesce((_x->>'price_kobo')::bigint, -1) < 0 or coalesce((_x->>'minutes')::int, -1) < 0 or nullif(trim(coalesce(_x->>'label', '')), '') is null then raise exception 'amount_invalid' using errcode = 'P0001'; end if;
  end loop;
  for _k, _x in select key, value from jsonb_each(_data->'services') union all select key, value from jsonb_each(_data->'conditions') loop
    if coalesce((_x->>'multiplier')::numeric, 0) <= 0 or (_x->>'multiplier')::numeric > 10 then raise exception 'amount_invalid' using errcode = 'P0001'; end if;
  end loop;
  if not (_data->'services' ? 'standard' and _data->'services' ? 'deep' and _data->'conditions' ? 'normal') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  select coalesce(max(version), 0) + 1 into _v from public.cleaning_rate_versions;
  update public.cleaning_rate_versions set active = false where active;
  insert into public.cleaning_rate_versions (version, data, active, note, created_by) values (_v, _data, true, left(nullif(trim(coalesce(_note, '')), ''), 200), auth.uid());
  return _v;
end $$;

create or replace function public.cleaning_plan_type_save(_p jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update public.cleaning_plan_types set
    name = coalesce(nullif(trim(coalesce(_p->>'name', '')), ''), name), blurb = coalesce(_p->>'blurb', blurb),
    visits_per_month = coalesce(nullif(_p->>'visits_per_month', '')::int, visits_per_month),
    deep_every_months = case when _p ? 'deep_every_months' then nullif(_p->>'deep_every_months', '')::int else deep_every_months end,
    discount_pct = coalesce(nullif(_p->>'discount_pct', '')::numeric, discount_pct), active = coalesce((_p->>'active')::boolean, active)
  where slug = _p->>'slug';
  if not found then raise exception 'plan_not_found' using errcode = 'P0001'; end if;
end $$;

create or replace function public.cleaning_zone_days_save(_zone uuid, _days integer[])
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_cleaning_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(coalesce(_days, '{}')) d where d < 1 or d > 6) then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  delete from public.cleaning_zone_days where zone_id = _zone;
  insert into public.cleaning_zone_days (zone_id, weekday) select _zone, d from unnest(coalesce(_days, '{}')) d on conflict do nothing;
end $$;

-- ---------- Reports ----------
create or replace function public.cleaning_report(_from date, _to date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _s jsonb := private.cl_set();
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'revenue', coalesce((select jsonb_object_agg(purpose, total) from (select i.purpose, sum(i.amount_kobo) total from public.cleaning_invoices i
        where i.status = 'paid' and i.amount_kobo > 1 and (i.paid_at at time zone 'Africa/Lagos')::date between _from and _to group by i.purpose) t), '{}'::jsonb),
    'requests', (select count(*) from public.cleaning_requests where (created_at at time zone 'Africa/Lagos')::date between _from and _to),
    'inspections_done', (select count(*) from public.cleaning_inspections where status = 'done' and (done_at at time zone 'Africa/Lagos')::date between _from and _to),
    'quotes_sent', (select count(*) from public.cleaning_quotes where sent_at is not null and (sent_at at time zone 'Africa/Lagos')::date between _from and _to),
    'quotes_accepted', (select count(*) from public.cleaning_quotes where status = 'accepted' and (accepted_at at time zone 'Africa/Lagos')::date between _from and _to),
    'avg_quote_kobo', (select round(avg(private.cl_quote_total(q))) from public.cleaning_quotes q where sent_at is not null and (sent_at at time zone 'Africa/Lagos')::date between _from and _to),
    'lost_reasons', coalesce((select jsonb_object_agg(coalesce(lost_reason, 'not given'), n) from (select lost_reason, count(*) n from public.cleaning_requests
        where status = 'lost' and (updated_at at time zone 'Africa/Lagos')::date between _from and _to group by lost_reason) t), '{}'::jsonb),
    'visits_done', (select count(*) from public.cleaning_visits where status = 'done' and scheduled_date between _from and _to),
    'no_shows', (select count(*) from public.cleaning_visits where status = 'no_show' and scheduled_date between _from and _to),
    'recleans', (select count(*) from public.cleaning_visits where kind = 'reclean' and scheduled_date between _from and _to),
    'avg_rating', (select round(avg(rating)::numeric, 2) from public.cleaning_visits where rating is not null and scheduled_date between _from and _to),
    'active_plans', (select count(*) from public.cleaning_subscriptions where status = 'active'),
    'monthly_recurring_kobo', (select coalesce(sum(monthly_kobo), 0) from public.cleaning_subscriptions where status = 'active'),
    'damage_payouts_kobo', (select coalesce(sum(payout_kobo), 0) from public.cleaning_issues where (resolved_at at time zone 'Africa/Lagos')::date between _from and _to),
    'utilisation', (select jsonb_build_object('booked_min', coalesce(sum(private.cl_day_booked(d::date)), 0), 'capacity_min', coalesce(sum((private.cl_day_capacity(d::date)->>'minutes')::int), 0))
                    from generate_series(_from, _to, interval '1 day') d),
    'crew_pay', coalesce((select jsonb_agg(x order by x->>'name') from (
        select jsonb_build_object('name', p.full_name, 'visits', count(*), 'minutes', sum(greatest(0, extract(epoch from (v.finished_at - v.started_at)) / 60))::int,
          'five_stars', count(*) filter (where v.rating = 5),
          'pay_kobo', sum(greatest(coalesce((_s->>'crew_min_visit_kobo')::bigint, 200000),
                     (greatest(0, extract(epoch from (v.finished_at - v.started_at)) / 3600) * coalesce((_s->>'crew_hour_rate_kobo')::bigint, 100000))::bigint))
                    + count(*) filter (where v.rating = 5) * coalesce((_s->>'five_star_bonus_kobo')::bigint, 50000)) x
          from public.cleaning_visit_crew c join public.cleaning_visits v on v.id = c.visit_id join public.profiles p on p.id = c.staff_id
         where v.status in ('done', 'awaiting_signoff') and v.scheduled_date between _from and _to group by p.full_name) t), '[]'::jsonb),
    'inspector_pay', coalesce((select jsonb_agg(jsonb_build_object('name', p.full_name, 'inspections', n, 'accepted', a,
          'pay_kobo', n * coalesce((_s->>'inspection_pay_kobo')::bigint, 100000) + a * coalesce((_s->>'inspection_accept_bonus_kobo')::bigint, 100000)))
        from (select i.inspector_id, count(*) n, count(*) filter (where r.status = 'accepted') a from public.cleaning_inspections i join public.cleaning_requests r on r.id = i.request_id
               where i.status = 'done' and (i.done_at at time zone 'Africa/Lagos')::date between _from and _to group by i.inspector_id) t join public.profiles p on p.id = t.inspector_id), '[]'::jsonb));
end $$;

-- ---------- Daily upkeep (runs hourly) ----------
create or replace function public.cleaning_upkeep()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _today date := (now() at time zone 'Africa/Lagos')::date; _s public.cleaning_subscriptions; _n_exp int; _n_hold int; _n_sign int; _n_ren int := 0; _n_pause int := 0;
        _n_gen int := 0; _amt bigint; _months int; _tdisc numeric; _v record; _grace int := private.cl_int('renewal_grace_days', 3)::int;
begin
  update public.cleaning_quotes set status = 'expired', updated_at = now() where status = 'sent' and valid_until < now();
  get diagnostics _n_exp = row_count;
  update public.cleaning_visits set status = 'cancelled', cancelled_reason = 'hold_expired', counts_as_used = false where status = 'held' and hold_until < now() - interval '2 hours';
  get diagnostics _n_hold = row_count;
  update public.cleaning_visits set status = 'done', signoff = 'timeout', signed_off_at = now()
   where status = 'awaiting_signoff' and finished_at < now() - make_interval(hours => private.cl_int('complaint_window_hours', 24)::int);
  get diagnostics _n_sign = row_count;

  for _s in select * from public.cleaning_subscriptions where status in ('active', 'past_due') loop
    -- renewal invoice 3 days before the term ends
    if _s.current_period_end - _today <= 3 and not _s.cancel_at_period_end
       and not exists (select 1 from public.cleaning_invoices i where i.subscription_id = _s.id and i.purpose = 'renewal' and i.period_start = _s.current_period_end + 1 and i.status <> 'void') then
      _months := private.cl_term_months(_s.term);
      _tdisc := coalesce((private.cl_set()->'term_discounts'->>_s.term)::numeric, 0);
      _amt := private.cl_round(_s.monthly_kobo * _months * (1 - _tdisc / 100), 50000);
      insert into public.cleaning_invoices (customer_id, purpose, subscription_id, amount_kobo, description, period_start, period_end)
      values (_s.customer_id, 'renewal', _s.id, _amt, 'Cleaning plan renewal from ' || to_char(_s.current_period_end + 1, 'DD Mon YYYY'),
              _s.current_period_end + 1, (_s.current_period_end + 1 + make_interval(months => _months) - interval '1 day')::date);
      perform private.cl_notify_customer(_s.customer_id, 'Renew your cleaning plan', 'Your plan ends on ' || to_char(_s.current_period_end, 'DD Mon') || '. Pay ₦' || to_char(_amt / 100, 'FM999,999,999') || ' to keep your visits.',
        null, '/cleaning/my', 'Renew now', 'cleaning-renewal-' || _s.id || '-' || _s.current_period_end);
      _n_ren := _n_ren + 1;
    end if;
    -- ended
    if _s.current_period_end < _today then
      if _s.cancel_at_period_end then
        update public.cleaning_subscriptions set status = 'ended', updated_at = now() where id = _s.id;
        update public.cleaning_invoices set status = 'void' where subscription_id = _s.id and purpose = 'renewal' and status = 'open';
      elsif _s.status = 'active' then
        update public.cleaning_subscriptions set status = 'past_due', updated_at = now() where id = _s.id;
        perform private.cl_notify_admin('Cleaning plan renewal unpaid', jsonb_build_array('A cleaning plan ended without renewal payment. It pauses after ' || _grace || ' days.'),
          '/staff/cleaning/plans', 'cleaning-pastdue-' || _s.id || '-' || _s.current_period_end);
      elsif _s.status = 'past_due' and _s.current_period_end + _grace < _today then
        update public.cleaning_subscriptions set status = 'paused', updated_at = now() where id = _s.id;
        update public.cleaning_visits set status = 'cancelled', cancelled_reason = 'plan_unpaid', counts_as_used = false
         where subscription_id = _s.id and status = 'scheduled' and scheduled_date > _s.current_period_end;
        _n_pause := _n_pause + 1;
      end if;
    end if;
    if _s.status = 'active' then _n_gen := _n_gen + private.cl_generate_visits(_s.id); end if;
  end loop;

  -- tomorrow: remind customers once, flag visits without a crew
  for _v in select v.* from public.cleaning_visits v where v.scheduled_date = _today + 1 and v.status = 'scheduled' loop
    perform private.cl_notify_customer(_v.customer_id, 'Cleaning tomorrow', 'Your cleaners come tomorrow (' || _v.time_window || '). Please make sure water is available and valuables are put away. Your arrival code is in My cleaning.',
      null, '/cleaning/my', 'See my arrival code', 'cleaning-remind-' || _v.id);
    if not exists (select 1 from public.cleaning_visit_crew c where c.visit_id = _v.id and c.role = 'lead') then
      perform private.cl_notify_admin('Cleaning visit tomorrow has no crew', jsonb_build_array('Visit #' || _v.visit_no || ' on ' || to_char(_v.scheduled_date, 'Dy DD Mon') || ' (' || _v.time_window || ')'),
        '/staff/cleaning/board', 'cleaning-nocrew-' || _v.id);
    end if;
  end loop;
  return jsonb_build_object('expired_quotes', _n_exp, 'released_holds', _n_hold, 'auto_signoffs', _n_sign, 'renewal_invoices', _n_ren, 'paused', _n_pause, 'visits_created', _n_gen);
end $$;

revoke all on function public.cleaning_upkeep() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('cleaning-upkeep-hourly') where exists (select 1 from cron.job where jobname = 'cleaning-upkeep-hourly');
  perform cron.schedule('cleaning-upkeep-hourly', '17 * * * *', 'select public.cleaning_upkeep()');
end $$;

-- ---------- Grants ----------
do $$ declare _f text; begin
  foreach _f in array array[
    'cleaning_slots(uuid, integer, integer, date, integer)', 'cleaning_request_create(jsonb)', 'cleaning_request_staff_create(jsonb)', 'cleaning_request_update(uuid, jsonb)',
    'cleaning_book_inspection(uuid, jsonb)', 'cleaning_inspection_done(uuid, jsonb, text[])', 'cleaning_quote_preview(uuid, jsonb)', 'cleaning_quote_save(uuid, jsonb)',
    'cleaning_quote_send(uuid)', 'cleaning_quote_approve(uuid)', 'cleaning_quote_for_customer(uuid)', 'cleaning_accept_quote(uuid, jsonb)', 'cleaning_decline_quote(uuid, text)',
    'create_cleaning_payment_intent(uuid, text)', 'cleaning_desk_pay(uuid, text, uuid, text)', 'my_cleaning()', 'cleaning_reschedule(uuid, date, text)',
    'cleaning_signoff(uuid, integer, text)', 'cleaning_complain(uuid, text, text[])', 'cleaning_extra_decide(uuid, boolean)', 'cleaning_plan_cancel(uuid, boolean)',
    'cleaning_plan_pause(uuid, date, date)', 'cleaning_use_credit(uuid, date, text)', 'cleaning_requests_list(text, text)', 'cleaning_request_detail(uuid)',
    'cleaning_board(date, date)', 'cleaning_assign_crew(uuid, uuid, uuid[])', 'cleaning_set_start_time(uuid, time)', 'cleaning_cancel_visit(uuid, text, boolean)',
    'my_cleaning_jobs(date)', 'cleaning_visit_on_way(uuid)', 'cleaning_visit_arrive(uuid, text)', 'cleaning_visit_photos(uuid, text, text[])',
    'cleaning_visit_checklist(uuid, jsonb)', 'cleaning_visit_extra(uuid, jsonb, text, bigint, integer)', 'cleaning_visit_finish(uuid, text)',
    'cleaning_visit_no_show(uuid, text)', 'cleaning_report_issue(uuid, text, text, text[])', 'cleaning_issues_list(boolean)',
    'cleaning_issue_resolve(uuid, text, text, date, text, bigint)', 'cleaning_plans_list()', 'cleaning_open_invoices(text)', 'cleaning_admin_config()',
    'cleaning_settings_save(jsonb)', 'cleaning_rate_save(jsonb, text)', 'cleaning_plan_type_save(jsonb)', 'cleaning_zone_days_save(uuid, integer[])', 'cleaning_report(date, date)']
  loop
    execute format('revoke all on function public.%s from public, anon', _f);
    execute format('grant execute on function public.%s to authenticated', _f);
  end loop;
end $$;
grant execute on function public.cleaning_public_info() to anon, authenticated;

-- Internal helpers are only called from the functions above.
do $$ declare _f record; begin
  for _f in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'private' and p.proname like 'cl\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', _f.sig);
  end loop;
end $$;
grant execute on function public.cleaning_check_address(double precision, double precision) to anon, authenticated;
