-- Add six-month and annual subscription checkout without breaking the existing
-- two-argument RPC used by the WhatsApp flow (which remains monthly by default).
alter table public.subscriptions
  drop constraint if exists subscriptions_billing_period_check;
alter table public.subscriptions
  add constraint subscriptions_billing_period_check
  check (billing_period = any (array['monthly'::text, 'six_month'::text, 'yearly'::text]));

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

  -- Reuse the established, authenticated monthly intent flow for ownership checks,
  -- pending-attempt cleanup, provider validation and reference generation.
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
  _end_date := (current_date + make_interval(months => _months)) - 1;

  update public.subscriptions
     set billing_period = _billing_period,
         price_kobo = _total,
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
