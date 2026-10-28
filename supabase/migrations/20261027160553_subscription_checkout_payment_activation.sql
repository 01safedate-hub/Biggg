-- RECONSTRUCTED SOURCE — not byte-for-byte recovery of the lost original migration.
-- Reconstructed from live production catalog on 2026-10-28 and adjacent checked-in migrations.
-- Do not apply to the production database: the effects represented here are already present.
-- Purpose: establish a source-controlled baseline for subscription checkout/payment activation.

create or replace function public.create_subscription_payment_intent(_plan_slug text, _provider text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _plan public.plans;
  _sub uuid;
  _invoice uuid;
  _payment uuid;
  _reference text;
  _profile public.profiles;
  _amount bigint;
begin
  if auth.uid() is null or not private.is_active() then
    raise exception 'account_restricted' using errcode = 'P0001';
  end if;
  if _provider not in ('paystack', 'flutterwave') then
    raise exception 'invalid_provider' using errcode = 'P0001';
  end if;

  select * into _plan
  from public.plans
  where slug = _plan_slug and active = true
  for share;
  if not found then raise exception 'plan_not_found' using errcode = 'P0001'; end if;

  _amount := _plan.monthly_price_kobo;
  if _amount is null or _amount <= 0 then
    raise exception 'invalid_plan_price' using errcode = 'P0001';
  end if;
  if private.online_money_point() is null then
    raise exception 'no_online_money_point' using errcode = 'P0001';
  end if;

  insert into public.subscriptions (
    customer_id, plan_id, billing_period, status, price_kobo,
    current_period_start, current_period_end
  ) values (
    auth.uid(), _plan.id, 'monthly', 'pending', _amount,
    date_trunc('month', now()), date_trunc('month', now()) + interval '1 month'
  ) returning id into _sub;

  insert into public.subscription_invoices (
    subscription_id, period_start, period_end, amount_kobo, status
  ) values (
    _sub, current_date,
    (date_trunc('month', now()) + interval '1 month - 1 day')::date,
    _amount, 'due'
  ) returning id into _invoice;

  _reference := 'LP-SUB-' || replace(_sub::text, '-', '') || '-' ||
    encode(extensions.gen_random_bytes(5), 'hex');

  insert into public.payments (
    invoice_id, customer_id, purpose, kind, mode, amount_kobo,
    reference, status, money_point_id, note
  ) values (
    _invoice, auth.uid(), 'subscription', 'payment', _provider, _amount,
    _reference, 'pending', private.online_money_point(), 'Monthly plan: ' || _plan.name
  ) returning id into _payment;

  update public.subscription_invoices set payment_id = _payment where id = _invoice;
  select * into _profile from public.profiles where id = auth.uid();

  return jsonb_build_object(
    'reference', _reference, 'amount_kobo', _amount,
    'email', _profile.email, 'name', _profile.full_name, 'phone', _profile.phone,
    'plan_name', _plan.name, 'subscription_id', _sub
  );
end;
$function$;

-- Subscription activation is performed only after provider verification through
-- public.settle_online_payment; keep the authenticated client away from settlement.
revoke execute on function public.create_subscription_payment_intent(text, text) from public, anon;
grant execute on function public.create_subscription_payment_intent(text, text) to authenticated;
