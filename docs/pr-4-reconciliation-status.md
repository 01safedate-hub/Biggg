# PR #4 reconciliation status

Date: 2026-10-28

## Current checkpoint

PR #4 remains open and in draft. Its source branch is 150 commits behind and 131 commits ahead of `main`; do not merge it directly.

The protected branch `integration/pr-4-reconcile-2026-10-28` is based on current `main`. A draft replacement PR #5 tracks reconciliation: https://github.com/01safedate-hub/Biggg/pull/5

## Ported to the integration branch

- Customer subscription pages, customer navigation, extra-clothes bills, and location onboarding.
- Subscription-only pickup booking UI; removed the old customer-facing transport fare checkout from that booking flow.
- Customer order detail messaging for included garments and online-only extra-piece bills.
- Agent count UI, order-number-labelled arrival codes, and receiving-screen category corrections for subscription orders.
- OpenStreetMap map component/source work while retaining the existing live pickup map implementation.
- Six subscription-flow migrations already applied to production, now checked into source control:
  - `20261027195456_subscription_only_pickup_requests.sql`
  - `20261027195928_disable_legacy_transport_checkout.sql`
  - `20261027200035_subscription_delivery_no_fare.sql`
  - `20261027200514_restrict_subscription_payment_rpc_access.sql`
  - `20261027201356_cancel_subscription_pickup_without_refund.sql`
  - `20261027201836_subscription_category_corrections_no_rebilling.sql`
- The already-applied arrival-code function migration and a migration matching the live overage-price correction are now in source control.
- Fixed the customer login redirect so explicit return paths are preserved and the default first-time customer flow does not send staff into location onboarding.
- Updated the `pay-init` Edge Function to handle subscription and excess-clothes RPCs, support CORS preflight without wildcard origin access, and use validated callback origins. The updated function is deployed to Supabase as version 12.

## Production change verified

The live plan table had Starter at ₦220 per excess garment and Pro at ₦200. The agreed rule is ₦150 per excess garment across every plan. Applied the `normalize_subscription_overage_price` migration and verified all four plans now have `overage_price_kobo = 15000` (₦150).

The live database already has the server-side `orders_finalize_subscription_count` trigger. It counts all order-item quantities regardless of item type, sums pieces counted on earlier pickups in the current period, stores overage pieces/amount, auto-confirms counts within allowance, and leaves excess orders awaiting online payment.

## Remaining blockers before merge or production release

1. **Build gate is failing.** The latest Netlify deploy-preview status returned failure. The connected GitHub actions API reports no workflow run details for this branch, and this environment cannot retrieve the private Netlify deploy log. Do not mark the PR ready or merge until the build failure is diagnosed and the deploy preview is green.
2. Several earlier production migrations still have no matching migration source files in this repository: `20261027160553_subscription_checkout_payment_activation`, `20261027160702_subscription_extra_clothes_online_billing`, `20261027160814_align_subscription_plans_and_invoice_constraints`, and `20261027164705_secure_service_area_waitlist_submission`. Their exact original SQL must be recovered from the migration source/history before claiming that a clean database can be rebuilt from the repository.
3. Run the repository `typecheck` and `build` scripts on a clean checkout. A local run was not possible because the execution environment cannot resolve GitHub for cloning.
4. Complete a payment/pickup/overage/arrival-code end-to-end test against a safe test environment. No real payment was initiated as part of this reconciliation.
5. Review Supabase security-advisor findings function-by-function. Do not apply broad privilege changes without confirming each function's caller model.

## Safety state

- Original PR #4 remains untouched.
- `main` has not been changed.
- Live Supabase has only the explicitly noted overage-price migration and `pay-init` function deployment applied during this reconciliation; other checked-in SQL files correspond to migrations already recorded as applied.
- PR #5 remains draft while the deploy-preview failure and missing historical migration source are unresolved.
