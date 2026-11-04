-- Keep the plan's monthly price separate from the amount charged for a selected term.
-- Existing subscriptions retain their billing amount from the latest invoice; the
-- monthly price is restored from the authoritative plan record.
alter table public.subscriptions
  add column if not exists term_amount_kobo bigint;

update public.subscriptions s
   set term_amount_kobo = coalesce(
         (select i.amount_kobo
            from public.subscription_invoices i
           where i.subscription_id = s.id
           order by i.period_start desc, i.created_at desc
           limit 1),
         p.monthly_price_kobo
       ),
       price_kobo = p.monthly_price_kobo
  from public.plans p
 where p.id = s.plan_id
   and (s.term_amount_kobo is null or s.price_kobo is distinct from p.monthly_price_kobo);

alter table public.subscriptions
  add constraint subscriptions_term_amount_kobo_nonnegative
  check (term_amount_kobo is null or term_amount_kobo >= 0);

create or replace function public.create_subscription_payment_intent(
  _plan_slug text,
  _provider text,
  _billing_period text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  _result jsonb;
  _sub_id uuid;
  _invoice_id uuid;
  _monthly bigint;
  _months integer;
  _discount numeric;
  _total bigint;
  _end_date date;
begin
  if _billing_period not in ('monthly', 'six_month', 'yearly') then
    raise exception 'invalid_billing_period' using errcode = 'P0001';
  end if;

  -- The existing two-argument RPC remains responsible for customer, plan,
  -- provider, pending-attempt and reference validation.
  _result := public.create_subscription_payment_intent(_plan_slug, _provider);
  _sub_id := (_result->>'subscription_id')::uuid;

  select s.price_kobo, i.id
    into _monthly, _invoice_id
    from public.subscriptions s
    join public.subscription_invoices i on i.subscription_id = s.id
   where s.id = _sub_id
   order by i.created_at desc
   limit 1
   for update of s, i;

  if _monthly is null or _monthly <= 0 or _invoice_id is null then
    raise exception 'subscription_invoice_not_found' using errcode = 'P0001';
  end if;

  _months := case _billing_period when 'six_month' then 6 when 'yearly' then 12 else 1 end;
  _discount := case
    when _billing_period = 'six_month' then 5
    when _billing_period = 'yearly' then coalesce(
      (select nullif(value->>'yearly_discount_pct','')::numeric
         from public.settings where key = 'subscription'), 10
    )
    else 0
  end;
  if _discount < 0 or _discount >= 100 then
    raise exception 'invalid_subscription_discount' using errcode = 'P0001';
  end if;

  _total := round(_monthly * _months * (1 - _discount / 100));
  _end_date := (current_date + make_interval(months => _months))::date - 1;

  update public.subscriptions
     set billing_period = _billing_period,
         price_kobo = _monthly,
         term_amount_kobo = _total,
         current_period_start = date_trunc('day', now()),
         current_period_end = (_end_date + 1)::timestamp at time zone 'Africa/Lagos',
         updated_at = now()
   where id = _sub_id;

  update public.subscription_invoices
     set period_start = current_date,
         period_end = _end_date,
         amount_kobo = _total
   where id = _invoice_id;

  update public.payments
     set amount_kobo = _total,
         note = 'Subscription ' || _billing_period || ' plan'
   where reference = _result->>'reference'
     and status = 'pending';

  return _result || jsonb_build_object(
    'amount_kobo', _total,
    'billing_period', _billing_period,
    'months', _months,
    'discount_pct', _discount,
    'period_end', _end_date
  );
end
$function$;

revoke all on function public.create_subscription_payment_intent(text, text, text) from public;
revoke all on function public.create_subscription_payment_intent(text, text, text) from anon;
grant execute on function public.create_subscription_payment_intent(text, text, text) to authenticated;

create or replace function public.process_subscription_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
 v_sub record;
 v_invoice public.subscription_invoices;
 v_created integer:=0;
 v_reminded integer:=0;
 v_expired integer:=0;
 v_cancelled integer:=0;
 v_stage integer;
 v_days integer;
 v_body text;
 v_term interval;
begin
 for v_sub in
  select s.* from public.subscriptions s
   where s.status='active' and not s.cancel_at_period_end and s.current_period_end is not null
    and (s.current_period_end at time zone 'Africa/Lagos')::date
       between (now() at time zone 'Africa/Lagos')::date and (now() at time zone 'Africa/Lagos')::date+5
   order by s.current_period_end for update
 loop
  v_term:=case v_sub.billing_period
    when 'six_month' then interval '6 months'
    when 'yearly' then interval '12 months'
    else interval '1 month'
  end;
  if not exists(select 1 from public.subscription_invoices i where i.subscription_id=v_sub.id
      and i.period_start=(v_sub.current_period_end at time zone 'Africa/Lagos')::date) then
    insert into public.subscription_invoices(subscription_id,period_start,period_end,amount_kobo,status)
    values(v_sub.id,(v_sub.current_period_end at time zone 'Africa/Lagos')::date,
      ((v_sub.current_period_end+v_term) at time zone 'Africa/Lagos')::date,
      coalesce(v_sub.term_amount_kobo,v_sub.price_kobo),'due');
    v_created:=v_created+1;
  end if;
 end loop;

 for v_invoice in
  select i.* from public.subscription_invoices i join public.subscriptions s on s.id=i.subscription_id
   where i.status='due' and i.subscription_pickup_id is null and s.status='active' and not s.cancel_at_period_end
    and i.period_start between (now() at time zone 'Africa/Lagos')::date
                           and (now() at time zone 'Africa/Lagos')::date+5
 loop
  v_days:=v_invoice.period_start-(now() at time zone 'Africa/Lagos')::date;
  v_stage:=case when v_days<=0 then 3 when v_days<=2 then 2 else 1 end;
  if not exists(select 1 from public.order_events e where e.event='subscription_renewal_reminder'
    and e.detail->>'invoice_id'=v_invoice.id::text and e.detail->>'stage'=v_stage::text) then
   v_body:=case v_stage when 1 then 'Your LaundryPoint subscription renewal is due in 5 days.'
     when 2 then 'Your LaundryPoint subscription renewal is due in 2 days.'
     else 'Your LaundryPoint subscription renewal is due today.' end;
   insert into public.user_notifications(user_id,title,body,kind)
    select s.customer_id,'Subscription renewal reminder',v_body,'subscription'
    from public.subscriptions s where s.id=v_invoice.subscription_id;
   insert into public.order_events(event,detail) values('subscription_renewal_reminder',
    jsonb_build_object('invoice_id',v_invoice.id,'stage',v_stage));
   v_reminded:=v_reminded+1;
  end if;
 end loop;

 update public.subscriptions s set status='expired',updated_at=now()
  where s.status='active' and s.current_period_end<=now() and not s.cancel_at_period_end
    and exists(select 1 from public.subscription_invoices i where i.subscription_id=s.id
      and i.period_start=(s.current_period_end at time zone 'Africa/Lagos')::date and i.status='due')
    and not exists(select 1 from public.subscription_invoices i where i.subscription_id=s.id
      and i.period_start=(s.current_period_end at time zone 'Africa/Lagos')::date and i.status='paid');
 get diagnostics v_expired=row_count;
 update public.subscriptions s set status='cancelled',updated_at=now()
  where s.status='active' and s.cancel_at_period_end and s.current_period_end<=now();
 get diagnostics v_cancelled=row_count;
 return jsonb_build_object('renewal_invoices_created',v_created,'reminders_sent',v_reminded,
   'subscriptions_expired',v_expired,'scheduled_cancellations_applied',v_cancelled);
end
$function$;
