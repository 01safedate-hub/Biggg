# Monthly subscriptions: implementation contract

Status: implementation phase opened in PR #4. This document records verified schema findings and the server-side contract; subscription checkout must not be considered production-ready until payment verification, quota enforcement, UI integration, and tests are implemented and checked.

## Verified live-project findings (2026-10-27)
- Supabase project `aqxitpnektmkjpfbbfhz` is reachable and healthy; migrations are readable.
- The live database already has `public.subscriptions`, `public.orders`, `public.order_items`, and `public.payments`.
- `public.subscriptions` includes `customer_id`, `plan_id`, `billing_period`, `status` (default `pending`), `price_kobo`, `started_at`, `current_period_start`, `current_period_end`, `pickup_weekday`, `address_id`, and `zone_id`. A full column/constraint and policy review is still required before migration changes.
- `orders` already has nullable `subscription_pickup_id`; `payments` records `purpose`, `kind`, `mode`, `amount_kobo`, `reference`, `status`, and provider payload.
- Existing payment/order routines include `create_payment_intent` and `settle_online_payment`. Their full definitions, grants, provider callback path, and idempotency guarantees must be reviewed before modifying or calling them.
- Applied migration history includes `04_subscriptions_staff_finance` and later pickup/payment/order changes. Do not duplicate existing objects or assume repository migration files exactly match live definitions.

## Customer and agent rules
- Monthly plan payment covers pickup, laundry, and delivery during the active month.
- Count total pieces regardless of garment type.
- Starter: NGN 30,000 / 75 pieces per month. Other displayed plans must match the approved catalog.
- Allowance is cumulative across the month's two pickups and enforced transactionally on the server.
- No separate transport charge for covered subscription pickups while active.
- Pickup agent records the actual pieces using the existing itemiser. Pieces above remaining allowance are billed separately online to the customer on their device.
- Agents must not collect cash.
- Retire the old one-time booking path from customer-facing booking only after subscription booking is complete; preserve historical records.

## Implementation acceptance criteria
1. Inspect full live table definitions, constraints, RLS policies, grants, and definitions for payment, booking, count/correction, and settlement routines.
2. Confirm plan catalog and allowance storage. Add only missing schema objects through a versioned migration; do not trust browser-supplied price, allowance, or customer ID.
3. Create a transaction-safe quota ledger/RPC so two concurrent pickups cannot overspend the same allowance. Keep auditable item-count corrections.
4. Use verified, idempotent online payment to activate the plan. Webhook/callback replay must not activate or charge twice.
5. Compute overage server-side from confirmed piece count and approved pricing; create an online payment intent, and do not process excess items until payment is verified.
6. Covered subscription pickup/delivery fees must be zeroed in the authoritative booking calculation, not merely hidden in UI.
7. Customer UI: purchase, payment result, active plan, period, used/remaining pieces, pickup booking, overage review/payment.
8. Agent UI: show plan allowance and calculated excess; no client-side price override or cash collection.
9. Tests: plan purchase/activation, pending/failed payment, callback replay, expired plan, exact quota, overage, second pickup cumulative usage, concurrent counts, correction audit, non-subscriber denial, and no separate transport/delivery charge.

## Safety gate
Do not enable the checkout button in production or deploy a replacement payment/booking RPC until its existing definition and provider verification flow have been inspected and the acceptance tests pass.
