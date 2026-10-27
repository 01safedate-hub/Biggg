# Monthly subscriptions: implementation contract

Status: design/contract only until live Supabase schema and migration permissions are accessible.

## Customer rules
- Monthly plan payment covers pickup, laundry, and delivery during the active month.
- Count total pieces regardless of garment type.
- Starter: NGN 30,000 / 75 pieces per month, per product owner.
- Allowance is cumulative across two pickups within the month and enforced server-side.
- No separate transport charge for subscription pickups while active.
- Existing pickup agent itemiser records the actual pieces. Any pieces above remaining allowance are billed separately online to the customer on their device.
- Agents must not collect cash.
- Retire the old one-time booking path from customer-facing booking; preserve historical records.

## Required implementation
1. Database: plan catalog, subscription lifecycle, monthly allowance and usage ledger, order linkage, transaction-safe quota/overage RPC, and RLS that prevents customers editing entitlement or prices.
2. Payment: verified and idempotent plan activation; separate overage payment purpose with server-calculated amount; never accept amount from browser.
3. Customer UI: plan purchase, active subscription and remaining pieces, monthly pickup booking, count/overage review and online payment.
4. Agent UI: reuse itemiser, show remaining allowance and computed overage, no client-side price overrides.
5. Tests: shared quota across pickups; exact-fit and overage; concurrent counting; expired/unpaid subscription; callback replay; non-subscriber denial; covered pickups have no separate transport/delivery charges.

## Blocker
Supabase schema, migration, and Edge Function inspection return a permission error. Existing objects and the create_payment_intent / settle_online_payment RPC definitions cannot be verified. Do not replace existing RPCs or deploy schema/payment changes until Supabase access is restored.