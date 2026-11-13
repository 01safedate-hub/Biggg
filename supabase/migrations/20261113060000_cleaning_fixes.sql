-- Cleaning follow-up fixes:
-- 1. A deposit booking now creates the balance bill (before, the crew could never start).
-- 2. Cleaning staff can have weekly working days (used for booking capacity) and request leave.

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
      -- A deposit leaves a balance: bill it now so the customer can pay before the visit.
      if coalesce((_i.detail->>'balance_kobo')::bigint, 0) > 0
         and not exists (select 1 from public.cleaning_invoices b where b.visit_id = _v.id and b.purpose = 'balance' and b.status <> 'void') then
        insert into public.cleaning_invoices (customer_id, purpose, quote_id, visit_id, amount_kobo, description)
        values (_i.customer_id, 'balance', _q.id, _v.id, (_i.detail->>'balance_kobo')::bigint,
                'Balance for your clean on ' || to_char(_v.scheduled_date, 'Dy DD Mon') || ' (quote #' || _q.quote_no || '). Pay before the crew starts.');
      end if;
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


create or replace function public.set_shift_template(_staff uuid, _weekday integer, _start time without time zone, _end time without time zone, _active boolean)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if _weekday is null or _weekday < 0 or _weekday > 6 then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles p join public.user_roles r on r.user_id = p.id where p.id = _staff and p.status = 'active' and r.role in ('delivery_agent','secretary','cashier','admin','cleaner','cleaning_lead','inspector','scheduler')) then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if _active and (_start is null or _end is null or _start = _end or (case when _end <= _start then (_end + interval '24 hours') - _start else _end - _start end) > interval '14 hours') then raise exception 'invalid_shift' using errcode = 'P0001'; end if;
  update public.shift_templates set starts_at = coalesce(_start, starts_at), ends_at = coalesce(_end, ends_at), active = coalesce(_active, true) where staff_id = _staff and weekday = _weekday;
  if not found then
    if not coalesce(_active, true) then return; end if;
    insert into public.shift_templates (staff_id, weekday, starts_at, ends_at, active) values (_staff, _weekday, _start, _end, true);
  end if;
end $function$;

create or replace function public.submit_leave_request(_leave_type uuid, _start date, _end date, _reason text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare _uid uuid := auth.uid(); _days numeric; _type public.leave_types%rowtype; _id uuid;
begin
 if _uid is null then raise exception 'not_authenticated'; end if;
 if _start is null or _end is null or _end < _start or _start < (now() at time zone 'Africa/Lagos')::date then raise exception 'invalid_leave_dates'; end if;
 if not exists(select 1 from public.user_roles r where r.user_id=_uid and r.role in ('delivery_agent','cashier','secretary','admin','super_admin','washer','cleaner','cleaning_lead','inspector','scheduler')) then raise exception 'staff_only'; end if;
 select * into _type from public.leave_types where id=_leave_type and active;
 if not found then raise exception 'invalid_leave_type'; end if;
 _days := (_end - _start + 1)::numeric;
 if exists(select 1 from public.leave_requests l where l.staff_id=_uid and l.status in ('pending','approved') and daterange(l.start_date,l.end_date,'[]') && daterange(_start,_end,'[]')) then raise exception 'leave_dates_overlap'; end if;
 if _type.annual_allowance_days > 0 then
   insert into public.leave_balances(staff_id,leave_type_id,year,allowance_days) values(_uid,_leave_type,extract(year from _start)::int,_type.annual_allowance_days) on conflict(staff_id,leave_type_id,year) do nothing;
   if exists(select 1 from public.leave_balances b where b.staff_id=_uid and b.leave_type_id=_leave_type and b.year=extract(year from _start)::int and b.allowance_days+b.adjustment_days - coalesce((select sum(l.days_requested) from public.leave_requests l where l.staff_id=_uid and l.leave_type_id=_leave_type and l.status='approved' and extract(year from l.start_date)::int=b.year),0) < _days) then raise exception 'insufficient_leave_balance'; end if;
 end if;
 insert into public.leave_requests(staff_id,start_date,end_date,reason,status,leave_type_id,days_requested) values(_uid,_start,_end,nullif(trim(coalesce(_reason,'')),''),case when _type.requires_approval then 'pending' else 'approved' end,_leave_type,_days) returning id into _id;
 return _id;
end $function$;

revoke all on function private.cl_invoice_paid(uuid, text) from public, anon, authenticated;
