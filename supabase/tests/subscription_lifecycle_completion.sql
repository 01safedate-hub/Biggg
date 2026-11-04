-- Subscription lifecycle completion regression checks.
-- Run only against an isolated local/test Supabase database after applying migrations.
-- This script is read-only and deliberately does not create or modify customer data.

do $$
declare
  v_lifecycle text;
  v_checkout text;
  v_pickup_spacing text;
begin
  if to_regprocedure('public.create_subscription_pickup_followup()') is null then
    raise exception 'FAIL: create_subscription_pickup_followup() is missing';
  end if;
  if has_function_privilege('anon', 'public.create_subscription_pickup_followup()', 'EXECUTE') then
    raise exception 'FAIL: anon can execute create_subscription_pickup_followup()';
  end if;
  if has_function_privilege('authenticated', 'public.create_subscription_pickup_followup()', 'EXECUTE') then
    raise exception 'FAIL: authenticated can execute create_subscription_pickup_followup()';
  end if;
  if not has_function_privilege('service_role', 'public.create_subscription_pickup_followup()', 'EXECUTE') then
    raise exception 'FAIL: service_role must retain execute privilege for trusted maintenance';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'subscriptions'
       and column_name = 'term_amount_kobo' and data_type = 'bigint'
  ) then
    raise exception 'FAIL: subscriptions.term_amount_kobo bigint is missing';
  end if;

  v_checkout := pg_get_functiondef('public.create_subscription_payment_intent(text,text,text)'::regprocedure);
  if position('term_amount_kobo' in v_checkout) = 0 then
    raise exception 'FAIL: multi-term checkout does not persist term_amount_kobo';
  end if;
  if position('price_kobo = _monthly' in v_checkout) = 0 then
    raise exception 'FAIL: multi-term checkout does not preserve the monthly plan price';
  end if;
  if has_function_privilege('anon', 'public.create_subscription_payment_intent(text,text,text)', 'EXECUTE') then
    raise exception 'FAIL: anon can execute multi-term checkout RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.create_subscription_payment_intent(text,text,text)', 'EXECUTE') then
    raise exception 'FAIL: authenticated customers must be able to execute multi-term checkout RPC';
  end if;

  v_lifecycle := pg_get_functiondef('public.process_subscription_lifecycle()'::regprocedure);
  if position('term_amount_kobo' in v_lifecycle) = 0 then
    raise exception 'FAIL: renewal lifecycle does not use term_amount_kobo';
  end if;
  if position('coalesce(v_sub.term_amount_kobo,v_sub.price_kobo)' in v_lifecycle) = 0 then
    raise exception 'FAIL: renewal lifecycle has no legacy monthly-price fallback';
  end if;

  if to_regprocedure('private.enforce_subscription_pickup_spacing()') is null then
    raise exception 'FAIL: subscription pickup spacing trigger function is missing';
  end if;
  v_pickup_spacing := pg_get_functiondef('private.enforce_subscription_pickup_spacing()'::regprocedure);
  if position('14 * 24 * 60 * 60' in v_pickup_spacing) = 0 then
    raise exception 'FAIL: subscription pickup spacing is not enforced at 14 days';
  end if;
  if position('monthly_pickup_limit_reached' in v_pickup_spacing) = 0 then
    raise exception 'FAIL: subscription pickup count is not enforced at the database boundary';
  end if;

  raise notice 'RESULT: subscription privilege, term-price separation and pickup-spacing checks PASS';
end;
$$;

-- Remaining required integration test groups (run with disposable fixtures and provider mocks):
-- 1. Billing periods: 1, 6, 12 months; exact server-calculated amounts and Lagos period dates.
-- 2. Subscription payment verification: Paystack/Flutterwave success, pending,
--    failed, wrong provider, wrong reference, wrong NGN amount, foreign owner.
-- 3. Idempotency: repeated webhook and repeated pay-verify settle only once.
-- 4. Renewal: invoice created once; each reminder stage created once; paid invoice
--    extends period using stored billing_period; unpaid invoice expires subscription.
-- 5. Pickup schedule: approved count, spacing, billing-period boundaries,
--    idempotent order linkage, missed/skipped pickup behaviour.
-- 6. Category caps: excluded category, positive cap, cap excess, combined plan
--    allowance excess; verify no duplicate charge between category and monthly caps.
-- 7. Overage settlement: online-only payment; correct linked invoice/pickup/order;
--    amount mismatch rejected; successful payment releases count-confirmed order.
-- 8. Cancellation: cancel at period end, reverse cancellation, expiry; no refund.
-- 9. Authorization: customer cannot inspect/settle another customer's invoice;
--    staff pickup access requires assigned order.
-- 10. Regression: one-time pickup, standard order payment, active subscriptions,
--     existing monthly invoices, and historical subscriptions are unaffected.
--
-- pgTAP is not installed in the connected Supabase project; this executable
-- privilege/schema/function-definition check uses native PostgreSQL assertions.
