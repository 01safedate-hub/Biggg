-- Subscription lifecycle completion regression checks.
-- Run only against an isolated local/test Supabase database after applying migrations.
-- This script is read-only and deliberately does not create or modify customer data.

do $$
begin
  if to_regprocedure('public.create_subscription_pickup_followup()') is null then
    raise exception 'FAIL: create_subscription_pickup_followup() is missing';
  end if;
  if has_function_privilege('public', 'public.create_subscription_pickup_followup()', 'EXECUTE') then
    raise exception 'FAIL: PUBLIC can execute create_subscription_pickup_followup()';
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
  raise notice 'RESULT: subscription pickup follow-up execute privileges PASS';
end;
$$;

-- Remaining required test groups (expand as the corresponding implementation lands):
-- 1. Billing periods: 1, 6, 12 months; server-calculated amount; correct invoice dates.
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
-- privilege check uses native PostgreSQL assertions instead.
